const { sequelize } = require('../models');
const destinoService = require('../services/destinoService');

exports.getAll = async (req, res, next) => {
  try {
    const filters = { habilitado: req.query.habilitado };
    const destinos = await destinoService.getAll(filters);
    res.json({ success: true, data: destinos });
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

exports.delete = async (req, res, next) => {
  // Método obsoleto: use PATCH /destinos/:id/toggle-habilitado
  res.status(405).json({ success: false, message: 'Método obsoleto. Use PATCH /destinos/:id/toggle-habilitado para inhabilitar/restaurar.' });
};

exports.getRutas = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rutas = await destinoService.getRutas(id);
    res.json({ success: true, data: rutas });
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
