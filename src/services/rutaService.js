const { Ruta, RutaVehiculoConductor, RutaParada, Vehiculo, Conductor, Destino, EncomiendaVenta, Destinatario, Usuario, AnticipoExcedente, Paquete, sequelize } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasRuta } = require('../middlewares/validateDependencies');
const { tieneLicenciaVigente } = require('../utils/licenciaHelper');
const { esDomingo, getRangoHorario, horaDentroDeRango, MIN_DIAS_SALIDA_LLEGADA, DIAS_MARGEN_ENTRE_RUTAS, MAX_DIAS_ANTICIPACION } = require('../utils/horarioLaboral');
const { determinarEstadoEncomienda, paqueteLiberaRuta, resumenSedes } = require('./paqueteStateUtils');

// "Sedes de una ruta" = TODOS los municipios estructurales del recorrido (paradas
// + destino final). Devuelve { total, completadas } — una sede está completada
// cuando no le queda ningún paquete "Por entregar" (una parada sin carga cuenta
// como completada de entrada). Ver LOGICA.md, "Entrega en dos fases".
//
// Consultas planas a propósito: un include con `attributes: []` sobre
// EncomiendaVenta le quita la PK a Sequelize y deja de hidratar la asociación
// (bug que hacía que esto devolviera { total: 0 } y la ruta nunca se
// auto-completara). Sin includes anidados no hay ese riesgo.
const calcularSedesRuta = async (idRuta) => {
  const ruta = await Ruta.findByPk(idRuta, { attributes: ['idRuta', 'idDestino'] });
  if (!ruta) return { total: 0, completadas: 0 };

  const paradas = await RutaParada.findAll({ where: { idRuta }, attributes: ['idDestino'] });
  const sedesRuta = [...new Set([...paradas.map((p) => p.idDestino), ruta.idDestino])];
  if (sedesRuta.length === 0) return { total: 0, completadas: 0 };

  const pares = await RutaVehiculoConductor.findAll({
    where: { idRuta, habilitado: true },
    attributes: ['idRutaVehiculoConductor'],
  });
  const parIds = pares.map((p) => p.idRutaVehiculoConductor);

  // Municipios que todavía tienen al menos un paquete "Por entregar" (de una venta
  // activa) — esas sedes NO están completadas.
  let sedesConPendiente = [];
  if (parIds.length > 0) {
    const pendientes = await Paquete.findAll({
      where: { idRutaVehiculoConductor: { [Op.in]: parIds }, estado: 'Por entregar' },
      attributes: ['idEncomiendaVenta'],
    });
    const ventaIds = [...new Set(pendientes.map((p) => p.idEncomiendaVenta))];
    if (ventaIds.length > 0) {
      const ventasActivas = await EncomiendaVenta.findAll({
        where: { idEncomiendaVenta: { [Op.in]: ventaIds }, habilitado: true, estado: { [Op.ne]: 'Cancelada' } },
        attributes: ['idEncomiendaVenta'],
      });
      const activaSet = new Set(ventasActivas.map((v) => v.idEncomiendaVenta));
      const dests = await Destinatario.findAll({
        where: { idEncomiendaVenta: { [Op.in]: ventaIds } },
        attributes: ['idEncomiendaVenta', 'idDestino'],
      });
      sedesConPendiente = dests
        .filter((d) => activaSet.has(d.idEncomiendaVenta))
        .map((d) => d.idDestino);
    }
  }

  return resumenSedes(sedesRuta, sedesConPendiente);
};

// Best-effort: pasa la ruta a "Completada" automáticamente en cuanto no falta
// nada por entregar — todas las sedes con paquetes están completadas. El
// anticipo YA NO es requisito (2026-09-07): la ruta y el anticipo son
// independientes salvo por un solo sentido — la ruta dispara que el anticipo
// pase a "En Legalización" al arrancar — nunca al revés. Si el conductor no ha
// legalizado, el anticipo se queda "En Legalización" tal cual (updateEstado no
// lo toca, ver la rama `Completada`) y lo legaliza después desde el móvil sin
// que la ruta ya esté Completada le importe (anticipoService.update no depende
// del estado de la ruta). Si updateEstado rechaza por otra razón (condición de
// carrera, etc.), se deja la ruta "En Ruta" y NO se propaga el error: el admin
// siempre puede completarla a mano. La llaman
// encomiendaService.dejarPaquetesEnSede y encomiendaService.actualizarEstadoPaquete
// (los dos caminos por los que un paquete puede salir de "Por entregar").
const intentarAutoCompletar = async (idRuta) => {
  try {
    const ruta = await Ruta.findByPk(idRuta, { attributes: ['idRuta', 'estado'] });
    if (!ruta || ruta.estado !== 'En Ruta') return { completada: false, motivo: 'estado' };

    const { total, completadas } = await calcularSedesRuta(idRuta);
    if (total === 0 || completadas < total) return { completada: false, motivo: 'sedes' };

    await updateEstado(idRuta, 'Completada');
    return { completada: true };
  } catch (error) {
    console.error(`Auto-completar ruta #${idRuta} no procedió: ${error.message}`);
    return { completada: false, motivo: 'error' };
  }
};

// Máximo de pares vehículo+conductor por ruta — igual que MAX_PAQUETES en Ventas,
// un tope razonable para no dejar el array crecer sin límite en el formulario.
const MAX_PARES_RUTA = 10;

const INCLUDE_PARES = {
  model: RutaVehiculoConductor,
  as: 'paresVehiculoConductor',
  where: { habilitado: true },
  required: false,
  include: [
    { model: Vehiculo, as: 'vehiculo' },
    { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
  ],
};

const INCLUDE_PARADAS = {
  model: RutaParada,
  as: 'paradas',
  required: false,
  separate: true,
  order: [['orden', 'ASC']],
  include: [{ model: Destino, as: 'destino' }],
};

// Datos livianos del viaje enlazado (ida o regreso) — solo lo necesario para
// mostrar un chip clickeable, sin anidar de nuevo sus propios pares/paradas (eso
// se consulta abriendo esa otra ruta).
const INCLUDE_REGRESO_IDA = {
  model: Ruta, as: 'rutaIda', required: false,
  attributes: ['idRuta', 'origen', 'estado'],
  include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }],
};
const INCLUDE_REGRESO_VUELTA = {
  model: Ruta, as: 'rutaRegreso', required: false,
  attributes: ['idRuta', 'origen', 'estado'],
  include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }],
};

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaSalida', 'estado', 'idRuta', 'habilitado', 'origen'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaSalida';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" (ej. mismo estado)
  // pueden salir en distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idRuta') return [[field, direction]];
  return [[field, direction], ['idRuta', direction]];
};

// Pseudo-estado SOLO para el filtro del listado (NO es un valor real de
// `ruta.estado`): ruta de IDA ya "Completada", todavía SIN viaje de regreso
// enlazado, cuyo convoy sigue "fuera de base" (algún vehículo o conductor con
// `id_destino_actual`). Sirve para que el admin ubique rápido los conductores/
// vehículos varados que hay que traer de vuelta a la base. Ver LOGICA.md,
// "Rutas — filtro 'Regreso pendiente'".
const ESTADO_REGRESO_PENDIENTE = 'Regreso pendiente';

// Otro pseudo-filtro, no un estado real: toda ruta que ES un viaje de regreso
// (idRutaIda != null) -- mismo criterio que ya pinta el chip "Viaje de regreso" en
// el listado (useRutaColumns.jsx). Se agrega junto a "Regreso pendiente" en el
// selector de Estado para poder ubicarlas directamente sin tener que reconocerlas
// fila por fila.
const ESTADO_VIAJE_REGRESO = 'Viaje de regreso';

// Criterio "solo lo mío" de Rutas para operador_sede — DISTINTO del de
// Ventas/Clientes (que filtran por quién los registró): acá se filtra por qué
// rutas TOCAN geográficamente su municipio (como destino final o como parada),
// más los regresos enlazados a esas idas — así la sede siempre ve la ida que
// Medellín le trajo, aunque ella no la haya registrado. Nunca vacío para una
// sede con operación. Ver LOGICA.md, "Sedes remotas".
const buildSedeCondition = (idSede) => sequelize.literal(
  `("Ruta"."id_ruta" IN (
    SELECT r.id_ruta FROM ruta r
    WHERE r.id_destino = ${parseInt(idSede)}
       OR EXISTS (SELECT 1 FROM ruta_parada rp WHERE rp.id_ruta = r.id_ruta AND rp.id_destino = ${parseInt(idSede)})
       OR r.id_ruta_ida IN (
          SELECT r2.id_ruta FROM ruta r2
          WHERE r2.id_destino = ${parseInt(idSede)}
             OR EXISTS (SELECT 1 FROM ruta_parada rp2 WHERE rp2.id_ruta = r2.id_ruta AND rp2.id_destino = ${parseInt(idSede)})
       )
  ))`
);

const buildRutaWhere = ({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino, rol, idSede }) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estado && estado !== ESTADO_REGRESO_PENDIENTE && estado !== ESTADO_VIAJE_REGRESO) where.estado = estado;
  if (idDestino) where.idDestino = parseInt(idDestino);
  if (rol === 'operador_sede') where.idRuta = where.idRuta
    ? { [Op.and]: [where.idRuta, buildSedeCondition(idSede)] }
    : buildSedeCondition(idSede);

  // idVehiculo/idConductor ya no son columnas directas de "ruta" — se resuelven vía
  // subquery contra la tabla intermedia (usado por los links "highlight" desde las
  // páginas de Vehículo/Conductor).
  if (idConductor) {
    const condicion = { [Op.in]: sequelize.literal(
      `(SELECT id_ruta FROM ruta_vehiculo_conductor WHERE id_conductor = ${parseInt(idConductor)} AND habilitado = true)`
    ) };
    where.idRuta = where.idRuta ? { [Op.and]: [where.idRuta, condicion] } : condicion;
  }
  if (idVehiculo) {
    const condicion = { [Op.in]: sequelize.literal(
      `(SELECT id_ruta FROM ruta_vehiculo_conductor WHERE id_vehiculo = ${parseInt(idVehiculo)} AND habilitado = true)`
    ) };
    where.idRuta = where.idRuta ? { [Op.and]: [where.idRuta, condicion] } : condicion;
  }

  if (estado === ESTADO_REGRESO_PENDIENTE) {
    where.estado = 'Completada';
    where.idRutaIda = null; // una ruta de regreso no necesita su propio regreso
    const regresoPendienteCond = { [Op.and]: [
      // todavía no tiene un viaje de regreso enlazado
      { [Op.notIn]: sequelize.literal('(SELECT id_ruta_ida FROM ruta WHERE id_ruta_ida IS NOT NULL)') },
      // algún par del convoy sigue fuera de base
      { [Op.in]: sequelize.literal(
        '(SELECT rvc.id_ruta FROM ruta_vehiculo_conductor rvc ' +
        'LEFT JOIN conductor c ON c.id_conductor = rvc.id_conductor ' +
        'LEFT JOIN vehiculo v ON v.id_vehiculo = rvc.id_vehiculo ' +
        'WHERE rvc.habilitado = true AND (c.id_destino_actual IS NOT NULL OR v.id_destino_actual IS NOT NULL))'
      ) },
    ] };
    where.idRuta = where.idRuta ? { [Op.and]: [where.idRuta, regresoPendienteCond] } : regresoPendienteCond;
  }

  if (estado === ESTADO_VIAJE_REGRESO) where.idRutaIda = { [Op.ne]: null };

  if (anio) {
    // fecha_salida es tipo DATE en Postgres — LIKE no aplica sobre fechas, hay que
    // comparar por rango (>= inicio del período, < inicio del siguiente).
    const anioNum = parseInt(anio);
    const mesNum = mes ? parseInt(mes) : null;
    const mesInicio = mesNum || 1;
    const inicio = `${anioNum}-${String(mesInicio).padStart(2, '0')}-01`;
    const fin = mesNum
      ? (mesNum === 12 ? `${anioNum + 1}-01-01` : `${anioNum}-${String(mesNum + 1).padStart(2, '0')}-01`)
      : `${anioNum + 1}-01-01`;
    where.fechaSalida = { [Op.gte]: inicio, [Op.lt]: fin };
  }
  if (q) {
    const trimmed = q.trim();
    const escapado = sequelize.escape(`%${trimmed}%`);
    const conditions = [
      { origen: { [Op.iLike]: `%${trimmed}%` } },
      sequelize.literal(
        `EXISTS (SELECT 1 FROM ruta_vehiculo_conductor rvc JOIN vehiculo v ON v.id_vehiculo = rvc.id_vehiculo ` +
        `WHERE rvc.id_ruta = "Ruta"."id_ruta" AND rvc.habilitado = true AND v.placa ILIKE ${escapado})`
      ),
      sequelize.literal(
        `EXISTS (SELECT 1 FROM ruta_vehiculo_conductor rvc JOIN conductor c ON c.id_conductor = rvc.id_conductor ` +
        `JOIN usuario u ON u.id_usuario = c.id_usuario ` +
        `WHERE rvc.id_ruta = "Ruta"."id_ruta" AND rvc.habilitado = true ` +
        `AND (u.nombre ILIKE ${escapado} OR u.apellido ILIKE ${escapado}))`
      ),
    ];
    where[Op.or] = conditions;
  }
  return where;
};

const getAll = async ({ habilitado, estado, anio, mes, page = 1, limit = 10, sortBy, q, idConductor, idVehiculo, idDestino, rol, idSede } = {}) => {
  const where = buildRutaWhere({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino, rol, idSede });

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const include = [INCLUDE_PARES, INCLUDE_PARADAS, { model: Destino, as: 'destino' }, INCLUDE_REGRESO_IDA, INCLUDE_REGRESO_VUELTA];

  // OJO con subQuery:false acá: paresVehiculoConductor es hasMany (una ruta puede
  // tener varios vehículos, ver el convoy) — con subQuery:false, LIMIT se aplica sobre
  // las filas ya unidas (una por cada par), no sobre las rutas distintas. Una ruta con
  // 2+ vehículos "gastaba" cupos de más y la página devolvía menos rutas de las
  // pedidas (ej. limit=5 devolvía 4). Sin subQuery:false, Sequelize aplica LIMIT/OFFSET
  // en una subconsulta sobre "ruta" antes de unir los pares, así que siempre da
  // exactamente `limit` rutas distintas (o menos solo si de verdad no hay más).
  const { count, rows: data } = await Ruta.findAndCountAll({
    where,
    include,
    limit,
    offset,
    // Orden por defecto: más reciente REGISTRADA primero (idRuta DESC), igual que
    // todos los demás módulos — antes era fechaSalida DESC (fecha de viaje, no de
    // registro), así que una ruta recién creada con salida cercana no aparecía de
    // primera si ya existían rutas programadas más lejos en el futuro.
    order: order.length > 0 ? order : [['idRuta', 'DESC']],
    distinct: true,
  });

  const enCursoIds = data.filter(r => r.estado === 'En Ruta').map(r => r.idRuta);
  if (enCursoIds.length > 0) {
    // Si algún paquete de los pares de esta ruta sigue "Por entregar", el conductor
    // todavía no lo dejó en la sede y la ruta no se puede completar (ver la
    // validación PACKAGES_PENDING en updateEstado). "En sede de destino" ya NO
    // cuenta como pendiente: es trabajo del distribuidor, con la ruta ya cerrada.
    // (El anticipo NO tiene un indicador acá a propósito — desde 2026-09-07 la
    // ruta ya no depende de él para nada, ni para completarse manual ni
    // automáticamente. Ver "Completar la ruta ya NO exige el anticipo legalizado".)
    const pares = await RutaVehiculoConductor.findAll({
      where: { idRuta: { [Op.in]: enCursoIds }, habilitado: true },
      attributes: ['idRutaVehiculoConductor', 'idRuta'],
    });
    const rutaDelPar = new Map(pares.map(p => [p.idRutaVehiculoConductor, p.idRuta]));
    if (rutaDelPar.size > 0) {
      const pendientesPaquete = await Paquete.findAll({
        where: {
          idRutaVehiculoConductor: { [Op.in]: [...rutaDelPar.keys()] },
          estado: 'Por entregar',
        },
        attributes: ['idRutaVehiculoConductor'],
      });
      const rutasConPaquetesPendientes = new Set(pendientesPaquete.map(p => rutaDelPar.get(p.idRutaVehiculoConductor)));
      data.forEach(r => { r.dataValues.paquetesPendientes = rutasConPaquetesPendientes.has(r.idRuta); });
    }

    // Indicador "X de N sedes completadas" para las rutas En Ruta — el conductor
    // avanza por sede (parada o destino final), no por paquete. Al llegar a N/N la
    // ruta se auto-completa; ver intentarAutoCompletar.
    for (const r of data) {
      if (r.estado === 'En Ruta') {
        const { total, completadas } = await calcularSedesRuta(r.idRuta);
        r.dataValues.sedesTotales = total;
        r.dataValues.sedesCompletadas = completadas;
      }
    }
  }

  // pesoUsado: kg ya ocupados en CADA PAR vehículo+conductor (no en la ruta completa)
  // por ventas activas (no canceladas) — usado por el selector de vehículo en Ventas
  // para mostrar cuánta capacidad le queda a cada camión de la ruta.
  const parIds = data.flatMap(r => (r.paresVehiculoConductor || []).map(p => p.idRutaVehiculoConductor));
  if (parIds.length > 0) {
    const paquetesConPeso = await Paquete.findAll({
      where: { idRutaVehiculoConductor: { [Op.in]: parIds } },
      attributes: ['idRutaVehiculoConductor', 'peso'],
      include: [{ model: EncomiendaVenta, as: 'encomienda', attributes: [], required: true, where: { estado: { [Op.ne]: 'Cancelada' } } }],
    });
    const pesoPorPar = {};
    paquetesConPeso.forEach(p => {
      pesoPorPar[p.idRutaVehiculoConductor] = (pesoPorPar[p.idRutaVehiculoConductor] || 0) + parseFloat(p.peso || 0);
    });
    data.forEach(r => {
      (r.paresVehiculoConductor || []).forEach(par => {
        par.dataValues.pesoUsado = pesoPorPar[par.idRutaVehiculoConductor] || 0;
      });
    });
  }

  return { data, total: count };
};

const getById = async (id, { rol, idSede } = {}) => {
  const ruta = await Ruta.findByPk(id, {
    include: [INCLUDE_PARES, INCLUDE_PARADAS, { model: Destino, as: 'destino' }, INCLUDE_REGRESO_IDA, INCLUDE_REGRESO_VUELTA]
  });

  if (!ruta) {
    throw new AppError('Ruta no encontrada', 404);
  }

  // Mismo criterio geográfico de getAll ("toca mi municipio", más regresos
  // enlazados) — un operador_sede no debe poder consultar el detalle de una
  // ruta ajena a su sede adivinando el id. Ver LOGICA.md, "Sedes remotas".
  if (rol === 'operador_sede') {
    const visible = await Ruta.findOne({ where: { idRuta: id, [Op.and]: [buildSedeCondition(idSede)] }, attributes: ['idRuta'] });
    if (!visible) {
      throw new AppError('No tienes acceso a esta ruta', 403);
    }
  }

  return ruta;
};

const validarDocumentosVehiculo = (vehiculo) => {
  // "hoy" se calcula en hora Colombia explícitamente, sin importar en qué zona horaria
  // corre el servidor (Render corre en UTC) — si no, entre las 7pm y medianoche hora
  // Colombia el servidor ya "cree" que es el día siguiente y vence documentos varias
  // horas antes de tiempo. vencimientoSOAT/etc. ya son "YYYY-MM-DD" (DATEONLY), así que
  // comparar como string contra otro "YYYY-MM-DD" es exacto y evita además cualquier
  // lío de parseo de Date (mismo tipo de bug ya corregido en el frontend).
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const docs = [
    { campo: vehiculo.vencimientoSOAT,              nombre: 'SOAT' },
    { campo: vehiculo.vencimientoRevisionTecnica,   nombre: 'Revisión Técnico-Mecánica' },
    { campo: vehiculo.vencimientoSeguroTerceros,    nombre: 'Seguro de Terceros' },
  ];
  for (const { campo, nombre } of docs) {
    if (campo && String(campo) <= hoy) {
      throw new AppError(`El vehículo ${vehiculo.placa || ''} tiene el ${nombre} vencido y no puede ser asignado a una ruta`, 400);
    }
  }
};

// Suma el peso de los paquetes ya asignados a un par vehículo+conductor (excluyendo
// ventas Canceladas, igual que encomiendaService.getPesoUsadoEnPar) — usado para saber
// si un vehículo nuevo puede cargar con lo que ya estaba asignado al anterior.
const getPesoAsignadoEnPar = async (idRutaVehiculoConductor, transaction) => {
  const paquetes = await Paquete.findAll({
    where: { idRutaVehiculoConductor },
    include: [{ model: EncomiendaVenta, as: 'encomienda', where: { estado: { [Op.ne]: 'Cancelada' } }, attributes: [] }],
    attributes: ['peso'],
    transaction,
  });
  return paquetes.reduce((sum, p) => sum + parseFloat(p.peso || 0), 0);
};

// Choque de vehículo/conductor entre rutas distintas — cada ruta "ocupa" a su vehículo
// y conductor desde su fechaSalida hasta su fechaLlegadaEstimada, más DIAS_MARGEN_ENTRE_RUTAS
// de margen entre el final de una y el inicio de la otra (tiempo de descargar, revisar
// el vehículo y que el conductor descanse). El margen se exige UNA sola vez entre el
// final de una ruta y el inicio de la otra (no se "acolchona" cada ruta por separado).
// Ejemplo: Ruta A ocupa 20→22 de agosto, con margen de 1 día → una Ruta B puede salir
// el 23 de agosto sin chocar (22+1), pero no el 22 (mismo día que A llega, 0 días de
// margen).
// Rutas antiguas sin fechaLlegadaEstimada (antes de esta migración) se tratan como ocupación
// de un solo día, por seguridad.
const GAP_TRANSICION = DIAS_MARGEN_ENTRE_RUTAS;

const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

const validarChoqueVehiculoConductor = async ({ idVehiculo, idConductor, fechaSalida, fechaLlegadaEstimada, idRutaExcluir }) => {
  if (!fechaSalida) return;

  const llegadaCandidata = fechaLlegadaEstimada || fechaSalida;

  const pares = await RutaVehiculoConductor.findAll({
    where: {
      habilitado: true,
      [Op.or]: [{ idVehiculo }, { idConductor }],
      ...(idRutaExcluir ? { idRuta: { [Op.ne]: idRutaExcluir } } : {}),
    },
    include: [{
      model: Ruta,
      as: 'ruta',
      required: true,
      where: { habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
      include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }],
    }],
  });

  for (const p of pares) {
    const otraSalida = p.ruta.fechaSalida;
    const otraLlegada = p.ruta.fechaLlegadaEstimada || otraSalida;
    const rutaLabel = p.ruta.origen ? `${p.ruta.origen} → ${p.ruta.destino?.municipio || 'Sin destino'}` : `Ruta #${p.idRuta}`;
    // Margen entre el final de una ruta y el inicio de la otra — en cualquiera de los
    // dos sentidos (no importa cuál de las dos se programó primero). OJO: el margen se
    // exige UNA sola vez entre el final de una y el inicio de la otra, no dos veces
    // (no se "acolchona" cada ruta por separado y se compara el solape — eso exigiría
    // el doble del margen real). Ejemplo (el mismo que ya validó la usuaria): Ruta A
    // ocupa 3→5 de agosto → una Ruta B puede salir el 7 de agosto (5+2) sin chocar,
    // porque ya deja exactamente GAP_TRANSICION días entre el final de A y el inicio
    // de B.
    const chocaPorInicioB = fechaSalida < sumarDias(otraLlegada, GAP_TRANSICION);
    const chocaPorInicioOtra = otraSalida < sumarDias(llegadaCandidata, GAP_TRANSICION);
    const seSuperponen = chocaPorInicioB && chocaPorInicioOtra;
    if (seSuperponen) {
      throw new AppError(
        `Este vehículo o conductor ya tiene otra ruta (${rutaLabel}) programada del ${otraSalida} al ${otraLlegada}. Debes dejar al menos ${GAP_TRANSICION} días de margen antes o después de ese rango.`,
        409,
        [{
          tipo: 'Choque de vehículo/conductor',
          id: p.idRuta,
          descripcion: `La ruta ${rutaLabel} ya tiene este vehículo/conductor asignado, del ${otraSalida} al ${otraLlegada}`
        }],
        'SCHEDULE_CONFLICT'
      );
    }
  }
};

// Horario laboral de la empresa (ver src/utils/horarioLaboral.js): valida que la salida
// y la llegada de la ruta caigan en día/hora hábil, y que la llegada no sea anterior a
// la salida (MIN_DIAS_SALIDA_LLEGADA = 0 — un vehículo puede salir e ir y venir el
// mismo día, ej. rutas cortas). Concepto separado de validarChoqueVehiculoConductor
// (esa función es sobre choque de vehículo/conductor entre rutas distintas, esta es
// sobre el horario de UNA sola ruta) — no se mezclan.
const validarHorarioRuta = ({ fechaSalida, horaSalida, fechaLlegadaEstimada, horaLlegadaEstimada, exigirFechaSalidaFutura = false }) => {
  // "Hoy" en hora Colombia — mismo patrón que validarDocumentosVehiculo, para que el
  // límite no dependa de en qué zona horaria corre el servidor (Render corre en UTC).
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  // Mismo tope (MAX_DIAS_ANTICIPACION) para ambas fechas — no se reduce el de salida
  // para "dejar espacio" al mínimo de llegada: si alguien elige una salida tan pegada
  // al tope que no queda ningún día de llegada válido, eso se rechaza más abajo con un
  // mensaje claro (el chequeo de "mínimo N días desde la salida" y el de "máximo
  // MAX_DIAS_ANTICIPACION días desde hoy" conviven — si chocan entre sí para una
  // combinación puntual, el usuario lo ve explicado, en vez de que el campo de salida
  // le reduzca el rango sin avisar por qué.
  const maxPermitido = sumarDias(hoy, MAX_DIAS_ANTICIPACION);

  // Piso: la salida puede ser hoy mismo (una ruta puede salir en la tarde aunque se
  // haya programado en la mañana — ej. reprogramar una ruta Cancelada para más tarde
  // el mismo día), nunca antes de hoy. `exigirFechaSalidaFutura` solo lo pide create()
  // (siempre una ruta nueva) y update() cuando la fechaSalida efectivamente CAMBIA de
  // valor — así una ruta Cancelada con fecha ya vencida se puede seguir editando en
  // otros campos (conductor, observaciones) sin que esto la bloquee, mientras nadie
  // intente dejarle o ponerle una fecha de salida en el pasado.
  if (exigirFechaSalidaFutura && fechaSalida && fechaSalida < hoy) {
    throw new AppError(`La fecha de salida no puede ser anterior a hoy (mínimo el ${hoy})`, 400);
  }

  if (fechaSalida && esDomingo(fechaSalida)) {
    throw new AppError('No se puede programar una salida en domingo (la empresa permanece cerrada)', 400);
  }
  if (fechaSalida && fechaSalida > maxPermitido) {
    throw new AppError(`La fecha de salida no puede ser más de ${MAX_DIAS_ANTICIPACION} días a partir de hoy (máximo el ${maxPermitido})`, 400);
  }
  if (fechaSalida && horaSalida && !horaDentroDeRango(fechaSalida, horaSalida)) {
    const r = getRangoHorario(fechaSalida);
    throw new AppError(`La hora de salida debe estar entre las ${r.min} y las ${r.max}`, 400);
  }
  if (fechaLlegadaEstimada) {
    if (esDomingo(fechaLlegadaEstimada)) {
      throw new AppError('No se puede programar una llegada en domingo (la empresa permanece cerrada)', 400);
    }
    if (fechaLlegadaEstimada > maxPermitido) {
      throw new AppError(`La fecha de llegada no puede ser más de ${MAX_DIAS_ANTICIPACION} días a partir de hoy (máximo el ${maxPermitido})`, 400);
    }
    if (fechaSalida) {
      const minima = sumarDias(fechaSalida, MIN_DIAS_SALIDA_LLEGADA);
      if (fechaLlegadaEstimada < minima) {
        const mensaje = MIN_DIAS_SALIDA_LLEGADA > 0
          ? `La fecha de llegada debe ser al menos ${MIN_DIAS_SALIDA_LLEGADA} día(s) después de la salida (mínimo el ${minima})`
          : `La fecha de llegada no puede ser anterior a la fecha de salida (mínimo el ${minima})`;
        throw new AppError(mensaje, 400);
      }
    }
    if (horaLlegadaEstimada && !horaDentroDeRango(fechaLlegadaEstimada, horaLlegadaEstimada)) {
      const r = getRangoHorario(fechaLlegadaEstimada);
      throw new AppError(`La hora estimada de llegada debe estar entre las ${r.min} y las ${r.max}`, 400);
    }
  }
};

const validarPares = (pares) => {
  if (!Array.isArray(pares) || pares.length === 0) {
    throw new AppError('Debes asignar al menos un vehículo con su conductor', 400);
  }
  if (pares.length > MAX_PARES_RUTA) {
    throw new AppError(`No puedes asignar más de ${MAX_PARES_RUTA} vehículos a una misma ruta`, 400);
  }
  const vehiculosIds = pares.map(p => p.idVehiculo);
  const conductoresIds = pares.map(p => p.idConductor);
  if (new Set(vehiculosIds).size !== vehiculosIds.length) {
    throw new AppError('No puedes asignar el mismo vehículo dos veces en la misma ruta', 400);
  }
  if (new Set(conductoresIds).size !== conductoresIds.length) {
    throw new AppError('No puedes asignar el mismo conductor dos veces en la misma ruta', 400);
  }
};

// Paradas intermedias del corredor — opcionales (una ruta puede seguir sin ninguna,
// como hasta ahora). Si vienen, cada una necesita un destino válido y no se puede
// repetir el mismo municipio dos veces en la misma ruta (ver índice único
// uq_parada_ruta_destino en init.sql). Hubo una validación de orden geográfico
// (`destino.corredor`/`ordenCorredor`, un valor cargado a mano por destino) pero se
// quitó — daba falsos positivos en rutas reales porque un valor manual de "posición
// aproximada" no capta la geometría real de la carretera (ej. Medellín → Caucasia con
// paradas Zaragoza y El Bagre se rechazaba aunque el mapa real confirma ese orden). Se
// deja en manos del admin, que sí ve el camino real. Queda pendiente resolverlo bien
// con coordenadas/mapa (ver PENDIENTES_MAPA_RUTAS.md).
// El "orden" que manda el cliente se ignora: se numera según la posición del array,
// así el frontend no tiene que llevar la cuenta ni dejar huecos al reordenar/quitar
// una parada.
const validarParadas = async (paradas, transaction) => {
  if (paradas === undefined) return null;
  if (!Array.isArray(paradas)) {
    throw new AppError('Las paradas deben ser una lista', 400);
  }
  if (paradas.length > 20) {
    throw new AppError('No puedes agregar más de 20 paradas a una misma ruta', 400);
  }
  const idsDestino = paradas.map((p) => parseInt(p.idDestino));
  if (idsDestino.some((id) => !id || isNaN(id))) {
    throw new AppError('Cada parada necesita un destino válido', 400);
  }
  if (new Set(idsDestino).size !== idsDestino.length) {
    throw new AppError('No puedes repetir el mismo municipio dos veces como parada de la misma ruta', 400);
  }
  if (idsDestino.length === 0) return [];

  for (const idDestino of idsDestino) {
    const destino = await Destino.findByPk(idDestino, { transaction });
    if (!destino) throw new AppError(`Destino #${idDestino} no encontrado`, 404);
  }

  return paradas.map((p, i) => ({
    idDestino: parseInt(p.idDestino),
    orden: i + 1,
  }));
};

// Si se manda idRutaIda, valida que sea una ruta real de la que ESTA sea el
// regreso: debe existir, estar habilitada, ya "Completada" (el viaje de ida ya
// terminó) y no tener ya otro regreso enlazado (uq_ruta_ida en init.sql es el
// respaldo a nivel de BD; esto da un mensaje claro antes de llegar ahí).
const validarRutaIda = async (idRutaIda) => {
  if (!idRutaIda) return;
  const rutaIda = await Ruta.findByPk(idRutaIda);
  if (!rutaIda || !rutaIda.habilitado) throw new AppError('La ruta de ida no existe o está inhabilitada', 404);
  if (rutaIda.estado !== 'Completada') {
    throw new AppError('Solo se puede programar el regreso de una ruta que ya esté "Completada"', 400);
  }
  const yaTieneRegreso = await Ruta.findOne({ where: { idRutaIda } });
  if (yaTieneRegreso) {
    throw new AppError('Esa ruta ya tiene un viaje de regreso programado', 409);
  }
};

// El origen de una ruta no lo elige el usuario (el campo va bloqueado en el
// wizard): una ruta normal siempre sale de "Medellín" (la oficina principal); un
// viaje de regreso (idRutaIda) sale del municipio de destino de la ida — el
// conductor está físicamente allá. Ver LOGICA.md, "Rutas — origen y fuera de base".
const resolverOrigenRuta = async (idRutaIda, transaction) => {
  if (!idRutaIda) return 'Medellín';
  const rutaIda = await Ruta.findByPk(idRutaIda, {
    // Incluir la PK (idDestino) además de municipio — sin la PK, Sequelize no
    // asocia la fila del include con la ruta y `rutaIda.destino` vuelve null.
    include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio'] }],
    transaction,
  });
  return rutaIda?.destino?.municipio || 'Medellín';
};

// El origen (Medellín en una ruta normal, o el destino de la ida en un regreso)
// no puede ser también el destino final ni una de las paradas — sería un tramo
// de longitud cero. El origen no lo elige el usuario, así que esto atrapa el
// caso en el que se selecciona como destino/parada el mismo municipio del que
// sale la ruta. `paradasIdDestino` solo se valida cuando llega un juego nuevo de
// paradas (en una edición que no las toca, se dejan como estaban).
const validarOrigenDistinto = async ({ idDestino, paradasIdDestino, idRutaIda, transaction }) => {
  const origen = await resolverOrigenRuta(idRutaIda, transaction);

  if (idDestino !== undefined && idDestino !== null) {
    const destino = await Destino.findByPk(idDestino, { attributes: ['idDestino', 'municipio'], transaction });
    if (destino && destino.municipio === origen) {
      throw new AppError(`El destino de la ruta no puede ser ${origen}: es el municipio de origen.`, 400, null, 'DESTINO_IGUAL_ORIGEN');
    }
  }

  const ids = (paradasIdDestino || []).filter((v) => v !== null && v !== undefined);
  if (ids.length > 0) {
    const paradas = await Destino.findAll({ where: { idDestino: { [Op.in]: ids } }, attributes: ['idDestino', 'municipio'], transaction });
    if (paradas.some((p) => p.municipio === origen)) {
      throw new AppError(`Una parada no puede ser ${origen}: es el municipio de origen de la ruta.`, 400, null, 'PARADA_IGUAL_ORIGEN');
    }
  }
};

// "Fuera de base": un conductor/vehículo que quedó en otro municipio tras
// completar o cancelar una ruta que no volvió a Medellín (conductor.idDestinoActual
// / vehiculo.idDestinoActual != null) no se puede asignar a una ruta NUEVA desde
// Medellín hasta que se le programe el regreso. Para un REGRESO es al revés: solo
// se pueden asignar los que quedaron justo en el destino de la ida.
const validarUbicacionParaRuta = async ({ pares, idRutaIda }) => {
  const idsVehiculo = pares.map((p) => parseInt(p.idVehiculo));
  const idsConductor = pares.map((p) => parseInt(p.idConductor));

  const vehiculos = await Vehiculo.findAll({
    where: { idVehiculo: { [Op.in]: idsVehiculo } },
    attributes: ['idVehiculo', 'placa', 'idDestinoActual'],
    include: [{ model: Destino, as: 'destinoActual', attributes: ['idDestino', 'municipio'] }],
  });
  const conductores = await Conductor.findAll({
    where: { idConductor: { [Op.in]: idsConductor } },
    attributes: ['idConductor', 'idDestinoActual'],
    include: [
      { model: Usuario, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellido'] },
      { model: Destino, as: 'destinoActual', attributes: ['idDestino', 'municipio'] },
    ],
  });

  let idaIdDestino = null;
  if (idRutaIda) {
    const rutaIda = await Ruta.findByPk(idRutaIda, { attributes: ['idDestino'] });
    idaIdDestino = rutaIda?.idDestino ?? null;
  }

  const vehFuera = [];
  const condFuera = [];

  for (const v of vehiculos) {
    if (idRutaIda) {
      if (v.idDestinoActual !== idaIdDestino) {
        vehFuera.push({ tipo: 'Vehículo', id: v.idVehiculo, descripcion: `El vehículo ${v.placa} no está en el municipio desde el que sale el regreso${v.destinoActual ? ` (quedó en ${v.destinoActual.municipio})` : ' (está en base)'}` });
      }
    } else if (v.idDestinoActual) {
      vehFuera.push({ tipo: 'Vehículo', id: v.idVehiculo, descripcion: `El vehículo ${v.placa} quedó en ${v.destinoActual?.municipio || 'otro municipio'}: necesita un viaje de regreso antes de una ruta nueva desde Medellín` });
    }
  }
  for (const c of conductores) {
    const nom = c.usuario ? `${c.usuario.nombre} ${c.usuario.apellido}` : `Conductor #${c.idConductor}`;
    if (idRutaIda) {
      if (c.idDestinoActual !== idaIdDestino) {
        condFuera.push({ tipo: 'Conductor', id: c.idConductor, descripcion: `${nom} no está en el municipio desde el que sale el regreso${c.destinoActual ? ` (quedó en ${c.destinoActual.municipio})` : ' (está en base)'}` });
      }
    } else if (c.idDestinoActual) {
      condFuera.push({ tipo: 'Conductor', id: c.idConductor, descripcion: `${nom} quedó en ${c.destinoActual?.municipio || 'otro municipio'}: necesita un viaje de regreso antes de una ruta nueva desde Medellín` });
    }
  }

  if (vehFuera.length > 0) {
    throw new AppError(
      idRutaIda ? 'Uno o más vehículos no están en el municipio desde el que sale el regreso' : 'Uno o más vehículos quedaron fuera de base y necesitan un viaje de regreso',
      409, vehFuera, 'VEHICULO_FUERA_DE_BASE'
    );
  }
  if (condFuera.length > 0) {
    throw new AppError(
      idRutaIda ? 'Uno o más conductores no están en el municipio desde el que sale el regreso' : 'Uno o más conductores quedaron fuera de base y necesitan un viaje de regreso',
      409, condFuera, 'CONDUCTOR_FUERA_DE_BASE'
    );
  }
};

const create = async (data) => {
  const { idDestino, origen, fechaSalida, horaSalida, horaLlegadaEstimada, fechaLlegadaEstimada, estado, observaciones, pares, paradas, idRutaIda } = data;

  validarHorarioRuta({ fechaSalida, horaSalida, fechaLlegadaEstimada, horaLlegadaEstimada, exigirFechaSalidaFutura: true });
  validarPares(pares);
  await validarRutaIda(idRutaIda);
  await validarUbicacionParaRuta({ pares, idRutaIda });

  const destino = await Destino.findByPk(idDestino);
  if (!destino) throw new AppError('Destino no encontrado', 404);

  for (const par of pares) {
    const vehiculo = await Vehiculo.findByPk(par.idVehiculo);
    if (!vehiculo) throw new AppError('Vehículo no encontrado', 404);
    validarDocumentosVehiculo(vehiculo);

    const conductor = await Conductor.findByPk(par.idConductor);
    if (!conductor) throw new AppError('Conductor no encontrado', 404);
    if (!tieneLicenciaVigente(conductor.categoriasLicencia)) {
      throw new AppError('El conductor tiene la licencia de conducción vencida y no puede ser asignado a una ruta', 400);
    }

    await validarChoqueVehiculoConductor({ idVehiculo: par.idVehiculo, idConductor: par.idConductor, fechaSalida, fechaLlegadaEstimada });
  }

  const paradasNormalizadas = await validarParadas(paradas);

  // Una parada es un municipio ANTES de llegar, no el mismo lugar de llegada —
  // igual criterio que validarOrigenDistinto de abajo, pero contra el destino
  // final en vez del origen.
  if ((paradasNormalizadas || []).some((p) => p.idDestino === parseInt(idDestino))) {
    throw new AppError('Una parada no puede ser el mismo destino final de la ruta', 400, null, 'PARADA_IGUAL_DESTINO');
  }

  await validarOrigenDistinto({
    idDestino,
    paradasIdDestino: (paradasNormalizadas || []).map((p) => p.idDestino),
    idRutaIda,
  });

  const transaction = await sequelize.transaction();
  let idRutaCreada;
  try {
    const ruta = await Ruta.create({
      origen: await resolverOrigenRuta(idRutaIda, transaction),
      idDestino,
      idRutaIda: idRutaIda || null,
      fechaSalida: fechaSalida || null,
      fechaLlegadaEstimada: fechaLlegadaEstimada || null,
      horaSalida: horaSalida || null,
      horaLlegadaEstimada: horaLlegadaEstimada || null,
      estado: estado || 'Programada',
      observaciones: observaciones || null
    }, { transaction });
    idRutaCreada = ruta.idRuta;

    await RutaVehiculoConductor.bulkCreate(
      pares.map(p => ({ idRuta: ruta.idRuta, idVehiculo: p.idVehiculo, idConductor: p.idConductor })),
      { transaction }
    );

    if (paradasNormalizadas && paradasNormalizadas.length > 0) {
      await RutaParada.bulkCreate(
        paradasNormalizadas.map(p => ({ idRuta: ruta.idRuta, idDestino: p.idDestino, orden: p.orden })),
        { transaction }
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return getById(idRutaCreada);
};

// WS4 "Sedes remotas" — el operador_sede dispara el regreso de su sede con una
// sola acción (solo pide fecha/hora de salida): arma acá el resto de los datos
// (mismo convoy, paradas invertidas — igual patrón que
// ListarRutaProgramacion.handleProgramarRegreso en el wizard del admin) y
// delega en create() para el resto (resolverOrigenRuta, validarUbicacionParaRuta,
// transacción...). Ver LOGICA.md, "Sedes remotas".
const crearRegresoDesdeSede = async (idRutaIda, { fechaSalida, horaSalida } = {}, { idSede } = {}) => {
  if (!fechaSalida || !horaSalida) {
    throw new AppError('La fecha y la hora de salida del regreso son obligatorias', 400);
  }

  const ida = await Ruta.findByPk(idRutaIda, { include: [INCLUDE_PARES, INCLUDE_PARADAS] });
  if (!ida || !ida.habilitado) {
    throw new AppError('La ruta no existe o está inhabilitada', 404);
  }
  if (ida.estado !== 'Completada') {
    throw new AppError('Solo se puede programar el regreso de una ruta que ya esté "Completada"', 400);
  }
  const yaTieneRegreso = await Ruta.findOne({ where: { idRutaIda } });
  if (yaTieneRegreso) {
    throw new AppError('Esa ruta ya tiene un viaje de regreso programado', 409);
  }
  // La ida debe tocar geográficamente la sede de quien dispara el regreso —
  // mismo criterio "solo lo mío" de Rutas (destino final o parada, ver
  // buildSedeCondition). En la práctica solo la sede que es el destino final
  // puede tener el convoy "fuera de base" ahí (validarUbicacionParaRuta, más
  // abajo, es la validación autoritativa) — esto solo da un mensaje más claro.
  const tocaLaSede = ida.idDestino === idSede || (ida.paradas || []).some((p) => p.idDestino === idSede);
  if (!tocaLaSede) {
    throw new AppError('Esa ruta no llega a tu sede', 403);
  }

  const medellin = await Destino.findOne({ where: { municipio: 'Medellín', habilitado: true } });
  if (!medellin) {
    throw new AppError('No se encontró el destino "Medellín" en el catálogo', 500);
  }

  const pares = (ida.paresVehiculoConductor || []).map((p) => ({ idVehiculo: p.idVehiculo, idConductor: p.idConductor }));
  const paradas = [...(ida.paradas || [])].sort((a, b) => b.orden - a.orden).map((p) => ({ idDestino: p.idDestino }));

  return create({
    idDestino: medellin.idDestino,
    idRutaIda,
    fechaSalida,
    horaSalida,
    pares,
    paradas,
  });
};

const update = async (id, data) => {
  const { origen, idDestino, fechaSalida, horaSalida, horaLlegadaEstimada, fechaLlegadaEstimada, estado, observaciones, habilitado, pares, paradas } = data;

  const ruta = await Ruta.findByPk(id);
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  // Edición general solo permitida en Programada (nada comprometido aún) o
  // Cancelada (se puede reprogramar libremente). "En Ruta"/"Completada" ya
  // tienen guías/anticipos/estados en cascada que dependen de estos datos —
  // cambiarlos por fuera de updateEstado corrompería esa cadena.
  if (!['Programada', 'Cancelada'].includes(ruta.estado)) {
    throw new AppError(`No se puede editar una ruta en estado "${ruta.estado}". Solo se puede editar cuando está Programada o Cancelada.`, 400);
  }

  if (idDestino !== undefined) {
    const destinoNuevo = await Destino.findByPk(idDestino);
    if (!destinoNuevo) throw new AppError('Destino no encontrado', 404);
  }

  // Si se manda un juego de pares nuevo, revalidar "fuera de base" con el mismo
  // criterio que create (una ruta Cancelada que se reprograma también pasa por acá).
  if (Array.isArray(pares) && pares.length > 0) {
    await validarUbicacionParaRuta({ pares, idRutaIda: ruta.idRutaIda });
  }

  // undefined = el campo no vino en el body -> conservar el valor actual.
  // '' / null = vino vacío (ej. `horaLlegadaEstimada` es opcional y el form lo
  // manda como "") -> guardar NULL. Sin esto, Postgres reventaba con
  // "invalid input syntax for type time: ''" al editar una ruta con hora de
  // llegada en blanco (create ya normalizaba con `|| null`, update no).
  const conservarOLimpiar = (valor, actual) => {
    if (valor === undefined) return actual;
    if (valor === '' || valor === null) return null;
    return valor;
  };
  const nuevaFechaSalida = conservarOLimpiar(fechaSalida, ruta.fechaSalida);
  const nuevaHoraSalida = conservarOLimpiar(horaSalida, ruta.horaSalida);
  const nuevaFechaLlegadaEstimada = conservarOLimpiar(fechaLlegadaEstimada, ruta.fechaLlegadaEstimada);
  const nuevaHoraLlegadaEstimada = conservarOLimpiar(horaLlegadaEstimada, ruta.horaLlegadaEstimada);
  // El nombre se quedó de cuando solo existía fechaSalida — hoy dispara la revalidación
  // de choque (validarChoqueVehiculoConductor) ante cualquier cambio que afecte el rango
  // ocupado por la ruta, incluida la nueva fechaLlegadaEstimada.
  const fechaHoraCambio = fechaSalida !== undefined || horaSalida !== undefined
    || fechaLlegadaEstimada !== undefined || horaLlegadaEstimada !== undefined;

  // Reprogramar solo = editarle la fecha/hora a una ruta Cancelada — nadie entra a
  // tocarle la fecha/hora a una ruta Cancelada más que para volver a ponerla en curso
  // (decisión de la usuaria, ver LOGICA.md). Si esta edición cambia la fechaSalida u
  // horaSalida (TIME de Postgres viene con segundos, ".slice(0,5)" normaliza antes de
  // comparar) y el resultado ya no está vencido, se reactiva sola en vez de obligar a
  // un segundo paso manual por el menú de estado. Si el caller manda `estado` explícito
  // (ej. alguien cancelándola de nuevo en la misma edición), ese manda siempre.
  const normHora = (h) => (h ? h.slice(0, 5) : h);
  const salidaCambio = nuevaFechaSalida !== ruta.fechaSalida || normHora(nuevaHoraSalida) !== normHora(ruta.horaSalida);
  const reactivarAutomaticamente = estado === undefined && ruta.estado === 'Cancelada' && salidaCambio
    && motivoSalidaVencida({ fechaSalida: nuevaFechaSalida, horaSalida: nuevaHoraSalida }) === null;

  validarHorarioRuta({
    fechaSalida: nuevaFechaSalida, horaSalida: nuevaHoraSalida,
    fechaLlegadaEstimada: nuevaFechaLlegadaEstimada, horaLlegadaEstimada: nuevaHoraLlegadaEstimada,
    // Solo exige salida futura si la fechaSalida efectivamente CAMBIA de valor — el
    // form del frontend reenvía el objeto completo en cada edición, así que comparar
    // contra el valor ya guardado (no solo si el campo vino en el body) es lo que
    // distingue "la estoy corrigiendo" de "no la toqué". Sin esto, no se podría editar
    // ningún otro campo de una ruta Cancelada cuya fecha ya quedó en el pasado.
    exigirFechaSalidaFutura: nuevaFechaSalida !== ruta.fechaSalida,
  });

  // Si se mueve la fecha de salida y/o llegada, la fechaEstimadaEntrega que ya tenía
  // prometida cada venta de esta ruta deja de tener sentido — ya sea porque quedó por
  // debajo del nuevo mínimo permitido (llegada, o salida+1 si la ruta no tiene llegada
  // — mismo criterio que validarFechaEntrega en encomiendaService.js), o porque sigue
  // siendo técnicamente válida pero ya no refleja la fecha real de la ruta (ej. la
  // ruta se adelantó y la venta se quedó prometiendo una entrega más tardía de lo que
  // ahora hace falta). Bloquear la edición no sirve aquí: exigiría corregir esas
  // ventas ANTES de saber a qué fechas se va a mover la ruta, un problema circular
  // (ver discusión con la usuaria). En vez de eso, se deja mover la ruta libremente y
  // se SINCRONIZA la fechaEstimadaEntrega de todas las ventas activas de esta ruta a
  // la nueva fecha mínima (decisión explícita de la usuaria: se prefiere perder un
  // ajuste manual con margen extra que hubiera puesto alguien, a dejar fechas
  // desactualizadas silenciosamente). Se excluyen las ventas Canceladas (no prometen
  // nada real); el resto (incluidas las "huérfanas" de una ruta que se canceló y se
  // está reprogramando, ver updateEstado) si siguen atadas a esta ruta, se sincronizan
  // igual — esto de paso resuelve el caso que antes dejaba el campo en null.
  let ventasSincronizadas = [];
  let minimaEntregaNueva = null;
  if (fechaHoraCambio) {
    minimaEntregaNueva = nuevaFechaLlegadaEstimada || sumarDias(nuevaFechaSalida, 1);
    ventasSincronizadas = await EncomiendaVenta.findAll({
      where: {
        idRuta: id,
        habilitado: true,
        estado: { [Op.ne]: 'Cancelada' },
      },
      attributes: ['idEncomiendaVenta'],
    });
  }

  if (pares !== undefined) validarPares(pares);
  const paradasNormalizadas = await validarParadas(paradas);
  // idDestino efectivo: el que llega, o el que ya tenía la ruta.
  const idDestinoEfectivo = idDestino !== undefined ? parseInt(idDestino) : ruta.idDestino;

  // Una parada es un municipio ANTES de llegar, no el mismo lugar de llegada —
  // solo se revisa si llega un juego nuevo de paradas (paradasNormalizadas !==
  // null); si la edición no las toca, se dejan como estaban.
  if (paradasNormalizadas && paradasNormalizadas.some((p) => p.idDestino === idDestinoEfectivo)) {
    throw new AppError('Una parada no puede ser el mismo destino final de la ruta', 400, null, 'PARADA_IGUAL_DESTINO');
  }

  await validarOrigenDistinto({
    idDestino: idDestinoEfectivo,
    // Solo se revisan las paradas si llega un juego nuevo (paradasNormalizadas
    // !== null); si la edición no las toca, se dejan como estaban.
    paradasIdDestino: paradasNormalizadas ? paradasNormalizadas.map((p) => p.idDestino) : [],
    idRutaIda: ruta.idRutaIda,
  });

  const transaction = await sequelize.transaction();
  try {
    if (pares !== undefined) {
      const paresActuales = await RutaVehiculoConductor.findAll({ where: { idRuta: id, habilitado: true }, transaction });
      const paresActualesPorId = new Map(paresActuales.map(p => [p.idRutaVehiculoConductor, p]));
      const idsConservados = new Set();

      for (const par of pares) {
        const parActual = par.idRutaVehiculoConductor ? paresActualesPorId.get(par.idRutaVehiculoConductor) : null;
        const esNuevo = !parActual;
        const cambioVehiculo = esNuevo || parActual.idVehiculo !== par.idVehiculo;
        const cambioConductor = esNuevo || parActual.idConductor !== par.idConductor;

        if (cambioVehiculo) {
          const vehiculo = await Vehiculo.findByPk(par.idVehiculo, { transaction });
          if (!vehiculo) throw new AppError('Vehículo no encontrado', 404);
          validarDocumentosVehiculo(vehiculo);

          // Si se está cambiando el vehículo de un par que YA tiene paquetes asignados
          // (ej. por documentos vencidos), el vehículo nuevo debe poder cargar con lo
          // que ya estaba asignado al anterior — si no, quedaría sobrecargado sin que
          // nada lo avise (la capacidad hoy solo se valida al crear/editar una Venta,
          // nunca al cambiar el vehículo de un par ya existente).
          if (!esNuevo && vehiculo.capacidad) {
            const pesoAsignado = await getPesoAsignadoEnPar(parActual.idRutaVehiculoConductor, transaction);
            const capacidad = parseFloat(vehiculo.capacidad);
            if (pesoAsignado > capacidad) {
              throw new AppError(
                `El vehículo ${vehiculo.placa || ''} tiene capacidad para ${capacidad} kg, pero este par ya tiene ${pesoAsignado.toFixed(2)} kg en paquetes asignados. Elige un vehículo con más capacidad.`,
                400
              );
            }
          }
        }
        if (cambioConductor) {
          const conductor = await Conductor.findByPk(par.idConductor, { transaction });
          if (!conductor) throw new AppError('Conductor no encontrado', 404);
          if (!tieneLicenciaVigente(conductor.categoriasLicencia)) {
            throw new AppError('El conductor tiene la licencia de conducción vencida y no puede ser asignado a una ruta', 400);
          }
        }
        if (esNuevo || cambioVehiculo || cambioConductor || fechaHoraCambio) {
          await validarChoqueVehiculoConductor({
            idVehiculo: par.idVehiculo, idConductor: par.idConductor,
            fechaSalida: nuevaFechaSalida, fechaLlegadaEstimada: nuevaFechaLlegadaEstimada, idRutaExcluir: parseInt(id),
          });
        }

        if (esNuevo) {
          const nuevo = await RutaVehiculoConductor.create(
            { idRuta: id, idVehiculo: par.idVehiculo, idConductor: par.idConductor },
            { transaction }
          );
          idsConservados.add(nuevo.idRutaVehiculoConductor);
        } else {
          idsConservados.add(parActual.idRutaVehiculoConductor);
          if (cambioVehiculo || cambioConductor) {
            await parActual.update({ idVehiculo: par.idVehiculo, idConductor: par.idConductor }, { transaction });
          }
        }
      }

      const paresAQuitar = paresActuales.filter(p => !idsConservados.has(p.idRutaVehiculoConductor));
      for (const par of paresAQuitar) {
        const tienePaquetes = await Paquete.count({ where: { idRutaVehiculoConductor: par.idRutaVehiculoConductor }, transaction });
        if (tienePaquetes > 0) {
          throw new AppError('No puedes quitar un vehículo de la ruta si ya tiene paquetes asignados en esta ruta.', 400);
        }
        await par.update({ habilitado: false }, { transaction });
      }
    } else if (fechaHoraCambio) {
      // No vino un array de pares nuevo, pero sí cambió la fecha/hora de salida —
      // revalidar el choque contra los pares que ya tenía la ruta.
      const paresActuales = await RutaVehiculoConductor.findAll({ where: { idRuta: id, habilitado: true }, transaction });
      for (const par of paresActuales) {
        await validarChoqueVehiculoConductor({
          idVehiculo: par.idVehiculo, idConductor: par.idConductor,
          fechaSalida: nuevaFechaSalida, fechaLlegadaEstimada: nuevaFechaLlegadaEstimada, idRutaExcluir: parseInt(id),
        });
      }
    }

    // Paradas: conjunto completo, se reemplaza igual que "pares" — a diferencia de
    // los pares, ninguna parada tiene todavía paquetes que dependan de ella (esa
    // trazabilidad sigue viviendo en RutaVehiculoConductor), así que no hace falta
    // soft-delete: se borran las que había y se crean las nuevas.
    if (paradasNormalizadas !== null) {
      await RutaParada.destroy({ where: { idRuta: id }, transaction });
      if (paradasNormalizadas.length > 0) {
        await RutaParada.bulkCreate(
          paradasNormalizadas.map(p => ({ idRuta: parseInt(id), idDestino: p.idDestino, orden: p.orden })),
          { transaction }
        );
      }
    }

    await ruta.update({
      // El origen no se edita: normal -> "Medellín"; regreso -> destino de la ida.
      origen:                await resolverOrigenRuta(ruta.idRutaIda, transaction),
      idDestino:             idDestino             !== undefined ? idDestino             : ruta.idDestino,
      fechaSalida:           nuevaFechaSalida,
      fechaLlegadaEstimada:          nuevaFechaLlegadaEstimada,
      horaSalida:            nuevaHoraSalida,
      horaLlegadaEstimada:   nuevaHoraLlegadaEstimada,
      estado:                estado !== undefined ? estado : (reactivarAutomaticamente ? 'Programada' : ruta.estado),
      observaciones:         observaciones         !== undefined ? observaciones         : ruta.observaciones,
      habilitado:            habilitado            !== undefined ? habilitado            : ruta.habilitado
    }, { transaction });

    if (ventasSincronizadas.length > 0) {
      await EncomiendaVenta.update(
        { fechaEstimadaEntrega: minimaEntregaNueva },
        { where: { idEncomiendaVenta: { [Op.in]: ventasSincronizadas.map(v => v.idEncomiendaVenta) } }, transaction }
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return { ruta: await getById(id), ventasSincronizadas, reactivada: reactivarAutomaticamente };
};

// Mismo cálculo que yaDebioSalir() en jobs/autoIniciarRutas.js (offset fijo -05:00
// para Colombia) — se duplica acá en vez de importarlo porque ese archivo ya importa
// rutaService, y hacerlo al revés crearía una dependencia circular. Devuelve el
// motivo ('fecha'/'hora'/null) para armar un mensaje más útil: "hora" solo aplica
// cuando la fecha sigue siendo hoy pero la hora de salida ya pasó.
const motivoSalidaVencida = (ruta) => {
  if (!ruta.fechaSalida || !ruta.horaSalida) return 'fecha';
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (ruta.fechaSalida < hoy) return 'fecha';
  if (ruta.fechaSalida > hoy) return null;
  const salida = new Date(`${ruta.fechaSalida}T${ruta.horaSalida}-05:00`);
  return (isNaN(salida.getTime()) || salida <= new Date()) ? 'hora' : null;
};

const updateEstado = async (id, estado) => {
  const estadosValidos = ['Programada', 'En Ruta', 'Completada', 'Cancelada'];
  if (!estadosValidos.includes(estado)) {
    throw new AppError(`Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`, 400);
  }

  const ruta = await Ruta.findByPk(id, { include: [INCLUDE_PARES] });
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  if (ruta.estado === 'Completada') {
    throw new AppError('No se puede cambiar el estado de una ruta completada', 400);
  }

  if (estado === 'Programada' && ruta.estado === 'En Ruta') {
    throw new AppError('No se puede revertir el estado de una ruta en curso a Programada', 400);
  }

  // Solo llega acá el caso Cancelada -> Programada (En Ruta -> Programada ya se
  // bloqueó arriba). Si la fecha/hora de salida que la ruta ya tenía guardada quedó
  // en el pasado, dejarla pasar a "Programada" así abre una ventana de carrera real:
  // el job de auto-inicio (jobs/autoIniciarRutas.js) revisa cada minuto y la agarraría
  // de inmediato, pasándola a "En Ruta" con la fecha vieja antes de que alguien
  // alcance a editarla con una fecha nueva. Se obliga a corregir la fecha PRIMERO
  // (edición permitida en Cancelada, ver update() más abajo) y solo después cambiar
  // el estado.
  if (estado === 'Programada') {
    const motivo = motivoSalidaVencida(ruta);
    if (motivo === 'fecha') {
      throw new AppError('La fecha de salida de esta ruta ya pasó. Edítala con una fecha futura antes de volver a ponerla en Programada.', 400);
    }
    if (motivo === 'hora') {
      throw new AppError('La hora de salida de esta ruta ya pasó (sigue siendo hoy). Edítala con una hora futura antes de volver a ponerla en Programada.', 400);
    }
  }

  if (estado === 'Cancelada' && ruta.estado === 'Programada') {
    throw new AppError('No se puede cancelar una ruta que aún no ha iniciado. Edítala o inhabilítala en su lugar.', 400);
  }

  const pares = ruta.paresVehiculoConductor || [];

  if (estado === 'En Ruta') {
    for (const par of pares) {
      const conflictoVehiculo = await RutaVehiculoConductor.findOne({
        where: { idVehiculo: par.idVehiculo, habilitado: true, idRuta: { [Op.ne]: id } },
        include: [{ model: Ruta, as: 'ruta', required: true, where: { habilitado: true, estado: 'En Ruta' }, include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }],
      });
      if (conflictoVehiculo) {
        const rutaLabel = conflictoVehiculo.ruta.origen ? `${conflictoVehiculo.ruta.origen} → ${conflictoVehiculo.ruta.destino?.municipio || 'Sin destino'}` : `Ruta #${conflictoVehiculo.idRuta}`;
        // Mismo criterio de redacción en los 3 lugares que reportan este conflicto
        // (acá, el pre-chequeo del frontend en useEstadoRuta.js, y el descripcion
        // de abajo) — "está en curso con la ruta X", no "ya está asignado a la
        // ruta X que se encuentra En Ruta" (daba a entender que el problema era la
        // asignación en sí, no que ya está ocupado). Ver LOGICA.md.
        throw new AppError(
          `El vehículo ${par.vehiculo?.placa || ''} está en curso con la ruta ${rutaLabel}`,
          409,
          [{
            tipo: 'Conflicto de vehículo',
            id: conflictoVehiculo.idRuta,
            descripcion: `${par.vehiculo?.placa || 'Vehículo'} está en curso con la ruta ${rutaLabel}`
          }],
          'VEHICLE_IN_USE'
        );
      }

      const conflictoConductor = await RutaVehiculoConductor.findOne({
        where: { idConductor: par.idConductor, habilitado: true, idRuta: { [Op.ne]: id } },
        include: [{ model: Ruta, as: 'ruta', required: true, where: { habilitado: true, estado: 'En Ruta' }, include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }],
      });
      if (conflictoConductor) {
        const u = par.conductor?.usuario;
        const rutaLabel = conflictoConductor.ruta.origen ? `${conflictoConductor.ruta.origen} → ${conflictoConductor.ruta.destino?.municipio || 'Sin destino'}` : `Ruta #${conflictoConductor.idRuta}`;
        throw new AppError(
          `El conductor ${u ? `${u.nombre} ${u.apellido}` : ''} está en curso con la ruta ${rutaLabel}`,
          409,
          [{
            tipo: 'Conflicto de conductor',
            id: conflictoConductor.idRuta,
            descripcion: `${u ? `${u.nombre} ${u.apellido}` : 'El conductor'} está en curso con la ruta ${rutaLabel}`
          }],
          'CONDUCTOR_IN_USE'
        );
      }

      // Revalidación de documentos/licencia justo al iniciar — antes solo se
      // validaba al crear/asignar el par, nunca al pasar a "En Ruta". Si un
      // documento vence mientras la ruta seguía Programada, esto lo atrapa aquí,
      // en el momento exacto en que realmente importa.
      if (par.vehiculo) validarDocumentosVehiculo(par.vehiculo);
      if (par.conductor && !tieneLicenciaVigente(par.conductor.categoriasLicencia)) {
        const u = par.conductor.usuario;
        throw new AppError(
          `El conductor ${u ? `${u.nombre} ${u.apellido}` : ''} tiene la licencia de conducción vencida y no puede iniciar la ruta`,
          400
        );
      }
    }

    const encomiendaCount = await EncomiendaVenta.count({
      where: { idRuta: parseInt(id), habilitado: true }
    });
    // Un viaje de regreso (idRutaIda) puede arrancar vacío — el camión igual tiene
    // que volver a base, y hoy no hay forma de cargarlo (ver "cargar el regreso"
    // en LOGICA.md). Para el resto de rutas, ningún tramo puede ir vacío:
    if (encomiendaCount === 0 && !ruta.idRutaIda) {
      throw new AppError('No se puede iniciar la ruta sin encomiendas asignadas. Registra al menos una encomienda antes de poner la ruta En Ruta.', 400);
    }

    if (!ruta.idRutaIda) {
      // (a) Ninguna sede del recorrido (parada o destino final) puede quedar sin
      //     carga — si no, sería una "parada basura" y un tramo vacío.
      const paradasRuta = await RutaParada.findAll({ where: { idRuta: parseInt(id) }, attributes: ['idDestino'] });
      const sedesRuta = [...new Set([...paradasRuta.map((p) => p.idDestino), ruta.idDestino])];
      const destsConCarga = await Destinatario.findAll({
        attributes: ['idDestino'],
        include: [{
          model: EncomiendaVenta, as: 'encomienda', required: true, attributes: ['idEncomiendaVenta'],
          where: { idRuta: parseInt(id), habilitado: true, estado: { [Op.ne]: 'Cancelada' } },
        }],
      });
      const conCarga = new Set(destsConCarga.map((d) => d.idDestino));
      const sedesVacias = sedesRuta.filter((s) => !conCarga.has(s));
      if (sedesVacias.length > 0) {
        const nombres = await Destino.findAll({ where: { idDestino: { [Op.in]: sedesVacias } }, attributes: ['idDestino', 'municipio'] });
        throw new AppError(
          'Cada parada y el destino final deben tener al menos una encomienda asignada antes de poner la ruta En Ruta.',
          409,
          nombres.map((n) => ({ tipo: 'sede', id: n.idDestino, descripcion: `${n.municipio}: sin paquetes en esta ruta` })),
          'SEDE_SIN_CARGA'
        );
      }

      // (b) Ningún vehículo del convoy puede salir vacío.
      const paresVacios = [];
      for (const par of pares) {
        const n = await Paquete.count({ where: { idRutaVehiculoConductor: par.idRutaVehiculoConductor } });
        if (n === 0) paresVacios.push(par);
      }
      if (paresVacios.length > 0) {
        throw new AppError(
          'Todos los vehículos del convoy deben llevar al menos un paquete antes de poner la ruta En Ruta.',
          409,
          paresVacios.map((par) => ({ tipo: 'vehiculo', id: par.idVehiculo, descripcion: `${par.vehiculo?.placa || 'Vehículo'}: sin paquetes asignados` })),
          'VEHICULO_SIN_CARGA'
        );
      }
    }

    const ventasSinFecha = await EncomiendaVenta.findAll({
      where: { idRuta: parseInt(id), habilitado: true, estado: { [Op.ne]: 'Cancelada' }, fechaEstimadaEntrega: null },
      attributes: ['idEncomiendaVenta'],
      include: [{ model: Paquete, as: 'paquetes', attributes: ['numeroGuia'], required: false, limit: 1 }],
    });
    if (ventasSinFecha.length > 0) {
      throw new AppError(
        `Hay ${ventasSinFecha.length === 1 ? '1 venta' : ventasSinFecha.length + ' ventas'} sin fecha estimada de entrega. Asígnales una fecha antes de poner la ruta En Ruta.`,
        409,
        ventasSinFecha.map(v => ({
          tipo: 'venta',
          id: v.idEncomiendaVenta,
          guia: v.paquetes?.[0]?.numeroGuia || `#${v.idEncomiendaVenta}`,
          descripcion: `Guía ${v.paquetes?.[0]?.numeroGuia || '#' + v.idEncomiendaVenta} no tiene fecha estimada de entrega asignada`,
        })),
        'MISSING_DELIVERY_DATE'
      );
    }

    for (const par of pares) {
      // Al arrancar, la ubicación pasa a "en tránsito" (idDestinoActual = null).
      // dejarPaquetesEnSede la va rellenando sede por sede a medida que el
      // conductor descarga. Ver LOGICA.md "Entrega en dos fases".
      await Vehiculo.update({ estado: 'En Ruta', idDestinoActual: null }, { where: { idVehiculo: par.idVehiculo } });
      await Conductor.update({ estado: 'En Ruta', idDestinoActual: null }, { where: { idConductor: par.idConductor } });
    }
    await AnticipoExcedente.update(
      { estado: 'En Legalización' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'Entregado' } }
    );
    await EncomiendaVenta.update(
      { estado: 'En Ruta' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'Programada' } }
    );
  }

  // Ya NO bloquea completar la ruta si el anticipo sigue "En Legalización" (antes sí
  // lo hacía acá) — decisión de la usuaria: si el conductor se olvida de legalizar, la
  // ruta quedaba atascada "En Ruta" para siempre (ni vehículo/conductor se liberaban,
  // ni se podía programar el regreso), sin ninguna salida manual. El anticipo se queda
  // "En Legalización" tal cual, sin tocarlo — a propósito no se calcula un excedente
  // aquí como sí se hace al Cancelar (ver más abajo): asumir "gastó $0" tiene sentido
  // en una ruta cancelada (probablemente casi no se gastó nada), pero en una ruta que
  // sí se completó de verdad el conductor con certeza gastó algo — adivinar $0 ahí
  // sería casi con seguridad incorrecto. El conductor sigue pudiendo legalizarlo
  // después desde el móvil, sin importar que la ruta ya esté Completada (update() del
  // anticipo no depende del estado de la ruta). intentarAutoCompletar() SÍ sigue
  // esperando a que se legalice antes de auto-completar (tiene su propio chequeo
  // aparte, antes de llamar a esta función) — este cambio solo abre la puerta manual
  // para cuando el auto-completado nunca llega a pasar. Ver LOGICA.md.

  if ((estado === 'Completada' || estado === 'Cancelada') && ruta.estado === 'En Ruta') {
    for (const par of pares) {
      await Vehiculo.update({ estado: 'Disponible' }, { where: { idVehiculo: par.idVehiculo } });
      await Conductor.update({ estado: 'Disponible' }, { where: { idConductor: par.idConductor } });
    }
  }

  if (estado === 'Completada') {
    const ventasActivas = await EncomiendaVenta.findAll({
      where: { idRuta: ruta.idRuta, habilitado: true, estado: 'En Ruta' },
      include: [{ model: Paquete, as: 'paquetes' }],
    });

    // No se puede completar la ruta mientras a alguna venta le quede un paquete
    // "Por entregar": el conductor todavía no lo dejó en la sede. "En sede de
    // destino" sí deja completar — de ahí en adelante la entrega final la resuelve
    // el distribuidor y la venta se cierra sola en ese momento (no aquí).
    const ventasConPendientes = ventasActivas.filter((venta) =>
      (venta.paquetes || []).some((p) => !paqueteLiberaRuta(p.estado))
    );
    if (ventasConPendientes.length > 0) {
      throw new AppError(
        'Hay ventas con paquetes que el conductor todavía no ha dejado en la sede. Debe legalizar la entrega en sede de todos los paquetes antes de completar la ruta.',
        409,
        ventasConPendientes.map((venta) => ({
          tipo: 'venta',
          id: venta.idEncomiendaVenta,
          descripcion: `La venta con guía ${venta.paquetes?.[0]?.numeroGuia || 'sin guía'} tiene paquetes sin dejar en la sede`,
        })),
        'PACKAGES_PENDING'
      );
    }

    for (const venta of ventasActivas) {
      await venta.update({ estado: determinarEstadoEncomienda(venta.paquetes, venta.estado) });
    }

    // Al completar, el conductor y el vehículo quedaron físicamente en el destino
    // de la ruta — salvo que ESTA sea un viaje de regreso (idRutaIda), en cuyo caso
    // volvieron a la base y se limpia la marca. Más adelante (workstream 8) esto
    // bloquea asignarlos a una ruta nueva desde Medellín hasta programarles el
    // regreso. Ver LOGICA.md, "Entrega en dos fases — fuera de base".
    if (ruta.estado === 'En Ruta') {
      const idDestinoActual = ruta.idRutaIda ? null : ruta.idDestino;
      for (const par of pares) {
        await Vehiculo.update({ idDestinoActual }, { where: { idVehiculo: par.idVehiculo } });
        await Conductor.update({ idDestinoActual }, { where: { idConductor: par.idConductor } });
      }
    }
  }

  if (estado === 'Cancelada') {
    // Cancelación (a mitad de ruta o antes). Por venta:
    //  A) Venta SIN ningún paquete en sede (todos "Por entregar"): vuelve a
    //     "Programada" para reasignarla completa a otra ruta; sus paquetes vuelven
    //     a "Por entregar".
    //  B) Venta CON al menos un paquete ya en sede: NO se toca — sigue "En Ruta"
    //     y el distribuidor termina lo que llegó. Los paquetes que el conductor no
    //     alcanzó a dejar se quedan "Por entregar" (el admin debe reasignarlos a
    //     una ruta nueva). NO se marcan como "no entregados": esa marca es
    //     exclusiva del distribuidor de sede.
    const ventas = await EncomiendaVenta.findAll({
      where: { idRuta: ruta.idRuta, habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
      include: [{ model: Paquete, as: 'paquetes' }],
    });

    const idsVentasAReasignar = ventas
      .filter((venta) => !(venta.paquetes || []).some((p) => paqueteLiberaRuta(p.estado)))
      .map((venta) => venta.idEncomiendaVenta);

    if (idsVentasAReasignar.length > 0) {
      await EncomiendaVenta.update(
        { estado: 'Programada' },
        { where: { idEncomiendaVenta: { [Op.in]: idsVentasAReasignar } } }
      );
      await Paquete.update(
        { estado: 'Por entregar' },
        { where: { idEncomiendaVenta: { [Op.in]: idsVentasAReasignar } } }
      );
    }

    // Ubicación al cancelar: NO se fuerza nada. Si el conductor ya había dejado
    // carga en alguna sede, idDestinoActual ya trae ese municipio (lo puso
    // dejarPaquetesEnSede) y se respeta. Si no descargó nada, quedó en null ("en
    // tránsito / en base") — si el vehículo quedó tirado en el camino es un tema
    // operativo: el admin lo pone en "Mantenimiento" si se dañó y le arma la ruta
    // que corresponda cuando esté listo. Ver LOGICA.md.

    // El anticipo NO se toca (2026-09-07, mismo criterio que "Completada ya no
    // exige el anticipo legalizado" más arriba). Antes se calculaba acá el
    // excedente asumiendo "gastó $0" — tenía sentido para una cancelación
    // apenas arrancado el viaje, pero el candado SEDES_INCOMPLETAS de
    // anticipoService.update() bloquea legalizar (registrar valorGastado)
    // hasta dejar TODAS las sedes completas, así que un conductor que alcanzó
    // a dejar carga en 1 o 2 de 3 sedes antes de que la ruta se cancelara
    // NUNCA tuvo oportunidad de declarar lo que sí gastó (gasolina, peajes) —
    // asumir $0 ahí le cobraría de vuelta plata que ya usó, casi seguro
    // incorrecto. El anticipo se queda "Entregado"/"En Legalización" tal cual;
    // anticipoService.update() ahora deja legalizarlo igual aunque la ruta ya
    // esté "Cancelada" (se salta el candado de sedes en ese caso — ver ahí).
    // Mismo "pendiente de decidir" que Completada: si el conductor nunca
    // vuelve a abrir el móvil, este anticipo se queda sin cerrar (no hay vía
    // admin para legalizar en su nombre). Ver LOGICA.md.
  }

  ruta.estado = estado;
  await ruta.save();
  return getById(id);
};

const toggleHabilitado = async (id) => {
  const ruta = await Ruta.findByPk(id, {
    include: [INCLUDE_PARES, { model: Destino, as: 'destino' }],
  });
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  if (ruta.habilitado === true) {
    // Antes solo el frontend (ModalInhabilitarRuta.jsx) bloqueaba por ruta.estado
    // === 'En Ruta' — el backend nunca lo validaba, solo miraba encomiendas activas
    // vía verificarDependenciasRuta. Si todas las ventas de una ruta ya llegaban a
    // un estado final pero nadie la pasaba manualmente a "Completada", el backend
    // dejaba inhabilitarla igual, aunque vehículo/conductor siguieran marcados
    // ocupados por ella. Replicado acá para que el backend sea consistente con el
    // pre-chequeo del frontend, no solo un respaldo más laxo.
    if (ruta.estado === 'En Ruta') {
      throw new AppError(
        'No se puede inhabilitar esta ruta porque está en curso. Complétala o cancélala primero.',
        409,
        [{ tipo: 'Ruta activa', id: ruta.idRuta, descripcion: 'Esta ruta está "En Ruta" y no ha finalizado' }],
        'DEPENDENCY_CONFLICT'
      );
    }

    const { bloqueado, dependencias } = await verificarDependenciasRuta(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar esta ruta porque tiene encomiendas activas',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  // Al REHABILITAR (false -> true) una ruta que quedó `Programada` con la fecha/hora
  // ya vencida (pudo pasar mientras estuvo inhabilitada, sin que nadie la revisara —
  // el job de auto-inicio SÍ actúa sobre una Programada vencida, es justo su
  // disparador, no lo contrario), dejarla `habilitado:true` así la vuelve a exponer al
  // job (que filtra `habilitado:true`) y la agarraría de inmediato en su próximo tick.
  // Se cancela sola en vez de eso — mismo tratamiento que cualquier Programada vencida
  // — y queda editable: al corregirle la fecha, `update()` ya la reactiva sola cuando
  // vuelve a quedar válida (ver esa función). Nunca aplica al revés (Cancelada no le
  // importa al job, esté habilitada o no) ni al inhabilitar.
  const seCancelaPorFechaVencida = ruta.habilitado === false && ruta.estado === 'Programada'
    && motivoSalidaVencida(ruta) !== null;

  ruta.habilitado = !ruta.habilitado;
  if (seCancelaPorFechaVencida) ruta.estado = 'Cancelada';
  await ruta.save();
  return { ruta, seCancelaPorFechaVencida };
};

const getAniosDisponibles = async ({ rol, idSede } = {}) => {
  // Mismo criterio geográfico que buildSedeCondition ("toca mi municipio" +
  // regresos enlazados) — sin esto, el filtro "Año" de operador_sede mostraba
  // años de rutas que ni siquiera puede abrir. Ver LOGICA.md, "Sedes remotas".
  const condicionSede = rol === 'operador_sede'
    ? `WHERE (
        id_destino = ${parseInt(idSede)}
        OR EXISTS (SELECT 1 FROM ruta_parada rp WHERE rp.id_ruta = ruta.id_ruta AND rp.id_destino = ${parseInt(idSede)})
        OR id_ruta_ida IN (
          SELECT r2.id_ruta FROM ruta r2
          WHERE r2.id_destino = ${parseInt(idSede)}
             OR EXISTS (SELECT 1 FROM ruta_parada rp2 WHERE rp2.id_ruta = r2.id_ruta AND rp2.id_destino = ${parseInt(idSede)})
        )
      )`
    : '';
  const rows = await sequelize.query(
    `SELECT DISTINCT EXTRACT(YEAR FROM fecha_salida)::int AS anio FROM ruta ${condicionSede} ORDER BY anio DESC`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => r.anio);
};

const getPageOf = async (id, { limit = 10, rol, idSede } = {}) => {
  const record = await Ruta.findByPk(id, { attributes: ['idRuta'] });
  if (!record) throw new AppError('Ruta no encontrada', 404);
  const where = { idRuta: { [Op.gt]: parseInt(id) } };
  if (rol === 'operador_sede') {
    where[Op.and] = [buildSedeCondition(idSede)];
    const visible = await Ruta.findOne({ where: { idRuta: id, [Op.and]: [buildSedeCondition(idSede)] }, attributes: ['idRuta'] });
    if (!visible) throw new AppError('No tienes acceso a esta ruta', 403);
  }
  // Debe replicar exactamente el orden por defecto de getAll (idRuta DESC) — si no,
  // "ir a la página donde está" vuelve a apuntar a la página equivocada.
  const before = await Ruta.count({ where });
  const page = Math.floor(before / limit) + 1;
  const row = (before % limit) + 1;
  return { page, row };
};

// Devuelve, para la lista de vehículos/conductores dada, todas las rutas activas
// (Programada/En Ruta) que ya los tienen asignados — es la materia prima que usa el
// frontend para pintar el calendario de disponibilidad al registrar/editar una ruta
// (un día cae "ocupado" si está dentro del rango salida→llegada de alguna de estas
// rutas, con el margen de GAP_TRANSICION en cada punta; ver validarChoqueVehiculoConductor
// más arriba, misma regla, calculada en el cliente para poder mostrarla antes de que el
// usuario intente guardar). idRutaExcluir se usa al editar, para no chocar contra la
// propia ruta que se está editando.
const getDisponibilidad = async ({ idVehiculos = [], idConductores = [], idRutaExcluir } = {}) => {
  if (idVehiculos.length === 0 && idConductores.length === 0) return [];

  const or = [];
  if (idVehiculos.length) or.push({ idVehiculo: { [Op.in]: idVehiculos } });
  if (idConductores.length) or.push({ idConductor: { [Op.in]: idConductores } });

  const pares = await RutaVehiculoConductor.findAll({
    where: {
      habilitado: true,
      [Op.or]: or,
      ...(idRutaExcluir ? { idRuta: { [Op.ne]: idRutaExcluir } } : {}),
    },
    include: [
      {
        model: Ruta,
        as: 'ruta',
        required: true,
        where: { habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
        attributes: ['idRuta', 'origen', 'estado', 'fechaSalida', 'fechaLlegadaEstimada'],
        include: [{ model: Destino, as: 'destino', attributes: ['municipio', 'departamento'] }],
      },
      { model: Vehiculo, as: 'vehiculo', attributes: ['idVehiculo', 'placa'] },
      {
        model: Conductor,
        as: 'conductor',
        attributes: ['idConductor'],
        include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido'] }],
      },
    ],
  });

  return pares.map((p) => ({
    idRuta: p.ruta.idRuta,
    origen: p.ruta.origen,
    destino: p.ruta.destino ? { municipio: p.ruta.destino.municipio, departamento: p.ruta.destino.departamento } : null,
    estado: p.ruta.estado,
    fechaSalida: p.ruta.fechaSalida,
    fechaLlegadaEstimada: p.ruta.fechaLlegadaEstimada,
    idVehiculo: p.idVehiculo,
    placa: p.vehiculo?.placa || null,
    idConductor: p.idConductor,
    conductorNombre: p.conductor?.usuario ? `${p.conductor.usuario.nombre} ${p.conductor.usuario.apellido}` : null,
  }));
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  updateEstado,
  toggleHabilitado,
  getPageOf,
  getAniosDisponibles,
  getDisponibilidad,
  calcularSedesRuta,
  intentarAutoCompletar,
  crearRegresoDesdeSede,
};
