const express = require('express');
const router = express.Router();
const conductorController = require('../controllers/conductorController');
const anticipoController = require('../controllers/anticipoExcedenteController');
const { authenticate, authorize, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const { createValidation, updateValidation, cambiarEstadoValidation } = require('../validators/conductoresValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Conductores
 *   description: Gestión de conductores y operaciones de su perfil propio
 */

/**
 * @swagger
 * /conductores/perfil:
 *   get:
 *     summary: Obtener perfil del conductor autenticado (solo conductores)
 *     tags: [Conductores]
 *     responses:
 *       200:
 *         description: Perfil del conductor con datos de licencia y vehículo asignado
 *       403:
 *         description: Solo conductores pueden acceder a este endpoint
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/perfil', async (req, res, next) => {
  try {
    if (req.usuario.rol?.nombre !== 'conductor') {
      return res.status(403).json({
        success: false,
        message: 'Solo los conductores pueden acceder a su perfil'
      });
    }

    const { Conductor, Usuario, Vehiculo } = require('../models');

    const conductor = await Conductor.findOne({
      where: { idUsuario: req.usuario.idUsuario },
      include: [
        { model: Usuario, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellido', 'telefono', 'email', 'tipoIdentificacion', 'numeroIdentificacion'] },
        { model: Vehiculo, as: 'vehiculos', where: { habilitado: true }, required: false, attributes: ['idVehiculo', 'placa', 'marca', 'modelo', 'anio', 'color', 'tipo', 'capacidad'] }
      ]
    });

    if (!conductor) {
      return res.status(404).json({ success: false, message: 'Conductor no encontrado' });
    }

    const vehiculo = conductor.vehiculos && conductor.vehiculos.length > 0 ? conductor.vehiculos[0] : null;

    res.json({
      success: true,
      data: {
        id: conductor.usuario.idUsuario,
        nombre: conductor.usuario.nombre,
        apellido: conductor.usuario.apellido,
        telefono: conductor.usuario.telefono,
        email: conductor.usuario.email,
        tipoIdentificacion: conductor.usuario.tipoIdentificacion,
        numeroIdentificacion: conductor.usuario.numeroIdentificacion,
        conductorId: conductor.idConductor,
        categoriaLicencia: conductor.categoriaLicencia,
        numeroLicencia: conductor.numeroLicencia,
        vencimientoLicencia: conductor.vencimientoLicencia,
        placa: vehiculo?.placa,
        marca: vehiculo?.marca,
        modelo: vehiculo?.modelo,
        anio: vehiculo?.anio,
        color: vehiculo?.color,
        tipo: vehiculo?.tipo,
        capacidad: vehiculo?.capacidad,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /conductores/perfil:
 *   put:
 *     summary: Actualizar perfil del conductor autenticado (solo conductores)
 *     tags: [Conductores]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:              { type: string }
 *               telefono:            { type: string }
 *               email:               { type: string, format: email }
 *               categoriaLicencia:   { type: string }
 *               numeroLicencia:      { type: string }
 *               vencimientoLicencia: { type: string, format: date }
 *               placa:               { type: string }
 *               marca:               { type: string }
 *               modelo:              { type: string }
 *               anio:                { type: integer }
 *               color:               { type: string }
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente (usuario + conductor + vehículo en transacción)
 */
router.put('/perfil', async (req, res, next) => {
  try {
    if (req.usuario.rol?.nombre !== 'conductor') {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden actualizar su perfil' });
    }

    const { Conductor, Usuario, Vehiculo } = require('../models');
    const sequelize = require('../config/database');

    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });

    if (!conductor) {
      return res.status(404).json({ success: false, message: 'Conductor no encontrado' });
    }

    const { nombre, telefono, email, numeroIdentificacion, direccion, categoriaLicencia, numeroLicencia, vencimientoLicencia, placa, marca, modelo, anio, color } = req.body;

    const t = await sequelize.transaction();

    try {
      await Usuario.update(
        { ...(nombre && { nombre }), ...(telefono && { telefono }), ...(email && { email }), ...(numeroIdentificacion && { numeroIdentificacion }), ...(direccion && { direccion }) },
        { where: { idUsuario: req.usuario.idUsuario }, transaction: t }
      );

      await conductor.update(
        { ...(categoriaLicencia !== undefined && { categoriaLicencia }), ...(numeroLicencia !== undefined && { numeroLicencia }), ...(vencimientoLicencia !== undefined && { vencimientoLicencia }) },
        { transaction: t }
      );

      await Vehiculo.update(
        { ...(placa && { placa }), ...(marca && { marca }), ...(modelo && { modelo }), ...(anio && { anio }), ...(color && { color }) },
        { where: { idConductor: conductor.idConductor }, transaction: t }
      );

      await t.commit();

      res.json({ success: true, message: 'Perfil actualizado exitosamente' });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /conductores/mis-anticipos:
 *   get:
 *     summary: Listar anticipos del conductor autenticado (solo conductores)
 *     tags: [Conductores]
 *     responses:
 *       200:
 *         description: Anticipos del conductor
 *       403:
 *         description: Solo conductores pueden acceder
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/mis-anticipos', async (req, res, next) => {
  try {
    if (req.usuario.rol?.nombre !== 'conductor') {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden acceder a esta información' });
    }
    const { Conductor } = require('../models');
    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(404).json({ success: false, message: 'Conductor no encontrado' });
    }
    req.params.id = conductor.idConductor;
    return conductorController.getAnticipos(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /conductores/mis-anticipos:
 *   post:
 *     summary: Registrar anticipo propio (solo conductores)
 *     tags: [Conductores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tipo, monto]
 *             properties:
 *               tipo:        { type: string, enum: [anticipo, excedente] }
 *               monto:       { type: number }
 *               idRuta:      { type: integer }
 *               descripcion: { type: string }
 *     responses:
 *       201:
 *         description: Anticipo registrado (idConductor se toma del token)
 */
router.post('/mis-anticipos', async (req, res, next) => {
  try {
    if (req.usuario.rol?.nombre !== 'conductor') {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden crear anticipos' });
    }
    const { Conductor } = require('../models');
    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(404).json({ success: false, message: 'Conductor no encontrado' });
    }
    req.body.idConductor = conductor.idConductor;
    return anticipoController.create(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /conductores:
 *   get:
 *     summary: Listar conductores
 *     tags: [Conductores]
 *     parameters:
 *       - in: query
 *         name: habilitado
 *         schema: { type: string, enum: ['true','false'] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de conductores con datos de usuario y licencia
 */
router.get('/', conductorController.getAll);
router.get('/:id/page-of', authorize('admin'), conductorController.getPageOf);

/**
 * @swagger
 * /conductores/{id}:
 *   get:
 *     summary: Obtener conductor por ID
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del conductor
 *       404:
 *         description: Conductor no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', conductorController.getById);

/**
 * @swagger
 * /conductores/{id}/anticipos:
 *   get:
 *     summary: Listar anticipos de un conductor específico
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de anticipos y excedentes del conductor
 */
router.get('/:id/anticipos', conductorController.getAnticipos);

/**
 * @swagger
 * /conductores:
 *   post:
 *     summary: Registrar nuevo conductor (solo admin)
 *     tags: [Conductores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConductorCreate'
 *     responses:
 *       201:
 *         description: Conductor registrado con usuario vinculado (rol conductor asignado automáticamente)
 *       400:
 *         description: Email o documento ya registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorize('admin'), createValidation, validate, conductorController.create);

/**
 * @swagger
 * /conductores/{id}:
 *   put:
 *     summary: Actualizar conductor (solo admin)
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConductorCreate'
 *     responses:
 *       200:
 *         description: Conductor actualizado
 */
router.put('/:id', authorize('admin'), updateValidation, validate, conductorController.update);

/**
 * @swagger
 * /conductores/{id}/estado:
 *   patch:
 *     summary: Cambiar estado operativo del conductor (solo admin)
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [estado]
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [Disponible, En Ruta]
 *     responses:
 *       200:
 *         description: Estado operativo actualizado
 */
router.patch('/:id/estado', authorize('admin'), cambiarEstadoValidation, validate, conductorController.cambiarEstado);

/**
 * @swagger
 * /conductores/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar conductor (solo admin)
 *     description: |
 *       Afecta únicamente el acceso al sistema (`usuario.habilitado`).
 *       Los registros de rutas, anticipos y vehículos permanecen intactos.
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 *       400:
 *         description: Conductor tiene rutas activas o anticipos pendientes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_conductor'), conductorController.toggleHabilitado);

module.exports = router;
