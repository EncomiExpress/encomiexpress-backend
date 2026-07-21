const AppError = require('../errors/appError');
const anticipoService = require('../services/anticipoService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const { idConductor, idRuta, estado, habilitado, anio, mes, q } = req.query;
    const result = await anticipoService.getAll({ idConductor, idRuta, estado, habilitado, anio, mes, q, page, limit, sortBy });
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

exports.createMisAnticipo = async (req, res, next) => {
  try {
    const anticipo = await anticipoService.createMisAnticipo(req.usuario.idUsuario, req.usuario.rol?.nombre, req.body);
    res.status(201).json({ success: true, message: 'Anticipo creado exitosamente', data: anticipo });
  } catch (error) {
    next(error);
  }
};

exports.updateSoporte = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return next(new AppError('No se subió ningún archivo', 400));
    }
    // El resultado que entrega Cloudinary no trae ningún campo `.path` (eso es
    // convención de multer.diskStorage) — la URL real de la imagen es
    // `secure_url`. Con `.path` cada URL guardada quedaba `undefined`.
    const fileUrls = req.files.map(f => f.secure_url);
    const result = await anticipoService.updateSoporte(id, fileUrls);
    res.json({ success: true, message: 'Soporte subido exitosamente', data: result });
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
exports.getAniosDisponibles = async (req, res, next) => {
  try {
    const anios = await anticipoService.getAniosDisponibles();
    res.json({ success: true, data: anios });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await anticipoService.getPageOf(id, { limit });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
