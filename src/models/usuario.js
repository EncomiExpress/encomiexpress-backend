const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Usuario = sequelize.define('Usuario', {
  idUsuario: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idRol: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tipoIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  numeroIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  nombre: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  apellido: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // true solo para cuentas creadas por autoregistro público (POST /auth/register,
  // ver authService.register) mientras esperan que un admin las habilite por primera
  // vez. Se limpia a false en ese momento (ver usuarioService.toggleHabilitado) — así
  // el frontend distingue "pendiente de activación" de "inhabilitada normalmente".
  registroPendiente: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'usuario',
  timestamps: false,
  underscored: true
});

module.exports = Usuario;
