const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EncomiExpress API',
      version: '1.0.0',
      description: 'API REST para el sistema de gestión de encomiendas y transporte de carga del Bajo Cauca antioqueño.',
      contact: { name: 'EncomiExpress', email: 'admin@encomiexpress.com' },
    },
    servers: [
      { url: 'http://localhost:3000/api', description: 'Servidor de desarrollo' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        // ── Respuestas genéricas ──────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Descripción del error' },
          },
        },
        // ── Auth ─────────────────────────────────────────────────────────────
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'admin@encomiexpress.com' },
            password: { type: 'string', example: 'admin123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success:      { type: 'boolean', example: true },
            token:        { type: 'string' },
            refreshToken: { type: 'string' },
            usuario: {
              type: 'object',
              properties: {
                idUsuario:           { type: 'integer' },
                nombre:              { type: 'string' },
                apellido:            { type: 'string' },
                email:               { type: 'string' },
                rol:                 { type: 'string' },
                permisos:            { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        // ── Usuario ──────────────────────────────────────────────────────────
        UsuarioCreate: {
          type: 'object',
          required: ['tipoIdentificacion','numeroIdentificacion','nombre','apellido','email','password','idRol'],
          properties: {
            tipoIdentificacion:  { type: 'string', enum: ['CC','CE','TI','PP'], example: 'CC' },
            numeroIdentificacion:{ type: 'string', example: '1001234567' },
            nombre:              { type: 'string', example: 'Juan' },
            apellido:            { type: 'string', example: 'Pérez' },
            telefono:            { type: 'string', example: '3001234567' },
            email:               { type: 'string', format: 'email', example: 'juan@gmail.com' },
            password:            { type: 'string', example: 'segura123' },
            idRol:               { type: 'integer', example: 1 },
          },
        },
        Usuario: {
          type: 'object',
          properties: {
            idUsuario:           { type: 'integer' },
            tipoIdentificacion:  { type: 'string' },
            numeroIdentificacion:{ type: 'string' },
            nombre:              { type: 'string' },
            apellido:            { type: 'string' },
            telefono:            { type: 'string' },
            email:               { type: 'string' },
            habilitado:          { type: 'boolean' },
            rol:                 { type: 'object', properties: { idRol: { type: 'integer' }, nombre: { type: 'string' } } },
          },
        },
        // ── Conductor ─────────────────────────────────────────────────────────
        ConductorCreate: {
          type: 'object',
          required: ['tipoIdentificacion','numeroIdentificacion','nombre','apellido','email','password'],
          properties: {
            tipoIdentificacion:   { type: 'string', enum: ['CC','CE','TI','PP'] },
            numeroIdentificacion: { type: 'string', example: '1002345678' },
            nombre:               { type: 'string', example: 'Pedro' },
            apellido:             { type: 'string', example: 'López' },
            telefono:             { type: 'string', example: '3109876543' },
            email:                { type: 'string', format: 'email' },
            password:             { type: 'string' },
            categoriaLicencia:    { type: 'string', example: 'C2' },
            numeroLicencia:       { type: 'string', example: '12345678' },
            vencimientoLicencia:  { type: 'string', format: 'date', example: '2027-12-31' },
          },
        },
        // ── Cliente ──────────────────────────────────────────────────────────
        ClienteCreate: {
          type: 'object',
          required: ['tipoIdentificacion','numeroIdentificacion','nombre','apellido','email'],
          properties: {
            tipoIdentificacion:   { type: 'string', enum: ['CC','CE','TI','PP'] },
            numeroIdentificacion: { type: 'string' },
            nombre:               { type: 'string' },
            apellido:             { type: 'string' },
            telefono:             { type: 'string' },
            email:                { type: 'string', format: 'email' },
            direccion:            { type: 'string' },
          },
        },
        // ── Vehículo ─────────────────────────────────────────────────────────
        VehiculoCreate: {
          type: 'object',
          required: ['placa','idConductor','idPropietario'],
          properties: {
            placa:        { type: 'string', example: 'ABC123' },
            marca:        { type: 'string', example: 'Chevrolet' },
            modelo:       { type: 'string', example: 'NHR' },
            anio:         { type: 'integer', example: 2020 },
            color:        { type: 'string', example: 'Blanco' },
            tipo:         { type: 'string', example: 'Camión' },
            capacidad:    { type: 'number', example: 5000 },
            idConductor:  { type: 'integer' },
            idPropietario:{ type: 'integer' },
          },
        },
        // ── Destino ──────────────────────────────────────────────────────────
        DestinoCreate: {
          type: 'object',
          required: ['departamento','ciudad'],
          properties: {
            departamento: { type: 'string', example: 'Antioquia' },
            ciudad:       { type: 'string', example: 'Caucasia' },
            tarifaBase:   { type: 'number', example: 0 },
          },
        },
        // ── Ruta ─────────────────────────────────────────────────────────────
        RutaCreate: {
          type: 'object',
          required: ['idConductor','idVehiculo','idDestino','fechaSalida'],
          properties: {
            idConductor: { type: 'integer' },
            idVehiculo:  { type: 'integer' },
            idDestino:   { type: 'integer' },
            fechaSalida: { type: 'string', format: 'date-time' },
            observaciones:{ type: 'string' },
          },
        },
        // ── Anticipo ─────────────────────────────────────────────────────────
        AnticipoCreate: {
          type: 'object',
          required: ['idConductor','tipo','monto'],
          properties: {
            idConductor: { type: 'integer' },
            idRuta:      { type: 'integer' },
            tipo:        { type: 'string', enum: ['anticipo','excedente'] },
            monto:       { type: 'number', example: 150000 },
            descripcion: { type: 'string' },
          },
        },
        // ── Encomienda ───────────────────────────────────────────────────────
        EncomiendaCreate: {
          type: 'object',
          required: ['idCliente','idRuta'],
          properties: {
            idCliente:          { type: 'integer' },
            idRuta:             { type: 'integer' },
            valorServicio:      { type: 'number', example: 25000 },
            metodoPago:         { type: 'string', enum: ['efectivo','transferencia','contraentrega'] },
            observaciones:      { type: 'string' },
          },
        },
        // ── Propietario ──────────────────────────────────────────────────────
        PropietarioCreate: {
          type: 'object',
          required: ['tipoIdentificacion','numeroIdentificacion','nombre','apellido'],
          properties: {
            tipoIdentificacion:   { type: 'string', enum: ['CC','CE','TI','PP','NIT'] },
            numeroIdentificacion: { type: 'string' },
            nombre:               { type: 'string' },
            apellido:             { type: 'string' },
            telefono:             { type: 'string' },
            email:                { type: 'string', format: 'email' },
          },
        },
        // ── Rol ──────────────────────────────────────────────────────────────
        RolCreate: {
          type: 'object',
          required: ['nombre'],
          properties: {
            nombre:      { type: 'string', example: 'supervisor' },
            descripcion: { type: 'string' },
            permisos:    { type: 'array', items: { type: 'integer' }, description: 'IDs de permisos a asignar' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
