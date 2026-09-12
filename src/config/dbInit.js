// npm run db:init
// 1) Crea la base de datos en Postgres si todavía no existe (usando las
//    credenciales de .env) y 2) sincroniza las tablas a partir de los
//    modelos de Sequelize. Los modelos son la única fuente de verdad del
//    esquema; este script no duplica CREATE TABLEs a mano.
require('dotenv').config();
const { Client } = require('pg');

const NOMBRE_VALIDO = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  name: process.env.DB_NAME || 'encomiexpress',
};

const ensureDatabaseExists = async () => {
  if (!NOMBRE_VALIDO.test(dbConfig.name)) {
    throw new Error(`DB_NAME inválido: "${dbConfig.name}"`);
  }

  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: 'postgres', // BD de mantenimiento: siempre existe, se usa solo para crear la nuestra
    ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbConfig.name]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbConfig.name}"`);
      console.log(`Base de datos "${dbConfig.name}" creada`);
    } else {
      console.log(`Base de datos "${dbConfig.name}" ya existe`);
    }
  } finally {
    await client.end();
  }
};

const syncTables = async () => {
  const { sequelize } = require('../models');
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('Tablas sincronizadas a partir de los modelos');
  } finally {
    await sequelize.close();
  }
};

(async () => {
  try {
    // En un Postgres administrado (Aiven, Render Postgres, Supabase, etc.)
    // la base de datos ya viene creada de fábrica y el usuario normalmente
    // NO tiene permiso para conectarse a la BD de mantenimiento "postgres"
    // ni para crear otras — por eso este paso no es fatal si falla: se
    // avisa y se sigue directo a sincronizar tablas contra la BD que ya existe.
    try {
      await ensureDatabaseExists();
    } catch (error) {
      console.warn('⚠️ No se pudo verificar/crear la base de datos (normal en un Postgres administrado, donde ya viene creada):', error.message);
    }
    await syncTables();
    process.exit(0);
  } catch (error) {
    console.error('Error inicializando la base de datos:', error);
    process.exit(1);
  }
})();
