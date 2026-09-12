const { EncomiendaVenta, Destinatario, Paquete, PaqueteEntregaFinal, Cliente, Ruta, RutaParada, RutaVehiculoConductor, Vehiculo, Conductor, Destino, Usuario, UsuarioSede, sequelize } = require('../models');
const AppError = require('../errors/appError');
const crypto = require('crypto');
const { normalizarEstadoPaquete, determinarEstadoEncomienda, determinarEstadoPago } = require('./paqueteStateUtils');
const { sendPaqueteDevueltoEmail } = require('../config/email');
const { MAX_DIAS_ANTICIPACION } = require('../utils/horarioLaboral');

const MODALIDADES_RECAUDO_VALIDAS = ['Pago Inmediato', 'Contraentrega'];
// Municipio de origen de toda venta (oficina principal). Mismo string que fuerza
// rutaService.resolverOrigenRuta para una ruta normal. No es una fila de `destino`
// por diseño (el origen es texto libre en `ruta.origen`), pero sí puede existir una
// fila `destino` "Medellín" en la BD real — y una venta nunca debe ir dirigida a
// ella (uno no se despacha encomiendas a sí mismo). Ver LOGICA.md.
const MUNICIPIO_ORIGEN = 'Medellín';
// Tope de la "novedad"/observación de un paquete en Entrega en dos fases — mismo
// valor que ya usa "Observaciones" en Ruta/Venta (ver rutasValidator.js), aunque
// acá no hay un validators/paquetesValidator.js: este módulo valida a mano en el
// controller/servicio, no vía express-validator (gap preexistente, no se creó
// uno nuevo solo para esto).
const NOVEDAD_MAX_LENGTH = 500;

const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

// La fecha estimada de entrega de un paquete no puede caer antes de que el vehículo
// llegue a su destino — no tiene sentido prometer una entrega antes de que la ruta
// esté físicamente allá. Tope superior: MAX_DIAS_ANTICIPACION (90) días desde hoy,
// mismo horizonte y misma constante que ya limita fechaSalida/fechaLlegadaEstimada de
// una Ruta (ver rutaService.validarHorarioRuta) — sin este tope alguien podía dejar
// "prometida" una entrega a meses/años vista. Si ruta.fechaLlegadaEstimada es null
// (ruta creada antes de esta validación), el mínimo se cae al de un día después de la
// salida.
const validarFechaEntrega = (fechaEstimadaEntrega, ruta) => {
  if (!fechaEstimadaEntrega || !ruta.fechaSalida) return;
  // "Hoy" en hora Colombia — mismo patrón que rutaService.validarHorarioRuta, para que
  // el tope no dependa de en qué zona horaria corre el servidor (Render corre en UTC).
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const maxPermitido = sumarDias(hoy, MAX_DIAS_ANTICIPACION);
  if (fechaEstimadaEntrega > maxPermitido) {
    throw new AppError(`La fecha estimada de entrega no puede ser más de ${MAX_DIAS_ANTICIPACION} días a partir de hoy (máximo el ${maxPermitido})`, 400);
  }
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

// Una venta solo puede quedar asignada/reactivada sobre una ruta que de verdad la
// pueda transportar: tiene que seguir "Programada" (no haber salido, terminado o sido
// cancelada) Y seguir habilitada (una ruta puede quedar inhabilitada — soft-delete —
// sin que su `estado` deje de decir "Programada", son dos campos independientes). Usado
// en create()/update() y en toggleHabilitado() al rehabilitar — ver LOGICA.md, "Ventas
// — Cancelada e inhabilitar/habilitar".
const rutaSigueSirviendo = (ruta) => !!ruta && ruta.estado === 'Programada' && ruta.habilitado !== false;

// Una ruta ahora puede tener varios pares vehículo+conductor (convoy) — este include
// se reutiliza en todas las consultas que devuelven una venta con su ruta, para que el
// frontend pueda mostrar el vehículo/conductor correcto de cada paquete (ya no hay uno
// solo por ruta). Mismo patrón que INCLUDE_PARES en rutaService.js.
const INCLUDE_PARES = {
  model: RutaVehiculoConductor,
  as: 'paresVehiculoConductor',
  where: { habilitado: true },
  required: false,
  // separate: true -- una ruta con convoy (2+ pares) multiplicaba filas a nivel
  // SQL dentro de RUTA_INCLUDE. En getAll(), paginado con LIMIT/OFFSET y
  // subQuery:false, esas filas de más se comían cupo de la página: una venta
  // cuya ruta tiene 2 pares ocupaba 2 posiciones en la ventana de la página,
  // dejando esa página con un registro menos y corriendo todo lo siguiente un
  // lugar (ver LOGICA.md, "getAll de Ventas devolvía páginas cortas por el
  // convoy, getPageOf quedaba desincronizado").
  separate: true,
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

const getAll = async ({ estado, idCliente, idRuta, habilitado, estadoPago, modalidadRecaudo, q, page = 1, limit = 10, sortBy, rol, idSede } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (idCliente) where.idCliente = idCliente;
  if (idRuta) where.idRuta = parseInt(idRuta);
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estadoPago) where.estadoPago = estadoPago;
  if (modalidadRecaudo) where.modalidadRecaudo = modalidadRecaudo;
  // "Solo lo mío" para operador_sede — filtra por quién registró la venta. Un
  // listado nuevo empieza vacío. Ver LOGICA.md, "Sedes remotas".
  if (rol === 'operador_sede') where.idSede = idSede;

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
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'destino' }] },
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

const getById = async (id, { rol, idSede } = {}) => {
  const encomienda = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'destino' }] },
      RUTA_INCLUDE,
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
    ],
  });

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  if (rol === 'operador_sede' && encomienda.idSede !== idSede) {
    throw new AppError('No tienes acceso a esta venta', 403);
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

// Un regreso solo transporta ventas nuevas cuando lo registra el operador_sede
// de la sede desde la que ESE regreso sale (WS5, "Sedes remotas") — el destino
// de la ida que enlaza es justo esa sede. Para cualquier otro caller (admin
// incluido) un regreso sigue sin transportar ventas nuevas (ver LOGICA.md,
// "Ventas — no se puede asignar una venta a un viaje de regreso").
const esRegresoDeLaSede = async (ruta, idSede, transaction) => {
  if (!ruta.idRutaIda || idSede === undefined) return false;
  const rutaIda = await Ruta.findByPk(ruta.idRutaIda, { attributes: ['idDestino'], transaction });
  return rutaIda?.idDestino === idSede;
};

const create = async (data, { rol, idSede } = {}) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      idCliente,
      idRuta,
      fechaEstimadaEntrega,
      observaciones,
      total,
      modalidadRecaudo,
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
    // Mismo criterio que update(): una venta nueva solo puede nacer asignada a una
    // ruta que siga sirviendo (Programada Y habilitada).
    if (!rutaSigueSirviendo(ruta)) {
      throw new AppError('Solo se puede asignar la venta a una ruta que esté Programada', 400);
    }
    // Un viaje de regreso (ruta.idRutaIda) no transporta ventas nuevas — solo lleva
    // al convoy de vuelta a la base (y, a futuro, los paquetes no entregados que
    // regresan) — EXCEPTO cuando quien registra es el operador_sede de la sede
    // desde la que ese regreso sale (WS5, "Sedes remotas"): ahí es justo la venta
    // de regreso que la sede necesita registrar (remitente en su sede, destinatario
    // en Medellín — al revés del flujo normal). El frontend ya lo excluye del
    // selector de ruta para cualquier otro caso; esto es la fuente de verdad del
    // backend.
    const esVentaDeRegresoDeSede = ruta.idRutaIda && rol === 'operador_sede' && await esRegresoDeLaSede(ruta, idSede, transaction);
    if (ruta.idRutaIda && !esVentaDeRegresoDeSede) {
      throw new AppError('No se puede asignar una venta a un viaje de regreso: elige una ruta de ida', 400);
    }
    // Si no mandan fecha estimada de entrega, se autocompleta con la llegada de la
    // ruta (o salida+1 si no tiene llegada) — el mínimo permitido de todos modos, así
    // que siempre es válida. El frontend ya la autocompleta igual al elegir la ruta
    // (PasoEnvio.jsx) y la deja editable; esto es una red de seguridad para quien cree
    // la venta directo por API sin mandar el campo.
    const fechaEstimadaEntregaFinal = fechaEstimadaEntrega
      || ruta.fechaLlegadaEstimada
      || (ruta.fechaSalida ? sumarDias(ruta.fechaSalida, 1) : null);
    validarFechaEntrega(fechaEstimadaEntregaFinal, ruta);

    if (!destinatario || !destinatario.idDestino) {
      throw new AppError('El municipio de destino del destinatario es obligatorio', 400);
    }
    const destinoDestinatario = await Destino.findByPk(destinatario.idDestino);
    if (!destinoDestinatario) {
      throw new AppError('El destino del destinatario no existe', 400);
    }
    // Excepción simétrica a la de arriba: en una venta de regreso de sede el
    // destinatario SÍ va a Medellín a propósito (es el origen real de esa venta
    // el que cambió, no Medellín — ver comentario de esRegresoDeLaSede arriba).
    if (destinoDestinatario.municipio === MUNICIPIO_ORIGEN && !esVentaDeRegresoDeSede) {
      throw new AppError(`El destino del destinatario no puede ser ${MUNICIPIO_ORIGEN}: es el municipio de origen de las ventas`, 400);
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
      modalidadRecaudo &&
      !MODALIDADES_RECAUDO_VALIDAS.some((v) => v.toLowerCase() === modalidadRecaudo.toLowerCase())
    ) {
      throw new AppError(`Modalidad de recaudo inválida. Opciones: ${MODALIDADES_RECAUDO_VALIDAS.join(', ')}`, 400);
    }

    const modalidadRecaudoResuelta = modalidadRecaudo
      ? (MODALIDADES_RECAUDO_VALIDAS.find((v) => v.toLowerCase() === modalidadRecaudo.toLowerCase()) || null)
      : null;
    // Pago Inmediato se cobra en el momento mismo del registro (no hay nada
    // pendiente por cobrar después, a diferencia de Contraentrega) — la venta y
    // cada uno de sus paquetes nacen "Pagado" directamente. Contraentrega nace
    // "Pendiente" en ambos niveles; el cobro real se resuelve por paquete en
    // registrarEntregaFinal. Ver paqueteStateUtils.determinarEstadoPago.
    const esPagoInmediato = modalidadRecaudoResuelta === 'Pago Inmediato';
    const estadoPagoResuelto = esPagoInmediato ? 'Pagada' : 'Pendiente';

    const encomienda = await EncomiendaVenta.create(
      {
        idCliente,
        idRuta,
        fechaEstimadaEntrega: fechaEstimadaEntregaFinal || null,
        observaciones: observaciones || null,
        total: total || 0,
        modalidadRecaudo: modalidadRecaudoResuelta,
        estadoPago: estadoPagoResuelto,
        estado: 'Programada',
        // Nunca lo que mande el body — sale del contexto de sesión de quien
        // registra. Alimenta el filtro "solo lo mío" de Ventas (WS3).
        idSede: rol === 'operador_sede' ? idSede : null,
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
            estadoPago: esPagoInmediato ? 'Pagado' : 'Pendiente',
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    const encomiendaCompleta = await EncomiendaVenta.findByPk(encomienda.idEncomiendaVenta, {
      include: [
        { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'destino' }] },
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
      modalidadRecaudo,
      habilitado,
      destinatario,
      paquetes,
    } = data;

    const encomienda = await EncomiendaVenta.findByPk(id);

    if (!encomienda) {
      throw new AppError('Encomienda no encontrada', 404);
    }

    // Cancelada sí se puede editar (a diferencia de antes) — es la forma de
    // reasignarle ruta/fecha, igual que una ruta Cancelada. Ver LOGICA.md, "Ventas —
    // Cancelada e inhabilitar/habilitar".
    if (!['Programada', 'Cancelada'].includes(encomienda.estado)) {
      throw new AppError(`Esta venta ya está en estado "${encomienda.estado}": no se puede editar`, 400);
    }

    if (
      modalidadRecaudo &&
      !MODALIDADES_RECAUDO_VALIDAS.some((v) => v.toLowerCase() === modalidadRecaudo.toLowerCase())
    ) {
      throw new AppError(`Modalidad de recaudo inválida. Opciones: ${MODALIDADES_RECAUDO_VALIDAS.join(', ')}`, 400);
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
    // Una venta solo puede quedar asignada a una ruta que siga sirviendo — sin esto,
    // reactivar una Cancelada (o simplemente editar una Programada) podría dejarla
    // apuntando a una ruta que ya salió, se completó, se canceló o quedó inhabilitada,
    // sin que nadie lo note (el frontend ya filtra el selector de ruta igual, esto es
    // la fuente de verdad del backend). Ver LOGICA.md.
    if (!rutaSigueSirviendo(rutaNueva)) {
      throw new AppError('Solo se puede asignar la venta a una ruta que esté Programada', 400);
    }
    // Un viaje de regreso no transporta ventas — ver el mismo chequeo en create().
    if (rutaNueva.idRutaIda) {
      throw new AppError('No se puede asignar una venta a un viaje de regreso: elige una ruta de ida', 400);
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

    // Modalidad de recaudo: solo se puede llegar hasta acá (update no bloqueado)
    // mientras la venta sigue Programada/Cancelada, o sea antes de que cualquier
    // paquete haya salido de "Por entregar" — así que si la modalidad cambia, el
    // re-sync de Paquete.estadoPago de abajo siempre es "todos a Pagado" o "todos
    // a Pendiente", nunca hay estados intermedios que respetar. Ver PLAN_recaudo_
    // por_paquete.md, sección 9, punto 1.
    const modalidadRecaudoAnterior = encomienda.modalidadRecaudo;
    const modalidadRecaudoResuelta = modalidadRecaudo !== undefined
      ? (modalidadRecaudo ? MODALIDADES_RECAUDO_VALIDAS.find(v => v.toLowerCase() === modalidadRecaudo.toLowerCase()) || modalidadRecaudoAnterior : null)
      : modalidadRecaudoAnterior;
    const modalidadRecaudoCambio = modalidadRecaudoResuelta !== modalidadRecaudoAnterior;
    const esPagoInmediatoVigente = modalidadRecaudoResuelta === 'Pago Inmediato';
    const estadoPagoPaqueteVigente = esPagoInmediatoVigente ? 'Pagado' : 'Pendiente';

    // Si llegó hasta acá sin lanzar error, la ruta/fecha nuevas ya son válidas (ruta
    // Programada, fechaEstimadaEntrega dentro de rango) — una venta Cancelada se
    // reactiva sola a Programada en la misma operación, sin pedir un segundo paso
    // manual. Ver LOGICA.md, "Ventas — Cancelada e inhabilitar/habilitar".
    await encomienda.update(
      {
        idRuta: nuevoIdRuta,
        fechaEstimadaEntrega: nuevaFechaEstimadaEntrega,
        observaciones: observaciones !== undefined ? observaciones : encomienda.observaciones,
        total: nuevoTotal,
        modalidadRecaudo: modalidadRecaudoResuelta,
        estadoPago: modalidadRecaudoCambio ? (esPagoInmediatoVigente ? 'Pagada' : 'Pendiente') : encomienda.estadoPago,
        habilitado: habilitado !== undefined ? habilitado : encomienda.habilitado,
        estado: encomienda.estado === 'Cancelada' ? 'Programada' : encomienda.estado,
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
        if (destinoDestinatario.municipio === MUNICIPIO_ORIGEN) {
          throw new AppError(`El destino del destinatario no puede ser ${MUNICIPIO_ORIGEN}: es el municipio de origen de las ventas`, 400);
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
          // Paquete nuevo del diff: nace con el estadoPago de la modalidad
          // vigente de la venta (misma regla que create()), sin esperar a que la
          // modalidad "haya cambiado" — un paquete nuevo nunca tuvo un
          // estadoPago previo que preservar.
          await Paquete.create(
            { idEncomiendaVenta: id, numeroGuia: await generarNumeroGuia(transaction), estadoPago: estadoPagoPaqueteVigente, ...datos },
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

    // Si la modalidad de recaudo cambió, re-sincronizar el estadoPago de TODOS los
    // paquetes de la venta (no solo los nuevos del diff de arriba) — ver el
    // comentario sobre modalidadRecaudoCambio más arriba. Ningún paquete pudo
    // haber avanzado más allá de "Por entregar" mientras la venta seguía editable.
    if (modalidadRecaudoCambio) {
      await Paquete.update(
        { estadoPago: estadoPagoPaqueteVigente },
        { where: { idEncomiendaVenta: id }, transaction }
      );
    }

    await transaction.commit();

    const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'destino' }] },
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

// Único camino válido hoy para este endpoint legacy (ver ../../../LOGICA.md,
// "Repartidor local — retirado"): Por entregar -> Entregado/Devuelto directo,
// lo marca el conductor del tramo troncal mientras su ruta sigue "En Ruta". Un
// paquete que ya llegó a "En sede de destino" YA NO se puede marcar
// Entregado/Devuelto por acá — eso es exclusivo del distribuidor de esa sede
// (PATCH /paquetes/:id/entrega-final, ver registrarEntregaFinal()).
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
    // Ya no aplica el flujo viejo de "repartidor local" (retirado, ver LOGICA.md)
    // — un paquete que llegó a la sede solo lo cierra el distribuidor de esa sede.
    throw new AppError('Este paquete ya está en sede de destino: la entrega final la registra el distribuidor de esa sede', 409);
  } else {
    // Entrega directa del tramo troncal (estadoAnterior === 'Por entregar') — mismo
    // comportamiento de siempre.
    if (paquete.asignacion?.ruta?.estado !== 'En Ruta') {
      throw new AppError('Solo se puede actualizar un paquete mientras su ruta está "En Ruta"', 409);
    }
  }

  await sequelize.transaction(async (t) => {
    // Espejo de registrarEntregaFinal, por consistencia: si este camino legacy
    // marca "Entregado" una venta Contraentrega, ese paquete también se cobra.
    const datosPaquete = {
      estado: estadoNormalizado,
      observacionEstado: observacion || paquete.observacionEstado || '',
      fechaUltimoEstado: new Date(),
      fotoEntrega: fotoEntrega || paquete.fotoEntrega || null,
    };
    if (estadoNormalizado === 'Entregado' && encomienda?.modalidadRecaudo === 'Contraentrega') {
      datosPaquete.estadoPago = 'Pagado';
    }
    await paquete.update(datosPaquete, { transaction: t });

    if (encomienda) {
      const paquetes = await Paquete.findAll({ where: { idEncomiendaVenta: paquete.idEncomiendaVenta }, transaction: t });
      await encomienda.update({
        estado: determinarEstadoEncomienda(paquetes, encomienda.estado),
        estadoPago: determinarEstadoPago(paquetes, encomienda.estadoPago),
      }, { transaction: t });
    }
  });

  // Este paquete acaba de salir de "Por entregar" a "Entregado"/"Devuelto" directo
  // — puede que con eso la ruta ya tenga todas sus sedes completas. Mismo
  // disparador best-effort que dejarPaquetesEnSede; sin esto, una ruta que se
  // completa entera por esta vía directa (sin pasar nunca por
  // dejarPaquetesEnSede) nunca dispara el auto-completado y se queda "En Ruta"
  // para siempre aunque no le falte nada. require lazy para no atar el orden de
  // carga de módulos.
  if (estadoAnterior === 'Por entregar' && paquete.asignacion?.idRuta) {
    const autoCompletar = require('./rutaService').intentarAutoCompletar;
    await autoCompletar(paquete.asignacion.idRuta);
  }

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

// El conductor del tramo troncal legaliza DE UNA SOLA VEZ todos los paquetes que
// dejó en la sede de un municipio (una parada intermedia o el destino final):
// pasan de "Por entregar" -> "En sede de destino". La entrega final al
// destinatario la hace después el distribuidor de esa sede (rol 'distribuidor'),
// con la ruta ya cerrada. Foto y novedades son opcionales — el conductor solo
// deja constancia de que descargó el lote. Ver LOGICA.md, "Entrega en dos fases".
const dejarPaquetesEnSede = async (idConductor, { idRuta, idDestino, novedades = '', fotoEntrega = null } = {}) => {
  const { Op } = sequelize.Sequelize;

  if (!idRuta || !idDestino) {
    throw new AppError('Faltan datos de la ruta o de la sede', 400);
  }
  // Sigue siendo opcional (a diferencia de la novedad de registrarEntregaFinal,
  // ver comentario ahí) — este es un traspaso interno masivo (camión -> sede),
  // no la entrega real al destinatario, así que no se le exige evidencia. Solo
  // se le pone tope de longitud si el conductor sí escribe algo.
  if (novedades.length > NOVEDAD_MAX_LENGTH) {
    throw new AppError(`La novedad no puede exceder ${NOVEDAD_MAX_LENGTH} caracteres`, 400);
  }

  const ruta = await Ruta.findByPk(idRuta, { attributes: ['idRuta', 'estado', 'idDestino'] });
  if (!ruta) throw new AppError('Ruta no encontrada', 404);
  if (ruta.estado !== 'En Ruta') {
    throw new AppError('Solo se pueden dejar paquetes en sede mientras la ruta está "En Ruta"', 409);
  }

  // La sede tiene que ser el destino final de la ruta o una de sus paradas.
  const esDestinoFinal = ruta.idDestino === idDestino;
  const esParada = !esDestinoFinal && (await RutaParada.count({ where: { idRuta, idDestino } })) > 0;
  if (!esDestinoFinal && !esParada) {
    throw new AppError('Esa sede no pertenece al recorrido de esta ruta', 409);
  }

  // Pares (vehículo+conductor) de ESTE conductor en ESTA ruta.
  const pares = await RutaVehiculoConductor.findAll({
    where: { idRuta, idConductor, habilitado: true },
    attributes: ['idRutaVehiculoConductor', 'idVehiculo'],
  });
  if (pares.length === 0) {
    throw new AppError('No tienes ningún vehículo asignado en esta ruta', 403);
  }
  const parIds = pares.map((p) => p.idRutaVehiculoConductor);
  const vehiculoIds = [...new Set(pares.map((p) => p.idVehiculo))];

  // Paquetes "Por entregar" de esos pares cuya venta va dirigida a esta sede
  // (Destinatario.idDestino) y no está cancelada.
  const candidatos = await Paquete.findAll({
    where: { idRutaVehiculoConductor: { [Op.in]: parIds }, estado: 'Por entregar' },
    include: [{
      model: EncomiendaVenta, as: 'encomienda', required: true,
      where: { estado: { [Op.ne]: 'Cancelada' } },
      include: [{ model: Destinatario, as: 'destinatario', required: true, where: { idDestino } }],
    }],
  });
  if (candidatos.length === 0) {
    throw new AppError('No hay paquetes pendientes por dejar en esta sede', 409);
  }

  const idsPaquete = candidatos.map((p) => p.idPaquete);
  const ventaIds = [...new Set(candidatos.map((p) => p.idEncomiendaVenta))];

  await sequelize.transaction(async (t) => {
    await Paquete.update(
      {
        estado: 'En sede de destino',
        fechaUltimoEstado: new Date(),
        ...(novedades ? { observacionEstado: novedades } : {}),
        ...(fotoEntrega ? { fotoEntrega } : {}),
      },
      { where: { idPaquete: { [Op.in]: idsPaquete } }, transaction: t }
    );

    // Recalcular el estado de cada venta afectada. Con todos sus paquetes en "En
    // sede de destino" (no terminal) la venta SIGUE "En Ruta" — el cierre lo
    // dispara el distribuidor al resolver la entrega final.
    for (const idEncomiendaVenta of ventaIds) {
      const venta = await EncomiendaVenta.findByPk(idEncomiendaVenta, { transaction: t });
      if (!venta) continue;
      const paquetesVenta = await Paquete.findAll({ where: { idEncomiendaVenta }, transaction: t });
      await venta.update({
        estado: determinarEstadoEncomienda(paquetesVenta, venta.estado),
        estadoPago: determinarEstadoPago(paquetesVenta, venta.estadoPago),
      }, { transaction: t });
    }

    // Trazabilidad en vivo: el conductor (y su vehículo) acaba de dejar carga en
    // esta sede, así que su "ubicación actual" pasa a ser este municipio. Se va
    // actualizando sede por sede a medida que avanza el recorrido; al completar la
    // ruta ya coincide con el destino final. Ver LOGICA.md "Entrega en dos fases".
    await Conductor.update({ idDestinoActual: idDestino }, { where: { idConductor }, transaction: t });
    if (vehiculoIds.length > 0) {
      await Vehiculo.update({ idDestinoActual: idDestino }, { where: { idVehiculo: { [Op.in]: vehiculoIds } }, transaction: t });
    }
  });

  // Con esta sede lista, la ruta puede quedar completa (todas las sedes + anticipo
  // cerrado). Best-effort tras el commit — si aún falta algo no hace nada.
  // require lazy para no atar el orden de carga de módulos.
  const autoCompletar = require('./rutaService').intentarAutoCompletar;
  const autoResult = await autoCompletar(idRuta);

  return {
    actualizados: candidatos.length,
    idRuta,
    idDestino,
    ventasAfectadas: ventaIds.length,
    rutaCompletada: autoResult.completada === true,
  };
};

// Paquetes "En sede de destino" que le tocan a un distribuidor — los de las
// sedes (municipios) que ese usuario cubre (usuario_sede). El idUsuario sale del
// token, no del query. Ver getPorSede en paqueteController.
const getPaquetesEnSede = async (idUsuarioDistribuidor) => {
  const { Op } = sequelize.Sequelize;

  const sedes = await UsuarioSede.findAll({
    where: { idUsuario: idUsuarioDistribuidor, habilitado: true },
    attributes: ['idDestino'],
  });
  const idsDestino = sedes.map((s) => s.idDestino);
  if (idsDestino.length === 0) return [];

  return Paquete.findAll({
    where: { estado: 'En sede de destino' },
    include: [
      {
        model: EncomiendaVenta, as: 'encomienda', required: true,
        where: { estado: { [Op.ne]: 'Cancelada' }, habilitado: true },
        include: [
          { model: Cliente, as: 'cliente', attributes: ['idCliente', 'nombre', 'apellido', 'telefono'] },
          {
            model: Destinatario, as: 'destinatario', required: true,
            where: { idDestino: { [Op.in]: idsDestino } },
            include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio', 'departamento'] }],
          },
        ],
      },
      {
        model: RutaVehiculoConductor, as: 'asignacion',
        include: [{ model: Ruta, as: 'ruta', attributes: ['idRuta', 'origen', 'estado'], include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }],
      },
    ],
    order: [['fechaUltimoEstado', 'DESC'], ['idPaquete', 'DESC']],
  });
};

// Paquetes que ESTE distribuidor ya cerró (Entregado/Devuelto) — su propio
// historial, a diferencia de getPaquetesEnSede (arriba) que solo trae lo
// pendiente. Filtra por idUsuarioEntrega (quién lo cerró), no por sede — un
// distribuidor solo puede cerrar paquetes de sus propias sedes de todos modos
// (registrarEntregaFinal ya lo valida), así que equivale a lo mismo, pero es
// más directo. Sin paginación de servidor a propósito, mismo patrón que
// getByConductor/getMisAnticipos — el móvil pagina en el cliente ("Mostrar 5
// más"). Ver LOGICA.md, "Historial de entrega final — tab del distribuidor".
const getHistorialSedeDistribuidor = async (idUsuarioDistribuidor) => {
  const { Op } = sequelize.Sequelize;

  return Paquete.findAll({
    where: { estado: { [Op.in]: ['Entregado', 'Devuelto'] }, idUsuarioEntrega: idUsuarioDistribuidor },
    include: [
      {
        model: EncomiendaVenta, as: 'encomienda', required: true,
        include: [
          { model: Cliente, as: 'cliente', attributes: ['idCliente', 'nombre', 'apellido', 'telefono'] },
          {
            model: Destinatario, as: 'destinatario', required: true,
            include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio', 'departamento'] }],
          },
        ],
      },
      {
        model: RutaVehiculoConductor, as: 'asignacion',
        include: [{ model: Ruta, as: 'ruta', attributes: ['idRuta', 'origen', 'estado'], include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }],
      },
    ],
    order: [['fechaUltimoEstado', 'DESC'], ['idPaquete', 'DESC']],
  });
};

const ACCIONES_ENTREGA_FINAL = ['Entregado', 'Devuelto', 'Intento'];

// Tope de intentos fallidos por paquete (decisión de la usuaria, 2026-09-08):
// un número fijo de intentos, sin ningún control de cada cuánto se puede
// registrar uno -- el distribuidor decide libremente cuándo insistir, el
// sistema no impone ninguna cadencia ni compara fechas entre intentos
// (fechaUltimoIntento solo queda guardada como dato, nunca se usa para
// bloquear). "No entregado" sigue disponible en cualquier momento (decisión
// explícita: el distribuidor puede cerrarlo antes si ya sabe que es
// imposible entregar, ej. dirección inexistente) -- el tope solo bloquea
// seguir sumando 'Intento'. Ver LOGICA.md, "Tope de intentos de entrega".
const MAX_INTENTOS_ENTREGA = 5;

// Entrega final al destinatario, desde "En sede de destino" — la registra el
// distribuidor de la sede (rol 'distribuidor', un Usuario), no un conductor.
//   - 'Entregado' / 'Devuelto': estado terminal. En la UI 'Devuelto' se muestra
//     como "No entregado" (el valor interno no cambia).
//   - 'Intento': NO cambia el estado (sigue "En sede de destino") — solo suma al
//     contador de insistidera (intentosEntrega) y actualiza fechaUltimoIntento.
// Novedad y foto OBLIGATORIAS en las 3 (2026-09-08) — antes solo la novedad, y
// solo para Devuelto/Intento; Entregado no pedía nada. Con eso, un "Entregado"
// sin evidencia propia se guardaba con `novedad || paquete.observacionEstado`,
// heredando en silencio la nota/foto que el CONDUCTOR dejó al llegar a la sede
// (dejarPaquetesEnSede) — dos pasos distintos del proceso mezclados bajo el
// mismo campo, sin ninguna marca de cuál es cuál. Exigir siempre novedad+foto
// acá hace que el fallback nunca se dispare en la práctica: el registro que
// queda siempre es la evidencia real del distribuidor, no algo heredado. La
// foto se valida como obligatoria en el controller (paqueteController.js,
// donde se lee req.file); acá solo la novedad — texto en el body. Ver
// LOGICA.md, "Entrega en dos fases" y "Evidencia de entrega final obligatoria".
const registrarEntregaFinal = async (idPaquete, { accion, novedad = '', fotoEntrega = null, idUsuarioDistribuidor } = {}) => {
  if (!ACCIONES_ENTREGA_FINAL.includes(accion)) {
    throw new AppError(`Acción inválida. Debe ser una de: ${ACCIONES_ENTREGA_FINAL.join(', ')}`, 400);
  }

  const paquete = await Paquete.findByPk(idPaquete, {
    include: [{ model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] }],
  });
  if (!paquete) throw new AppError('Paquete no encontrado', 404);

  if (paquete.estado !== 'En sede de destino') {
    throw new AppError('Solo se puede gestionar la entrega final de un paquete que esté "En sede de destino"', 409);
  }

  const encomienda = paquete.encomienda;
  if (encomienda?.estado === 'Cancelada') {
    throw new AppError('No se puede gestionar un paquete de una venta cancelada', 409);
  }

  const idDestinoVenta = encomienda?.destinatario?.idDestino;
  if (!idDestinoVenta) {
    throw new AppError('Esta venta no tiene un municipio de destino registrado', 409);
  }
  const cubreSede = await UsuarioSede.findOne({
    where: { idUsuario: idUsuarioDistribuidor, idDestino: idDestinoVenta, habilitado: true },
  });
  if (!cubreSede) {
    throw new AppError('No tienes asignada la sede de este paquete', 403);
  }

  if (!novedad.trim()) {
    throw new AppError('La novedad es obligatoria para registrar la entrega final', 400);
  }
  if (novedad.length > NOVEDAD_MAX_LENGTH) {
    throw new AppError(`La novedad no puede exceder ${NOVEDAD_MAX_LENGTH} caracteres`, 400);
  }

  const esIntento = accion === 'Intento';
  if (esIntento && (paquete.intentosEntrega || 0) >= MAX_INTENTOS_ENTREGA) {
    throw new AppError(`Ya se registraron ${MAX_INTENTOS_ENTREGA} intentos para este paquete — no se pueden registrar más. Márcalo como Entregado o No entregado.`, 409);
  }

  await sequelize.transaction(async (t) => {
    // Historial completo -- una fila por cada llamada, sin importar la acción
    // (ver models/paqueteEntregaFinal.js). novedad/fotoEntrega ya vienen
    // garantizados no vacíos (validados arriba y en el controller), así que acá
    // ya no hace falta el `|| valorAnterior` que sí tenía sentido cuando eran
    // opcionales.
    await PaqueteEntregaFinal.create({
      idPaquete: paquete.idPaquete,
      accion,
      novedad,
      foto: fotoEntrega,
      idUsuarioDistribuidor,
    }, { transaction: t });

    if (esIntento) {
      await paquete.update({
        intentosEntrega: (paquete.intentosEntrega || 0) + 1,
        fechaUltimoIntento: new Date(),
        observacionEstado: novedad,
        fotoEntrega,
        idUsuarioEntrega: idUsuarioDistribuidor,
      }, { transaction: t });
    } else {
      // Regla de recaudo por paquete (ver PLAN_recaudo_por_paquete.md): en
      // Contraentrega, este paquete se cobra si y solo si se entregó. Un
      // 'Devuelto' se queda 'Pendiente' — cerrado sin cobro, en firme.
      const datosPaquete = {
        estado: accion, // 'Entregado' | 'Devuelto'
        observacionEstado: novedad,
        fotoEntrega,
        fechaUltimoEstado: new Date(),
        idUsuarioEntrega: idUsuarioDistribuidor,
      };
      if (accion === 'Entregado' && encomienda?.modalidadRecaudo === 'Contraentrega') {
        datosPaquete.estadoPago = 'Pagado';
      }
      await paquete.update(datosPaquete, { transaction: t });

      // Cierre de la venta si ya ningún paquete queda pendiente, y recálculo del
      // rollup de pago (determinarEstadoPago) en el mismo punto.
      if (encomienda) {
        const paquetes = await Paquete.findAll({ where: { idEncomiendaVenta: paquete.idEncomiendaVenta }, transaction: t });
        await encomienda.update({
          estado: determinarEstadoEncomienda(paquetes, encomienda.estado),
          estadoPago: determinarEstadoPago(paquetes, encomienda.estadoPago),
        }, { transaction: t });
      }
    }
  });

  // Correo al cliente cuando el paquete queda "Devuelto" (no entregado) — solo en
  // la transición, sin bloquear la operación si el envío falla.
  if (accion === 'Devuelto' && encomienda) {
    try {
      const cliente = await Cliente.findByPk(encomienda.idCliente);
      if (cliente?.email) {
        await sendPaqueteDevueltoEmail(cliente.email, {
          nombreCliente: `${cliente.nombre} ${cliente.apellido}`.trim(),
          numeroGuia: paquete.numeroGuia,
          motivo: novedad || '',
        });
      }
    } catch (error) {
      console.error(`No se pudo enviar el correo de paquete no entregado (paquete #${idPaquete}):`, error.message);
    }
  }

  return Paquete.findByPk(idPaquete, {
    include: [
      { model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] },
      { model: Usuario, as: 'usuarioEntrega', attributes: ['idUsuario', 'nombre', 'apellido'] },
    ],
  });
};

// Historial completo de entrega final de un paquete (ver models/paqueteEntregaFinal.js)
// -- todas las filas, en orden cronológico (más viejo primero, se lee como una
// historia: intento 1, intento 2, ..., el cierre). Usado por el modal "Ver
// historial" de ModalConsultarVenta.jsx (web) -- no existía antes de esta tabla,
// así que un paquete cerrado antes de que se agregara simplemente no tiene filas.
const getHistorialEntregaFinal = async (idPaquete) => {
  const paquete = await Paquete.findByPk(idPaquete, { attributes: ['idPaquete'] });
  if (!paquete) throw new AppError('Paquete no encontrado', 404);

  return PaqueteEntregaFinal.findAll({
    where: { idPaquete },
    include: [{ model: Usuario, as: 'distribuidor', attributes: ['idUsuario', 'nombre', 'apellido'] }],
    order: [['fecha', 'ASC'], ['idPaqueteEntregaFinal', 'ASC']],
  });
};

// Autorización para GET /paquetes/:id/historial-entrega desde el móvil del
// distribuidor -- mismo criterio que registrarEntregaFinal (cubreSede): solo
// puede ver el historial de un paquete cuya sede (destino de la venta) cubra
// vía usuario_sede. El admin (vía consultar_venta) no pasa por acá, tiene
// acceso sin esta restricción -- ver paqueteController.getHistorialEntrega.
const distribuidorCubrePaquete = async (idPaquete, idUsuarioDistribuidor) => {
  const paquete = await Paquete.findByPk(idPaquete, {
    include: [{ model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] }],
  });
  const idDestino = paquete?.encomienda?.destinatario?.idDestino;
  if (!idDestino) return false;

  const cubre = await UsuarioSede.findOne({
    where: { idUsuario: idUsuarioDistribuidor, idDestino, habilitado: true },
  });
  return !!cubre;
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

const toggleHabilitado = async (id) => {
  const encomienda = await EncomiendaVenta.findByPk(id);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  let pasoACancelada = false;

  if (encomienda.habilitado) {
    // Inhabilitar: solo bloquea una venta "En Ruta" (paquetes físicamente en tránsito
    // en este momento) — a diferencia de antes, ya NO exige pasar primero por
    // "Cancelada" para poder inhabilitar una Programada (ver LOGICA.md, "Ventas —
    // Cancelada e inhabilitar/habilitar"). El estado no se toca acá; el filtro
    // `habilitado:true` que usan las cascadas de Ruta (ver rutaService.js) ya
    // protege a una venta inhabilitada de ser arrastrada mientras está oculta.
    if (encomienda.estado === 'En Ruta') {
      throw new AppError(
        'No se puede inhabilitar una venta que está en tránsito',
        409,
        [{ tipo: 'Estado activo', id: encomienda.idEncomiendaVenta, descripcion: 'Esta venta está "En Ruta" y no ha finalizado' }],
        'DEPENDENCY_CONFLICT'
      );
    }
  } else if (encomienda.estado === 'Programada') {
    // Rehabilitar una Programada: mientras estuvo inhabilitada, su ruta pudo haber
    // avanzado (salió, se completó, se canceló) sin que la sincronización de fechas de
    // rutaService.update() la tocara (esa sincronización solo alcanza a las ventas
    // habilitadas). Se revisa acá, en el único momento en que vuelve a quedar "viva".
    const ruta = await Ruta.findByPk(encomienda.idRuta);
    if (!rutaSigueSirviendo(ruta)) {
      // La ruta ya no sirve para esta venta (salió/terminó/se canceló, o quedó
      // inhabilitada) — queda Cancelada para forzar la reasignación (editable, ver
      // update() más abajo).
      encomienda.estado = 'Cancelada';
      pasoACancelada = true;
    } else {
      // La ruta sigue Programada — se corrige la fecha SOLO si ya no alcanza el
      // mínimo actual (no se pisa un margen manual que sigue siendo válido, distinto
      // del "sincronizar siempre" de rutaService.update(): ahí el disparador es que
      // la ruta cambió; acá el disparador es que la venta se reactiva, la ruta pudo
      // no haber cambiado en absoluto — ver LOGICA.md).
      const minimaEntrega = ruta.fechaLlegadaEstimada || sumarDias(ruta.fechaSalida, 1);
      if (!encomienda.fechaEstimadaEntrega || encomienda.fechaEstimadaEntrega < minimaEntrega) {
        encomienda.fechaEstimadaEntrega = minimaEntrega;
      }
    }
  }

  encomienda.habilitado = !encomienda.habilitado;
  await encomienda.save();

  const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'destino' }] },
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
      RUTA_INCLUDE,
    ],
  });

  return { encomienda: encomiendaActualizada, pasoACancelada };
};

// Reactiva una venta "Cancelada" a "Programada" sin pasar por el wizard de Editar —
// para el caso en que no hace falta cambiar ningún dato: la ruta ya volvió a servir
// sola (ej. se canceló y se reprogramó) y no hay nada que reasignar. Único llamador:
// el clic en "Programada" del menú de Estado en el listado (frontend:
// EstadoVentaCancelada.jsx), que solo lo habilita cuando ya confirmó
// rutaSigueSirviendo() del lado del cliente — se revalida igual acá, fuente de
// verdad, por si la ruta cambió de estado justo en el medio. Ver LOGICA.md, "Ventas
// — Cancelada e inhabilitar/habilitar".
const reactivar = async (id) => {
  const encomienda = await EncomiendaVenta.findByPk(id);
  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }
  if (encomienda.habilitado === false) {
    throw new AppError('Esta venta está inhabilitada: habilítala primero', 400);
  }
  if (encomienda.estado !== 'Cancelada') {
    throw new AppError(`Esta venta ya está en estado "${encomienda.estado}": no hace falta reactivarla`, 400);
  }

  const ruta = await Ruta.findByPk(encomienda.idRuta);
  if (!rutaSigueSirviendo(ruta)) {
    throw new AppError('La ruta de esta venta ya no está disponible: edítala para asignarle una ruta nueva', 400);
  }

  // Mismo criterio que toggleHabilitado() al rehabilitar una venta "Programada" (ver
  // arriba): se corrige la fecha SOLO si ya no alcanza el mínimo actual de la ruta —
  // no se pisa un margen manual que sigue siendo válido. Distinto del "sincronizar
  // siempre" de rutaService.update() (ahí el disparador es que la ruta cambió; acá
  // el disparador es que la venta se reactiva, la ruta pudo no haber cambiado nada).
  const minimaEntrega = ruta.fechaLlegadaEstimada || sumarDias(ruta.fechaSalida, 1);
  if (!encomienda.fechaEstimadaEntrega || encomienda.fechaEstimadaEntrega < minimaEntrega) {
    encomienda.fechaEstimadaEntrega = minimaEntrega;
  }
  encomienda.estado = 'Programada';
  await encomienda.save();

  return EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'destino' }] },
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
      RUTA_INCLUDE,
    ],
  });
};

// El orden por defecto de getAll es [fechaRegistro DESC, idEncomiendaVenta DESC] —
// el desempate también tiene que ser DESC (Op.gt), no ASC. Con fechaRegistro
// siendo un DATEONLY, es normal que varias ventas del mismo día empaten ahí y
// dependan del desempate para quedar en el orden correcto.
const getPageOf = async (id, { limit = 10, rol, idSede } = {}) => {
  const Op = sequelize.Sequelize.Op;
  const record = await EncomiendaVenta.findByPk(id, { attributes: ['idEncomiendaVenta', 'fechaRegistro', 'idSede'] });
  if (!record) throw new AppError('Encomienda no encontrada', 404);
  if (rol === 'operador_sede' && record.idSede !== idSede) {
    throw new AppError('No tienes acceso a esta venta', 403);
  }
  const where = {
    [Op.or]: [
      { fechaRegistro: { [Op.gt]: record.fechaRegistro } },
      { fechaRegistro: record.fechaRegistro, idEncomiendaVenta: { [Op.gt]: parseInt(id) } },
    ],
  };
  if (rol === 'operador_sede') where.idSede = idSede;
  const before = await EncomiendaVenta.count({ where });
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
  toggleHabilitado,
  reactivar,
  getPageOf,
  getRangoFechas,
  actualizarEstadoPaquete,
  dejarPaquetesEnSede,
  getPaquetesEnSede,
  getHistorialSedeDistribuidor,
  registrarEntregaFinal,
  getHistorialEntregaFinal,
  distribuidorCubrePaquete,
  getPaquetesDevueltos,
  getAniosDisponiblesPaquetesDevueltos,
};
