const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const AppError = require('./errors/appError');
const errorHandler = require('./middlewares/errorHandler');
const { writeLimiter } = require('./middlewares/rateLimiter');

const app = express();

// Middlewares
app.use(helmet());
// Orígenes permitidos: localhost siempre (dev), más los que vengan en la env var
// FRONTEND_URLS (separados por coma) — así se agrega/cambia el dominio de Vercel
// en producción sin tocar código ni redesplegar el backend.
const allowedOrigins = [
  'http://localhost:5173',
  ...(process.env.FRONTEND_URLS ? process.env.FRONTEND_URLS.split(',').map(u => u.trim()) : []),
];
app.use(cors({
  origin: allowedOrigins,
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
const configuracionRoutes = require('./routes/configuracion');

// Respuesta simple en la raíz — nadie la usa desde el frontend (que consume /api/*),
// pero evita el 404 crudo si alguien abre la URL directo o algún monitor la pinguea.
app.get('/', (req, res) => {
  res.json({ success: true, message: 'EncomiExpress API' });
});

// Info general de la API en la URL base — igual que arriba, no la consume el
// frontend, pero da un punto de entrada legible para quien explore /api directo.
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'EncomiExpress API',
    endpoints: [
      '/api/auth',
      '/api/usuarios',
      '/api/conductores',
      '/api/permisos',
      '/api/propietarios',
      '/api/vehiculos',
      '/api/destinos',
      '/api/rutas',
      '/api/anticipos',
      '/api/clientes',
      '/api/encomiendas',
      '/api/roles',
      '/api/configuracion',
      '/api/health',
    ],
  });
});

// Documentación Swagger (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'EncomiExpress API Docs',
  }));
}

// Rate limiting para escritura en todas las rutas de negocio (omite GET/HEAD/OPTIONS)
app.use('/api', writeLimiter);

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
app.use('/api/configuracion', configuracionRoutes);

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

// Endpoint para resetear rápido el usuario admin en desarrollo local (solo disponible
// fuera de producción). A diferencia de `npm run db:seed` (config/seed.js), que se
// niega a tocar el admin si ya existe, este SIEMPRE lo borra y lo recrea — es el
// "botón de pánico" para cuando lo dejaste en un estado raro mientras pruebas.
// La contraseña sale de ADMIN_INITIAL_PASSWORD (obligatoria, igual que en seed.js) —
// nunca hardcodeada, ni siquiera para desarrollo local.
app.post('/api/seed', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Endpoint no disponible en producción', 403));
  }
  try {
    if (!process.env.ADMIN_INITIAL_PASSWORD) {
      return next(new AppError('ADMIN_INITIAL_PASSWORD no está definida en tu .env — defínela antes de usar este endpoint', 500));
    }
    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).{8,64}$/;
    if (!PASSWORD_REGEX.test(process.env.ADMIN_INITIAL_PASSWORD)) {
      return next(new AppError('ADMIN_INITIAL_PASSWORD es débil — debe tener 8-64 caracteres, con mayúsculas, minúsculas, números y un carácter especial', 500));
    }
    const bcrypt = require('bcryptjs');
    const { Usuario } = require('./models');

    await Usuario.destroy({ where: { email: 'admin@encomiexpress.com' } });
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD, 10);
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
      message: 'Admin reseteado exitosamente: admin@encomiexpress.com',
      data: { email: 'admin@encomiexpress.com' }
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