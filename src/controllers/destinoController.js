const destinoService = require('../services/destinoService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const filters = {
      habilitado: req.query.habilitado,
      departamento: req.query.departamento,
      q: req.query.q,
      page,
      limit,
      sortBy,
    };
    const result = await destinoService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const destino = await destinoService.getById(id);
    res.json({ success: true, data: destino });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const destino = await destinoService.create(req.body);
    res.status(201).json({ success: true, message: 'Destino creado exitosamente', data: destino });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const destino = await destinoService.update(id, req.body);
    res.json({ success: true, message: 'Destino actualizado exitosamente', data: destino });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await destinoService.getPageOf(id, { limit });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const destino = await destinoService.toggleHabilitado(id);
    res.json({ success: true, message: `Destino ${destino.habilitado ? 'habilitado' : 'inhabilitado'} exitosamente`, data: destino });
  } catch (error) {
    next(error);
  }
};
