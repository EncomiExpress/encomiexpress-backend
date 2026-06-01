const rateLimit = require('express-rate-limit');

// ============================================================
// Mensaje de error estándar cuando se supera el límite
// ============================================================
const mensajeLimiteAlcanzado = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Demasiadas solicitudes desde esta IP. Por favor, intenta de nuevo más tarde.',
    retryAfter: res.getHeader('Retry-After')
  });
};

// ============================================================
// 1. Límite ESTRICTO para autenticación (login / register / recover)
//    → Protege contra ataques de fuerza bruta a credenciales
// ============================================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ventana de 15 minutos
  max: 10,                   // máximo 10 intentos por IP por ventana
  standardHeaders: true,     // envía headers RateLimit-* estándar (RFC 6585)
  legacyHeaders: false,      // desactiva headers X-RateLimit-* deprecados
  message: mensajeLimiteAlcanzado,
  skipSuccessfulRequests: false // cuenta también los exitosos (evita enumerar usuarios)
});

// ============================================================
// 2. Límite GENERAL para todos los endpoints de la API
//    → Protege contra abuso masivo de peticiones
// ============================================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ventana de 15 minutos
  max: 300,                  // máximo 300 solicitudes por IP por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: mensajeLimiteAlcanzado
});

// ============================================================
// 3. Límite para endpoints de ESCRITURA (POST / PUT / PATCH / DELETE)
//    → Protege contra creación/modificación masiva de registros
// ============================================================
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ventana de 15 minutos
  max: 100,                  // máximo 100 operaciones de escritura por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: mensajeLimiteAlcanzado,
  // Solo aplica a métodos de escritura
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
});

module.exports = {
  authLimiter,
  apiLimiter,
  writeLimiter
};