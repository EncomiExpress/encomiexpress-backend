const rutaService = require('../services/rutaService');

exports.getAll = async (req, res, next) => {
  try {
    const filters = { habilitado: req.query.habilitado };
    const rutas = await rutaService.getAll(filters);
    res.json({ success: true, data: rutas });
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
    res.status(500).json({ success: false, message: error.message || 'Error al crear ruta', error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const ruta = await rutaService.update(id, req.body);
    res.json({ success: true, message: 'Ruta actualizada exitosamente', data: ruta });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Error al actualizar ruta', error: error.message });
  }
};

exports.remove = async (req, res) => {
  // Método obsoleto: use PATCH /rutas/:id/toggle-habilitado
  res.status(405).json({ success: false, message: 'Método obsoleto. Use PATCH /rutas/:id/toggle-habilitado para inhabilitar/restaurar.' });
};

exports.getEncomiendas = async (req, res) => {
  try {
    const { id } = req.params;
    const encomiendas = await rutaService.getEncomiendas(id);
    res.json({ success: true, data: encomiendas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Error al obtener encomiendas', error: error.message });
  }
};

exports.getAvailable = async (req, res) => {
  try {
    const { idDestino } = req.query;
    const rutas = await rutaService.getAvailable({ idDestino });
    res.json({ success: true, data: rutas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Error al obtener rutas disponibles', error: error.message });
  }
};

exports.toggleHabilitado = async (req, res) => {
  try {
    const { id } = req.params;
    const ruta = await rutaService.toggleHabilitado(id);
    res.json({ success: true, message: `Ruta ${ruta.habilitado ? 'habilitada' : 'inhabilitada'} exitosamente`, data: ruta });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Error al cambiar estado de la ruta', error: error.message });
  }
};
