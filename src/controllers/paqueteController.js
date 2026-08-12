const { Paquete, RutaVehiculoConductor, EncomiendaVenta, Destinatario, Ruta, Destino } = require('../models');
const { Op } = require('sequelize');
const encomiendaService = require('../services/encomiendaService');
const AppError = require('../errors/appError');

exports.getByConductor = async (req, res, next) => {
  try {
    const idConductor = req.query.idConductor ? parseInt(req.query.idConductor) : null;
    if (!idConductor) return res.status(400).json({ success: false, message: 'idConductor es requerido como query param' });

    // Buscar pares de ruta asignados al conductor
    const pares = await RutaVehiculoConductor.findAll({ where: { idConductor, habilitado: true }, attributes: ['idRutaVehiculoConductor'] });
    const ids = pares.map(p => p.idRutaVehiculoConductor);

    const paquetes = await Paquete.findAll({
      where: { idRutaVehiculoConductor: { [Op.in]: ids } },
      include: [
        { model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] },
        { model: RutaVehiculoConductor, as: 'asignacion', include: [{ model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino' }] }] },
      ],
      order: [['idPaquete', 'ASC']]
    });

    res.json({ success: true, data: paquetes });
  } catch (error) {
    next(error);
  }
};

exports.subirEvidencia = async (req, res, next) => {
  try {
    const { id } = req.params;
    const fileUrl = req.file?.path || null;
    if (!fileUrl) return res.status(400).json({ success: false, message: 'Archivo no proporcionado' });

    // Opcionalmente, se puede recibir un estado en el body (e.g., 'Entregado')
    const estado = req.body.estado || 'Entregado';

    const paquete = await encomiendaService.actualizarEstadoPaquete(id, estado, { observacion: req.body.observacion || '', fotoEntrega: fileUrl });
    res.json({ success: true, message: 'Evidencia subida y paquete actualizado', data: paquete });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
