const { EncomiendaVenta, Destinatario, Paquete, Cliente, Ruta, Vehiculo, Conductor, Destino, sequelize } = require('../models');
const { Usuario } = require('../models');
const AppError = require('../errors/appError');
const crypto = require('crypto');
const { sendTrackingEmail } = require('../config/email');

const ESTADOS_VALIDOS = [
  'pendiente de recogida',
  'en recogida',
  'programada',
  'en tránsito',
  'entregado',
  'devuelto',
  'activo',
  'inactivo',
];
const METODOS_PAGO_VALIDOS = ['Contraentrega', 'Efectivo', 'Transferencia', 'Nequi'];
const ESTADOS_PAGO_VALIDOS = ['Pendiente', 'Pagado'];

const generarNumeroGuia = async () => {
  const prefix = 'EE';
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
};

const generarTokenSeguimiento = (numeroGuia) => {
  return crypto
    .createHash('sha256')
    .update(numeroGuia + (process.env.JWT_SECRET || 'secret'))
    .digest('hex')
    .substring(0, 32);
};

const getAll = async ({ estado, idCliente, fechaInicio, fechaFin }) => {
  const where = {};
  if (estado) where.estado = estado;
  if (idCliente) where.idCliente = idCliente;
  if (fechaInicio && fechaFin) {
    where.fechaRegistro = {
      [sequelize.Sequelize.Op.between]: [fechaInicio, fechaFin],
    };
  }

  const encomiendas = await EncomiendaVenta.findAll({
    where,
    include: [
      { model: Cliente, as: 'cliente' },
      {
        model: Ruta,
        as: 'ruta',
        required: false,
        include: [
          { model: Vehiculo, as: 'vehiculo', required: false },
          { model: Destino, as: 'destino', required: false },
        ],
      },
      { model: Destinatario, as: 'destinatarios' },
      { model: Paquete, as: 'paquetes' },
    ],
    order: [['fechaRegistro', 'DESC']],
  });

  return encomiendas;
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

const getByGuia = async (numeroGuia) => {
  const encomienda = await EncomiendaVenta.findOne({
    where: { numeroGuia },
    include: [
      { model: Cliente, as: 'cliente' },
      {
        model: Ruta,
        as: 'ruta',
        required: false,
        include: [
          { model: Vehiculo, as: 'vehiculo', required: false },
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

// ⚠️ FIX: función movida ANTES de module.exports para que sea accesible al exportar
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

const create = async (data) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      idCliente,
      idRuta,
      numeroFactura,
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
      await transaction.rollback();
      throw new AppError('Cliente no encontrado', 400);
    }

    if (idRuta) {
      const ruta = await Ruta.findByPk(idRuta);
      if (!ruta) {
        await transaction.rollback();
        throw new AppError('Ruta no encontrada', 400);
      }
    }

    if (
      metodoPago &&
      !METODOS_PAGO_VALIDOS.some((v) => v.toLowerCase() === metodoPago.toLowerCase())
    ) {
      await transaction.rollback();
      throw new AppError(`Método de pago inválido. Opciones: ${METODOS_PAGO_VALIDOS.join(', ')}`, 400);
    }

    if (
      estadoPago &&
      !ESTADOS_PAGO_VALIDOS.some((v) => v.toLowerCase() === estadoPago.toLowerCase())
    ) {
      await transaction.rollback();
      throw new AppError(`Estado de pago inválido. Opciones: ${ESTADOS_PAGO_VALIDOS.join(', ')}`, 400);
    }

    let numeroGuia = await generarNumeroGuia();
    let guiaExistente = await EncomiendaVenta.findOne({ where: { numeroGuia } });
    while (guiaExistente) {
      numeroGuia = await generarNumeroGuia();
      guiaExistente = await EncomiendaVenta.findOne({ where: { numeroGuia } });
    }

    const valorImpuestos = impuestos || 0;
    const total = (valorServicio || 0) + valorImpuestos;
    const tokenSeguimiento = generarTokenSeguimiento(numeroGuia);

    const encomienda = await EncomiendaVenta.create(
      {
        idCliente,
        idRuta: idRuta || null,
        tokenSeguimiento,
        numeroGuia,
        numeroFactura: numeroFactura || null,
        fechaEstimadaEntrega: fechaEstimadaEntrega || null,
        observaciones: observaciones || null,
        valorServicio: valorServicio || 0,
        impuestos: valorImpuestos,
        total,
        metodoPago: metodoPago || null,
        estadoPago: estadoPago || 'Pendiente',
        estado: 'pendiente de recogida',
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

    try {
      const clienteEmail = cliente.email || null;
      if (clienteEmail) {
        await sendTrackingEmail(clienteEmail, numeroGuia, tokenSeguimiento);
      }
    } catch (e) {
      console.error('Error enviando correo de seguimiento:', e.message || e);
    }

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
      numeroFactura,
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
      await transaction.rollback();
      throw new AppError('Encomienda no encontrada', 404);
    }

    if (
      metodoPago &&
      !METODOS_PAGO_VALIDOS.some((v) => v.toLowerCase() === metodoPago.toLowerCase())
    ) {
      throw new AppError(`Método de pago inválido. Opciones: ${METODOS_PAGO_VALIDOS.join(', ')}`, 400);
    }

    if (
      estadoPago &&
      !ESTADOS_PAGO_VALIDOS.some((v) => v.toLowerCase() === estadoPago.toLowerCase())
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

    let nuevoIdRuta = encomienda.idRuta;
    if (idRuta !== undefined) {
      if (idRuta && !isNaN(parseInt(idRuta)) && parseInt(idRuta) > 0) {
        nuevoIdRuta = parseInt(idRuta);
      } else {
        nuevoIdRuta = null;
      }
    }

    await encomienda.update(
      {
        idRuta: nuevoIdRuta,
        numeroFactura: numeroFactura !== undefined ? numeroFactura : encomienda.numeroFactura,
        fechaEstimadaEntrega:
          fechaEstimadaEntrega !== undefined
            ? fechaEstimadaEntrega
            : encomienda.fechaEstimadaEntrega,
        observaciones: observaciones !== undefined ? observaciones : encomienda.observaciones,
        valorServicio: nuevoValorServicio,
        impuestos: nuevoImpuestos,
        total: nuevoTotal,
        metodoPago: metodoPago !== undefined ? metodoPago : encomienda.metodoPago,
        estadoPago: estadoPago !== undefined ? estadoPago : encomienda.estadoPago,
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

  // Normalizar a minúsculas para comparación consistente
  const estadoNormalizado = typeof estado === 'string' ? estado.toLowerCase() : estado;

  if (!ESTADOS_VALIDOS.includes(estadoNormalizado)) {
    throw new AppError(`Estado inválido. Opciones: ${ESTADOS_VALIDOS.join(', ')}`, 400);
  }

  await encomienda.update({ estado: estadoNormalizado });

  return encomienda;
};

const deleteEncomienda = async (id) => {
  const encomienda = await EncomiendaVenta.findByPk(id);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  await encomienda.update({ habilitado: false });

  return { message: 'Encomienda deshabilitada exitosamente' };
};

const toggleHabilitado = async (id) => {
  const encomienda = await EncomiendaVenta.findByPk(id);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  const nuevoEstado = !encomienda.habilitado;
  await encomienda.update({ habilitado: nuevoEstado });

  const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente' },
      { model: Destinatario, as: 'destinatarios' },
      { model: Paquete, as: 'paquetes' },
      { model: Ruta, as: 'ruta', required: false },
    ],
  });

  return encomiendaActualizada;
};

const agregarPaquete = async (idEncomiendaVenta, data) => {
  const { descripcionContenido, peso, alto, ancho, profundidad, valorDeclarado } = data;

  const encomienda = await EncomiendaVenta.findByPk(idEncomiendaVenta);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  const paquete = await Paquete.create({
    idEncomiendaVenta,
    descripcionContenido: descripcionContenido || null,
    peso: peso || null,
    alto: alto || null,
    ancho: ancho || null,
    profundidad: profundidad || null,
    valorDeclarado: valorDeclarado || null,
  });

  return paquete;
};

const agregarDestinatario = async (idEncomiendaVenta, data) => {
  const { nombreDestinatario, telefonoDestinatario, direccionDestinatario } = data;

  const encomienda = await EncomiendaVenta.findByPk(idEncomiendaVenta);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  const destinatario = await Destinatario.create({
    idEncomiendaVenta,
    nombreDestinatario,
    telefonoDestinatario: telefonoDestinatario || null,
    direccionDestinatario: direccionDestinatario || null,
  });

  return destinatario;
};

module.exports = {
  generarNumeroGuia,
  getAll,
  getById,
  getByGuia,
  getPublicByToken, // ⚠️ FIX: ahora sí se exporta correctamente
  create,
  update,
  cambiarEstado,
  delete: deleteEncomienda,
  toggleHabilitado,
  agregarPaquete,
  agregarDestinatario,
};