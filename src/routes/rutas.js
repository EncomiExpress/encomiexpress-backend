const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const rutaController = require('../controllers/rutaController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation } = require('../validators/rutasValidator');

router.use(authenticate);

router.get('/', authorizePermission('listar_ruta'), rutaController.getAll);
router.get('/:id', authorizePermission('consultar_ruta'), rutaController.getById);
router.post('/', authorizePermission('registrar_ruta'), createValidation, validate, rutaController.create);
router.put('/:id', authorizePermission('actualizar_ruta'), rutaController.update);
router.patch('/:id/toggle-habilitado', authorizePermission('actualizar_ruta'), rutaController.toggleHabilitado);

module.exports = router;
