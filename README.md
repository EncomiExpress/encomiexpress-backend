# EncomiExpress - Backend

API REST para la gestión operativa de EncomiExpress en OsvaldoC Mensajería y Logística S.A.S., empresa especializada en el transporte de encomiendas. Diseñada como la capa central de servicios del sistema, permite la comunicación y administración de información entre el panel web administrativo, la aplicación móvil y la base de datos.

---

## Características Implementadas

| Rol | Funcionalidades |
|------|----------------|
| **Administrador** | - Gestión de usuarios, roles y permisos <br> - Gestión de clientes y conductores <br> - Gestión de vehículos y propietarios <br> - Gestión de destinos y rutas <br> - Control de encomiendas y ventas <br> - Control de anticipos y excedentes |
| **Conductor** *(vía app móvil)* | - Consulta de anticipos asignados <br> - Cargue de soportes y legalización |
| **General** | - Autenticación JWT <br> - Manejo de errores centralizado <br> - Validación de datos por middleware |

---

## Stack Tecnológico

- Node.js — Entorno de ejecución
- Express.js — Framework web
- PostgreSQL — Base de datos
- Sequelize — ORM
- JWT — Autenticación
- Bcryptjs — Encriptación de contraseñas
- Cloudinary — Almacenamiento de imágenes y soportes
- Nodemailer — Envío de correos electrónicos
- Multer — Manejo de archivos

---

## Arquitectura Limpia

El proyecto está estructurado siguiendo principios de arquitectura limpia y separación de responsabilidades:

```
src/
│
├── config/                    # Configuraciones globales (BD, Cloudinary, email)
├── controllers/               # Capa delgada: recibe req, llama al servicio, envía res
├── services/                  # Lógica de negocio (reglas, validaciones, consultas)
├── models/                    # Modelos Sequelize y relaciones entre entidades
├── routes/                    # Definición de endpoints organizados por recurso
├── middlewares/               # Autenticación, autorización y manejo de errores
├── validators/                # Reglas de validación de datos por entidad
├── errors/                    # Clases de error personalizadas (AppError)
├── utils/                     # Funciones helpers puras (sin dependencias)
├── app.js                     # Configuración de Express (middlewares, rutas)
└── server.js                  # Punto de entrada (conecta DB, inicia servidor)
```

### Principios

- **Separación de responsabilidades**: Cada capa tiene un propósito bien definido (rutas, controladores, servicios, modelos).
- **Middlewares reutilizables**: Autenticación, autorización por rol y por permiso como middlewares independientes.
- **Manejo de errores centralizado**: `appError` con respuestas diferenciadas por entorno (`development` / `production`).
- **RBAC**: Control de acceso basado en roles y permisos granulares por módulo.
- **Validaciones desacopladas**: Reglas de validación por entidad en `validators/`, ejecutadas por middleware antes de llegar al controlador.

---

## Entidades

| Entidad | Descripción |
|---|---|
| `Usuario` | Usuarios del sistema con rol asignado |
| `Rol` | Roles del sistema (admin, conductor) |
| `Permiso` | Permisos granulares por módulo |
| `RolPermiso` | Relación N:N entre roles y permisos |
| `Conductor` | Perfil de conductor vinculado a un usuario |
| `PropietarioVehiculo` | Propietarios de vehículos propios o tercerizados |
| `Vehiculo` | Flota de vehículos asignados a conductores |
| `Cliente` | Clientes remitentes de encomiendas |
| `Destinatario` | Destinatarios de los envíos |
| `Destino` | Ciudades y tarifas base habilitadas |
| `Ruta` | Rutas programadas con vehículo y conductor asignado |
| `EncomiendaVenta` | Registro de ventas y encomiendas con guía generada |
| `Paquete` | Paquetes asociados a cada encomienda |
| `AnticipoExcedente` | Anticipos entregados a conductores y su legalización |

---

## Seguridad

| Mecanismo | Detalle |
|---|---|
| **JWT** | Token con expiración de 24h — el servidor rechaza tokens inválidos o expirados con error 401 |
| **Bcrypt** | Contraseñas hasheadas con salt de 10 rondas |
| **RBAC** | Middleware `authorize(...roles)` y `authorizePermission(permiso)` por ruta |
| **CORS** | Habilitado vía `cors()` en Express |
| **Validación** | Middleware de validación aplicado por recurso antes de llegar al controlador |
| **Errores operacionales** | `appError.isOperational` diferencia errores esperados de fallos internos — en producción no se expone el stack |

---

## Decisiones de Diseño

| Decisión | Justificación |
|---|---|
| **Sequelize vs TypeORM** | Sequelize tiene mayor compatibilidad con JavaScript puro y ecosistema más maduro para el stack del equipo |
| **AppError centralizado** | Permite respuestas consistentes en todos los endpoints y diferencia entre errores operacionales y de sistema |
| **Seed vía endpoint `/api/seed`** | Facilita la inicialización del admin en entornos de despliegue sin acceso directo a la base de datos |
| **Autorización por rol y por permiso** | Permite control de acceso flexible: por rol para rutas generales, por permiso para acciones granulares |

---

## Variables de Entorno

Creá un archivo `.env` en la raíz del proyecto:

```dotenv
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=encomiexpress
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=tu_secret_key
JWT_EXPIRES_IN=24h

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

EMAIL_USER=
EMAIL_PASS=
```

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/EncomiExpress/encomiexpress-backend.git
cd encomiexpress-backend

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor
npm run dev    # Desarrollo
npm start      # Producción
```

---

## Credenciales de Prueba

El usuario administrador se inicializa automáticamente llamando al endpoint:
POST http://localhost:3000/api/seed

| Rol | Email | Contraseña |
|------|-------|------------|
| Administrador | `admin@encomiexpress.com` | `admin123` |
| Conductor | `conductor@encomiexpress.com` | `conductor123` |

---

## Rutas de la API

- Base URL: `http://localhost:3000/api`
- Autenticación: `POST /auth/login`
 - Usuarios: `GET/POST/PUT /usuarios`, `PATCH /usuarios/:id/toggle-habilitado` (rehabilitar/inhabilitar)
- Roles: `GET/POST/PUT/DELETE /roles`
- Permisos: `GET /permisos`
- Clientes: `GET/POST/PUT /clientes`
 - Conductores: `GET/POST /conductores`, `GET /conductores/:id/vehiculos`, `PATCH /conductores/:id/toggle-habilitado`
 - Propietarios: `GET/POST/PUT /propietarios`, `PATCH /propietarios/:id/toggle-habilitado`
 - Vehículos: `GET/POST/PUT /vehiculos`, `PATCH /vehiculos/:id/toggle-habilitado`
 - Destinos: `GET/POST/PUT /destinos`, `PATCH /destinos/:id/toggle-habilitado`
 - Rutas: `GET/POST /rutas`, `GET /rutas/disponibles`, `GET /rutas/:id/encomiendas`, `PATCH /rutas/:id/toggle-habilitado`
- Encomiendas: `GET/POST /encomiendas`, `GET /encomiendas/track/:numeroGuia`, `PUT /encomiendas/:id/estado`, `POST /encomiendas/:id/pagar`
 - Anticipos: `GET/POST /anticipos`, `POST /anticipos/liquidar/:id`, `PATCH /anticipos/:id/toggle-habilitado`
- Health check: `GET /health`
- Seed: `POST /seed`

---

## Repositorios relacionados

| Repositorio | Descripción | Stack |
|-------------|-------------|-------|
| [encomiexpress-mobile](https://github.com/EncomiExpress/encomiexpress-mobile) | Aplicación móvil para conductores y administradores | Flutter · Dart |
| [encomiexpress-frontend](https://github.com/EncomiExpress/encomiexpress-frontend) | Panel web administrativo | React · Vite · Material UI |

---

Desarrollado con apoyo de herramientas de inteligencia artificial Claude (Anthropic) y Kilo Code.
