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
 * PATCH /paquetes/:id/evidencia
 * Subir foto de entrega (form-data file)
 */
router.patch('/:id/evidencia', upload.single('file'), paqueteController.subirEvidencia);

/**
 * PATCH /paquetes/:id/repartidor-local
 * Asignar el repartidor local que hace la entrega puerta a puerta en el
 * municipio de destino — solo admin, solo aplica a un paquete "En sede de
 * destino" (ver encomiendaService.asignarRepartidorLocal).
 */
router.patch('/:id/repartidor-local', authorize('admin'), paqueteController.asignarRepartidorLocal);

module.exports = router;
