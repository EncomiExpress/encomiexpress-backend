const { EncomiendaVenta, Destinatario, Paquete, Cliente, Ruta, Vehiculo, Conductor, Destino, Usuario, sequelize } = require('../models');
const AppError = require('../errors/appError');
const crypto = require('crypto');

const ESTADOS_VALIDOS = [
  'Programada',
  'En Tránsito',
  'Entregada',
  'Cancelada',
];
const METODOS_PAGO_VALIDOS = ['Contraentrega', 'Efectivo', 'Transferencia', 'Nequi'];
const ESTADOS_PAGO_VALIDOS = ['Pendiente', 'Pagado'];

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
  const anio = new Date().getFullYear();

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

// Ya no se deriva de numeroGuia (la venta no tiene uno único cuando hay varios
// paquetes) — un token aleatorio es además más seguro que hashear un número
// de guía secuencial y por tanto parcialmente adivinable.
const generarTokenSeguimiento = () => crypto.randomBytes(16).toString('hex');

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
      { '$ruta.nombre_ruta$': { [Op.iLike]: `%${trimmed}%` } },
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
      {
        model: Ruta,
        as: 'ruta',
        required: false,
        include: [
          { model: Vehiculo, as: 'vehiculo', required: false },
          {
            model: Conductor,
            as: 'conductor',
            required: false,
            include: [{ model: Usuario, as: 'usuario', required: false }],
          },
          { model: Destino, as: 'destino', required: false },
        ],
      },
      { model: Destinatario, as: 'destinatario' },
      { model: Paquete, as: 'paquetes', separate: true },
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
      {
        model: Ruta,
        as: 'ruta',
        required: false,
        include: [
          { model: Vehiculo, as: 'vehiculo', required: false },
          {
            model: Conductor,
            as: 'conductor',
            required: false,
            include: [{ model: Usuario, as: 'usuario', required: false }],
          },
          { model: Destino, as: 'destino', required: false },
        ],
      },
      { model: Destinatario, as: 'destinatario' },
      { model: Paquete, as: 'paquetes' },
    ],
  });

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  return encomienda;
};

// Backend listo para seguimiento público por link (token en la URL, sin login) — pendiente
// de decidir si se implementa: falta construir la página /seguimiento en el frontend que
// consuma este endpoint. Ver nota en CLAUDE.md.
const getPublicByToken = async (token) => {
  const encomienda = await EncomiendaVenta.findOne({
    where: { tokenSeguimiento: token, habilitado: true },
    include: [
      { model: Cliente, as: 'cliente', attributes: ['nombre', 'apellido'] },
      {
        model: Ruta,
        as: 'ruta',
        required: false,
        attributes: ['idRuta'],
        include: [
          { model: Destino, as: 'destino', required: false, attributes: ['ciudad', 'departamento'] },
        ],
      },
      { model: Destinatario, as: 'destinatario' },
      { model: Paquete, as: 'paquetes', limit: 1 },
    ],
  });

  if (!encomienda) throw new AppError('Encomienda no encontrada', 404);

  return {
    numeroGuia: encomienda.paquetes?.[0]?.numeroGuia || null,
    estado: encomienda.estado,
    fechaRegistro: encomienda.fechaRegistro,
    fechaEstimadaEntrega: encomienda.fechaEstimadaEntrega,
    remitente: `${encomienda.cliente?.nombre || ''} ${encomienda.cliente?.apellido || ''}`.trim(),
    destinatario: encomienda.destinatario?.nombreDestinatario || null,
    destino:
      encomienda.ruta && encomienda.ruta.destino
        ? `${encomienda.ruta.destino.ciudad} - ${encomienda.ruta.destino.departamento}`
        : null,
  };
};

// Suma el peso de los paquetes de todas las ventas ya asignadas a una ruta (sin contar
// las canceladas ni, si se indica, la propia venta que se está editando) — usado para
// saber cuánta capacidad del vehículo ya está ocupada antes de aceptar una venta nueva.
const getPesoUsadoEnRuta = async (idRuta, excluirIdEncomienda, transaction) => {
  const where = { idRuta, estado: { [sequelize.Sequelize.Op.ne]: 'Cancelada' } };
  if (excluirIdEncomienda) {
    where.idEncomiendaVenta = { [sequelize.Sequelize.Op.ne]: excluirIdEncomienda };
  }
  const ventas = await EncomiendaVenta.findAll({
    where,
    include: [{ model: Paquete, as: 'paquetes', attributes: ['peso'] }],
    transaction,
  });
  return ventas.reduce(
    (total, venta) => total + venta.paquetes.reduce((sum, p) => sum + parseFloat(p.peso || 0), 0),
    0
  );
};

const validarCapacidadRuta = async (idRuta, paquetesNuevos, transaction, excluirIdEncomienda) => {
  const ruta = await Ruta.findByPk(idRuta, {
    include: [{ model: Vehiculo, as: 'vehiculo' }],
    transaction,
  });

  if (!ruta || !ruta.vehiculo || !ruta.vehiculo.capacidad) return;

  const pesoNuevo = (paquetesNuevos || []).reduce((sum, p) => sum + parseFloat(p.peso || 0), 0);
  const pesoUsado = await getPesoUsadoEnRuta(idRuta, excluirIdEncomienda, transaction);
  const capacidad = parseFloat(ruta.vehiculo.capacidad);
  const disponible = capacidad - pesoUsado;

  if (pesoNuevo > disponible) {
    // No hacemos rollback aquí — el try/catch de create()/update() ya lo hace al
    // capturar este error. Llamarlo dos veces revienta con "Transaction cannot be
    // rolled back because it has been finished with state: rollback".
    throw new AppError(
      `Esta ruta ya no tiene espacio suficiente. Quedan ${disponible.toFixed(2)} kg disponibles y este envío pesa ${pesoNuevo.toFixed(2)} kg.`,
      400
    );
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
      valorServicio,
      impuestos,
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
    await validarCapacidadRuta(idRuta, paquetes, transaction);

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

    const valorImpuestos = impuestos || 0;
    const total = (valorServicio || 0) + valorImpuestos;
    const tokenSeguimiento = generarTokenSeguimiento();

    const encomienda = await EncomiendaVenta.create(
      {
        idCliente,
        idRuta,
        tokenSeguimiento,
        fechaEstimadaEntrega: fechaEstimadaEntrega || null,
        observaciones: observaciones || null,
        valorServicio: valorServicio || 0,
        impuestos: valorImpuestos,
        total,
        metodoPago: metodoPago ? (METODOS_PAGO_VALIDOS.find(v => v.toLowerCase() === metodoPago.toLowerCase()) || null) : null,
        estadoPago: ESTADOS_PAGO_VALIDOS.find(v => v.toLowerCase() === (estadoPago || 'Pendiente').toLowerCase()) || 'Pendiente',
        estado: 'Programada',
      },
      { transaction }
    );

    if (destinatario) {
      await Destinatario.create(
        {
          idEncomiendaVenta: encomienda.idEncomiendaVenta,
          nombreDestinatario: destinatario.nombreDestinatario,
          telefonoDestinatario: destinatario.telefonoDestinatario || null,
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
            numeroGuia: await generarNumeroGuia(transaction),
            descripcionContenido: pkg.descripcionContenido || null,
            peso: pkg.peso || null,
            alto: pkg.alto || null,
            ancho: pkg.ancho || null,
            profundidad: pkg.profundidad || null,
            valorDeclarado: pkg.valorDeclarado || null,
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    const encomiendaCompleta = await EncomiendaVenta.findByPk(encomienda.idEncomiendaVenta, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Ruta, as: 'ruta', required: false },
        { model: Destinatario, as: 'destinatario' },
        { model: Paquete, as: 'paquetes' },
      ],
    });

    // Envío de correo de seguimiento desactivado a propósito: la página /rastreo del
    // frontend todavía no existe. Ver sendTrackingEmail en config/email.js.

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
      valorServicio,
      impuestos,
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

    const nuevoImpuestos =
      impuestos !== undefined ? parseDecimal(impuestos) : parseDecimal(encomienda.impuestos);
    const nuevoValorServicio =
      valorServicio !== undefined
        ? parseDecimal(valorServicio)
        : parseDecimal(encomienda.valorServicio);
    const nuevoTotal = nuevoImpuestos + nuevoValorServicio;

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
    // Si esta venta no manda paquetes nuevos, se valida con los que ya tenía
    // (no están cambiando, pero igual cuentan para el peso de la ruta).
    const paquetesParaValidar = paquetes && paquetes.length > 0
      ? paquetes
      : await Paquete.findAll({ where: { idEncomiendaVenta: id }, attributes: ['peso'], transaction });
    await validarCapacidadRuta(nuevoIdRuta, paquetesParaValidar, transaction, parseInt(id));

    await encomienda.update(
      {
        idRuta: nuevoIdRuta,
        fechaEstimadaEntrega:
          fechaEstimadaEntrega !== undefined
            ? fechaEstimadaEntrega
            : encomienda.fechaEstimadaEntrega,
        observaciones: observaciones !== undefined ? observaciones : encomienda.observaciones,
        valorServicio: nuevoValorServicio,
        impuestos: nuevoImpuestos,
        total: nuevoTotal,
        metodoPago: metodoPago !== undefined ? (metodoPago ? METODOS_PAGO_VALIDOS.find(v => v.toLowerCase() === metodoPago.toLowerCase()) || encomienda.metodoPago : null) : encomienda.metodoPago,
        estadoPago: estadoPago !== undefined ? (ESTADOS_PAGO_VALIDOS.find(v => v.toLowerCase() === estadoPago.toLowerCase()) || encomienda.estadoPago) : encomienda.estadoPago,
        habilitado: habilitado !== undefined ? habilitado : encomienda.habilitado,
      },
      { transaction }
    );

    if (destinatario) {
      const destinatarioExistente = await Destinatario.findOne({
        where: { idEncomiendaVenta: id },
      });

      if (destinatarioExistente) {
        await destinatarioExistente.update(
          {
            nombreDestinatario:
              destinatario.nombreDestinatario || destinatarioExistente.nombreDestinatario,
            telefonoDestinatario: destinatario.telefonoDestinatario || null,
            direccionDestinatario: destinatario.direccionDestinatario || null,
          },
          { transaction }
        );
      } else {
        await Destinatario.create(
          {
            idEncomiendaVenta: id,
            nombreDestinatario: destinatario.nombreDestinatario,
            telefonoDestinatario: destinatario.telefonoDestinatario || null,
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
      // existían se actualizan en el mismo registro, y los que ya no vienen en el
      // payload (se quitaron en el formulario) se eliminan.
      const existentes = await Paquete.findAll({ where: { idEncomiendaVenta: id }, transaction });
      const existentesPorId = new Map(existentes.map((p) => [p.idPaquete, p]));
      const idsConservados = new Set();

      for (const pkg of paquetes) {
        const datos = {
          descripcionContenido: pkg.descripcionContenido || null,
          peso: pkg.peso || null,
          alto: pkg.alto || null,
          ancho: pkg.ancho || null,
          profundidad: pkg.profundidad || null,
          valorDeclarado: pkg.valorDeclarado || null,
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
        { model: Ruta, as: 'ruta', required: false },
        { model: Destinatario, as: 'destinatario' },
        { model: Paquete, as: 'paquetes' },
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

  if (estadoPago === 'Pagado' && encomienda.metodoPago === 'Contraentrega' && encomienda.estado !== 'Entregada') {
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
    const ESTADOS_FINALES = ['Entregada', 'Cancelada'];
    if (!ESTADOS_FINALES.includes(encomienda.estado)) {
      throw new AppError(
        `No se puede inhabilitar la encomienda porque está en estado "${encomienda.estado}"`,
        409,
        [{ tipo: 'Estado activo', id: encomienda.idEncomiendaVenta, descripcion: `La encomienda #${encomienda.idEncomiendaVenta} está en estado "${encomienda.estado}" y no ha finalizado` }],
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  const nuevoEstado = !encomienda.habilitado;
  await encomienda.update({ habilitado: nuevoEstado });

  const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente' },
      { model: Destinatario, as: 'destinatario' },
      { model: Paquete, as: 'paquetes' },
      {
        model: Ruta,
        as: 'ruta',
        required: false,
        include: [
          { model: Vehiculo, as: 'vehiculo', required: false },
          {
            model: Conductor,
            as: 'conductor',
            required: false,
            include: [{ model: Usuario, as: 'usuario', required: false }],
          },
          { model: Destino, as: 'destino', required: false },
        ],
      },
    ],
  });

  return encomiendaActualizada;
};

const getPageOf = async (id, { limit = 10 } = {}) => {
  const Op = sequelize.Sequelize.Op;
  const record = await EncomiendaVenta.findByPk(id, { attributes: ['idEncomiendaVenta', 'fechaRegistro'] });
  if (!record) throw new AppError('Encomienda no encontrada', 404);
  const before = await EncomiendaVenta.count({
    where: {
      [Op.or]: [
        { fechaRegistro: { [Op.gt]: record.fechaRegistro } },
        { fechaRegistro: record.fechaRegistro, idEncomiendaVenta: { [Op.lt]: parseInt(id) } },
      ],
    },
  });
  return { page: Math.floor(before / limit) + 1 };
};

module.exports = {
  getAll,
  getById,
  getPublicByToken,
  create,
  update,
  cambiarEstado,
  cambiarEstadoPago,
  toggleHabilitado,
  getPageOf,
};
