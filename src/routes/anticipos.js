const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middlewares/validation');
const anticipoController = require('../controllers/anticipoExcedenteController');
const { authenticate, authorize, authorizePermission } = require('../middlewares/auth');
const { upload } = require('../config/cloudinary');

// GET / → admin ve todos, conductor solo los suyos
router.get('/', authenticate, authorizePermission('listar_anticipo'), anticipoController.getAll);

// GET /:id → admin ve cualquiera, conductor solo el suyo
router.get('/:id', authenticate, authorizePermission('consultar_anticipo'), anticipoController.getById);

// POST / → admin envía idConductor, conductor se asocia automáticamente
router.post('/', authenticate, authorize('admin', 'conductor'),
  body('valorAnticipo').notEmpty().withMessage('Valor del anticipo es requerido'),
  validate,
  anticipoController.create
);

// PUT /:id → admin o conductor (conductor solo puede actualizar el suyo)
router.put('/:id', authenticate, authorize('admin', 'conductor'), anticipoController.update);

// POST /:id/soporte → subir soporte a Cloudinary
router.post('/:id/soporte', authenticate, authorize('admin', 'conductor'),
  upload.single('soporte'),
  anticipoController.updateSoporte
);

// DELETE /:id → solo admin
router.delete('/:id', authenticate, authorize('admin'), anticipoController.delete);

module.exports = router;