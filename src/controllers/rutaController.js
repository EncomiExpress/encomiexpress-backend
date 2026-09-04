const rutaService = require('../services/rutaService');

exports.getAll = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const sortBy = req.query.sortBy;
    const filters = {
      habilitado: req.query.habilitado,
      estado: req.query.estado,
      anio: req.query.anio,
      mes: req.query.mes,
      q: req.query.q,
      idConductor: req.query.idConductor,
      idVehiculo: req.query.idVehiculo,
      idDestino: req.query.idDestino,
      page,
      limit,
      sortBy,
    };
    const result = await rutaService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ruta = await rutaService.getById(id);
    res.json({ success: true, data: ruta });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res) => {
  try {
    const ruta = await rutaService.create(req.body);
    res.status(201).json({ success: true, message: 'Ruta creada exitosamente', data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al crear ruta' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { ruta, ventasSinFechaEntrega } = await rutaService.update(id, req.body);
    // Si mover la fecha de la ruta dejó ventas sin una fecha de entrega en sede válida
    // (se les vació el campo — ver rutaService.update), se avisa en el mismo mensaje
    // de éxito para que quien edita la ruta se entere de una y las revise después.
    const aviso = ventasSinFechaEntrega.length > 0
      ? ` Se vació la fecha estimada de entrega en sede de ${ventasSinFechaEntrega.length === 1 ? '1 venta' : `${ventasSinFechaEntrega.length} ventas`} porque quedó fuera del nuevo rango — asígnale${ventasSinFechaEntrega.length === 1 ? '' : 'n'} una fecha nueva.`
      : '';
    res.json({ success: true, message: `Ruta actualizada exitosamente.${aviso}`, data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al actualizar ruta' });
  }
};

exports.updateEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!estado) {
      return res.status(400).json({ success: false, message: 'El campo "estado" es requerido' });
    }
    const ruta = await rutaService.updateEstado(id, estado);
    res.json({ success: true, message: `Estado actualizado a "${ruta.estado}"`, data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error al actualizar estado',
      details: error.details,
      errorCode: error.errorCode,
    });
  }
};

exports.toggleHabilitado = async (req, res) => {
  try {
    const { id } = req.params;
    const ruta = await rutaService.toggleHabilitado(id);
    res.json({ success: true, message: `Ruta ${ruta.habilitado ? 'habilitada' : 'inhabilitada'} exitosamente`, data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al cambiar estado de la ruta' });
  }
};
exports.getAniosDisponibles = async (req, res, next) => {
  try {
    const anios = await rutaService.getAniosDisponibles();
    res.json({ success: true, data: anios });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const result = await rutaService.getPageOf(id, { limit });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// Query params: idVehiculos/idConductores como listas separadas por coma (ej.
// "1,2,3"), idRutaExcluir opcional (para editar sin chocar contra la propia ruta).
const parseIdsCsv = (value) =>
  (value || '')
    .split(',')
    .map((v) => parseInt(v.trim()))
    .filter((v) => !isNaN(v));

exports.getDisponibilidad = async (req, res, next) => {
  try {
    const idVehiculos = parseIdsCsv(req.query.idVehiculos);
    const idConductores = parseIdsCsv(req.query.idConductores);
    const idRutaExcluir = req.query.idRutaExcluir ? parseInt(req.query.idRutaExcluir) : undefined;
    const data = await rutaService.getDisponibilidad({ idVehiculos, idConductores, idRutaExcluir });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
