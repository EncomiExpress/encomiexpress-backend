const rutaService = require('../services/rutaService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const filters = {
      habilitado: req.query.habilitado,
      estado: req.query.estado,
      anio: req.query.anio,
      mes: req.query.mes,
      q: req.query.q,
      idConductor: req.query.idConductor,
      idVehiculo: req.query.idVehiculo,
      idDestino: req.query.idDestino,
      page,
      limit,
      sortBy,
    };
    const result = await rutaService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ruta = await rutaService.getById(id);
    res.json({ success: true, data: ruta });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res) => {
  try {
    const ruta = await rutaService.create(req.body);
    res.status(201).json({ success: true, message: 'Ruta creada exitosamente', data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al crear ruta' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const ruta = await rutaService.update(id, req.body);
    res.json({ success: true, message: 'Ruta actualizada exitosamente', data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al actualizar ruta' });
  }
};

exports.remove = async (req, res) => {
  res.status(405).json({ success: false, message: 'Método obsoleto. Use PATCH /rutas/:id/toggle-habilitado para inhabilitar/restaurar.' });
};

exports.updateEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!estado) {
      return res.status(400).json({ success: false, message: 'El campo "estado" es requerido' });
    }
    const ruta = await rutaService.updateEstado(id, estado);
    res.json({ success: true, message: `Estado actualizado a "${ruta.estado}"`, data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al actualizar estado' });
  }
};

exports.getEncomiendas = async (req, res) => {
  try {
    const { id } = req.params;
    const encomiendas = await rutaService.getEncomiendas(id);
    res.json({ success: true, data: encomiendas });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al obtener encomiendas' });
  }
};

exports.getAvailable = async (req, res) => {
  try {
    const { idDestino } = req.query;
    const rutas = await rutaService.getAvailable({ idDestino });
    res.json({ success: true, data: rutas });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al obtener rutas disponibles' });
  }
};

exports.toggleHabilitado = async (req, res) => {
  try {
    const { id } = req.params;
    const ruta = await rutaService.toggleHabilitado(id);
    res.json({ success: true, message: `Ruta ${ruta.habilitado ? 'habilitada' : 'inhabilitada'} exitosamente`, data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al cambiar estado de la ruta' });
  }
};
exports.getPageOf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await rutaService.getPageOf(id, { limit });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
