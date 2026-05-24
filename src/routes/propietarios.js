const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const propietarioController = require('../controllers/propietarioVehiculoController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation } = require('../validators/propietariosValidator');

router.use(authenticate);

router.get('/', authorizePermission('gestion_transporte'), propietarioController.getAll);
router.get('/:id', authorizePermission('gestion_transporte'), propietarioController.getById);
router.post('/', authorizePermission('gestion_transporte'), createValidation, validate, propietarioController.create);
router.put('/:id', authorizePermission('gestion_transporte'), propietarioController.update);
router.patch('/:id/toggle-habilitado', authorizePermission('gestion_transporte'), propietarioController.toggleHabilitado);

module.exports = router;
