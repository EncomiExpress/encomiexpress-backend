const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const usuarioController = require('../controllers/usuarioController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, updateValidation, changePasswordValidation } = require('../validators/usuariosValidator');

router.use(authenticate);

// Rutas de usuarios
router.get('/', authorizePermission('listar_usuario'), usuarioController.getAll);
router.get('/:id', authorizePermission('consultar_usuario'), usuarioController.getById);
router.post('/', authorizePermission('registrar_usuario'), createValidation, validate, usuarioController.create);
router.put('/:id', authorizePermission('actualizar_usuario'), updateValidation, validate, usuarioController.update);
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_usuario'), usuarioController.toggleHabilitado);
router.post('/:id/change-password', authorizePermission('actualizar_usuario'), changePasswordValidation, validate, usuarioController.changePassword);

module.exports = router;
