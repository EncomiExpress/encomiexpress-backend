const bcrypt = require('bcryptjs');
const { Usuario, Rol, Permiso, Conductor } = require('../models');
const { generateToken } = require('../middlewares/auth');
const AppError = require('../errors/appError');

const login = async (email, password) => {
  if (!email || !password) {
    throw new AppError('Email y password son requeridos', 400);
  }

  const usuario = await Usuario.findOne({
    where: { email },
    include: [{
      model: Rol,
      as: 'rol',
      include: [{ model: Permiso, as: 'permisos' }]
    }]
  });

  if (!usuario) {
    throw new AppError('Correo o contraseña incorrecta', 401);
  }

  if (!usuario.habilitado) {
    throw new AppError('Usuario deshabilitado', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, usuario.password);
  if (!isPasswordValid) {
    throw new AppError('Correo o contraseña incorrecta', 401);
  }

  const permisos = usuario.rol?.permisos?.map(p => p.nombre) ?? [];

  const token = generateToken({
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    idRol: usuario.idRol,
    rol: usuario.rol?.nombre ?? null
  });

  let conductorData = null;
  if (usuario.rol?.nombre === 'conductor') {
    const conductor = await Conductor.findOne({
      where: { idUsuario: usuario.idUsuario }
    });

    if (conductor) {
      conductorData = {
        idConductor: conductor.idConductor,
        categoriaLicencia: conductor.categoriaLicencia,
        numeroLicencia: conductor.numeroLicencia,
        vencimientoLicencia: conductor.vencimientoLicencia,
        estado: conductor.estado,
        habilitado: conductor.habilitado
      };
    }
  }

  return {
    token,
    usuario: {
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      telefono: usuario.telefono,
      tipoIdentificacion: usuario.tipoIdentificacion,
      numeroIdentificacion: usuario.numeroIdentificacion,
      rol: usuario.rol?.nombre ?? null,
      permisos
    },
    conductor: conductorData
  };
};

const register = async (data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, password, idRol } = data;

  const existingEmail = await Usuario.findOne({ where: { email } });
  if (existingEmail) {
    throw new AppError('El email ya está registrado', 400);
  }

  const existingDoc = await Usuario.findOne({ where: { numeroIdentificacion } });
  if (existingDoc) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const usuario = await Usuario.create({
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    password: hashedPassword,
    idRol: idRol || 2
  });

  const token = generateToken({
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    idRol: usuario.idRol,
    rol: 'usuario'
  });

  const rol = await Rol.findByPk(usuario.idRol, {
    include: [{ model: Permiso, as: 'permisos' }]
  });
  const permisos = rol?.permisos?.map(p => p.nombre) ?? [];

  return {
    token,
    usuario: {
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      telefono: usuario.telefono,
      tipoIdentificacion: usuario.tipoIdentificacion,
      numeroIdentificacion: usuario.numeroIdentificacion,
      rol: 'usuario',
      permisos
    }
  };
};

const getProfile = async (idUsuario) => {
  const usuario = await Usuario.findByPk(idUsuario, {
    include: [{
      model: Rol,
      as: 'rol',
      include: [{ model: Permiso, as: 'permisos' }]
    }],
    attributes: { exclude: ['password'] }
  });

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const permisos = usuario.rol?.permisos?.map(p => p.nombre) ?? [];

  return {
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    telefono: usuario.telefono,
    tipoIdentificacion: usuario.tipoIdentificacion,
    numeroIdentificacion: usuario.numeroIdentificacion,
    rol: usuario.rol?.nombre ?? null,
    permisos
  };
};

const getConductorProfile = async (idUsuario, rolNombre) => {
  if (rolNombre !== 'conductor') {
    throw new AppError('Acceso denegado. Solo los conductores pueden acceder a este recurso', 403);
  }

  const conductor = await Conductor.findOne({
    where: { idUsuario },
    include: [{ model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } }]
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  return {
    nombre: conductor.usuario.nombre,
    apellido: conductor.usuario.apellido,
    telefono: conductor.usuario.telefono,
    tipoIdentificacion: conductor.usuario.tipoIdentificacion,
    numeroIdentificacion: conductor.usuario.numeroIdentificacion,
    idConductor: conductor.idConductor,
    categoriaLicencia: conductor.categoriaLicencia,
    numeroLicencia: conductor.numeroLicencia,
    vencimientoLicencia: conductor.vencimientoLicencia,
    estado: conductor.estado,
    habilitado: conductor.habilitado,
    rol: conductor.usuario.rol?.nombre
  };
};

const recoverPassword = async (email) => {
  if (!email) {
    throw new AppError('Email es requerido', 400);
  }

  const usuario = await Usuario.findOne({ where: { email } });

  if (!usuario) {
    throw new AppError('No existe usuario con ese email', 404);
  }

  const tempPassword = Math.random().toString(36).slice(-8);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  await usuario.update({ password: hashedPassword });

  return tempPassword;
};

module.exports = {
  login,
  register,
  getProfile,
  getConductorProfile,
  recoverPassword
};