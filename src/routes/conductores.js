const express = require('express');
const router = express.Router();
const conductorController = require('../controllers/conductorController');
const anticipoController = require('../controllers/anticipoExcedenteController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const { createValidation, updateValidation, cambiarEstadoValidation } = require('../validators/conductoresValidator');

// ============================================
// RUTAS PROTEGIDAS - PRIMERO PARA EVITAR CONFLICTO CON :id
// ============================================
router.use(authenticate);

// Rutas protegidas - perfil del conductor logueado
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

// Actualizar perfil del conductor logueado
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

// Rutas para anticipos del conductor logueado
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

// ============================================
// RUTAS PÚBLICAS (solo lectura - para la app Flutter)
// ============================================
router.get('/', conductorController.getAll);
router.get('/:id', conductorController.getById);
router.get('/:id/vehiculos', conductorController.getVehiculos);
router.get('/:id/anticipos', conductorController.getAnticipos);

// ============================================
// RUTAS PROTEGIDAS - ADMIN
// ============================================
router.post('/', authorize('admin'), createValidation, validate, conductorController.create);
router.put('/:id', authorize('admin'), updateValidation, validate, conductorController.update);

// Ruta específica para cambiar estado del conductor
router.patch('/:id/estado', authorize('admin'), cambiarEstadoValidation, validate, conductorController.cambiarEstado);
router.patch('/:id/toggle-habilitado', authorize('admin'), conductorController.toggleHabilitado);

module.exports = router;