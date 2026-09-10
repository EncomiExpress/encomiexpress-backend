const encomiendaService = require('../services/encomiendaService');

// Contexto de sede del solicitante — solo tiene efecto para 'operador_sede'
// (ver LOGICA.md, "Sedes remotas"); para el resto de roles, idSede va undefined
// y los filtros/guardias de encomiendaService no se activan.
const contextoSede = (req) => ({
  rol: req.usuario?.rol?.codigo,
  idSede: req.sede?.idDestino,
});

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const q = req.query.q;
    const filters = {
      estado: req.query.estado,
      idCliente: req.query.idCliente,
      idRuta: req.query.idRuta,
      habilitado: req.query.habilitado,
      estadoPago: req.query.estadoPago,
      metodoPago: req.query.metodoPago,
      page,
      limit,
      sortBy,
      q,
      ...contextoSede(req),
    };
    const result = await encomiendaService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const encomienda = await encomiendaService.getById(id, contextoSede(req));
    res.json({ success: true, data: encomienda });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const encomienda = await encomiendaService.create(req.body, contextoSede(req));
    res.status(201).json({ success: true, message: 'Encomienda creada exitosamente', data: encomienda });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const encomienda = await encomiendaService.update(id, req.body);
    res.json({ success: true, message: 'Encomienda actualizada exitosamente', data: encomienda });
  } catch (error) {
    next(error);
  }
};

exports.cambiarEstadoPago = async (req, res, next) => {
  try {
    const { id } = req.params;
    const encomienda = await encomiendaService.cambiarEstadoPago(id, req.body.estadoPago);
    res.json({ success: true, message: 'Estado de pago actualizado exitosamente', data: encomienda });
  } catch (error) {
    next(error);
  }
};

exports.toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    // pasoACancelada (ver encomiendaService.toggleHabilitado) ya no se anuncia acá —
    // mismo criterio que Rutas: el toast se queda corto, el aviso va antes de
    // confirmar, en ModalInhabilitarVenta.jsx.
    const { encomienda } = await encomiendaService.toggleHabilitado(id);
    res.json({
      success: true,
      message: `Encomienda ${encomienda.habilitado ? 'habilitada' : 'inhabilitada'} exitosamente`,
      data: encomienda
    });
  } catch (error) {
    next(error);
  }
};

exports.reactivar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const encomienda = await encomiendaService.reactivar(id);
    res.json({ success: true, message: 'Venta reactivada exitosamente', data: encomienda });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const data = await encomiendaService.getPageOf(req.params.id, { limit, ...contextoSede(req) });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getRangoFechas = async (req, res, next) => {
  try {
    const data = await encomiendaService.getRangoFechas();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getPaquetesDevueltos = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await encomiendaService.getPaquetesDevueltos({
      q: req.query.q,
      anio: req.query.anio,
      mes: req.query.mes,
      habilitado: req.query.habilitado,
      page,
      limit,
    });
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getAniosDisponiblesPaquetesDevueltos = async (req, res, next) => {
  try {
    const anios = await encomiendaService.getAniosDisponiblesPaquetesDevueltos();
    res.json({ success: true, data: anios });
  } catch (error) {
    next(error);
  }
};
