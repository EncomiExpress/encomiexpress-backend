const express = require('express');
const router = express.Router();
const paqueteController = require('../controllers/paqueteController');
const { authenticate } = require('../middlewares/auth');
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

module.exports = router;
