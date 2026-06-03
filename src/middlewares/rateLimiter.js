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
// 1. Límite ESTRICTO para login
//    → Protege contra ataques de fuerza bruta a credenciales
// ============================================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensajeLimiteAlcanzado,
  skipSuccessfulRequests: true
});

// ============================================================
// 2. Límite LAXO para register / recover-password
//    → Permite uso normal pero bloquea abuso masivo
// ============================================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensajeLimiteAlcanzado,
  skipSuccessfulRequests: true
});

// ============================================================
// 3. Límite para endpoints de ESCRITURA del negocio (POST/PUT/PATCH/DELETE)
//    → Sin límite para GET, límite generoso para escritura
// ============================================================
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensajeLimiteAlcanzado,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
});

module.exports = {
  loginLimiter,
  authLimiter,
  writeLimiter
};