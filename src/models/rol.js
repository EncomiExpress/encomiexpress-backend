const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Rol = sequelize.define('Rol', {
  idRol: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  // Identificador estable e inmutable de los 4 roles del sistema (admin,
  // conductor, distribuidor, operador_sede) — NULL para un rol nuevo creado a
  // mano desde el panel. Nunca se expone para editar (ver rolService.update):
  // es lo que compara todo el código de autorización/negocio en vez de
  // `nombre`, para que `nombre` se pueda renombrar libremente (incluido
  // 'admin') sin romper nada. Ver LOGICA.md, "Rol: nombre editable vs codigo".
  codigo: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  descripcion: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'rol',
  timestamps: false,
  underscored: true
});

module.exports = Rol;
