const { AppError } = require('../errors/appError');
const anticipoService = require('../services/anticipoService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const { idConductor, estado, habilitado, q } = req.query;
    const result = await anticipoService.getAll({ idConductor, estado, habilitado, q, page, limit, sortBy });
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const anticipo = await anticipoService.getById(id);
    res.json({ success: true, data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { idConductor, idRuta, valorAnticipo, soporte, fechaEntrega } = req.body;
    const anticipo = await anticipoService.create({ idConductor, idRuta, valorAnticipo, soporte, fechaEntrega });
    res.status(201).json({ success: true, message: 'Anticipo creado exitosamente', data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const anticipo = await anticipoService.update(id, req.body);
    res.json({ success: true, message: 'Anticipo actualizado exitosamente', data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.cambiarEstado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!estado) {
      return next(new AppError('El campo "estado" es requerido', 400));
    }
    const anticipo = await anticipoService.cambiarEstado(id, estado);
    res.json({ success: true, message: `Estado actualizado a "${anticipo.estado}"`, data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.liquidar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { valorGastado, soporte } = req.body;
    const anticipo = await anticipoService.liquidar(id, { valorGastado, soporte });
    res.json({ success: true, message: 'Anticipo liquidado exitosamente', data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.entregarExcedente = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { soporte } = req.body;
    const anticipo = await anticipoService.entregarExcedente(id, { soporte });
    res.json({ success: true, message: 'Excedente entregado exitosamente', data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.delete = async (req, res, next) => {
  // Método obsoleto: use PATCH /anticipos/:id/toggle-habilitado
  res.status(405).json({ success: false, message: 'Método obsoleto. Use PATCH /anticipos/:id/toggle-habilitado para inhabilitar/restaurar.' });
};

exports.createMisAnticipo = async (req, res, next) => {
  try {
    const data = { ...req.body, idUsuario: req.usuario.idUsuario };
    const anticipo = await anticipoService.createMisAnticipo(data);
    res.status(201).json({ success: true, message: 'Anticipo creado exitosamente', data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.updateSoporte = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return next(new AppError('No se subió ningún archivo', 400));
    }
    const fileUrl = req.file.path;
    const result = await anticipoService.updateSoporte(id, fileUrl);
    res.json({ success: true, message: 'Soporte subido exitosamente', data: { soporte: fileUrl } });
  } catch (error) {
    next(error);
  }
};

exports.toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const anticipo = await anticipoService.toggleHabilitado(id);
    res.json({
      success: true,
      message: `Anticipo ${anticipo.habilitado ? 'habilitado' : 'inhabilitado'} exitosamente`,
      data: anticipo
    });
  } catch (error) {
    next(error);
  }
};