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

// Genera numeroGuia secuencial por año (EE-2026-000042). pg_advisory_xact_lock serializa
// solo este paso puntual (conteo + siguiente número) entre transacciones concurrentes que
// registren una venta en el mismo año; se libera solo al terminar la transacción. Así se
// evita el choque de números sin necesitar una tabla contador.
const generarNumeroGuia = async (transaction) => {
  const anio = new Date().getFullYear();

  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', {
    replacements: { clave: `guia-${anio}` },
    transaction,
  });

  const totalAnio = await EncomiendaVenta.count({
    where: { numeroGuia: { [sequelize.Sequelize.Op.like]: `EE-${anio}-%` } },
    transaction,
  });

  const secuencia = (totalAnio + 1).toString().padStart(6, '0');
  return `EE-${anio}-${secuencia}`;
};

const generarTokenSeguimiento = (numeroGuia) => {
  return crypto
    .createHash('sha256')
    .update(numeroGuia + (process.env.JWT_SECRET || 'secret'))
    .digest('hex')
    .substring(0, 32);
};

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaRegistro', 'estado', 'estadoPago', 'numeroGuia', 'idEncomiendaVenta', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaRegistro';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
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
      { numeroGuia: { [Op.iLike]: `%${trimmed}%` } },
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
      { model: Destinatario, as: 'destinatarios', separate: true },
      { model: Paquete, as: 'paquetes', separate: true },
    ],
    limit,
    offset,
    order: order.length > 0 ? order : [['fechaRegistro', 'DESC']],
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
      { model: Destinatario, as: 'destinatarios' },
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
      { model: Destinatario, as: 'destinatarios', limit: 1 },
      { model: Paquete, as: 'paquetes', limit: 1 },
    ],
  });

  if (!encomienda) throw new AppError('Encomienda no encontrada', 404);

  return {
    numeroGuia: encomienda.numeroGuia,
    estado: encomienda.estado,
    fechaRegistro: encomienda.fechaRegistro,
    fechaEstimadaEntrega: encomienda.fechaEstimadaEntrega,
    remitente: `${encomienda.cliente?.nombre || ''} ${encomienda.cliente?.apellido || ''}`.trim(),
    destinatario:
      encomienda.destinatarios && encomienda.destinatarios[0]
        ? encomienda.destinatarios[0].nombreDestinatario
        : null,
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

    const numeroGuia = await generarNumeroGuia(transaction);

    const valorImpuestos = impuestos || 0;
    const total = (valorServicio || 0) + valorImpuestos;
    const tokenSeguimiento = generarTokenSeguimiento(numeroGuia);

    const encomienda = await EncomiendaVenta.create(
      {
        idCliente,
        idRuta,
        tokenSeguimiento,
        numeroGuia,
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
        { model: Destinatario, as: 'destinatarios' },
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
      await Paquete.destroy({ where: { idEncomiendaVenta: id }, transaction });

      for (const pkg of paquetes) {
        await Paquete.create(
          {
            idEncomiendaVenta: id,
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

    const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Ruta, as: 'ruta', required: false },
        { model: Destinatario, as: 'destinatarios' },
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
        [{ tipo: 'Estado activo', id: encomienda.idEncomiendaVenta, descripcion: `La encomienda ${encomienda.numeroGuia || '#' + encomienda.idEncomiendaVenta} está en estado "${encomienda.estado}" y no ha finalizado` }],
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  const nuevoEstado = !encomienda.habilitado;
  await encomienda.update({ habilitado: nuevoEstado });

  const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente' },
      { model: Destinatario, as: 'destinatarios' },
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
