const { Ruta, SalidaProgramada, Destino, sequelize } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');

// CRUD de la plantilla reutilizable de corredor (origen->destino). Sin fecha, hora,
// estado ni convoy -- eso vive en SalidaProgramada, una fila por cada viaje
// concreto y reservable de esta ruta (ver salidaProgramadaService.js, que absorbió
// TODA la lógica de negocio de la máquina de estados que antes vivía acá). Ver
// LOGICA.md, "Ruta -> plantilla + SalidaProgramada -> agenda" (Fase 3 del split).

// "Solo lo mío" de Rutas para operador_sede -- el split (Fase 3-4) se llevó esta
// lógica entera de acá a salidaProgramadaService.buildSedeCondition (que filtra
// Salidas), pero el listado de Rutas se quedó sin equivalente propio: toda sede veía
// las 13 rutas del sistema (bug real, 2026-09-17). Reutiliza el MISMO criterio que ya
// funciona bien en Salidas, un nivel más arriba (Ruta en vez de SalidaProgramada): una
// sede ve (a) su propia ruta de ida (la que termina en su municipio) y (b) la ruta
// compartida "Medellín" SOLO si ya tiene al menos un regreso ahí (ver
// salidaProgramadaService.crearRegresoDesdeSede -- todo regreso, de cualquier sede,
// cuelga de esa misma plantilla). Nunca hace falta mover el regreso a su propia ruta:
// con esto una sede sin operación simplemente no ve esa fila todavía.
const buildRutaSedeCondition = (idSede) => sequelize.literal(
  `("Ruta"."id_ruta" IN (
    SELECT id_ruta FROM ruta WHERE id_destino = ${parseInt(idSede)}
    UNION
    SELECT r.id_ruta FROM ruta r
    JOIN salida_programada s ON s.id_ruta = r.id_ruta
    WHERE s.id_salida_ida IN (
      SELECT s2.id_salida FROM salida_programada s2
      JOIN ruta r2 ON r2.id_ruta = s2.id_ruta
      WHERE r2.id_destino = ${parseInt(idSede)}
    )
  ))`
);

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['idRuta', 'habilitado'];
  const parts = sortBy.split('.');
  const field = parts[0];
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // "municipio" no es columna propia de Ruta: se ordena por el destino asociado
  // (ver columna "Ruta" de la tabla en el frontend, que en realidad filtra por
  // destino ya que el origen siempre es Medellín).
  if (field === 'municipio') {
    return [[{ model: Destino, as: 'destino' }, 'municipio', direction], ['idRuta', direction]];
  }
  const resolvedField = allowed.includes(field) ? field : 'idRuta';
  // Desempate por id: sin esto, filas con el mismo valor en "field" pueden salir en
  // distinto orden relativo según el LIMIT de cada consulta.
  if (resolvedField === 'idRuta') return [[resolvedField, direction]];
  return [[resolvedField, direction], ['idRuta', direction]];
};

// 2026-09-17: la plantilla compartida "Medellín" (destino Medellín, reutilizada por
// TODOS los regresos del sistema, ver crearRegresoDesdeSede) nunca se muestra como
// fila propia en el listado -- confunde, agrupa de golpe los regresos de todas las
// sedes. En su lugar, el listado ofrece un filtro `tipo`:
//   - 'ida' (default): las rutas reales de siempre, sin la plantilla compartida.
//   - 'regreso': esas MISMAS rutas reales, pero solo las que ya tienen al menos un
//     regreso registrado (join contra la plantilla compartida por dentro) -- el
//     frontend las pinta con la etiqueta invertida (ej. "Caucasia → Medellín").
// Ninguno de los dos casos mueve datos: el regreso sigue viviendo bajo la plantilla
// compartida, esto es puramente cómo se presenta.
const getAll = async ({ habilitado, q, idDestino, page = 1, limit = 10, sortBy, rol, idSede, tipo } = {}) => {
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
  if (rol === 'operador_sede') {
    where.idRuta = buildRutaSedeCondition(idSede);
  } else {
    where['$destino.municipio$'] = { [Op.ne]: 'Medellín' };
    if (tipo === 'regreso') {
      where.idRuta = sequelize.literal(
        `EXISTS (SELECT 1 FROM salida_programada s WHERE s.id_salida_ida IN (SELECT id_salida FROM salida_programada WHERE id_ruta = "Ruta"."id_ruta"))`
      );
    }
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

  // Una plantilla por corredor: se crea una sola vez y se reutiliza indefinidamente
  // (ver RUTAS-SALIDAS.md) — no importa si la que ya existe está inhabilitada, ahí
  // lo que corresponde es rehabilitarla, no crear una segunda hacia el mismo destino.
  const existente = await Ruta.findOne({ where: { idDestino } });
  if (existente) {
    throw new AppError('Ya existe una ruta registrada hacia ese destino', 400);
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

  if (idDestino !== undefined && parseInt(idDestino) !== ruta.idDestino) {
    const destino = await Destino.findByPk(idDestino);
    if (!destino) {
      throw new AppError('Destino no encontrado', 404);
    }
    const existente = await Ruta.findOne({ where: { idDestino, idRuta: { [Op.ne]: id } } });
    if (existente) {
      throw new AppError('Ya existe una ruta registrada hacia ese destino', 400);
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
