const vehiculoService = require('../services/vehiculoService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const { estado, tipo, habilitado, q, idPropietario } = req.query;
    const filters = { estado, tipo, habilitado, q, idPropietario, page, limit, sortBy };
    const result = await vehiculoService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vehiculo = await vehiculoService.getById(id);
    res.json({ success: true, data: vehiculo });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const vehiculo = await vehiculoService.create(req.body);
    res.status(201).json({ success: true, message: 'Vehículo creado exitosamente', data: vehiculo });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vehiculo = await vehiculoService.update(id, req.body);
    res.json({ success: true, message: 'Vehículo actualizado exitosamente', data: vehiculo });
  } catch (error) {
    next(error);
  }
};

exports.cambiarEstado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await vehiculoService.cambiarEstado(id, req.body.estado);
    res.json({ success: true, message: 'Estado del vehículo actualizado correctamente', data: result });
  } catch (error) {
    next(error);
  }
};

exports.toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vehiculo = await vehiculoService.toggleHabilitado(id);
    res.json({
      success: true,
      message: `Vehículo ${vehiculo.habilitado ? 'habilitado' : 'inhabilitado'} exitosamente`,
      data: vehiculo
    });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await vehiculoService.getPageOf(id, { limit });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
