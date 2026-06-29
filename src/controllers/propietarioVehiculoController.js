const propietarioService = require('../services/propietarioService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const filters = { habilitado: req.query.habilitado, q: req.query.q, tipoFlota: req.query.tipoFlota, page, limit, sortBy };
    const result = await propietarioService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const propietario = await propietarioService.getById(id);
    res.json({ success: true, data: propietario });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const propietario = await propietarioService.create(req.body);
    res.status(201).json({ success: true, message: 'Propietario creado exitosamente', data: propietario });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const propietario = await propietarioService.update(id, req.body);
    res.json({ success: true, message: 'Propietario actualizado exitosamente', data: propietario });
  } catch (error) {
    next(error);
  }
};

exports.delete = async (req, res, next) => {
  // Método obsoleto: use PATCH /propietarios/:id/toggle-habilitado
  res.status(405).json({ success: false, message: 'Método obsoleto. Use PATCH /propietarios/:id/toggle-habilitado para inhabilitar/restaurar.' });
};

exports.getVehiculos = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vehiculos = await propietarioService.getVehiculos(id);
    res.json({ success: true, data: vehiculos });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await propietarioService.getPageOf(req.params.id, { limit });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const propietario = await propietarioService.toggleHabilitado(id);
    res.json({
      success: true,
      message: `Propietario ${propietario.habilitado ? 'habilitado' : 'inhabilitado'} exitosamente`,
      data: propietario
    });
  } catch (error) {
    next(error);
  }
};
