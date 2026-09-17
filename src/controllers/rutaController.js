const rutaService = require('../services/rutaService');

// CRUD de la plantilla reutilizable de corredor (origen->destino). Todo lo demás
// (agenda concreta: fecha/hora/estado/convoy) vive ahora en
// salidaProgramadaController.js / routes/salidas.js.

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await rutaService.getAll({
      habilitado: req.query.habilitado,
      q: req.query.q,
      idDestino: req.query.idDestino,
      sortBy: req.query.sortBy,
      page,
      limit,
    });
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
    res.json({ success: true, message: 'Ruta actualizada exitosamente.', data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al actualizar ruta' });
  }
};

exports.toggleHabilitado = async (req, res) => {
  try {
    const { id } = req.params;
    const { ruta } = await rutaService.toggleHabilitado(id);
    res.json({ success: true, message: `Ruta ${ruta.habilitado ? 'habilitada' : 'inhabilitada'} exitosamente`, data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al cambiar estado de la ruta' });
  }
};
