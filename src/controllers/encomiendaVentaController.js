const encomiendaService = require('../services/encomiendaService');

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
    const encomienda = await encomiendaService.getById(id);
    res.json({ success: true, data: encomienda });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const encomienda = await encomiendaService.create(req.body, req.file?.path);
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

exports.cambiarEstado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const encomienda = await encomiendaService.cambiarEstado(id, req.body.estado);
    res.json({ success: true, message: 'Estado de encomienda actualizado exitosamente', data: encomienda });
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
    const encomienda = await encomiendaService.toggleHabilitado(id);
    res.json({
      success: true,
      message: `Encomienda ${encomienda.habilitado ? 'habilitada' : 'inhabilitada'} exitosamente`,
      data: encomienda
    });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const data = await encomiendaService.getPageOf(req.params.id, { limit });
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

exports.actualizarEstadoPaquete = async (req, res, next) => {
  try {
    const paquete = await encomiendaService.actualizarEstadoPaquete(req.params.idPaquete, req.body.estado, {
      observacion: req.body.observacion,
      fotoEntrega: req.body.fotoEntrega || null,
    });
    res.json({ success: true, message: 'Estado del paquete actualizado correctamente', data: paquete });
  } catch (error) {
    next(error);
  }
};

exports.getPaquetesDevueltos = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await encomiendaService.getPaquetesDevueltos({ q: req.query.q, page, limit });
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.actualizarVariosPaquetes = async (req, res, next) => {
  try {
    const paquetes = await encomiendaService.actualizarVariosPaquetes(req.body.idsPaquetes || [], req.body.estado, {
      observacion: req.body.observacion,
      fotoEntrega: req.body.fotoEntrega || null,
    });
    res.json({ success: true, message: 'Estados de paquetes actualizados correctamente', data: paquetes });
  } catch (error) {
    next(error);
  }
};
