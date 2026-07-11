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

// Respuesta simple en la raíz — nadie la usa desde el frontend (que consume /api/*),
// pero evita el 404 crudo si alguien abre la URL directo o algún monitor la pinguea.
app.get('/', (req, res) => {
  res.json({ success: true, message: 'EncomiExpress API' });
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

// Endpoint para inicializar datos de la base de datos (solo disponible en desarrollo).
// Bloqueado en producción a propósito: crea el rol admin y sus permisos ya habilitados,
// sin login previo. En producción, el primer admin se crea corriendo `npm run db:seed`
// manualmente (una sola vez) apuntando las variables de entorno a la base de datos real
// — no como request HTTP.
// Distinto de POST /api/auth/register (authController.js): ese SÍ queda disponible en
// producción a propósito, porque siempre crea la cuenta inhabilitada y pendiente de
// aprobación (nunca queda activa sin que un admin la habilite) — por eso no necesita
// este mismo bloqueo.
app.post('/api/seed', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Endpoint no disponible en producción', 403));
  }
  try {
    const bcrypt = require('bcryptjs');
    const { Rol, Permiso, RolPermiso, Usuario } = require('./models');

    const existingRoles = await Rol.count();
    if (existingRoles === 0) {
      const roles = await Rol.bulkCreate([
        { nombre: 'admin',    descripcion: 'Administrador del sistema con acceso total', habilitado: true },
        { nombre: 'conductor', descripcion: 'Conductor de vehículo', habilitado: true }
      ]);

      const permisos = await Permiso.bulkCreate([
        { nombre: 'listar_usuario',       descripcion: 'Listar usuarios' },
        { nombre: 'registrar_usuario',    descripcion: 'Registrar usuarios' },
        { nombre: 'consultar_usuario',    descripcion: 'Consultar usuarios' },
        { nombre: 'actualizar_usuario',   descripcion: 'Actualizar usuarios' },
        { nombre: 'inhabilitar_usuario',  descripcion: 'Inhabilitar usuarios' },
        { nombre: 'listar_rol',           descripcion: 'Listar roles' },
        { nombre: 'registrar_rol',        descripcion: 'Registrar roles' },
        { nombre: 'consultar_rol',        descripcion: 'Consultar roles' },
        { nombre: 'actualizar_rol',       descripcion: 'Actualizar roles' },
        { nombre: 'inhabilitar_rol',      descripcion: 'Inhabilitar roles' },
        { nombre: 'listar_cliente',       descripcion: 'Listar clientes' },
        { nombre: 'registrar_cliente',    descripcion: 'Registrar clientes' },
        { nombre: 'consultar_cliente',    descripcion: 'Consultar clientes' },
        { nombre: 'actualizar_cliente',   descripcion: 'Actualizar clientes' },
        { nombre: 'inhabilitar_cliente',  descripcion: 'Inhabilitar clientes' },
        { nombre: 'listar_vehiculo',        descripcion: 'Listar vehículos' },
        { nombre: 'registrar_vehiculo',     descripcion: 'Registrar vehículos' },
        { nombre: 'consultar_vehiculo',     descripcion: 'Consultar vehículos' },
        { nombre: 'actualizar_vehiculo',    descripcion: 'Actualizar vehículos' },
        { nombre: 'inhabilitar_vehiculo',   descripcion: 'Inhabilitar vehículos' },
        { nombre: 'listar_conductor',       descripcion: 'Listar conductores' },
        { nombre: 'registrar_conductor',    descripcion: 'Registrar conductores' },
        { nombre: 'consultar_conductor',    descripcion: 'Consultar conductores' },
        { nombre: 'actualizar_conductor',   descripcion: 'Actualizar conductores' },
        { nombre: 'inhabilitar_conductor',  descripcion: 'Inhabilitar conductores' },
        { nombre: 'listar_destino',         descripcion: 'Listar destinos' },
        { nombre: 'registrar_destino',      descripcion: 'Registrar destinos' },
        { nombre: 'consultar_destino',      descripcion: 'Consultar destinos' },
        { nombre: 'actualizar_destino',     descripcion: 'Actualizar destinos' },
        { nombre: 'inhabilitar_destino',    descripcion: 'Inhabilitar destinos' },
        { nombre: 'listar_ruta',            descripcion: 'Listar rutas' },
        { nombre: 'registrar_ruta',         descripcion: 'Registrar rutas' },
        { nombre: 'consultar_ruta',         descripcion: 'Consultar rutas' },
        { nombre: 'actualizar_ruta',        descripcion: 'Actualizar rutas' },
        { nombre: 'inhabilitar_ruta',       descripcion: 'Inhabilitar rutas' },
        { nombre: 'listar_anticipo',        descripcion: 'Listar anticipos' },
        { nombre: 'registrar_anticipo',     descripcion: 'Registrar anticipos' },
        { nombre: 'consultar_anticipo',     descripcion: 'Consultar anticipos' },
        { nombre: 'actualizar_anticipo',    descripcion: 'Actualizar anticipos' },
        { nombre: 'inhabilitar_anticipo',   descripcion: 'Inhabilitar anticipos' },
        { nombre: 'listar_venta',           descripcion: 'Listar ventas' },
        { nombre: 'registrar_venta',        descripcion: 'Registrar ventas' },
        { nombre: 'consultar_venta',        descripcion: 'Consultar ventas' },
        { nombre: 'actualizar_venta',       descripcion: 'Actualizar ventas' },
        { nombre: 'inhabilitar_venta',      descripcion: 'Inhabilitar ventas' },
        { nombre: 'listar_propietario',     descripcion: 'Listar propietarios' },
        { nombre: 'registrar_propietario',   descripcion: 'Registrar propietarios' },
        { nombre: 'consultar_propietario',   descripcion: 'Consultar propietarios' },
        { nombre: 'actualizar_propietario',  descripcion: 'Actualizar propietarios' },
        { nombre: 'inhabilitar_propietario', descripcion: 'Inhabilitar propietarios' },
        { nombre: 'ver_dashboard',           descripcion: 'Ver dashboard' },
      ]);

      const adminRol = roles[0];
      await RolPermiso.bulkCreate(
        permisos.map(p => ({ idRol: adminRol.idRol, idPermiso: p.idPermiso }))
      );
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
      message: 'Seed ejecutado correctamente. Login con: admin@encomiexpress.com / admin123',
      data: { email: 'admin@encomiexpress.com', password: 'admin123' }
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