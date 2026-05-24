const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const vehiculoController = require('../controllers/vehiculoController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, cambiarEstadoValidation } = require('../validators/vehiculosValidator');

router.use(authenticate);

router.get('/', authorizePermission('listar_vehiculo'), vehiculoController.getAll);
router.get('/:id', authorizePermission('consultar_vehiculo'), vehiculoController.getById);
router.post('/', authorizePermission('registrar_vehiculo'), createValidation, validate, vehiculoController.create);
router.put('/:id', authorizePermission('actualizar_vehiculo'), vehiculoController.update);

// Ruta específica para cambiar estado del vehículo
router.patch('/:id/estado', cambiarEstadoValidation, validate, vehiculoController.cambiarEstado);
router.patch('/:id/toggle-habilitado', authorizePermission('actualizar_vehiculo'), vehiculoController.toggleHabilitado);

module.exports = router;