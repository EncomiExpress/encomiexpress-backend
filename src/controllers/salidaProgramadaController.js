const salidaProgramadaService = require('../services/salidaProgramadaService');

// Contexto de sede del solicitante — solo tiene efecto para 'operador_sede' (ver
// LOGICA.md, "Sedes remotas"); para el resto de roles, idSede va undefined y los
// filtros/guardias del servicio no se activan.
const contextoSede = (req) => ({
  rol: req.usuario?.rol?.codigo,
  idSede: req.sede?.idDestino,
});

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
      idRuta: req.query.idRuta,
      regresoDeRuta: req.query.regresoDeRuta,
      page,
      limit,
      sortBy,
      ...contextoSede(req),
    };
    const result = await salidaProgramadaService.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const salida = await salidaProgramadaService.getById(id, contextoSede(req));
    res.json({ success: true, data: salida });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res) => {
  try {
    const salida = await salidaProgramadaService.create(req.body, contextoSede(req));
    res.status(201).json({ success: true, message: 'Ruta creada exitosamente', data: salida });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al crear ruta' });
  }
};

// Autorización dual (admin `actualizar_ruta` vs. operador_sede
// `programar_regreso_sede`), mismo patrón que updateEstado — operador_sede solo
// puede editar fecha/hora de su propio regreso, se revalida en el servicio.
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const permisos = req.usuario.rol?.permisos?.map((p) => p.nombre) || [];
    const esAdmin = permisos.includes('actualizar_ruta');
    const esOperadorSede = permisos.includes('programar_regreso_sede');
    if (!esAdmin && !esOperadorSede) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    const { ruta } = await salidaProgramadaService.update(id, req.body, esAdmin ? {} : { rol: 'operador_sede', idSede: req.sede?.idDestino });
    res.json({ success: true, message: 'Ruta actualizada exitosamente.', data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al actualizar ruta' });
  }
};

// Autorización dual, resuelta acá en vez de con un solo authorizePermission en la
// ruta (mismo patrón que paqueteController.registrarDevolucion):
//   - admin (permiso actualizar_ruta): cualquier salida, cualquier transición.
//   - operador_sede (permiso programar_regreso_sede): solo "poner en ruta"
//     (Programada -> En Ruta) el regreso de SU propia sede.
exports.updateEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!estado) {
      return res.status(400).json({ success: false, message: 'El campo "estado" es requerido' });
    }
    const permisos = req.usuario.rol?.permisos?.map((p) => p.nombre) || [];
    const esAdmin = permisos.includes('actualizar_ruta');
    const esOperadorSede = permisos.includes('programar_regreso_sede');
    if (!esAdmin && !esOperadorSede) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    const ruta = await salidaProgramadaService.updateEstado(id, estado, esAdmin ? {} : { rol: 'operador_sede', idSede: req.sede?.idDestino });
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

// Autorización dual (admin `inhabilitar_ruta` vs. operador_sede
// `programar_regreso_sede`), mismo patrón que update()/updateEstado.
exports.toggleHabilitado = async (req, res) => {
  try {
    const { id } = req.params;
    const permisos = req.usuario.rol?.permisos?.map((p) => p.nombre) || [];
    const esAdmin = permisos.includes('inhabilitar_ruta');
    const esOperadorSede = permisos.includes('programar_regreso_sede');
    if (!esAdmin && !esOperadorSede) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    const { ruta } = await salidaProgramadaService.toggleHabilitado(id, esAdmin ? {} : { rol: 'operador_sede', idSede: req.sede?.idDestino });
    res.json({ success: true, message: `Ruta ${ruta.habilitado ? 'habilitada' : 'inhabilitada'} exitosamente`, data: ruta });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al cambiar estado de la ruta' });
  }
};

exports.getAniosDisponibles = async (req, res, next) => {
  try {
    const anios = await salidaProgramadaService.getAniosDisponibles(contextoSede(req));
    res.json({ success: true, data: anios });
  } catch (error) {
    next(error);
  }
};

// WS4 "Sedes remotas" — el operador_sede dispara el regreso de su sede con una sola
// acción (fecha/hora de salida + fecha/hora estimada de llegada).
exports.crearRegresoDesdeSede = async (req, res, next) => {
  try {
    const { idSalidaIda } = req.params;
    const { fechaSalida, horaSalida, fechaLlegadaEstimada, horaLlegadaEstimada } = req.body;
    const regreso = await salidaProgramadaService.crearRegresoDesdeSede(idSalidaIda, { fechaSalida, horaSalida, fechaLlegadaEstimada, horaLlegadaEstimada }, contextoSede(req));
    res.status(201).json({ success: true, message: 'Regreso programado exitosamente', data: regreso });
  } catch (error) {
    next(error);
  }
};

exports.getPageOf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const idRuta = req.query.idRuta ? parseInt(req.query.idRuta) : undefined;
    const regresoDeRuta = req.query.regresoDeRuta ? parseInt(req.query.regresoDeRuta) : undefined;
    const result = await salidaProgramadaService.getPageOf(id, { limit, idRuta, regresoDeRuta, ...contextoSede(req) });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// Query params: idVehiculos/idConductores como listas separadas por coma (ej.
// "1,2,3"), idSalidaExcluir opcional (para editar sin chocar contra la propia salida).
const parseIdsCsv = (value) =>
  (value || '')
    .split(',')
    .map((v) => parseInt(v.trim()))
    .filter((v) => !isNaN(v));

exports.getDisponibilidad = async (req, res, next) => {
  try {
    const idVehiculos = parseIdsCsv(req.query.idVehiculos);
    const idConductores = parseIdsCsv(req.query.idConductores);
    const idSalidaExcluir = req.query.idSalidaExcluir ? parseInt(req.query.idSalidaExcluir) : undefined;
    const data = await salidaProgramadaService.getDisponibilidad({ idVehiculos, idConductores, idSalidaExcluir });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
