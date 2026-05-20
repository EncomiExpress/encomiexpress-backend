const { AnticipoExcedente, Conductor, Ruta, Vehiculo, Destino } = require('../models');
const AppError = require('../errors/AppError');

exports.getAll = async (req, res, next) => {
  try {
    const { estado } = req.query;
    const where = {};

    // Si es conductor, solo puede ver sus propios anticipos
    if (req.usuario.rol?.nombre === 'conductor') {
      const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
      if (!conductor) return next(new AppError('Conductor no encontrado', 404));
      where.idConductor = conductor.idConductor;
    } else {
      // Admin puede filtrar por conductor si lo desea
      if (req.query.idConductor) where.idConductor = req.query.idConductor;
    }

    if (estado) where.estado = estado;

    const anticipos = await AnticipoExcedente.findAll({
      where,
      include: [
        { model: Conductor, as: 'conductor', include: [{ model: require('../models').Usuario, as: 'usuario' }] },
        { 
          model: Ruta, 
          as: 'ruta',
          include: [
            { model: Vehiculo, as: 'vehiculo' },
            { model: Destino, as: 'destino' }
          ]
        }
      ]
    });

    res.json({
      success: true,
      data: anticipos
    });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const anticipo = await AnticipoExcedente.findByPk(id, {
      include: [
        { model: Conductor, as: 'conductor', include: [{ model: require('../models').Usuario, as: 'usuario' }] },
        { 
          model: Ruta, 
          as: 'ruta',
          include: [
            { model: Vehiculo, as: 'vehiculo' },
            { model: Destino, as: 'destino' }
          ]
        }
      ]
    });

    if (!anticipo) {
      return next(new AppError('Anticipo no encontrado', 404));
    }

    // Si es conductor, verificar que el anticipo le pertenece
    if (req.usuario.rol?.nombre === 'conductor') {
      const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
      if (!conductor || anticipo.idConductor !== conductor.idConductor) {
        return next(new AppError('No tiene permiso para ver este anticipo', 403));
      }
    }

    res.json({
      success: true,
      data: anticipo
    });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { idRuta, valorAnticipo, soporte, fechaEntrega } = req.body;
    let idConductorFinal = req.body.idConductor;

    // Si es conductor, asociar automáticamente con su propio perfil
    if (req.usuario.rol?.nombre === 'conductor') {
      const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
      if (!conductor) return next(new AppError('Conductor no encontrado', 404));
      idConductorFinal = conductor.idConductor;
    } else {
      // Admin debe enviar idConductor
      const conductor = await Conductor.findByPk(idConductorFinal);
      if (!conductor) return next(new AppError('Conductor no encontrado', 404));
    }
    let idRutaFinal = idRuta;
    if (idRuta) {
      const ruta = await Ruta.findByPk(idRuta);
      if (!ruta) {
        return next(new AppError('Ruta no encontrada', 404));
      }
      idRutaFinal = ruta.idRuta;
    }

    const anticipo = await AnticipoExcedente.create({
      idConductor: idConductorFinal,
      idRuta: idRutaFinal,
      valorAnticipo: valorAnticipo || 0,
      valorGastado: 0,
      excedente: 0,
      estado: 'pendiente',
      soporte,
      fechaEntrega
    });

    res.status(201).json({
      success: true,
      message: 'Anticipo creado exitosamente',
      data: anticipo
    });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      valorGastado, 
      excedente, 
      estado, 
      soporte, 
      fechaEntrega, 
      fechaLegalizacion,
      fechaEntregaExcedente 
    } = req.body;

    const anticipo = await AnticipoExcedente.findByPk(id);

    if (!anticipo) {
      return next(new AppError('Anticipo no encontrado', 404));
    }

    let newExcedente = excedente;
    if (valorGastado !== undefined) {
      newExcedente = anticipo.valorAnticipo - valorGastado;
    }

    await anticipo.update({
      valorGastado: valorGastado !== undefined ? valorGastado : anticipo.valorGastado,
      excedente: newExcedente !== undefined ? newExcedente : anticipo.excedente,
      estado: estado || anticipo.estado,
      soporte: soporte !== undefined ? soporte : anticipo.soporte,
      fechaEntrega: fechaEntrega !== undefined ? fechaEntrega : anticipo.fechaEntrega,
      fechaLegalizacion: fechaLegalizacion !== undefined ? fechaLegalizacion : anticipo.fechaLegalizacion,
      fechaEntregaExcedente: fechaEntregaExcedente !== undefined ? fechaEntregaExcedente : anticipo.fechaEntregaExcedente
    });

    res.json({
      success: true,
      message: 'Anticipo actualizado exitosamente',
      data: anticipo
    });
  } catch (error) {
    next(error);
  }
};

exports.liquidar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { valorGastado, soporte } = req.body;

    const anticipo = await AnticipoExcedente.findByPk(id);

    if (!anticipo) {
      return next(new AppError('Anticipo no encontrado', 404));
    }

    if (anticipo.estado !== 'pendiente') {
      return next(new AppError('El anticipo ya fue liquidado', 400));
    }

    const excedente = anticipo.valorAnticipo - valorGastado;

    await anticipo.update({
      valorGastado,
      excedente,
      estado: excedente >= 0 ? 'liquidado' : 'con excedente',
      soporte,
      fechaLegalizacion: new Date()
    });

    res.json({
      success: true,
      message: 'Anticipo liquidado exitosamente',
      data: anticipo
    });
  } catch (error) {
    next(error);
  }
};

exports.entregarExcedente = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { soporte } = req.body;

    const anticipo = await AnticipoExcedente.findByPk(id);

    if (!anticipo) {
      return next(new AppError('Anticipo no encontrado', 404));
    }

    if (anticipo.excedente <= 0) {
      return next(new AppError('No hay excedente para entregar', 400));
    }

    await anticipo.update({
      estado: 'excedente entregado',
      soporte: soporte || anticipo.soporte,
      fechaEntregaExcedente: new Date()
    });

    res.json({
      success: true,
      message: 'Excedente entregado exitosamente',
      data: anticipo
    });
  } catch (error) {
    next(error);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const anticipo = await AnticipoExcedente.findByPk(id);

    if (!anticipo) {
      return next(new AppError('Anticipo no encontrado', 404));
    }

    await anticipo.destroy();

    res.json({
      success: true,
      message: 'Anticipo eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

exports.createMisAnticipo = async (req, res, next) => {
  try {
    if (req.usuario.rol?.nombre !== 'conductor') {
      return next(new AppError('Solo los conductores pueden crear anticipos', 403));
    }
    
    const conductor = await Conductor.findOne({ 
      where: { idUsuario: req.usuario.idUsuario }
    });
    
    if (!conductor) {
      return next(new AppError('Conductor no encontrado', 404));
    }
    
    const { idRuta, valorAnticipo, soporte, fechaEntrega } = req.body;

    let idRutaFinal = idRuta;
    if (idRuta) {
      const ruta = await Ruta.findByPk(idRuta);
      if (!ruta) {
        return next(new AppError('Ruta no encontrada', 404));
      }
      idRutaFinal = ruta.idRuta;
    }

    const anticipo = await AnticipoExcedente.create({
      idConductor: conductor.idConductor,
      idRuta: idRutaFinal,
      valorAnticipo: valorAnticipo || 0,
      valorGastado: 0,
      excedente: 0,
      estado: 'pendiente',
      soporte,
      fechaEntrega
    });

    res.status(201).json({
      success: true,
      message: 'Anticipo creado exitosamente',
      data: anticipo
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SUBIR SOPORTE A CLOUDINARY
// ============================================
exports.updateSoporte = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return next(new AppError('No se subió ningún archivo', 400));
    }

    const fileUrl = req.file.path; // ← Cloudinary pone la URL aquí

    const anticipo = await AnticipoExcedente.findByPk(id);
    if (!anticipo) {
      return next(new AppError('Anticipo no encontrado', 404));
    }

    await anticipo.update({ soporte: fileUrl });

    res.json({
      success: true,
      message: 'Soporte subido exitosamente',
      data: { soporte: fileUrl }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAll: exports.getAll,
  getById: exports.getById,
  create: exports.create,
  update: exports.update,
  liquidar: exports.liquidar,
  entregarExcedente: exports.entregarExcedente,
  delete: exports.delete,
  createMisAnticipo: exports.createMisAnticipo,
  updateSoporte: exports.updateSoporte
};