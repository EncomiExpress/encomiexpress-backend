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
 * GET /paquetes/sede/historial  (solo rol distribuidor)
 * Paquetes que el distribuidor autenticado ya cerró (Entregado/Devuelto) — su
 * propio historial. Declarada antes de las rutas con ":id" por la misma razón
 * que "/sede". Ver getHistorialSedeDistribuidor().
 */
router.get('/sede/historial', authorize('distribuidor'), paqueteController.getHistorialSede);

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
 * PATCH /paquetes/:id/entrega-final  (solo rol distribuidor, form-data file
 * OBLIGATORIO + body novedad OBLIGATORIA)
 * Entrega final al destinatario desde "En sede de destino": accion =
 * 'Entregado' | 'Devuelto' | 'Intento'. Ver registrarEntregaFinal().
 */
router.patch('/:id/entrega-final', authorize('distribuidor'), upload.single('file'), paqueteController.registrarEntregaFinal);

/**
 * GET /paquetes/:id/historial-entrega  (panel web -- módulo Ventas -- Y móvil
 * del distribuidor)
 * Historial completo de la entrega final de un paquete — una fila por cada
 * intento/entrega/devolución registrada. Sin authorize/authorizePermission
 * acá: la autorización (admin con permiso, o distribuidor dueño de la sede)
 * se resuelve dentro del controller — ver getHistorialEntrega().
 */
router.get('/:id/historial-entrega', paqueteController.getHistorialEntrega);

module.exports = router;
