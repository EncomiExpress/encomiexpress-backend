const express = require('express');
const router = express.Router();
const { Permiso } = require('../models');
const { authenticate } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Permisos
 *   description: Consulta de permisos disponibles en el sistema
 */

/**
 * @swagger
 * /permisos:
 *   get:
 *     summary: Listar todos los permisos habilitados
 *     tags: [Permisos]
 *     responses:
 *       200:
 *         description: Lista de permisos ordenados alfabéticamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       idPermiso: { type: integer }
 *                       nombre:    { type: string }
 *                       descripcion: { type: string }
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const permisos = await Permiso.findAll({
      where: { habilitado: true },
      order: [['nombre', 'ASC']]
    });
    res.json({ success: true, data: permisos });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
