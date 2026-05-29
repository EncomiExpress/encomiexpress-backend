const rolService = require('../services/rolService');

const getAll = async (req, res, next) => {
  try {
    const roles = await rolService.getAll();
    res.json({ success: true, data: roles });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rol = await rolService.getById(id);
    res.json({ success: true, data: rol });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const rol = await rolService.create(req.body);
    res.status(201).json({ success: true, message: 'Rol creado correctamente', data: rol });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rol = await rolService.update(id, req.body);
    res.json({ success: true, message: 'Rol actualizado correctamente', data: rol });
  } catch (error) {
    next(error);
  }
};

const toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rol = await rolService.toggleHabilitado(id);
    res.json({
      success: true,
      message: `Rol ${rol.habilitado ? 'habilitado' : 'inhabilitado'} correctamente`,
      data: rol
    });
  } catch (error) {
    next(error);
  }
};

const deleteRol = async (req, res, next) => {
  try {
    const { id } = req.params;
    await rolService.delete(id);
    res.json({ success: true, message: 'Rol eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

const getAllPermisos = async (req, res, next) => {
  try {
    const permisos = await rolService.getAllPermisos();
    res.json({ success: true, data: permisos });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado,
  delete: deleteRol,
  getAllPermisos
};
