require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http = require('http');
const app = require('./app');
const { sequelize } = require('./models');
const { iniciarAutoInicioRutas } = require('./jobs/autoIniciarRutas');

const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingEnvVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error('❌ Variables de entorno requeridas faltantes:', missingEnvVars.join(', '));
  process.exit(1);
}

// No tumba el servidor (el resto de la app funciona sin ella) — solo avisa, porque
// sin esto el enlace de correo de recuperar contraseña apunta a localhost en
// silencio, sin ningún error visible.
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URLS) {
  console.warn('⚠️  FRONTEND_URLS no está configurada — el enlace de correo de recuperar contraseña apuntará a localhost y no funcionará para los usuarios.');
}

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Base de datos conectada');

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      console.log('✅ Modelos sincronizados');
    }

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📄 Documentación API: http://localhost:${PORT}/api/docs`);
      }
    });

    iniciarAutoInicioRutas();
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();