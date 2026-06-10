const bcrypt = require('bcryptjs');
const usuarioService = require('../services/usuarioService');


exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const { habilitado, idRol, q } = req.query;
    const result = await usuarioService.getAll({ page, limit, sortBy, habilitado, idRol, q });
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = await usuarioService.getById(id);
    res.json({ success: true, data: usuario });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const usuario = await usuarioService.create(req.body);
    res.status(201).json({ success: true, message: 'Usuario creado exitosamente', data: { idUsuario: usuario.idUsuario, email: usuario.email, nombre: usuario.nombre } });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = await usuarioService.update(id, req.body);
    res.json({ success: true, message: 'Usuario actualizado exitosamente', data: { idUsuario: usuario.idUsuario, email: usuario.email, nombre: usuario.nombre } });
  } catch (error) {
    next(error);
  }
};

exports.delete = async (req, res, next) => {
  // Método obsoleto: use PATCH /usuarios/:id/toggle-habilitado
  res.status(405).json({ success: false, message: 'Método obsoleto. Use PATCH /usuarios/:id/toggle-habilitado para inhabilitar/restaurar.' });
};

exports.changePassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    await usuarioService.changePassword(id, req.body);
    res.json({ success: true, message: 'Password actualizado exitosamente' });
  } catch (error) {
    next(error);
  }
};

exports.toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = await usuarioService.toggleHabilitado(id, req.usuario.idUsuario);
    res.json({ success: true, message: usuario.habilitado ? 'Usuario habilitado exitosamente' : 'Usuario inhabilitado exitosamente', data: usuario });
  } catch (error) {
    next(error);
  }
};
