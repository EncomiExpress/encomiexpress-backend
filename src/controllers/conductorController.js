const conductorService = require('../services/conductorService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const { estado, habilitado, q } = req.query;
    const filters = { estado, habilitado, q, page, limit, sortBy };
    const result = await conductorService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const conductor = await conductorService.getById(id);
    res.json({ success: true, data: conductor });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const conductor = await conductorService.create(req.body);
    res.status(201).json({ success: true, message: 'Conductor creado exitosamente', data: conductor });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const conductor = await conductorService.update(id, req.body);
    res.json({ success: true, message: 'Conductor actualizado exitosamente', data: conductor });
  } catch (error) {
    next(error);
  }
};

exports.getAnticipos = async (req, res, next) => {
  try {
    const { id } = req.params;
    const anticipos = await conductorService.getAnticipos(id);
    res.json({ success: true, data: anticipos });
  } catch (error) {
    next(error);
  }
};

exports.cambiarEstado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await conductorService.cambiarEstado(id, req.body.estado);
    res.json({
      success: true,
      message: 'Estado del conductor actualizado correctamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.getPerfil = async (req, res, next) => {
  try {
    const perfil = await conductorService.getMiPerfil(req.usuario.idUsuario, req.usuario.rol?.nombre);
    res.json({ success: true, data: perfil });
  } catch (error) {
    next(error);
  }
};

exports.actualizarPerfil = async (req, res, next) => {
  try {
    await conductorService.actualizarMiPerfil(req.usuario.idUsuario, req.usuario.rol?.nombre, req.body);
    res.json({ success: true, message: 'Perfil actualizado exitosamente' });
  } catch (error) {
    next(error);
  }
};

exports.getMisAnticipos = async (req, res, next) => {
  try {
    const anticipos = await conductorService.getMisAnticipos(req.usuario.idUsuario, req.usuario.rol?.nombre);
    res.json({ success: true, data: anticipos });
  } catch (error) {
    next(error);
  }
};

exports.toggleHabilitado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const conductor = await conductorService.toggleHabilitado(id);
    res.json({
      success: true,
      message: `Conductor ${conductor.habilitado ? 'habilitado' : 'inhabilitado'} exitosamente`,
      data: conductor
    });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await conductorService.getPageOf(req.params.id, { limit });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
