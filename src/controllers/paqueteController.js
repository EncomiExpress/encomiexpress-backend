const { Paquete, RutaVehiculoConductor, EncomiendaVenta, Destinatario, Ruta, Destino, Conductor } = require('../models');
const { Op } = require('sequelize');
const encomiendaService = require('../services/encomiendaService');
const AppError = require('../errors/appError');

exports.getByConductor = async (req, res, next) => {
  try {
    // El idConductor sale del token, no del query param — así un conductor nunca
    // puede pedir los paquetes de otro con solo cambiar el número en la URL.
    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden acceder a sus paquetes' });
    }
    const idConductor = conductor.idConductor;

    const pares = await RutaVehiculoConductor.findAll({ where: { idConductor, habilitado: true }, attributes: ['idRutaVehiculoConductor'] });
    const ids = pares.map(p => p.idRutaVehiculoConductor);

    const paquetes = await Paquete.findAll({
      where: { idRutaVehiculoConductor: { [Op.in]: ids } },
      include: [
        // El Destino anidado en el destinatario es el municipio real de la venta
        // (parada intermedia o destino final) — el móvil agrupa por él para el
        // botón "dejar en sede" (ver driver_paquetes.dart).
        { model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] }] },
        { model: RutaVehiculoConductor, as: 'asignacion', include: [{ model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino' }] }] },
      ],
      order: [['idPaquete', 'DESC']]
    });

    res.json({ success: true, data: paquetes });
  } catch (error) {
    next(error);
  }
};

exports.subirEvidencia = async (req, res, next) => {
  try {
    const { id } = req.params;

    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden actualizar sus paquetes' });
    }

    const paquete = await Paquete.findByPk(id, { include: [{ model: RutaVehiculoConductor, as: 'asignacion' }] });
    if (!paquete) {
      return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    }
    // Dos conductores distintos pueden tocar este paquete según en qué punto del
    // flujo esté: el del tramo troncal (asignacion.idConductor, para "Por entregar"
    // y para la entrega directa de siempre) o el repartidor local ya asignado
    // (idConductorEntrega, solo aplica una vez el paquete está "En sede de destino").
    const esConductorTroncal = paquete.asignacion?.idConductor === conductor.idConductor;
    const esRepartidorLocal = paquete.idConductorEntrega === conductor.idConductor;
    if (!esConductorTroncal && !esRepartidorLocal) {
      return res.status(403).json({ success: false, message: 'Este paquete no está asignado a tu cuenta' });
    }

    // El resultado que entrega Cloudinary no trae ningún campo `.path` (eso es
    // convención de multer.diskStorage) — la URL real de la imagen es
    // `secure_url`. Mismo bug ya corregido antes en el soporte de anticipos.
    const fileUrl = req.file?.secure_url || null;
    if (!fileUrl) return res.status(400).json({ success: false, message: 'Archivo no proporcionado' });

    const estado = req.body.estado;
    if (!estado) return res.status(400).json({ success: false, message: 'El campo "estado" es requerido' });

    const paqueteActualizado = await encomiendaService.actualizarEstadoPaquete(id, estado, { observacion: req.body.observacion || '', fotoEntrega: fileUrl });
    res.json({ success: true, message: 'Evidencia subida y paquete actualizado', data: paqueteActualizado });
  } catch (error) {
    next(error);
  }
};

exports.dejarEnSede = async (req, res, next) => {
  try {
    // El idConductor sale del token, no del body — un conductor solo legaliza sus
    // propios paquetes.
    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden legalizar la entrega en sede' });
    }

    const idRuta = parseInt(req.body.idRuta, 10);
    const idDestino = parseInt(req.body.idDestino, 10);
    if (!idRuta || !idDestino) {
      return res.status(400).json({ success: false, message: 'Los campos "idRuta" e "idDestino" son requeridos' });
    }

    // Foto y novedades opcionales — el conductor puede legalizar sin subir nada.
    const fotoEntrega = req.file?.secure_url || null;

    const resultado = await encomiendaService.dejarPaquetesEnSede(conductor.idConductor, {
      idRuta,
      idDestino,
      novedades: req.body.novedades || '',
      fotoEntrega,
    });

    res.json({
      success: true,
      message: `Se ${resultado.actualizados === 1 ? 'dejó 1 paquete' : `dejaron ${resultado.actualizados} paquetes`} en la sede`,
      data: resultado,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/paquetes/sede — paquetes "En sede de destino" de las sedes que cubre
// el distribuidor autenticado (usuario_sede). El idUsuario sale del token.
exports.getPorSede = async (req, res, next) => {
  try {
    if (req.usuario.rol?.nombre !== 'distribuidor') {
      return res.status(403).json({ success: false, message: 'Solo los distribuidores pueden acceder a los paquetes en sede' });
    }
    const paquetes = await encomiendaService.getPaquetesEnSede(req.usuario.idUsuario);
    res.json({ success: true, data: paquetes });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/paquetes/:id/entrega-final — el distribuidor de la sede registra la
// entrega final: accion = 'Entregado' | 'Devuelto' | 'Intento'. Foto opcional,
// novedad obligatoria para 'Devuelto'/'Intento' (ver registrarEntregaFinal).
exports.registrarEntregaFinal = async (req, res, next) => {
  try {
    if (req.usuario.rol?.nombre !== 'distribuidor') {
      return res.status(403).json({ success: false, message: 'Solo los distribuidores pueden gestionar la entrega final' });
    }
    const { id } = req.params;
    const accion = req.body.accion;
    if (!accion) {
      return res.status(400).json({ success: false, message: 'El campo "accion" es requerido' });
    }
    const fotoEntrega = req.file?.secure_url || null;
    const paquete = await encomiendaService.registrarEntregaFinal(id, {
      accion,
      novedad: req.body.novedad || '',
      fotoEntrega,
      idUsuarioDistribuidor: req.usuario.idUsuario,
    });
    res.json({ success: true, message: 'Entrega registrada', data: paquete });
  } catch (error) {
    next(error);
  }
};

exports.asignarRepartidorLocal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { idConductor } = req.body;
    if (!idConductor) {
      return res.status(400).json({ success: false, message: 'El campo "idConductor" es requerido' });
    }
    const paquete = await encomiendaService.asignarRepartidorLocal(id, parseInt(idConductor));
    res.json({ success: true, message: 'Repartidor local asignado exitosamente', data: paquete });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
