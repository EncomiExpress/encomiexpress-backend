const express = require('express');
const router = express.Router();
const paqueteController = require('../controllers/paqueteController');
const { authenticate, authorize } = require('../middlewares/auth');
const { upload } = require('../config/cloudinary');

router.use(authenticate);

/**
 * GET /paquetes?conductorId=123
 * Listar paquetes asignados a un conductor
 */
router.get('/', paqueteController.getByConductor);

/**
 * GET /paquetes/sede  (solo rol distribuidor)
 * Paquetes "En sede de destino" de las sedes que cubre el distribuidor
 * autenticado (usuario_sede). Ver getPaquetesEnSede().
 */
router.get('/sede', authorize('distribuidor'), paqueteController.getPorSede);

/**
 * PATCH /paquetes/sede  (solo rol conductor, form-data opcional: file + novedades)
 * El conductor del tramo troncal marca DE UNA SOLA VEZ todos los paquetes que
 * dejó en la sede de un municipio (parada o destino final): "Por entregar" ->
 * "En sede de destino". Body: idRuta, idDestino. Ver dejarPaquetesEnSede().
 * Declarada antes de las rutas con ":id" para que "sede" no se lea como un id.
 */
router.patch('/sede', authorize('conductor'), upload.single('file'), paqueteController.dejarEnSede);

/**
 * PATCH /paquetes/:id/evidencia
 * Subir foto de entrega (form-data file) — flujo del conductor.
 */
router.patch('/:id/evidencia', upload.single('file'), paqueteController.subirEvidencia);

/**
 * PATCH /paquetes/:id/entrega-final  (solo rol distribuidor, form-data opcional: file)
 * Entrega final al destinatario desde "En sede de destino": accion =
 * 'Entregado' | 'Devuelto' | 'Intento'. Ver registrarEntregaFinal().
 */
router.patch('/:id/entrega-final', authorize('distribuidor'), upload.single('file'), paqueteController.registrarEntregaFinal);

/**
 * PATCH /paquetes/:id/repartidor-local
 * Asignar el repartidor local que hace la entrega puerta a puerta en el
 * municipio de destino — solo admin, solo aplica a un paquete "En sede de
 * destino" (ver encomiendaService.asignarRepartidorLocal).
 */
router.patch('/:id/repartidor-local', authorize('admin'), paqueteController.asignarRepartidorLocal);

module.exports = router;
