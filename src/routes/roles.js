const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const rolController = require('../controllers/rolController');
const { authenticate, authorize } = require('../middlewares/auth');
const { createValidation, updateValidation } = require('../validators/rolesValidator');

router.use(authenticate);

// Rutas de roles - solo admin
router.get('/', authorize('admin'), rolController.getAll);
router.get('/permisos', rolController.getAllPermisos);
router.get('/:id', authorize('admin'), rolController.getById);
router.post('/', authorize('admin'), createValidation, validate, rolController.create);
router.put('/:id', authorize('admin'), updateValidation, validate, rolController.update);
router.patch('/:id/toggle-habilitado', authorize('admin'), rolController.toggleHabilitado);
router.delete('/:id', authorize('admin'), rolController.delete);

module.exports = router;
