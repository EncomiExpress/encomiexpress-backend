require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a la base de datos establecida correctamente');

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      console.log('✅ Modelos sincronizados con la base de datos');
    }

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: ['http://localhost:5173', 'http://localhost:3000'],
        methods: ['GET', 'POST']
      }
    });

    io.use((socket, next) => {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(); // permitir conexiones sin token si se desea
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next();
        socket.userId = decoded.idUsuario;
        next();
      });
    });

    io.on('connection', (socket) => {
      console.log('Cliente conectado:', socket.id);
      socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
      });
    });

    app.set('io', io);

    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
      console.log(`📋 Documentación: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
