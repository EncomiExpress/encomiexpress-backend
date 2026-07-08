const { Sequelize } = require('sequelize');
require('dotenv').config();

// DESPLIEGUE A SUPABASE (o cualquier Postgres administrado que exija SSL):
// 1. En las variables de entorno de Render (o donde corra el backend), agrega DB_SSL=true.
// 2. Verifica que DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME sean los de Supabase
//    (Project Settings → Database → Connection string, usa el modo "Session" o el pooler).
// 3. Si al conectar ves un error de certificado, es normal con Supabase — por eso
//    rejectUnauthorized queda en false abajo. Localmente NO definas DB_SSL: la conexión
//    sigue sin SSL, tal como hoy.
const sslOptions = process.env.DB_SSL === 'true'
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : {};

const sequelize = new Sequelize(
  process.env.DB_NAME || 'encomiexpress',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: sslOptions,
    logging: false, // Desactivar logs de SQL
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: false, //true
      freezeTableName: true
    }
  }
);

module.exports = sequelize;