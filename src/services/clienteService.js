const { Cliente } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { tieneEncomiendasActivasPorCliente } = require('../middlewares/validateDependencies');

const getAll = async () => {
  const clientes = await Cliente.findAll({
    order: [['nombre', 'ASC']]
  });
  return clientes;
};

const getById = async (id) => {
  const cliente = await Cliente.findByPk(id);

  if (!cliente) {
    throw new AppError('Cliente no encontrado', 404);
  }

  return cliente;
};

const create = async (data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, direccion } = data;

  const existingCliente = await Cliente.findOne({ where: { numeroIdentificacion } });
  if (existingCliente) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  if (email) {
    const existingEmail = await Cliente.findOne({ where: { email } });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  const nuevoCliente = await Cliente.create({
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    direccion,
    habilitado: true
  });

  return nuevoCliente;
};

const update = async (id, data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, direccion } = data;

  const cliente = await Cliente.findByPk(id);
  if (!cliente) {
    throw new AppError('Cliente no encontrado', 404);
  }

  if (numeroIdentificacion && numeroIdentificacion !== cliente.numeroIdentificacion) {
    const existingCliente = await Cliente.findOne({
      where: { numeroIdentificacion, id: { [Op.ne]: id } }
    });
    if (existingCliente) {
      throw new AppError('El número de identificación ya está registrado', 400);
    }
  }

  if (email && email !== cliente.email) {
    const existingEmail = await Cliente.findOne({
      where: { email, id: { [Op.ne]: id } }
    });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  await cliente.update({
    tipoIdentificacion: tipoIdentificacion || cliente.tipoIdentificacion,
    numeroIdentificacion: numeroIdentificacion || cliente.numeroIdentificacion,
    nombre: nombre || cliente.nombre,
    apellido: apellido || cliente.apellido,
    telefono: telefono || cliente.telefono,
    email: email || cliente.email,
    direccion: direccion || cliente.direccion
  });

  return cliente;
};

const toggleHabilitado = async (id) => {
  const cliente = await Cliente.findByPk(id);
  if (!cliente) {
    throw new AppError('Cliente no encontrado', 404);
  }

  if (cliente.habilitado === true) {
    const encomiendasActivas = await tieneEncomiendasActivasPorCliente(id);
    if (encomiendasActivas) throw new AppError('No se puede inhabilitar un cliente con encomiendas activas', 400);
  }

  cliente.habilitado = !cliente.habilitado;
  await cliente.save();

  return cliente;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado
};