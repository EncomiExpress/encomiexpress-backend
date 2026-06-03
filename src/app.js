const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const AppError = require('./errors/appError');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    // 'https://dominio.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Importar rutas
const authRoutes = require('./routes/auth');
const usuarioRoutes = require('./routes/usuarios');
const conductorRoutes = require('./routes/conductores');
const propietarioRoutes = require('./routes/propietarios');
const vehiculoRoutes = require('./routes/vehiculos');
const destinoRoutes = require('./routes/destinos');
const rutaRoutes = require('./routes/rutas');
const anticipoRoutes = require('./routes/anticipos');
const clienteRoutes = require('./routes/clientes');
const encomiendaRoutes = require('./routes/encomiendas');
const rolRoutes = require('./routes/roles');
const permisosRoutes = require('./routes/permisos');

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/conductores', conductorRoutes);
app.use('/api/permisos', permisosRoutes);
app.use('/api/propietarios', propietarioRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/destinos', destinoRoutes);
app.use('/api/rutas', rutaRoutes);
app.use('/api/anticipos', anticipoRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/encomiendas', encomiendaRoutes);
app.use('/api/roles', rolRoutes);

// Ruta de verificación de estado
app.get('/api/health', async (req, res) => {
  const start = Date.now();

  let dbStatus = 'OK';
  let dbError = null;
  try {
    const { sequelize } = require('./models');
    await sequelize.authenticate();
  } catch (error) {
    dbStatus = 'ERROR';
    dbError = error.message;
  }

  const responseTime = Date.now() - start;

  res.status(dbStatus === 'OK' ? 200 : 503).json({
    status: dbStatus === 'OK' ? 'OK' : 'DEGRADED',
    message: 'API ENCOMIEXPRESS funcionando correctamente',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    responseTime: `${responseTime}ms`,
    database: {
      status: dbStatus,
      host: process.env.DB_HOST || 'localhost',
      name: process.env.DB_NAME || 'encomiexpress',
      ...(dbError && { error: dbError })
    }
  });
});

// Endpoint para inicializar datos de la base de datos
app.post('/api/seed', async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const { Rol, Permiso, Usuario } = require('./models');

    const existingRoles = await Rol.count();
    if (existingRoles === 0) {
      await Rol.bulkCreate([
        { nombre: 'admin', descripcion: 'Administrador del sistema con acceso total', habilitado: true },
        { nombre: 'usuario', descripcion: 'Usuario que puede registrar encomiendas', habilitado: true },
        { nombre: 'conductor', descripcion: 'Conductor de vehículo', habilitado: true }
      ]);

      await Permiso.bulkCreate([
        { nombre: 'usuarios', descripcion: 'Gestión de usuarios' },
        { nombre: 'roles', descripcion: 'Gestión de roles y permisos' },
        { nombre: 'clientes', descripcion: 'Gestión de clientes' },
        { nombre: 'conductores', descripcion: 'Gestión de conductores' },
        { nombre: 'vehiculos', descripcion: 'Gestión de vehículos' },
        { nombre: 'destinos', descripcion: 'Gestión de destinos' },
        { nombre: 'rutas', descripcion: 'Gestión de rutas' },
        { nombre: 'encomiendas', descripcion: 'Gestión de encomiendas' },
        { nombre: 'anticipos', descripcion: 'Gestión de anticipos' }
      ]);
    }

    await Usuario.destroy({ where: { email: 'admin@encomiexpress.com' } });

    const hashedPassword = await bcrypt.hash('admin123', 10);
    await Usuario.create({
      idRol: 1,
      tipoIdentificacion: 'CC',
      numeroIdentificacion: '12345678',
      nombre: 'Administrador',
      apellido: 'Sistema',
      telefono: '3000000000',
      email: 'admin@encomiexpress.com',
      password: hashedPassword,
      habilitado: true
    });

    res.json({
      success: true,
      message: 'Usuario admin recreado correctamente. Login con: admin@encomiexpress.com / admin123',
      data: {
        email: 'admin@encomiexpress.com',
        password: 'admin123'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Middleware para rutas no encontradas (404)
app.all('*', (req, res, next) => {
  next(new AppError(`No se pudo encontrar la ruta ${req.originalUrl} en el servidor`, 404));
});

// Middleware global de manejo de errores
app.use(errorHandler);

module.exports = app;