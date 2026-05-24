const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const encomiendaVentaController = require('../controllers/encomiendaVentaController');
const { authenticate, authorize } = require('../middlewares/auth');
const {
  createValidation,
  cambiarEstadoValidation,
  agregarPaqueteValidation,
  agregarDestinatarioValidation
} = require('../validators/encomiendasValidator');

// ============================================
// Rutas públicas
// ============================================

// GET /api/encomiendas - Listar todas las encomiendas
router.get('/', encomiendaVentaController.getAll);

// GET /api/encomiendas/:id - Obtener una encomienda por ID
router.get('/:id', encomiendaVentaController.getById);

// GET /api/encomiendas/guia/:numeroGuia - Buscar por número de guía
router.get('/guia/:numeroGuia', encomiendaVentaController.getByGuia);

// Ruta pública de seguimiento por token
router.get('/public/:token', encomiendaVentaController.getPublicByToken);

// ============================================
// Rutas protegidas
// ============================================

router.use(authenticate);

// POST /api/encomiendas - Crear una nueva encomienda
router.post('/', authenticate, createValidation, validate, encomiendaVentaController.create);

// PUT /api/encomiendas/:id - Actualizar una encomienda
router.put('/:id', encomiendaVentaController.update);

// PATCH /api/encomiendas/:id/estado - Cambiar estado
router.patch('/:id/estado', authenticate, cambiarEstadoValidation, validate, encomiendaVentaController.cambiarEstado);

// PATCH /api/encomiendas/:id/toggle-habilitado - Habilitar/Inhabilitar
router.patch('/:id/toggle-habilitado', encomiendaVentaController.toggleHabilitado);

// DELETE /api/encomiendas/:id - Inhabilitar una encomienda (legacy)
router.delete('/:id', authorize('admin'), encomiendaVentaController.delete);

// POST /api/encomiendas/:idEncomiendaVenta/paquetes - Agregar paquete
router.post('/:idEncomiendaVenta/paquetes', authenticate, agregarPaqueteValidation, validate, encomiendaVentaController.agregarPaquete);

// POST /api/encomiendas/:idEncomiendaVenta/destinatario - Agregar destinatario
router.post('/:idEncomiendaVenta/destinatario', authenticate, agregarDestinatarioValidation, validate, encomiendaVentaController.agregarDestinatario);

module.exports = router;
