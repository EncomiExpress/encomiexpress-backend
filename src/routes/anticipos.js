const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const anticipoController = require('../controllers/anticipoExcedenteController');
const { authenticate, authorize, authorizePermission } = require('../middlewares/auth');
const { upload } = require('../config/cloudinary');
const { createValidation } = require('../validators/anticiposValidator');

// ============================================
// RUTAS PÚBLICAS (solo lectura para admin/conductor)
// ============================================
router.get('/', authenticate, authorizePermission('listar_anticipo'), anticipoController.getAll);
router.get('/:id', authenticate, authorizePermission('consultar_anticipo'), anticipoController.getById);

// ============================================
// RUTAS PROTEGIDAS
// ============================================

// Crear anticipo - admin o conductor
router.post('/', authenticate, authorize('admin', 'conductor'), createValidation, validate, anticipoController.create);

// Actualizar anticipo - admin o conductor (solo el conductor owner o admin)
router.put('/:id', authenticate, authorize('admin', 'conductor'), anticipoController.update);

// Subir soporte a Cloudinary
router.post('/:id/soporte', authenticate, authorize('admin', 'conductor'), 
  upload.single('soporte'), 
  anticipoController.updateSoporte
);

// Toggle habilitado
router.patch('/:id/toggle-habilitado', authenticate, authorize('admin'), authorizePermission('actualizar_anticipo'), anticipoController.toggleHabilitado);

module.exports = router;