const { EncomiendaVenta, Destinatario, Paquete, Cliente, Ruta, RutaParada, RutaVehiculoConductor, Vehiculo, Conductor, Destino, Usuario, ConductorSede, sequelize } = require('../models');
const AppError = require('../errors/appError');
const crypto = require('crypto');
const { normalizarEstadoPaquete, determinarEstadoEncomienda } = require('./paqueteStateUtils');
const { sendPaqueteDevueltoEmail } = require('../config/email');

const ESTADOS_VALIDOS = [
  'Programada',
  'En Ruta',
  'Entregada',
  'Completada con novedades',
  'Cancelada',
];
const METODOS_PAGO_VALIDOS = ['Contraentrega', 'Efectivo', 'Transferencia'];
const ESTADOS_PAGO_VALIDOS = ['Pendiente', 'Pagado'];

const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

// La fecha estimada de entrega de un paquete no puede caer antes de que el vehículo
// llegue a su destino — no tiene sentido prometer una entrega antes de que la ruta
// esté físicamente allá. No hay tope superior: una vez el vehículo llegó, la entrega
// (directa o vía repartidor local desde "En sede de destino") puede tardar cualquier
// cantidad de días adicionales. Si ruta.fechaLlegadaEstimada es null (ruta creada antes
// de esta validación), se cae al mínimo anterior de un día después de la salida.
const validarFechaEntrega = (fechaEstimadaEntrega, ruta) => {
  if (!fechaEstimadaEntrega || !ruta.fechaSalida) return;
  if (ruta.fechaLlegadaEstimada) {
    if (fechaEstimadaEntrega < ruta.fechaLlegadaEstimada) {
      throw new AppError(`La fecha estimada de entrega debe ser igual o posterior a la llegada de la ruta (mínimo el ${ruta.fechaLlegadaEstimada})`, 400);
    }
    return;
  }
  const minima = sumarDias(ruta.fechaSalida, 1);
  if (fechaEstimadaEntrega < minima) {
    throw new AppError(`La fecha estimada de entrega debe ser al menos un día después de la salida de la ruta (mínimo el ${minima})`, 400);
  }
};

// Una ruta ahora puede tener varios pares vehículo+conductor (convoy) — este include
// se reutiliza en todas las consultas que devuelven una venta con su ruta, para que el
// frontend pueda mostrar el vehículo/conductor correcto de cada paquete (ya no hay uno
// solo por ruta). Mismo patrón que INCLUDE_PARES en rutaService.js.
const INCLUDE_PARES = {
  model: RutaVehiculoConductor,
  as: 'paresVehiculoConductor',
  where: { habilitado: true },
  required: false,
  include: [
    { model: Vehiculo, as: 'vehiculo' },
    { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
  ],
};

const RUTA_INCLUDE = {
  model: Ruta,
  as: 'ruta',
  required: false,
  include: [INCLUDE_PARES, { model: Destino, as: 'destino', required: false }],
};

// Vehículo/conductor específico de CADA paquete (una venta puede repartir sus paquetes
// entre varios vehículos de la misma ruta) — usado por la guía PDF y por el detalle de venta.
const paqueteIncludeConAsignacion = (extra = {}) => ({
  model: Paquete,
  as: 'paquetes',
  include: [
    {
      model: RutaVehiculoConductor,
      as: 'asignacion',
      required: false,
      include: [
        { model: Vehiculo, as: 'vehiculo', required: false },
        { model: Conductor, as: 'conductor', required: false, include: [{ model: Usuario, as: 'usuario', required: false }] },
      ],
    },
  ],
  ...extra,
});

// Genera numeroGuia por año (EE-2026-483920), uno POR PAQUETE (no por venta) — cada
// paquete físico necesita su propio número de guía/código de barras único, porque en la
// práctica se despachan por separado.
//
// Los 6 dígitos son ALEATORIOS, no un contador visible — un número secuencial revela
// cuántos envíos se han hecho y en qué orden, algo que no hace falta exponer. Como el
// espacio de 6 dígitos (1.000.000 de valores) es finito, se verifica que no exista ya
// y se reintenta unas pocas veces en el caso (raro) de que choque con uno existente.
// pg_advisory_xact_lock serializa este paso entre transacciones concurrentes del mismo
// año, para que dos paquetes nunca puedan "reservar" el mismo número al mismo tiempo;
// se libera solo al terminar la transacción completa.
const generarNumeroGuia = async (transaction) => {
  // Año en hora Colombia, no la del servidor (Render corre en UTC) — sin esto, la
  // última noche del año (7pm-medianoche hora Colombia) ya generaría guías con el
  // año siguiente.
  const anio = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 4);

  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', {
    replacements: { clave: `guia-${anio}` },
    transaction,
  });

  for (let intento = 0; intento < 5; intento++) {
    const secuencia = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const numeroGuia = `EE-${anio}-${secuencia}`;
    const existente = await Paquete.findOne({ where: { numeroGuia }, transaction });
    if (!existente) return numeroGuia;
  }

  throw new AppError('No se pudo generar un número de guía único, intenta de nuevo.', 500);
};

// "numeroGuia" ya no es columna de encomienda_venta (vive en paquete, uno por paquete) —
// para poder seguir ordenando el listado por ese criterio, se ordena por la guía del
// paquete más antiguo de cada venta (el "paquete 1"), vía subquery correlacionada.
const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaRegistro', 'estado', 'estadoPago', 'numeroGuia', 'idEncomiendaVenta', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaRegistro';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, cuando varias filas comparten el mismo valor en "field"
  // (ej. mismo fechaRegistro, mismo estado), Postgres puede devolverlas en distinto orden
  // relativo según el LIMIT/OFFSET de cada consulta — se ve como que una fila "salta" de
  // posición al cambiar el tamaño de página, aunque nada haya cambiado en los datos.
  if (field === 'numeroGuia') {
    return [
      [
        sequelize.literal(
          '(SELECT numero_guia FROM paquete WHERE paquete.id_encomienda_venta = "EncomiendaVenta"."id_encomienda_venta" ORDER BY id_paquete ASC LIMIT 1)'
        ),
        direction,
      ],
      ['idEncomiendaVenta', direction],
    ];
  }
  if (field === 'idEncomiendaVenta') return [[field, direction]];
  return [[field, direction], ['idEncomiendaVenta', direction]];
};

const getAll = async ({ estado, idCliente, idRuta, habilitado, estadoPago, metodoPago, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (idCliente) where.idCliente = idCliente;
  if (idRuta) where.idRuta = parseInt(idRuta);
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estadoPago) where.estadoPago = estadoPago;
  if (metodoPago) where.metodoPago = metodoPago;

  if (q) {
    const { Op } = sequelize.Sequelize;
    const trimmed = q.trim();
    const conditions = [
      { estado: { [Op.iLike]: `%${trimmed}%` } },
      { estadoPago: { [Op.iLike]: `%${trimmed}%` } },
      { '$cliente.nombre$': { [Op.iLike]: `%${trimmed}%` } },
      { '$cliente.apellido$': { [Op.iLike]: `%${trimmed}%` } },
      { '$ruta.origen$': { [Op.iLike]: `%${trimmed}%` } },
    ];
    const partes = trimmed.split(/\s+/).filter(Boolean);
    if (partes.length > 1) {
      const primero = `%${partes[0]}%`;
      const resto = `%${partes.slice(1).join(' ')}%`;
      conditions.push({ [Op.and]: [{ '$cliente.nombre$': { [Op.iLike]: primero } }, { '$cliente.apellido$': { [Op.iLike]: resto } }] });
      conditions.push({ [Op.and]: [{ '$cliente.apellido$': { [Op.iLike]: primero } }, { '$cliente.nombre$': { [Op.iLike]: resto } }] });
    }

    // numeroGuia vive en Paquete (uno por paquete), no en EncomiendaVenta — se busca
    // aparte y se combina por idEncomiendaVenta, para que una venta aparezca en los
    // resultados sin importar cuál de sus paquetes coincida con la búsqueda.
    const paquetesCoincidentes = await Paquete.findAll({
      where: { numeroGuia: { [Op.iLike]: `%${trimmed}%` } },
      attributes: ['idEncomiendaVenta'],
    });
    if (paquetesCoincidentes.length > 0) {
      conditions.push({ idEncomiendaVenta: { [Op.in]: paquetesCoincidentes.map((p) => p.idEncomiendaVenta) } });
    }

    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const { count, rows: data } = await EncomiendaVenta.findAndCountAll({
    where,
    include: [
      { model: Cliente, as: 'cliente' },
      RUTA_INCLUDE,
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion({ separate: true }),
    ],
    limit,
    offset,
    order: order.length > 0 ? order : [['fechaRegistro', 'DESC'], ['idEncomiendaVenta', 'DESC']],
    distinct: true,
    subQuery: false,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const encomienda = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente' },
      RUTA_INCLUDE,
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
    ],
  });

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  return encomienda;
};

// Suma el peso de los paquetes ya asignados a un par vehículo+conductor específico (sin
// contar ventas canceladas ni, si se indica, la propia venta que se está editando) — usado
// para saber cuánta capacidad de ESE vehículo ya está ocupada antes de aceptar un paquete nuevo.
// A diferencia del modelo anterior (capacidad por ruta completa), ahora cada vehículo del
// convoy tiene su propio cupo independiente.
const getPesoUsadoEnPar = async (idRutaVehiculoConductor, excluirIdEncomienda, transaction) => {
  const { Op } = sequelize.Sequelize;
  const ventaWhere = { estado: { [Op.ne]: 'Cancelada' } };
  if (excluirIdEncomienda) {
    ventaWhere.idEncomiendaVenta = { [Op.ne]: excluirIdEncomienda };
  }
  const paquetes = await Paquete.findAll({
    where: { idRutaVehiculoConductor },
    include: [{ model: EncomiendaVenta, as: 'encomienda', where: ventaWhere, attributes: [] }],
    attributes: ['peso'],
    transaction,
  });
  return paquetes.reduce((sum, p) => sum + parseFloat(p.peso || 0), 0);
};

// Valida la capacidad de cada vehículo usado por los paquetes de la venta, no la ruta
// completa: cada paquete trae su propio idRutaVehiculoConductor (a cuál vehículo del
// convoy va), se agrupan por ese campo y se valida cada uno contra la capacidad de SU
// vehículo. También confirma que el par elegido de verdad pertenezca a la ruta indicada.
const validarCapacidadPares = async (idRuta, paquetes, transaction, excluirIdEncomienda) => {
  const pesoNuevoPorPar = new Map();
  for (const pkg of (paquetes || [])) {
    const idPar = pkg.idRutaVehiculoConductor;
    if (!idPar) continue;
    pesoNuevoPorPar.set(idPar, (pesoNuevoPorPar.get(idPar) || 0) + parseFloat(pkg.peso || 0));
  }

  for (const [idRutaVehiculoConductor, pesoNuevo] of pesoNuevoPorPar) {
    const par = await RutaVehiculoConductor.findOne({
      where: { idRutaVehiculoConductor, habilitado: true },
      include: [{ model: Vehiculo, as: 'vehiculo' }],
      transaction,
    });
    if (!par || par.idRuta !== idRuta) {
      throw new AppError('El vehículo/conductor elegido no pertenece a esta ruta', 400);
    }
    if (!par.vehiculo || !par.vehiculo.capacidad) continue;

    const pesoUsado = await getPesoUsadoEnPar(idRutaVehiculoConductor, excluirIdEncomienda, transaction);
    const capacidad = parseFloat(par.vehiculo.capacidad);
    const disponible = capacidad - pesoUsado;

    if (pesoNuevo > disponible) {
      // No hacemos rollback aquí — el try/catch de create()/update() ya lo hace al
      // capturar este error. Llamarlo dos veces revienta con "Transaction cannot be
      // rolled back because it has been finished with state: rollback".
      throw new AppError(
        `El vehículo ${par.vehiculo.placa} ya no tiene espacio suficiente en esta ruta. Quedan ${disponible.toFixed(2)} kg disponibles y estos paquetes pesan ${pesoNuevo.toFixed(2)} kg.`,
        400
      );
    }
  }
};

// El municipio de destino de la venta tiene que ser el destino final de la ruta o una de
// sus paradas intermedias — misma regla que bloquea el frontend (rutaLlegaAlDestino en
// ventaValidation.js / PasoEnvio.jsx).
const validarRutaLlegaAlDestino = async (ruta, idDestinoVenta, transaction) => {
  if (!idDestinoVenta || idDestinoVenta === ruta.idDestino) return;
  const parada = await RutaParada.findOne({ where: { idRuta: ruta.idRuta, idDestino: idDestinoVenta }, transaction });
  if (!parada) {
    throw new AppError('La ruta elegida no llega al municipio de destino de la venta ni pasa por él', 400);
  }
};

const create = async (data) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      idCliente,
      idRuta,
      fechaEstimadaEntrega,
      observaciones,
      total,
      metodoPago,
      estadoPago,
      destinatario,
      paquetes,
    } = data;

    const cliente = await Cliente.findByPk(idCliente);
    if (!cliente) {
      throw new AppError('Cliente no encontrado', 400);
    }

    if (!idRuta) {
      throw new AppError('La ruta es obligatoria', 400);
    }
    const ruta = await Ruta.findByPk(idRuta);
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 400);
    }
    validarFechaEntrega(fechaEstimadaEntrega, ruta);

    if (!destinatario || !destinatario.idDestino) {
      throw new AppError('El municipio de destino del destinatario es obligatorio', 400);
    }
    const destinoDestinatario = await Destino.findByPk(destinatario.idDestino);
    if (!destinoDestinatario) {
      throw new AppError('El destino del destinatario no existe', 400);
    }
    await validarRutaLlegaAlDestino(ruta, destinatario.idDestino, transaction);

    if (paquetes && paquetes.length > 0) {
      for (const pkg of paquetes) {
        if (!pkg.idRutaVehiculoConductor) {
          throw new AppError('Cada paquete debe tener un vehículo asignado', 400);
        }
      }
    }
    await validarCapacidadPares(idRuta, paquetes, transaction);

    if (
      metodoPago &&
      !METODOS_PAGO_VALIDOS.some((v) => v.toLowerCase() === metodoPago.toLowerCase())
    ) {
      throw new AppError(`Método de pago inválido. Opciones: ${METODOS_PAGO_VALIDOS.join(', ')}`, 400);
    }

    if (
      estadoPago &&
      !ESTADOS_PAGO_VALIDOS.includes(estadoPago)
    ) {
      throw new AppError(`Estado de pago inválido. Opciones: ${ESTADOS_PAGO_VALIDOS.join(', ')}`, 400);
    }

    const metodoPagoResuelto = metodoPago
      ? (METODOS_PAGO_VALIDOS.find((v) => v.toLowerCase() === metodoPago.toLowerCase()) || null)
      : null;
    // Efectivo se cobra en el momento mismo del registro (no hay nada pendiente por
    // cobrar después, a diferencia de Contraentrega/Transferencia) — nace "Pagado"
    // directamente, sin importar qué estadoPago haya mandado el cliente.
    const estadoPagoResuelto = metodoPagoResuelto === 'Efectivo'
      ? 'Pagado'
      : (ESTADOS_PAGO_VALIDOS.find((v) => v.toLowerCase() === (estadoPago || 'Pendiente').toLowerCase()) || 'Pendiente');

    const encomienda = await EncomiendaVenta.create(
      {
        idCliente,
        idRuta,
        fechaEstimadaEntrega: fechaEstimadaEntrega || null,
        observaciones: observaciones || null,
        total: total || 0,
        metodoPago: metodoPagoResuelto,
        estadoPago: estadoPagoResuelto,
        estado: 'Programada',
      },
      { transaction }
    );

    if (destinatario) {
      await Destinatario.create(
        {
          idEncomiendaVenta: encomienda.idEncomiendaVenta,
          idDestino: destinatario.idDestino,
          nombreDestinatario: destinatario.nombreDestinatario,
          tipoIdentificacionDestinatario: destinatario.tipoIdentificacionDestinatario || null,
          numeroIdentificacionDestinatario: destinatario.numeroIdentificacionDestinatario || null,
          telefonoDestinatario: destinatario.telefonoDestinatario || null,
          correoDestinatario: destinatario.correoDestinatario || null,
          direccionDestinatario: destinatario.direccionDestinatario || null,
        },
        { transaction }
      );
    }

    if (paquetes && paquetes.length > 0) {
      for (const pkg of paquetes) {
        await Paquete.create(
          {
            idEncomiendaVenta: encomienda.idEncomiendaVenta,
            idRutaVehiculoConductor: pkg.idRutaVehiculoConductor,
            numeroGuia: await generarNumeroGuia(transaction),
            descripcionContenido: pkg.descripcionContenido || null,
            peso: pkg.peso || null,
            alto: pkg.alto || null,
            ancho: pkg.ancho || null,
            profundidad: pkg.profundidad || null,
            tipoCarga: pkg.tipoCarga || 'normal',
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    const encomiendaCompleta = await EncomiendaVenta.findByPk(encomienda.idEncomiendaVenta, {
      include: [
        { model: Cliente, as: 'cliente' },
        RUTA_INCLUDE,
        { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
        paqueteIncludeConAsignacion(),
      ],
    });

    return encomiendaCompleta;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const update = async (id, data) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      idRuta,
      fechaEstimadaEntrega,
      observaciones,
      total,
      metodoPago,
      estadoPago,
      habilitado,
      destinatario,
      paquetes,
    } = data;

    const encomienda = await EncomiendaVenta.findByPk(id);

    if (!encomienda) {
      throw new AppError('Encomienda no encontrada', 404);
    }

    if (encomienda.estado !== 'Programada') {
      throw new AppError(`Esta venta ya está en estado "${encomienda.estado}": no se puede editar`, 400);
    }

    if (
      metodoPago &&
      !METODOS_PAGO_VALIDOS.some((v) => v.toLowerCase() === metodoPago.toLowerCase())
    ) {
      throw new AppError(`Método de pago inválido. Opciones: ${METODOS_PAGO_VALIDOS.join(', ')}`, 400);
    }

    if (
      estadoPago &&
      !ESTADOS_PAGO_VALIDOS.includes(estadoPago)
    ) {
      throw new AppError(`Estado de pago inválido. Opciones: ${ESTADOS_PAGO_VALIDOS.join(', ')}`, 400);
    }

    const parseDecimal = (value) => {
      if (value === undefined || value === null || value === '') return 0;
      return typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.')) || 0;
    };

    const nuevoTotal =
      total !== undefined
        ? parseDecimal(total)
        : parseDecimal(encomienda.total);

    // La ruta es obligatoria siempre — una venta nunca puede quedar sin ruta.
    // Si se manda idRuta en la petición tiene que ser un id válido; si no se
    // manda, se deja la que ya tenía.
    let nuevoIdRuta = encomienda.idRuta;
    if (idRuta !== undefined) {
      if (idRuta && !isNaN(parseInt(idRuta)) && parseInt(idRuta) > 0) {
        nuevoIdRuta = parseInt(idRuta);
      } else {
        throw new AppError('La ruta es obligatoria', 400);
      }
    }

    const rutaNueva = await Ruta.findByPk(nuevoIdRuta, { transaction });
    if (!rutaNueva) {
      throw new AppError('Ruta no encontrada', 400);
    }
    const nuevaFechaEstimadaEntrega = fechaEstimadaEntrega !== undefined ? fechaEstimadaEntrega : encomienda.fechaEstimadaEntrega;
    validarFechaEntrega(nuevaFechaEstimadaEntrega, rutaNueva);
    const destinatarioExistente = await Destinatario.findOne({ where: { idEncomiendaVenta: id }, transaction });

    // El destino efectivo (el que llega en el body, o el ya guardado) tiene que caer en
    // la ruta nueva — su destino final o una de sus paradas.
    const idDestinoEfectivo = (destinatario && destinatario.idDestino !== undefined)
      ? destinatario.idDestino
      : (destinatarioExistente ? destinatarioExistente.idDestino : null);
    await validarRutaLlegaAlDestino(rutaNueva, idDestinoEfectivo, transaction);

    if (paquetes && paquetes.length > 0) {
      for (const pkg of paquetes) {
        if (!pkg.idRutaVehiculoConductor) {
          throw new AppError('Cada paquete debe tener un vehículo asignado', 400);
        }
      }
    }
    // Si esta venta no manda paquetes nuevos, se valida con los que ya tenía
    // (no están cambiando, pero igual cuentan para el peso de su vehículo).
    const paquetesParaValidar = paquetes && paquetes.length > 0
      ? paquetes
      : await Paquete.findAll({ where: { idEncomiendaVenta: id }, attributes: ['peso', 'idRutaVehiculoConductor'], transaction });
    await validarCapacidadPares(nuevoIdRuta, paquetesParaValidar, transaction, parseInt(id));

    await encomienda.update(
      {
        idRuta: nuevoIdRuta,
        fechaEstimadaEntrega: nuevaFechaEstimadaEntrega,
        observaciones: observaciones !== undefined ? observaciones : encomienda.observaciones,
        total: nuevoTotal,
        metodoPago: metodoPago !== undefined ? (metodoPago ? METODOS_PAGO_VALIDOS.find(v => v.toLowerCase() === metodoPago.toLowerCase()) || encomienda.metodoPago : null) : encomienda.metodoPago,
        estadoPago: estadoPago !== undefined ? (ESTADOS_PAGO_VALIDOS.find(v => v.toLowerCase() === estadoPago.toLowerCase()) || encomienda.estadoPago) : encomienda.estadoPago,
        habilitado: habilitado !== undefined ? habilitado : encomienda.habilitado,
      },
      { transaction }
    );

    if (destinatario) {
      let idDestinoResuelto = destinatarioExistente?.idDestino ?? null;
      if (destinatario.idDestino !== undefined) {
        const destinoDestinatario = await Destino.findByPk(destinatario.idDestino);
        if (!destinoDestinatario) {
          throw new AppError('El destino del destinatario no existe', 400);
        }
        idDestinoResuelto = destinatario.idDestino;
      }

      if (destinatarioExistente) {
        await destinatarioExistente.update(
          {
            idDestino: idDestinoResuelto,
            nombreDestinatario:
              destinatario.nombreDestinatario || destinatarioExistente.nombreDestinatario,
            tipoIdentificacionDestinatario: destinatario.tipoIdentificacionDestinatario || null,
            numeroIdentificacionDestinatario: destinatario.numeroIdentificacionDestinatario || null,
            telefonoDestinatario: destinatario.telefonoDestinatario || null,
            correoDestinatario: destinatario.correoDestinatario || null,
            direccionDestinatario: destinatario.direccionDestinatario || null,
          },
          { transaction }
        );
      } else {
        await Destinatario.create(
          {
            idEncomiendaVenta: id,
            idDestino: idDestinoResuelto,
            nombreDestinatario: destinatario.nombreDestinatario,
            tipoIdentificacionDestinatario: destinatario.tipoIdentificacionDestinatario || null,
            numeroIdentificacionDestinatario: destinatario.numeroIdentificacionDestinatario || null,
            telefonoDestinatario: destinatario.telefonoDestinatario || null,
            correoDestinatario: destinatario.correoDestinatario || null,
            direccionDestinatario: destinatario.direccionDestinatario || null,
          },
          { transaction }
        );
      }
    }

    if (paquetes && paquetes.length > 0) {
      // Diff en vez de "borrar todo y recrear": cada paquete tiene su propio número de
      // guía/código de barras físico, así que editar la venta (o incluso editar OTRO
      // paquete) nunca debe reasignarle un número nuevo a uno que no cambió. Solo se
      // crea guía nueva para paquetes realmente nuevos (sin idPaquete); los que ya
      // existían se actualizan en el mismo registro (incluyendo si se reasignaron a
      // otro vehículo del convoy), y los que ya no vienen en el payload (se quitaron
      // en el formulario) se eliminan.
      const existentes = await Paquete.findAll({ where: { idEncomiendaVenta: id }, transaction });
      const existentesPorId = new Map(existentes.map((p) => [p.idPaquete, p]));
      const idsConservados = new Set();

      for (const pkg of paquetes) {
        const datos = {
          idRutaVehiculoConductor: pkg.idRutaVehiculoConductor,
          descripcionContenido: pkg.descripcionContenido || null,
          peso: pkg.peso || null,
          alto: pkg.alto || null,
          ancho: pkg.ancho || null,
          profundidad: pkg.profundidad || null,
          tipoCarga: pkg.tipoCarga || 'normal',
        };

        if (pkg.idPaquete && existentesPorId.has(pkg.idPaquete)) {
          idsConservados.add(pkg.idPaquete);
          await existentesPorId.get(pkg.idPaquete).update(datos, { transaction });
        } else {
          await Paquete.create(
            { idEncomiendaVenta: id, numeroGuia: await generarNumeroGuia(transaction), ...datos },
            { transaction }
          );
        }
      }

      const idsAEliminar = existentes
        .filter((p) => !idsConservados.has(p.idPaquete))
        .map((p) => p.idPaquete);
      if (idsAEliminar.length > 0) {
        await Paquete.destroy({ where: { idPaquete: idsAEliminar }, transaction });
      }
    }

    await transaction.commit();

    const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        RUTA_INCLUDE,
        { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
        paqueteIncludeConAsignacion(),
      ],
    });

    return encomiendaActualizada;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const cambiarEstado = async (id, estado) => {
  const encomienda = await EncomiendaVenta.findByPk(id);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new AppError(`Estado inválido. Opciones: ${ESTADOS_VALIDOS.join(', ')}`, 400);
  }

  await encomienda.update({ estado });

  return encomienda;
};

// Dos caminos válidos para un paquete, según si pasa o no por una sede intermedia
// (ver ../../../LOGICA.md, "Paquetes — entrega en sede y reasignación local"):
//   A) Por entregar -> Entregado/Devuelto directo — el mismo de siempre, lo marca
//      el conductor del tramo troncal mientras su ruta sigue "En Ruta".
//   B) Por entregar -> En sede de destino (troncal, ruta "En Ruta") -> [se asigna
//      un repartidor local, ver asignarRepartidorLocal] -> Entregado/Devuelto,
//      marcado por ESE repartidor — ya no depende de que la ruta troncal siga "En
//      Ruta" (el camión grande ya pudo haberse ido a la siguiente parada).
const actualizarEstadoPaquete = async (idPaquete, estado, { observacion = '', fotoEntrega = null } = {}) => {
  const paquete = await Paquete.findByPk(idPaquete, {
    include: [{ model: RutaVehiculoConductor, as: 'asignacion', include: [{ model: Ruta, as: 'ruta' }] }],
  });
  if (!paquete) {
    throw new AppError('Paquete no encontrado', 404);
  }

  const estadoAnterior = paquete.estado;
  if (estadoAnterior === 'Entregado' || estadoAnterior === 'Devuelto') {
    throw new AppError('Este paquete ya tiene un estado final y no se puede modificar', 409);
  }

  const encomienda = await EncomiendaVenta.findByPk(paquete.idEncomiendaVenta);
  if (encomienda?.estado === 'Cancelada') {
    throw new AppError('No se puede actualizar un paquete de una venta cancelada', 409);
  }

  const estadoNormalizado = normalizarEstadoPaquete(estado);

  if (estadoNormalizado === 'En sede de destino') {
    if (estadoAnterior !== 'Por entregar') {
      throw new AppError('Solo se puede marcar "En sede de destino" desde "Por entregar"', 409);
    }
    if (paquete.asignacion?.ruta?.estado !== 'En Ruta') {
      throw new AppError('Solo se puede actualizar un paquete mientras su ruta está "En Ruta"', 409);
    }
  } else if (estadoAnterior === 'En sede de destino') {
    // Entrega local (Entregado/Devuelto) — ya no depende del estado de la ruta
    // troncal, depende de tener un repartidor local asignado.
    if (!paquete.idConductorEntrega) {
      throw new AppError('Este paquete todavía no tiene un repartidor local asignado', 409);
    }
  } else {
    // Entrega directa del tramo troncal (estadoAnterior === 'Por entregar') — mismo
    // comportamiento de siempre.
    if (paquete.asignacion?.ruta?.estado !== 'En Ruta') {
      throw new AppError('Solo se puede actualizar un paquete mientras su ruta está "En Ruta"', 409);
    }
  }

  await sequelize.transaction(async (t) => {
    await paquete.update({
      estado: estadoNormalizado,
      observacionEstado: observacion || paquete.observacionEstado || '',
      fechaUltimoEstado: new Date(),
      fotoEntrega: fotoEntrega || paquete.fotoEntrega || null,
    }, { transaction: t });

    if (encomienda) {
      const paquetes = await Paquete.findAll({ where: { idEncomiendaVenta: paquete.idEncomiendaVenta }, transaction: t });
      await encomienda.update({ estado: determinarEstadoEncomienda(paquetes, encomienda.estado) }, { transaction: t });
    }
  });

  // Notificación al cliente por correo cuando un paquete pasa a "Devuelto" — solo en
  // la transición (no en cada re-guardado mientras ya estaba devuelto), y sin bloquear
  // la actualización del paquete si el envío del correo falla (SMTP caído, etc.).
  if (estadoNormalizado === 'Devuelto' && estadoAnterior !== 'Devuelto' && encomienda) {
    try {
      const cliente = await Cliente.findByPk(encomienda.idCliente);
      if (cliente?.email) {
        await sendPaqueteDevueltoEmail(cliente.email, {
          nombreCliente: `${cliente.nombre} ${cliente.apellido}`.trim(),
          numeroGuia: paquete.numeroGuia,
          motivo: observacion || '',
        });
      }
    } catch (error) {
      console.error(`No se pudo enviar el correo de paquete devuelto (paquete #${idPaquete}):`, error.message);
    }
  }

  return paquete;
};

// Asigna (o reemplaza) el repartidor local de un paquete que ya está "En sede de
// destino" — acción exclusiva del admin (el conductor troncal no elige quién
// entrega localmente). De paso registra en ConductorSede que este conductor ya
// entregó en ese municipio, para que la próxima vez que se arme una lista de
// repartidores disponibles ahí aparezca — no hace falta ninguna pantalla aparte
// para dar de alta esa cobertura de antemano.
const asignarRepartidorLocal = async (idPaquete, idConductor) => {
  const paquete = await Paquete.findByPk(idPaquete, {
    include: [{ model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] }],
  });
  if (!paquete) throw new AppError('Paquete no encontrado', 404);

  if (paquete.estado !== 'En sede de destino') {
    throw new AppError('Solo se puede asignar un repartidor local a un paquete que esté "En sede de destino"', 409);
  }

  const idDestino = paquete.encomienda?.destinatario?.idDestino;
  if (!idDestino) {
    throw new AppError('Esta venta no tiene un municipio de destino registrado', 409);
  }

  const conductor = await Conductor.findByPk(idConductor);
  if (!conductor) throw new AppError('Conductor no encontrado', 404);
  if (conductor.habilitado === false) {
    throw new AppError('Este conductor está inhabilitado y no se puede asignar como repartidor', 400);
  }

  await sequelize.transaction(async (t) => {
    await paquete.update({ idConductorEntrega: idConductor }, { transaction: t });

    const cobertura = await ConductorSede.findOne({ where: { idConductor, idDestino }, transaction: t });
    if (!cobertura) {
      await ConductorSede.create({ idConductor, idDestino }, { transaction: t });
    } else if (!cobertura.habilitado) {
      await cobertura.update({ habilitado: true }, { transaction: t });
    }
  });

  return Paquete.findByPk(idPaquete, {
    include: [{ model: Conductor, as: 'conductorEntrega', include: [{ model: Usuario, as: 'usuario' }] }],
  });
};

const getPaquetesDevueltos = async ({ q, anio, mes, habilitado, page = 1, limit = 10 } = {}) => {
  const { Op } = sequelize.Sequelize;
  const where = { estado: 'Devuelto' };
  if (q) {
    const trimmed = q.trim();
    where[Op.or] = [
      { numeroGuia: { [Op.iLike]: `%${trimmed}%` } },
      { '$encomienda.cliente.nombre$': { [Op.iLike]: `%${trimmed}%` } },
      { '$encomienda.cliente.apellido$': { [Op.iLike]: `%${trimmed}%` } },
      { '$encomienda.cliente.email$': { [Op.iLike]: `%${trimmed}%` } },
    ];
  }
  // Mismo patrón año/mes que anticipoService.getAll — fechaUltimoEstado se filtra
  // por rango, no por LIKE.
  if (anio) {
    const anioNum = parseInt(anio);
    const mesNum = mes ? parseInt(mes) : null;
    const mesInicio = mesNum || 1;
    const inicio = `${anioNum}-${String(mesInicio).padStart(2, '0')}-01`;
    const fin = mesNum
      ? (mesNum === 12 ? `${anioNum + 1}-01-01` : `${anioNum}-${String(mesNum + 1).padStart(2, '0')}-01`)
      : `${anioNum + 1}-01-01`;
    where.fechaUltimoEstado = { [Op.gte]: inicio, [Op.lt]: fin };
  }

  // El paquete no tiene su propio "habilitado" (columna eliminada — su ciclo de vida
  // depende enteramente de la venta dueña, ver Paquete.model). Por eso este filtro no
  // toca `where` de Paquete, sino el `where` del include de la venta: un paquete
  // "inhabilitado" en este listado es, en realidad, un paquete cuya venta lo está.
  const whereEncomienda = {};
  if (habilitado !== undefined) whereEncomienda.habilitado = habilitado === 'true';

  const offset = (page - 1) * limit;
  const { count, rows: data } = await Paquete.findAndCountAll({
    where,
    include: [
      {
        model: EncomiendaVenta,
        as: 'encomienda',
        required: true,
        where: whereEncomienda,
        include: [{ model: Cliente, as: 'cliente' }],
      },
      {
        model: RutaVehiculoConductor,
        as: 'asignacion',
        include: [{ model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino' }] }],
      },
    ],
    limit,
    offset,
    order: [['fechaUltimoEstado', 'DESC'], ['idPaquete', 'DESC']],
    distinct: true,
    subQuery: false,
  });

  return { data, total: count };
};

const getAniosDisponiblesPaquetesDevueltos = async () => {
  const rows = await sequelize.query(
    "SELECT DISTINCT EXTRACT(YEAR FROM fecha_ultimo_estado)::int AS anio FROM paquete WHERE estado = 'Devuelto' ORDER BY anio DESC",
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => r.anio);
};

const cambiarEstadoPago = async (id, estadoPago) => {
  const encomienda = await EncomiendaVenta.findByPk(id);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  if (!ESTADOS_PAGO_VALIDOS.includes(estadoPago)) {
    throw new AppError(`Estado de pago inválido. Opciones: ${ESTADOS_PAGO_VALIDOS.join(', ')}`, 400);
  }

  if (encomienda.estado === 'Cancelada') {
    throw new AppError('Esta venta fue cancelada: no se puede cambiar el estado de pago', 400);
  }

  if (
    estadoPago === 'Pagado' &&
    encomienda.metodoPago === 'Contraentrega' &&
    !['Entregada', 'Completada con novedades'].includes(encomienda.estado)
  ) {
    throw new AppError('Esta venta es Contraentrega: el pago solo se puede confirmar cuando ya fue entregada', 400);
  }

  await encomienda.update({ estadoPago });

  return encomienda;
};

const toggleHabilitado = async (id) => {
  const encomienda = await EncomiendaVenta.findByPk(id);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  if (encomienda.habilitado) {
    const ESTADOS_FINALES = ['Entregada', 'Completada con novedades', 'Cancelada'];
    if (!ESTADOS_FINALES.includes(encomienda.estado)) {
      throw new AppError(
        `No se puede inhabilitar la encomienda porque está en estado "${encomienda.estado}"`,
        409,
        [{ tipo: 'Estado activo', id: encomienda.idEncomiendaVenta, descripcion: `Esta venta está en estado "${encomienda.estado}" y no ha finalizado` }],
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  const nuevoEstado = !encomienda.habilitado;
  await encomienda.update({ habilitado: nuevoEstado });

  const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente' },
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
      RUTA_INCLUDE,
    ],
  });

  return encomiendaActualizada;
};

// El orden por defecto de getAll es [fechaRegistro DESC, idEncomiendaVenta DESC] —
// el desempate también tiene que ser DESC (Op.gt), no ASC. Con fechaRegistro
// siendo un DATEONLY, es normal que varias ventas del mismo día empaten ahí y
// dependan del desempate para quedar en el orden correcto.
const getPageOf = async (id, { limit = 10 } = {}) => {
  const Op = sequelize.Sequelize.Op;
  const record = await EncomiendaVenta.findByPk(id, { attributes: ['idEncomiendaVenta', 'fechaRegistro'] });
  if (!record) throw new AppError('Encomienda no encontrada', 404);
  const before = await EncomiendaVenta.count({
    where: {
      [Op.or]: [
        { fechaRegistro: { [Op.gt]: record.fechaRegistro } },
        { fechaRegistro: record.fechaRegistro, idEncomiendaVenta: { [Op.gt]: parseInt(id) } },
      ],
    },
  });
  return { page: Math.floor(before / limit) + 1 };
};

// Límites reales para el filtro de período del Dashboard — evita que "Desde" acepte
// cualquier año arbitrario (ej. 1956) y que "Hasta" acepte fechas futuras sin sentido.
// Se calcula con MIN/MAX directo en la BD (no sobre una página de ventas ya cargada)
// para que siga siendo correcto sin importar cuántas ventas haya en total.
const getRangoFechas = async () => {
  const resultado = await EncomiendaVenta.findOne({
    attributes: [
      [sequelize.fn('MIN', sequelize.col('fecha_registro')), 'primerRegistro'],
      [sequelize.fn('MAX', sequelize.col('fecha_registro')), 'ultimoRegistro'],
    ],
    raw: true,
  });
  return {
    primerRegistro: resultado?.primerRegistro || null,
    ultimoRegistro: resultado?.ultimoRegistro || null,
  };
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  cambiarEstado,
  cambiarEstadoPago,
  toggleHabilitado,
  getPageOf,
  getRangoFechas,
  actualizarEstadoPaquete,
  asignarRepartidorLocal,
  getPaquetesDevueltos,
  getAniosDisponiblesPaquetesDevueltos,
};
