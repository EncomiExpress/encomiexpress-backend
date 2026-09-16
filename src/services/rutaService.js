const { Ruta, SalidaProgramada, Destino } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');

// CRUD de la plantilla reutilizable de corredor (origen->destino). Sin fecha, hora,
// estado, convoy ni paradas -- eso vive en SalidaProgramada, una fila por cada viaje
// concreto y reservable de esta ruta (ver salidaProgramadaService.js, que absorbió
// TODA la lógica de negocio de la máquina de estados que antes vivía acá). Ver
// LOGICA.md, "Ruta -> plantilla + SalidaProgramada -> agenda" (Fase 3 del split).

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['idRuta', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idRuta';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" pueden salir en
  // distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idRuta') return [[field, direction]];
  return [[field, direction], ['idRuta', direction]];
};

const getAll = async ({ habilitado, q, idDestino, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (idDestino) where.idDestino = parseInt(idDestino);
  // Sin nombre propio, la ruta se busca por su destino (el "Medellín ->" es fijo
  // para todas, buscarlo no aportaría nada) u observaciones.
  if (q) {
    const trimmed = q.trim();
    where[Op.or] = [
      { observaciones: { [Op.iLike]: `%${trimmed}%` } },
      { '$destino.municipio$': { [Op.iLike]: `%${trimmed}%` } },
    ];
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const { count, rows: data } = await Ruta.findAndCountAll({
    where,
    include: [{ model: Destino, as: 'destino' }],
    limit,
    offset,
    order: order.length > 0 ? order : [['idRuta', 'DESC']],
    distinct: true,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const ruta = await Ruta.findByPk(id, { include: [{ model: Destino, as: 'destino' }] });
  if (!ruta) {
    throw new AppError('Ruta no encontrada', 404);
  }
  return ruta;
};

const create = async (data) => {
  const { idDestino, observaciones } = data;

  if (!idDestino) {
    throw new AppError('El destino es obligatorio', 400);
  }
  const destino = await Destino.findByPk(idDestino);
  if (!destino) {
    throw new AppError('Destino no encontrado', 404);
  }

  const ruta = await Ruta.create({
    idDestino,
    observaciones: observaciones || null,
  });

  return getById(ruta.idRuta);
};

const update = async (id, data) => {
  const { idDestino, observaciones, habilitado } = data;

  const ruta = await Ruta.findByPk(id);
  if (!ruta) {
    throw new AppError('Ruta no encontrada', 404);
  }

  if (idDestino !== undefined) {
    const destino = await Destino.findByPk(idDestino);
    if (!destino) {
      throw new AppError('Destino no encontrado', 404);
    }
  }

  await ruta.update({
    idDestino: idDestino !== undefined ? idDestino : ruta.idDestino,
    observaciones: observaciones !== undefined ? observaciones : ruta.observaciones,
    habilitado: habilitado !== undefined ? habilitado : ruta.habilitado,
  });

  return getById(id);
};

// Deshabilitar una plantilla se bloquea si tiene alguna SalidaProgramada NO terminal
// (Programada/En Ruta) -- esas salidas siguen dependiendo de esta plantilla para su
// idDestino. Decisión de diseño (Fase 3, split ruta/salida): esto NO
// reutiliza middlewares/validateDependencies.verificarDependenciasRuta -- ese
// middleware ahora expone verificarDependenciasSalida (mismo propósito de siempre,
// pero mirando encomienda_venta.id_salida) para el toggle de UNA salida puntual, en
// salidaProgramadaService.toggleHabilitado. El chequeo de la plantilla es más simple
// (solo mira el estado de sus propias salidas, no hace falta bajar hasta las
// encomiendas) así que se dejó inline acá en vez de forzar una función de middleware
// genérica a conocer esta regla de negocio puntual.
const toggleHabilitado = async (id) => {
  const ruta = await Ruta.findByPk(id);
  if (!ruta) {
    throw new AppError('Ruta no encontrada', 404);
  }

  if (ruta.habilitado === true) {
    const salidasActivas = await SalidaProgramada.count({
      where: { idRuta: id, habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
    });
    if (salidasActivas > 0) {
      throw new AppError(
        'No se puede inhabilitar esta ruta porque tiene salidas programadas o en curso',
        409,
        [{ tipo: 'Salida activa', id: ruta.idRuta, descripcion: `Esta ruta tiene ${salidasActivas} salida(s) programada(s) o en curso` }],
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  ruta.habilitado = !ruta.habilitado;
  await ruta.save();
  return { ruta };
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado,
};
