const rolService = require('../services/rolService');

const getAll = async (req, res, next) => {
  try {
    const { habilitado, q, page, limit, sortBy } = req.query;
    const { data, total } = await rolService.getAll({
      habilitado,
      q,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
      sortBy,
    });
    res.json({ success: true, data, total });
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
    const rol = await rolService.toggleHabilitado(id, req.usuario.idRol, req.usuario.idUsuario);
    res.json({
      success: true,
      message: `Rol ${rol.habilitado ? 'habilitado' : 'inhabilitado'} correctamente`,
      data: rol
    });
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
  getAllPermisos
};
