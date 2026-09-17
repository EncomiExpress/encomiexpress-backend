const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const rutaController = require('../controllers/rutaController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, updateValidation } = require('../validators/rutasValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Rutas
 *   description: Plantillas reutilizables de corredor (origen->destino). La agenda
 *     concreta (fecha/hora/estado/convoy) vive en /salidas.
 */

/**
 * @swagger
 * /rutas:
 *   get:
 *     summary: Listar plantillas de ruta
 *     tags: [Rutas]
 *     responses:
 *       200:
 *         description: Lista paginada de rutas (plantilla)
 */
router.get('/', authorizePermission('listar_ruta'), rutaController.getAll);

/**
 * @swagger
 * /rutas/{id}:
 *   get:
 *     summary: Obtener una plantilla de ruta por ID
 *     tags: [Rutas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos de la plantilla, con su destino
 *       404:
 *         description: Ruta no encontrada
 */
router.get('/:id', authorizePermission('consultar_ruta'), rutaController.getById);

/**
 * @swagger
 * /rutas:
 *   post:
 *     summary: Registrar una nueva plantilla de ruta
 *     tags: [Rutas]
 *     responses:
 *       201:
 *         description: Ruta creada exitosamente
 */
router.post('/', authorizePermission('registrar_ruta'), createValidation, validate, rutaController.create);

/**
 * @swagger
 * /rutas/{id}:
 *   put:
 *     summary: Actualizar una plantilla de ruta
 *     tags: [Rutas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ruta actualizada
 */
router.put('/:id', authorizePermission('actualizar_ruta'), updateValidation, validate, rutaController.update);

/**
 * @swagger
 * /rutas/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar una plantilla de ruta
 *     description: Se rechaza si la plantilla tiene alguna salida Programada/En Ruta.
 *     tags: [Rutas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_ruta'), rutaController.toggleHabilitado);

module.exports = router;
