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
        { model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] },
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
    if (paquete.asignacion?.idConductor !== conductor.idConductor) {
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

module.exports = exports;
