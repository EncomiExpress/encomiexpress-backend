const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const destinoController = require('../controllers/destinoController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation } = require('../validators/destinosValidator');

router.use(authenticate);
router.get('/', authorizePermission('listar_destino'), destinoController.getAll);
router.get('/:id', authorizePermission('consultar_destino'), destinoController.getById);
router.post('/', authorizePermission('registrar_destino'), createValidation, validate, destinoController.create);
router.put('/:id', authorizePermission('actualizar_destino'), destinoController.update);
router.patch('/:id/toggle-habilitado', authorizePermission('actualizar_destino'), destinoController.toggleHabilitado);

module.exports = router;

