# EncomiExpress - Backend

API REST para la gestión operativa de EncomiExpress en OsvaldoC Mensajería y Logística S.A.S., empresa especializada en el transporte de encomiendas. Diseñada como la capa central de servicios del sistema, permite la comunicación y administración de información entre el panel web administrativo, la aplicación móvil y la base de datos.

---

## Integrantes del Equipo

- Valeria Paz Arana
- Santiago Suárez Durán
- Sebastián Valencia Pérez
- Yeferson Andrés Moreno Granda

---

## Índice

- [Características Implementadas](#características-implementadas)
- [Stack Tecnológico](#stack-tecnológico)
- [Arquitectura Limpia](#arquitectura-limpia)
- [Entidades](#entidades)
- [Seguridad](#seguridad)
- [Decisiones de Diseño](#decisiones-de-diseño)
- [Requisitos del Sistema](#requisitos-del-sistema)
- [Variables de Entorno](#variables-de-entorno)
- [Instalación](#instalación)
- [Ejecutar en Entorno Local](#ejecutar-en-entorno-local)
- [Documentación de la API](#documentación-de-la-api)
- [Repositorios relacionados](#repositorios-relacionados)
- [Licencia](#licencia)

---

## Características Implementadas

| Rol | Funcionalidades |
|------|----------------|
| **Administrador** | - Gestión de usuarios, roles y permisos <br> - Gestión de clientes y conductores <br> - Gestión de vehículos y propietarios <br> - Gestión de destinos y rutas <br> - Control de encomiendas y ventas <br> - Control de anticipos y excedentes |
| **Conductor** *(vía app móvil)* | - Consulta de anticipos asignados <br> - Cargue de soportes y legalización |
| **General** | - Autenticación JWT con access token (1h) y refresh token (24h) <br> - Manejo de errores centralizado <br> - Validación de datos por middleware <br> - Documentación interactiva Swagger |

---

## Stack Tecnológico

- Node.js — Entorno de ejecución
- Express.js — Framework web
- PostgreSQL — Base de datos
- Sequelize — ORM
- JWT — Autenticación (access token 1h + refresh token 24h)
- Bcryptjs — Encriptación de contraseñas (salt 10)
- Cloudinary — Almacenamiento de imágenes y soportes
- Nodemailer — Envío de correos electrónicos
- Multer — Manejo de archivos
- Swagger (swagger-jsdoc + swagger-ui-express) — Documentación interactiva de la API

---

## Arquitectura Limpia

El proyecto está estructurado siguiendo principios de arquitectura limpia y separación de responsabilidades:

```
src/
│
├── config/                    # Configuraciones globales (BD, Cloudinary, email, Swagger)
├── controllers/               # Capa delgada: recibe req, llama al servicio, envía res
├── services/                  # Lógica de negocio (reglas, validaciones, consultas)
├── models/                    # Modelos Sequelize y relaciones entre entidades
├── routes/                    # Definición de endpoints organizados por recurso
├── middlewares/               # Autenticación, autorización, rate limiting y manejo de errores
├── validators/                # Reglas de validación de datos por entidad
├── errors/                    # Clases de error personalizadas (AppError)
├── utils/                     # Funciones helpers puras (sin dependencias)
├── jobs/                      # Tareas programadas (ej. auto-iniciar rutas programadas)
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
| `Configuracion` | Fila única con valores de negocio globales (hoy solo la tarifa por kg) |

---

## Seguridad

| Mecanismo | Detalle |
|---|---|
| **JWT** | Access token con expiración de 1h + refresh token de 24h. El servidor rechaza tokens inválidos o expirados con error 401 |
| **Bcrypt** | Contraseñas hasheadas con salt de 10 rondas |
| **RBAC** | Middleware `authorize(...roles)` y `authorizePermission(permiso)` por ruta |
| **Helmet** | Cabeceras HTTP de seguridad (`app.use(helmet())`) aplicadas globalmente |
| **Rate limiting** | Límite estricto en `/login`, límite laxo en registro/recuperar contraseña, y límite general en todos los endpoints de escritura (`POST`/`PUT`/`PATCH`) del negocio |
| **CORS** | Orígenes permitidos vía `cors()`, restringido a `localhost:5173` en desarrollo y a los dominios definidos en `FRONTEND_URLS` en producción |
| **Validación** | Middleware de validación (`express-validator`) aplicado por recurso antes de llegar al controlador |
| **Errores operacionales** | `appError.isOperational` diferencia errores esperados de fallos internos — en producción no se expone el stack |
| **Guardia de cuenta propia** | Un usuario no puede inhabilitar su propia cuenta, ni individualmente ni por cascada al inhabilitar su propio rol |
| **Guardia de admin id=1** | La cuenta administradora inicial (id=1) no se puede inhabilitar bajo ninguna vía: ni ella misma, ni otro usuario, ni por cascada al inhabilitar el rol admin |
| **Bloqueo por rol inhabilitado** | Si el rol de un usuario está inhabilitado, el login y el refresh token son rechazados |

---

## Decisiones de Diseño

| Decisión | Justificación |
|---|---|
| **Sequelize vs TypeORM** | Sequelize tiene mayor compatibilidad con JavaScript puro y ecosistema más maduro para el stack del equipo |
| **AppError centralizado** | Permite respuestas consistentes en todos los endpoints y diferencia entre errores operacionales y de sistema |
| **Seed vía endpoint `/api/seed`** | Facilita la inicialización del admin en entornos de despliegue sin acceso directo a la base de datos |
| **Autorización por rol y por permiso** | Permite control de acceso flexible: por rol para rutas generales, por permiso para acciones granulares |
| **Access token 1h + refresh token 24h** | El access token de corta duración limita el riesgo si se compromete. El refresh permite renovación silenciosa sin re-login |
| **Swagger JSDoc en rutas** | Los comentarios `@swagger` viven junto al código de cada ruta, evitando que la documentación quede desincronizada |
| **Sin contraseña por defecto para el admin inicial** | Depender de `ADMIN_INITIAL_PASSWORD` evita que exista cualquier contraseña, real o de ejemplo, escrita en el repositorio |

---

## Requisitos del Sistema

| Requisito | Versión mínima | Notas |
|---|---|---|
| Node.js | 18 | Requerido por las dependencias del proyecto |
| npm | Incluido con Node.js | Gestor de paquetes |
| PostgreSQL | 14 | Base de datos relacional (en producción se usa Supabase, PostgreSQL 15 gestionado) |
| Git | Cualquiera | Para clonar el repositorio |

Opcional, solo si vas a usar esas funciones específicas:
- Cuenta de [Cloudinary](https://cloudinary.com) — para subir soportes/imágenes
- Credenciales SMTP (ej. Gmail) — para el correo de recuperar contraseña

---

## Variables de Entorno

Copia el archivo `.env.example` y renómbralo a `.env`:

```bash
cp .env.example .env
```

Luego completa los valores según tu entorno. Ver `.env.example` para la lista completa de variables requeridas.

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/EncomiExpress/encomiexpress-backend.git
cd encomiexpress-backend

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env

# 4. Crear una base de datos vacía en PostgreSQL y cargar su esquema + roles/permisos iniciales:
psql -U tu_usuario -d encomiexpress -f database/init.sql

# 5. Crear el usuario administrador inicial
# Define ADMIN_INITIAL_PASSWORD en tu .env con una contraseña fuerte
# (8-64 caracteres, mayúsculas, minúsculas, números y un carácter especial)
npm run db:seed
```

---

## Ejecutar en Entorno Local

```bash
npm run dev    # Desarrollo
npm start      # Producción
```

---

## Documentación de la API

La documentación interactiva está disponible en:

```
http://localhost:3000/api/docs
```

Disponible únicamente en entorno de desarrollo. Incluye los 79 endpoints documentados (56 rutas distintas) con parámetros, cuerpos de solicitud, respuestas y autenticación JWT integrada.

---

## Repositorios relacionados

| Repositorio | Descripción | Stack |
|-------------|-------------|-------|
| [encomiexpress-mobile](https://github.com/EncomiExpress/encomiexpress-mobile) | Aplicación móvil para conductores y administradores | Flutter · Dart |
| [encomiexpress-frontend](https://github.com/EncomiExpress/encomiexpress-frontend) | Panel web administrativo | React · Vite · Material UI |

---

## Licencia

Este proyecto está bajo la licencia MIT — ver el archivo [LICENSE](./LICENSE) para más detalles.

---

Desarrollado con apoyo de herramientas de inteligencia artificial Claude (Anthropic) y Kilo Code.