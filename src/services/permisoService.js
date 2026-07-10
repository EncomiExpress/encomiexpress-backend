const { Permiso } = require('../models');
const AppError = require('../errors/appError');

const getAll = async () => {
  const permisos = await Permiso.findAll({
    where: { habilitado: true },
    order: [['nombre', 'ASC']]
  });
  return permisos;
};

const getById = async (id) => {
  const permiso = await Permiso.findByPk(id);

  if (!permiso) {
    throw new AppError('Permiso no encontrado', 404);
  }

  return permiso;
};

module.exports = {
  getAll,
  getById
};