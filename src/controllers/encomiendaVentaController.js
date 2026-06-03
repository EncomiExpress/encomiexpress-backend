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
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
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

exports.getByGuia = async (req, res, next) => {
  try {
    const { numeroGuia } = req.params;
    const encomienda = await encomiendaService.getByGuia(numeroGuia);
    res.json({ success: true, data: encomienda });
  } catch (error) {
    next(error);
  }
};

exports.getPublicByToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const encomienda = await encomiendaService.getPublicByToken(token);
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

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    await encomiendaService.delete(id);
    res.json({ success: true, message: 'Encomienda deshabilitada exitosamente' });
  } catch (error) {
    next(error);
  }
};

exports.agregarPaquete = async (req, res, next) => {
  try {
    const { idEncomiendaVenta } = req.params;
    const paquete = await encomiendaService.agregarPaquete(idEncomiendaVenta, req.body);
    res.status(201).json({ success: true, message: 'Paquete agregado exitosamente', data: paquete });
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

exports.agregarDestinatario = async (req, res, next) => {
  try {
    const { idEncomiendaVenta } = req.params;
    const destinatario = await encomiendaService.agregarDestinatario(idEncomiendaVenta, req.body);
    res.status(201).json({ success: true, message: 'Destinatario agregado exitosamente', data: destinatario });
  } catch (error) {
    next(error);
  }
};
