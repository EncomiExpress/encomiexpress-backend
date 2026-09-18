const {
  SalidaProgramada, SalidaVehiculoConductor, Ruta, Vehiculo, Conductor,
  Destino, EncomiendaVenta, Destinatario, Usuario, UsuarioSede, Rol, AnticipoExcedente,
  Paquete, Cliente, sequelize
} = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasSalida } = require('../middlewares/validateDependencies');
const { tieneLicenciaVigente } = require('../utils/licenciaHelper');
const { esDomingo, getRangoSalida, horaSalidaValida, MIN_DIAS_SALIDA_LLEGADA, DIAS_MARGEN_ENTRE_RUTAS, MAX_DIAS_ANTICIPACION } = require('../utils/horarioLaboral');
const { determinarEstadoEncomienda, determinarEstadoPago, paqueteLiberaRuta } = require('./paqueteStateUtils');

// Absorbe TODA la lógica de negocio que antes vivía en rutaService.js (máquina de
// estados, choque de vehículo/conductor, viaje de regreso, sedes remotas, etc.),
// re-anclada al modelo SalidaProgramada (la agenda: cada fila es un viaje concreto y
// reservable) en vez del viejo modelo Ruta (que ahora es solo la plantilla
// origen->destino, ver rutaService.js). Ver LOGICA.md, "Ruta -> plantilla +
// SalidaProgramada -> agenda" (Fase 3 del split).

// Rutas directas (2026-09-16): ya no existen paradas intermedias, así que una salida
// entrega en UN SOLO municipio (el destino final de su plantilla). "¿Le queda algo
// pendiente?" reemplaza al viejo concepto de "sedes" (plural) — antes había que
// revisar cada parada por separado, ahora basta con mirar si algún paquete activo
// de la salida sigue "Por entregar".
const tienePaquetesPendientes = async (idSalida) => {
  const pares = await SalidaVehiculoConductor.findAll({
    where: { idSalida, habilitado: true },
    attributes: ['idSalidaVehiculoConductor'],
  });
  const parIds = pares.map((p) => p.idSalidaVehiculoConductor);
  if (parIds.length === 0) return false;

  const pendientes = await Paquete.findAll({
    where: { idSalidaVehiculoConductor: { [Op.in]: parIds }, estado: 'Por entregar' },
    attributes: ['idEncomiendaVenta'],
  });
  if (pendientes.length === 0) return false;

  // Un paquete "Por entregar" de una venta ya Cancelada/inhabilitada no cuenta —
  // mismo criterio que el resto del módulo (ver LOGICA.md).
  const ventaIds = [...new Set(pendientes.map((p) => p.idEncomiendaVenta))];
  const ventasActivas = await EncomiendaVenta.count({
    where: { idEncomiendaVenta: { [Op.in]: ventaIds }, habilitado: true, estado: { [Op.ne]: 'Cancelada' } },
  });
  return ventasActivas > 0;
};

// Best-effort: pasa la salida a "Completada" automáticamente en cuanto no falta nada
// por entregar — todas las sedes con paquetes están completadas. El anticipo YA NO es
// requisito (2026-09-07): la ruta y el anticipo son independientes salvo por un solo
// sentido — la ruta dispara que el anticipo pase a "En Legalización" al arrancar —
// nunca al revés. Si el conductor no ha legalizado, el anticipo se queda "En
// Legalización" tal cual (updateEstado no lo toca, ver la rama `Completada`) y lo
// legaliza después desde el móvil sin que la ruta ya esté Completada le importe
// (anticipoService.update no depende del estado de la ruta). Si updateEstado rechaza
// por otra razón (condición de carrera, etc.), se deja la ruta "En Ruta" y NO se
// propaga el error: el admin siempre puede completarla a mano. La llama
// encomiendaService.dejarPaquetesEnSede (el camino por el que un paquete sale de
// "Por entregar"; el endpoint viejo de evidencia directa se eliminó el 2026-09-18).
const intentarAutoCompletar = async (idSalida) => {
  try {
    const salida = await SalidaProgramada.findByPk(idSalida, { attributes: ['idSalida', 'estado'] });
    if (!salida || salida.estado !== 'En Ruta') return { completada: false, motivo: 'estado' };

    if (await tienePaquetesPendientes(idSalida)) return { completada: false, motivo: 'pendientes' };

    // { interno: true }: esto NO es un admin cambiando el estado a mano — salta la
    // exclusividad de operador_sede sobre su propio regreso (ver updateEstado) porque
    // no es ninguna de las dos partes actuando, es el sistema reaccionando a que ya
    // no queda nada "Por entregar".
    await updateEstado(idSalida, 'Completada', { interno: true });
    return { completada: true };
  } catch (error) {
    console.error(`Auto-completar ruta #${idSalida} no procedió: ${error.message}`);
    return { completada: false, motivo: 'error' };
  }
};

// Máximo de pares vehículo+conductor por salida — igual que MAX_PAQUETES en Ventas,
// un tope razonable para no dejar el array crecer sin límite en el formulario.
const MAX_PARES_RUTA = 10;

// separate:true -- sin esto, el LIMIT de findAndCountAll se aplicaba sobre las filas
// ya unidas con el convoy (una por cada par), no sobre las salidas distintas. Ver el
// mismo comentario histórico en la versión vieja de este archivo (rutaService.js).
const INCLUDE_PARES = {
  model: SalidaVehiculoConductor,
  as: 'paresVehiculoConductor',
  where: { habilitado: true },
  required: false,
  separate: true,
  include: [
    { model: Vehiculo, as: 'vehiculo' },
    { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
  ],
};

// La plantilla (origen conceptual, idDestino) de esta salida — ya no vive en la
// propia fila, hay que traerla vía include. Se reutiliza en todos los includes de
// abajo que antes leían `ruta.idDestino`/`ruta.destino` directo de la Ruta.
const INCLUDE_RUTA = {
  model: Ruta,
  as: 'ruta',
  attributes: ['idRuta', 'idDestino'],
  include: [{ model: Destino, as: 'destino' }],
};

// Datos livianos del viaje enlazado (ida o regreso) — solo lo necesario para mostrar
// un chip clickeable, sin anidar de nuevo su propio convoy (eso se consulta abriendo
// esa otra salida).
const INCLUDE_REGRESO_IDA = {
  model: SalidaProgramada, as: 'salidaIda', required: false,
  // idDestino (además de para el chip): con qué sede matchear tieneOperadorSedePropio
  // en getAll/getById — ver ahí. idRuta: para armar el link "ver esta salida"
  // (buildSalidaHighlightUrl) desde el chip -- Sequelize NO agrega solo la PK de un
  // include anidado cuando su propio `attributes` está restringido (a diferencia del
  // modelo raíz de la consulta), así que hay que pedirla explícito.
  attributes: ['idSalida', 'origen', 'estado'],
  include: [{ model: Ruta, as: 'ruta', attributes: ['idRuta', 'idDestino'], include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }],
};
const INCLUDE_REGRESO_VUELTA = {
  model: SalidaProgramada, as: 'salidaRegreso', required: false,
  attributes: ['idSalida', 'origen', 'estado'],
  include: [{ model: Ruta, as: 'ruta', attributes: ['idRuta', 'idDestino'], include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }],
};

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaSalida', 'estado', 'idSalida', 'habilitado', 'origen'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaSalida';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" (ej. mismo estado)
  // pueden salir en distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idSalida') return [[field, direction]];
  return [[field, direction], ['idSalida', direction]];
};

// Pseudo-estado SOLO para el filtro del listado (NO es un valor real de
// `salida_programada.estado`): salida de IDA ya "Completada", todavía SIN viaje de
// regreso enlazado, cuyo convoy sigue "fuera de base" (algún vehículo o conductor con
// `id_destino_actual`). Sirve para que el admin ubique rápido los conductores/
// vehículos varados que hay que traer de vuelta a la base. Ver LOGICA.md, "Rutas —
// filtro 'Regreso pendiente'".
const ESTADO_REGRESO_PENDIENTE = 'Regreso pendiente';

// Otro pseudo-filtro, no un estado real: toda salida que ES un viaje de regreso
// (idSalidaIda != null) -- mismo criterio que ya pinta el chip "Viaje de regreso" en
// el listado (useRutaColumns.jsx). Se agrega junto a "Regreso pendiente" en el
// selector de Estado para poder ubicarlas directamente sin tener que reconocerlas
// fila por fila.
const ESTADO_VIAJE_REGRESO = 'Viaje de regreso';

// Criterio "solo lo mío" de Rutas para operador_sede — DISTINTO del de
// Ventas/Clientes (que filtran por quién los registró): acá se filtra por qué
// salidas terminan en su municipio (destino final de la ida, que ahora vive en la
// plantilla `ruta`), más el regreso ya enlazado a esa ida — así la sede siempre ve la
// ida que Medellín le trajo, aunque ella no la haya registrado. Nunca vacío para una
// sede con operación.
const buildSedeCondition = (idSede) => sequelize.literal(
  `("SalidaProgramada"."id_salida" IN (
    SELECT s.id_salida FROM salida_programada s
    JOIN ruta r ON r.id_ruta = s.id_ruta
    WHERE r.id_destino = ${parseInt(idSede)}
       OR s.id_salida_ida IN (
          SELECT s2.id_salida FROM salida_programada s2
          JOIN ruta r2 ON r2.id_ruta = s2.id_ruta
          WHERE r2.id_destino = ${parseInt(idSede)}
       )
  ))`
);

const buildRutaWhere = ({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino, idRuta, regresoDeRuta, rol, idSede }) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estado && estado !== ESTADO_REGRESO_PENDIENTE && estado !== ESTADO_VIAJE_REGRESO) where.estado = estado;
  // idDestino ya no es columna directa de "salida_programada" — vive en su plantilla
  // (ruta.id_destino).
  if (idDestino) {
    where.idRuta = { [Op.in]: sequelize.literal(`(SELECT id_ruta FROM ruta WHERE id_destino = ${parseInt(idDestino)})`) };
  }
  // Filtro directo por plantilla — usado por la vista "Salidas de esta ruta"
  // (Rutas/ListarRuta.jsx, botón "Salidas"), que solo debe listar/crear salidas de
  // UNA ruta puntual.
  if (idRuta) {
    const condicion = parseInt(idRuta);
    where.idRuta = where.idRuta ? { [Op.and]: [where.idRuta, condicion] } : condicion;
  }
  // "Rutas de regreso" (ListarRuta.jsx, 2026-09-17): en vez de filtrar por idRuta
  // directo (que para un regreso siempre es la plantilla compartida "Medellín", igual
  // para todas las sedes), filtra por "es un regreso cuya ida cuelga de ESTA ruta
  // real" -- mismo criterio que rutaService.buildRutaSedeCondition pero acotado a una
  // sola ruta puntual en vez de "cualquier sede". idRuta y regresoDeRuta son
  // mutuamente excluyentes: el caller manda uno u otro según la pestaña activa.
  if (regresoDeRuta) {
    const condicion = sequelize.literal(
      `"SalidaProgramada"."id_salida_ida" IN (SELECT id_salida FROM salida_programada WHERE id_ruta = ${parseInt(regresoDeRuta)})`
    );
    where.idSalida = where.idSalida ? { [Op.and]: [where.idSalida, condicion] } : condicion;
  }
  if (rol === 'operador_sede') where.idSalida = where.idSalida
    ? { [Op.and]: [where.idSalida, buildSedeCondition(idSede)] }
    : buildSedeCondition(idSede);

  // idVehiculo/idConductor se resuelven vía subquery contra la tabla intermedia
  // (usado por los links "highlight" desde las páginas de Vehículo/Conductor).
  if (idConductor) {
    const condicion = { [Op.in]: sequelize.literal(
      `(SELECT id_salida FROM salida_vehiculo_conductor WHERE id_conductor = ${parseInt(idConductor)} AND habilitado = true)`
    ) };
    where.idSalida = where.idSalida ? { [Op.and]: [where.idSalida, condicion] } : condicion;
  }
  if (idVehiculo) {
    const condicion = { [Op.in]: sequelize.literal(
      `(SELECT id_salida FROM salida_vehiculo_conductor WHERE id_vehiculo = ${parseInt(idVehiculo)} AND habilitado = true)`
    ) };
    where.idSalida = where.idSalida ? { [Op.and]: [where.idSalida, condicion] } : condicion;
  }

  if (estado === ESTADO_REGRESO_PENDIENTE) {
    where.estado = 'Completada';
    where.idSalidaIda = null; // una salida de regreso no necesita su propio regreso
    const regresoPendienteCond = { [Op.and]: [
      // todavía no tiene un viaje de regreso enlazado
      { [Op.notIn]: sequelize.literal('(SELECT id_salida_ida FROM salida_programada WHERE id_salida_ida IS NOT NULL)') },
      // algún par del convoy sigue fuera de base
      { [Op.in]: sequelize.literal(
        '(SELECT svc.id_salida FROM salida_vehiculo_conductor svc ' +
        'LEFT JOIN conductor c ON c.id_conductor = svc.id_conductor ' +
        'LEFT JOIN vehiculo v ON v.id_vehiculo = svc.id_vehiculo ' +
        'WHERE svc.habilitado = true AND (c.id_destino_actual IS NOT NULL OR v.id_destino_actual IS NOT NULL))'
      ) },
    ] };
    where.idSalida = where.idSalida ? { [Op.and]: [where.idSalida, regresoPendienteCond] } : regresoPendienteCond;
  }

  if (estado === ESTADO_VIAJE_REGRESO) where.idSalidaIda = { [Op.ne]: null };

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
        `EXISTS (SELECT 1 FROM salida_vehiculo_conductor svc JOIN vehiculo v ON v.id_vehiculo = svc.id_vehiculo ` +
        `WHERE svc.id_salida = "SalidaProgramada"."id_salida" AND svc.habilitado = true AND v.placa ILIKE ${escapado})`
      ),
      sequelize.literal(
        `EXISTS (SELECT 1 FROM salida_vehiculo_conductor svc JOIN conductor c ON c.id_conductor = svc.id_conductor ` +
        `JOIN usuario u ON u.id_usuario = c.id_usuario ` +
        `WHERE svc.id_salida = "SalidaProgramada"."id_salida" AND svc.habilitado = true ` +
        `AND (u.nombre ILIKE ${escapado} OR u.apellido ILIKE ${escapado}))`
      ),
    ];
    where[Op.or] = conditions;
  }
  return where;
};

const getAll = async ({ habilitado, estado, anio, mes, page = 1, limit = 10, sortBy, q, idConductor, idVehiculo, idDestino, idRuta, regresoDeRuta, rol, idSede } = {}) => {
  const where = buildRutaWhere({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino, idRuta, regresoDeRuta, rol, idSede });

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const include = [INCLUDE_PARES, INCLUDE_RUTA, INCLUDE_REGRESO_IDA, INCLUDE_REGRESO_VUELTA];

  // OJO con subQuery:false acá: paresVehiculoConductor es hasMany (una salida puede
  // tener varios vehículos, ver el convoy) — con subQuery:false, LIMIT se aplica sobre
  // las filas ya unidas (una por cada par), no sobre las salidas distintas. Ver el
  // mismo comentario histórico en la versión vieja de este archivo (rutaService.js).
  const { count, rows: data } = await SalidaProgramada.findAndCountAll({
    where,
    include,
    limit,
    offset,
    // Orden por defecto: más reciente REGISTRADA primero (idSalida DESC), igual que
    // todos los demás módulos.
    order: order.length > 0 ? order : [['idSalida', 'DESC']],
    distinct: true,
  });

  // Para cada fila que ES un regreso, si la sede de su ida tiene su propio
  // operador_sede, ni el admin puede cambiarle el estado (ver updateEstado) — el
  // frontend usa esto para no ofrecerle siquiera el menú (useRutaColumns). Se
  // aprovecha el mismo batch para el caso simétrico: una IDA cuyo propio destino
  // tiene operador_sede propio — ahí "Programar viaje de regreso" tampoco es del
  // admin, es exclusivo de esa sede (crearRegresoDesdeSede).
  const idsDestinoRelevante = [...new Set(
    data.map(r => (r.idSalidaIda && r.salidaIda) ? r.salidaIda.ruta?.idDestino : r.ruta?.idDestino).filter(Boolean)
  )];
  if (idsDestinoRelevante.length > 0) {
    const sedesConOperador = await idsDestinoConOperadorSede(idsDestinoRelevante);
    data.forEach(r => {
      if (r.idSalidaIda && r.salidaIda) {
        r.dataValues.esRegresoDeSedePropia = sedesConOperador.has(r.salidaIda.ruta?.idDestino);
      } else {
        r.dataValues.miDestinoTieneOperadorSede = sedesConOperador.has(r.ruta?.idDestino);
      }
    });
  }

  const enCursoIds = data.filter(r => r.estado === 'En Ruta').map(r => r.idSalida);
  if (enCursoIds.length > 0) {
    // Si algún paquete de los pares de esta salida sigue "Por entregar", el conductor
    // todavía no lo dejó en la sede y la ruta no se puede completar (ver la validación
    // PACKAGES_PENDING en updateEstado).
    const pares = await SalidaVehiculoConductor.findAll({
      where: { idSalida: { [Op.in]: enCursoIds }, habilitado: true },
      attributes: ['idSalidaVehiculoConductor', 'idSalida'],
    });
    const salidaDelPar = new Map(pares.map(p => [p.idSalidaVehiculoConductor, p.idSalida]));
    if (salidaDelPar.size > 0) {
      const pendientesPaquete = await Paquete.findAll({
        where: {
          idSalidaVehiculoConductor: { [Op.in]: [...salidaDelPar.keys()] },
          estado: 'Por entregar',
        },
        attributes: ['idSalidaVehiculoConductor'],
      });
      const salidasConPaquetesPendientes = new Set(pendientesPaquete.map(p => salidaDelPar.get(p.idSalidaVehiculoConductor)));
      data.forEach(r => { r.dataValues.paquetesPendientes = salidasConPaquetesPendientes.has(r.idSalida); });
    }
  }

  // pesoUsado / paquetesAsignados: kg y cantidad de paquetes ACTIVOS en CADA PAR
  // vehículo+conductor (no en la salida completa).
  const parIds = data.flatMap(r => (r.paresVehiculoConductor || []).map(p => p.idSalidaVehiculoConductor));
  if (parIds.length > 0) {
    const paquetesDeLosPares = await Paquete.findAll({
      where: { idSalidaVehiculoConductor: { [Op.in]: parIds } },
      attributes: ['idSalidaVehiculoConductor', 'peso'],
      include: [{ model: EncomiendaVenta, as: 'encomienda', attributes: ['estado', 'habilitado'], required: true }],
    });
    const pesoPorPar = {};
    const conteoPorPar = {};
    paquetesDeLosPares.forEach(p => {
      const activa = p.encomienda?.habilitado !== false && p.encomienda?.estado !== 'Cancelada';
      if (!activa) return;
      conteoPorPar[p.idSalidaVehiculoConductor] = (conteoPorPar[p.idSalidaVehiculoConductor] || 0) + 1;
      pesoPorPar[p.idSalidaVehiculoConductor] = (pesoPorPar[p.idSalidaVehiculoConductor] || 0) + parseFloat(p.peso || 0);
    });
    data.forEach(r => {
      (r.paresVehiculoConductor || []).forEach(par => {
        par.dataValues.pesoUsado = pesoPorPar[par.idSalidaVehiculoConductor] || 0;
        par.dataValues.paquetesAsignados = conteoPorPar[par.idSalidaVehiculoConductor] || 0;
      });
    });
  }

  return { data, total: count };
};

const getById = async (id, { rol, idSede } = {}) => {
  const salida = await SalidaProgramada.findByPk(id, {
    include: [INCLUDE_PARES, INCLUDE_RUTA, INCLUDE_REGRESO_IDA, INCLUDE_REGRESO_VUELTA]
  });

  if (!salida) {
    throw new AppError('Ruta no encontrada', 404);
  }

  // Mismo criterio geográfico de getAll ("toca mi municipio", más regresos
  // enlazados) — un operador_sede no debe poder consultar el detalle de una salida
  // ajena a su sede adivinando el id.
  if (rol === 'operador_sede') {
    const visible = await SalidaProgramada.findOne({ where: { idSalida: id, [Op.and]: [buildSedeCondition(idSede)] }, attributes: ['idSalida'] });
    if (!visible) {
      throw new AppError('No tienes acceso a esta ruta', 403);
    }
  }

  return salida;
};

const validarDocumentosVehiculo = (vehiculo) => {
  // "hoy" se calcula en hora Colombia explícitamente, sin importar en qué zona horaria
  // corre el servidor (Render corre en UTC) — si no, entre las 7pm y medianoche hora
  // Colombia el servidor ya "cree" que es el día siguiente y vence documentos varias
  // horas antes de tiempo.
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

// Suma el peso de los paquetes ACTIVOS asignados a un par vehículo+conductor (venta
// habilitada y no Cancelada, igual que encomiendaService.getPesoUsadoEnPar).
const getPesoAsignadoEnPar = async (idSalidaVehiculoConductor, transaction) => {
  const paquetes = await Paquete.findAll({
    where: { idSalidaVehiculoConductor },
    include: [{ model: EncomiendaVenta, as: 'encomienda', where: { habilitado: true, estado: { [Op.ne]: 'Cancelada' } }, attributes: [] }],
    attributes: ['peso'],
    transaction,
  });
  return paquetes.reduce((sum, p) => sum + parseFloat(p.peso || 0), 0);
};

// Choque de vehículo/conductor entre salidas distintas — cada salida "ocupa" a su
// vehículo y conductor desde su fechaSalida hasta su fechaLlegadaEstimada, más
// DIAS_MARGEN_ENTRE_RUTAS de margen entre el final de una y el inicio de la otra.
const GAP_TRANSICION = DIAS_MARGEN_ENTRE_RUTAS;

const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

const validarChoqueVehiculoConductor = async ({ idVehiculo, idConductor, fechaSalida, fechaLlegadaEstimada, idSalidaExcluir }) => {
  if (!fechaSalida) return;

  const llegadaCandidata = fechaLlegadaEstimada || fechaSalida;

  const pares = await SalidaVehiculoConductor.findAll({
    where: {
      habilitado: true,
      [Op.or]: [{ idVehiculo }, { idConductor }],
      ...(idSalidaExcluir ? { idSalida: { [Op.ne]: idSalidaExcluir } } : {}),
    },
    include: [{
      model: SalidaProgramada,
      as: 'salida',
      required: true,
      where: { habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
      include: [INCLUDE_RUTA],
    }],
  });

  for (const p of pares) {
    const otraSalida = p.salida.fechaSalida;
    const otraLlegada = p.salida.fechaLlegadaEstimada || otraSalida;
    const rutaLabel = p.salida.origen ? `${p.salida.origen} → ${p.salida.ruta?.destino?.municipio || 'Sin destino'}` : `Ruta #${p.idSalida}`;
    // Margen entre el final de una salida y el inicio de la otra — en cualquiera de
    // los dos sentidos, exigido una sola vez.
    const chocaPorInicioB = fechaSalida < sumarDias(otraLlegada, GAP_TRANSICION);
    const chocaPorInicioOtra = otraSalida < sumarDias(llegadaCandidata, GAP_TRANSICION);
    const seSuperponen = chocaPorInicioB && chocaPorInicioOtra;
    if (seSuperponen) {
      throw new AppError(
        `Este vehículo o conductor ya tiene otra ruta (${rutaLabel}) programada del ${otraSalida} al ${otraLlegada}. Debes dejar al menos ${GAP_TRANSICION} días de margen antes o después de ese rango.`,
        409,
        [{
          tipo: 'Choque de vehículo/conductor',
          id: p.idSalida,
          descripcion: `La ruta ${rutaLabel} ya tiene este vehículo/conductor asignado, del ${otraSalida} al ${otraLlegada}`
        }],
        'SCHEDULE_CONFLICT'
      );
    }
  }
};

// Valida que la salida y la llegada de la SalidaProgramada caigan en día hábil (no
// domingo), que la HORA DE SALIDA sea nocturna (los vehículos se despachan de noche,
// ver HORARIO_SALIDA) y que la llegada no sea anterior a la salida. La hora de llegada
// no tiene ventana: un despacho de noche llega de madrugada o esa misma noche.
//
// validarHoraSalida=false: para editar una salida ya creada SIN cambiarle fecha ni hora
// (ej. solo el vehículo) -- las que se programaron antes de que el despacho fuera
// nocturno conservan su hora de día y no se bloquean por eso; en cuanto se les cambia la
// fecha o la hora, sí tiene que ser de noche.
const validarHorarioRuta = ({ fechaSalida, horaSalida, fechaLlegadaEstimada, horaLlegadaEstimada, exigirFechaSalidaFutura = false, validarHoraSalida = true }) => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const maxPermitido = sumarDias(hoy, MAX_DIAS_ANTICIPACION);

  if (exigirFechaSalidaFutura && fechaSalida && fechaSalida < hoy) {
    throw new AppError(`La fecha de salida no puede ser anterior a hoy (mínimo el ${hoy})`, 400);
  }

  if (fechaSalida && esDomingo(fechaSalida)) {
    throw new AppError('No se puede programar una salida en domingo (la empresa permanece cerrada)', 400);
  }
  if (fechaSalida && fechaSalida > maxPermitido) {
    throw new AppError(`La fecha de salida no puede ser más de ${MAX_DIAS_ANTICIPACION} días a partir de hoy (máximo el ${maxPermitido})`, 400);
  }
  if (validarHoraSalida && fechaSalida && horaSalida && !horaSalidaValida(fechaSalida, horaSalida)) {
    const r = getRangoSalida(fechaSalida);
    throw new AppError(`La hora de salida debe ser de noche, entre las ${r.min} y las ${r.max}`, 400);
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
    // Mismo día: la llegada tiene que ser un rato después de la salida, no antes --
    // MIN_DIAS_SALIDA_LLEGADA=0 permite que sea el mismo día (chequeo de arriba), pero
    // eso no garantiza el orden de las horas dentro de ese día. Se comparan como HH:MM:
    // la hora puede venir del body ("20:00") o de la BD ("20:00:00").
    if (horaLlegadaEstimada && horaSalida && fechaLlegadaEstimada === fechaSalida && horaLlegadaEstimada.slice(0, 5) <= horaSalida.slice(0, 5)) {
      throw new AppError('La hora estimada de llegada debe ser posterior a la hora de salida cuando es el mismo día', 400);
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

// Si se manda idSalidaIda, valida que sea una salida real de la que ESTA sea el
// regreso: debe existir, estar habilitada, ya "Completada" (el viaje de ida ya
// terminó) y no tener ya otro regreso enlazado (uq_salida_ida en init.sql es el
// respaldo a nivel de BD; esto da un mensaje claro antes de llegar ahí).
//
// 2026-09-17, a pedido de la usuaria: se quitó la exigencia de un descanso mínimo
// del conductor entre la llegada de la ida y la salida del regreso (agregada por
// Yefersn15 el día anterior). El sistema no guarda una hora de llegada REAL --
// "Hora llegada est." es la única que existe -- así que medir el descanso desde ahí
// bloqueaba casos donde el convoy en realidad había llegado antes de lo estimado.
// Queda a criterio del admin/operador_sede al elegir fecha/hora del regreso.
const validarSalidaIda = async (idSalidaIda) => {
  if (!idSalidaIda) return;
  const salidaIda = await SalidaProgramada.findByPk(idSalidaIda);
  if (!salidaIda || !salidaIda.habilitado) throw new AppError('La ruta de ida no existe o está inhabilitada', 404);
  if (salidaIda.estado !== 'Completada') {
    throw new AppError('Solo se puede programar el regreso de una ruta que ya esté "Completada"', 400);
  }
  const yaTieneRegreso = await SalidaProgramada.findOne({ where: { idSalidaIda } });
  if (yaTieneRegreso) {
    throw new AppError('Esa ruta ya tiene un viaje de regreso programado', 409);
  }
};

// El origen de una salida no lo elige el usuario (el campo va bloqueado en el
// wizard): una salida normal siempre sale de "Medellín" (la oficina principal); un
// viaje de regreso (idSalidaIda) sale del municipio de destino de la plantilla de la
// ida — el conductor está físicamente allá.
const resolverOrigenRuta = async (idSalidaIda, transaction) => {
  if (!idSalidaIda) return 'Medellín';
  const salidaIda = await SalidaProgramada.findByPk(idSalidaIda, {
    include: [{ model: Ruta, as: 'ruta', attributes: ['idRuta'], include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio'] }] }],
    transaction,
  });
  return salidaIda?.ruta?.destino?.municipio || 'Medellín';
};

// El origen (Medellín en una salida normal, o el destino de la ida en un regreso) no
// puede ser también el destino final — sería un tramo de longitud cero.
const validarOrigenDistinto = async ({ idDestino, idSalidaIda, transaction }) => {
  const origen = await resolverOrigenRuta(idSalidaIda, transaction);

  if (idDestino !== undefined && idDestino !== null) {
    const destino = await Destino.findByPk(idDestino, { attributes: ['idDestino', 'municipio'], transaction });
    if (destino && destino.municipio === origen) {
      throw new AppError(`El destino de la ruta no puede ser ${origen}: es el municipio de origen.`, 400, null, 'DESTINO_IGUAL_ORIGEN');
    }
  }
};

// "Fuera de base": un conductor/vehículo que quedó en otro municipio tras completar o
// cancelar una salida que no volvió a Medellín (conductor.idDestinoActual /
// vehiculo.idDestinoActual != null) no se puede asignar a una salida NUEVA desde
// Medellín hasta que se le programe el regreso. Para un REGRESO es al revés: solo se
// pueden asignar los que quedaron justo en el destino de la ida.
//
// idDestinoActual solo refleja el estado REAL de ahora mismo (se fija al completar
// una salida) -- no alcanza a cubrir el caso de una salida NUEVA (B) programada para
// una fecha futura cuando el vehículo/conductor ya tiene OTRA salida Programada/En
// Ruta (A) que, cronológicamente, termina antes de B sin ser un regreso: ahora mismo
// idDestinoActual puede seguir en null (A ni siquiera arrancó), pero para cuando B
// tenga que arrancar, A ya lo habrá dejado fuera de base. validarChoqueVehiculoConductor
// (más abajo) evita que A y B se solapen en fechas, pero es puramente temporal -- no
// sabe que un viaje directo termina en OTRO municipio, no en Medellín. Por eso, para
// una salida nueva (no un regreso), además de mirar el estado real también se
// proyecta: de las otras salidas Programada/En Ruta de este vehículo/conductor que
// arrancan ANTES que B, la más tardía -- si esa no es un regreso, B se rechaza igual
// que si ya estuviera fuera de base ahora mismo (mismo tipo de error, unificado).
const masTardiaAntesDe = (otrosPares, idKey, fechaSalida, horaSalida) => {
  const porId = new Map();
  const horaB = horaSalida || '00:00';
  for (const p of otrosPares) {
    const id = p[idKey];
    if (!id) continue;
    const s = p.salida;
    const horaS = s.horaSalida || '00:00';
    const esAntes = s.fechaSalida < fechaSalida || (s.fechaSalida === fechaSalida && horaS < horaB);
    if (!esAntes) continue;
    const actual = porId.get(id);
    const horaActual = actual ? (actual.horaSalida || '00:00') : null;
    if (!actual || s.fechaSalida > actual.fechaSalida || (s.fechaSalida === actual.fechaSalida && horaS > horaActual)) {
      porId.set(id, s);
    }
  }
  return porId;
};

const validarUbicacionParaRuta = async ({ pares, idSalidaIda, fechaSalida, horaSalida, idSalidaExcluir }) => {
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
  if (idSalidaIda) {
    const salidaIda = await SalidaProgramada.findByPk(idSalidaIda, {
      include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }],
    });
    idaIdDestino = salidaIda?.ruta?.idDestino ?? null;
  }

  let ultimaVehiculoAntes = new Map();
  let ultimaConductorAntes = new Map();
  if (!idSalidaIda && fechaSalida) {
    const otrosPares = await SalidaVehiculoConductor.findAll({
      where: {
        habilitado: true,
        [Op.or]: [{ idVehiculo: { [Op.in]: idsVehiculo } }, { idConductor: { [Op.in]: idsConductor } }],
        ...(idSalidaExcluir ? { idSalida: { [Op.ne]: idSalidaExcluir } } : {}),
      },
      include: [{
        model: SalidaProgramada, as: 'salida', required: true,
        where: { habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
        attributes: ['idSalida', 'origen', 'fechaSalida', 'horaSalida', 'idSalidaIda'],
        include: [INCLUDE_RUTA],
      }],
    });
    ultimaVehiculoAntes = masTardiaAntesDe(otrosPares, 'idVehiculo', fechaSalida, horaSalida);
    ultimaConductorAntes = masTardiaAntesDe(otrosPares, 'idConductor', fechaSalida, horaSalida);
  }

  const vehFuera = [];
  const condFuera = [];

  for (const v of vehiculos) {
    if (idSalidaIda) {
      if (v.idDestinoActual !== idaIdDestino) {
        vehFuera.push({ tipo: 'Vehículo', id: v.idVehiculo, descripcion: `El vehículo ${v.placa} no está en el municipio desde el que sale el regreso${v.destinoActual ? ` (quedó en ${v.destinoActual.municipio})` : ' (está en base)'}` });
      }
    } else if (v.idDestinoActual) {
      vehFuera.push({ tipo: 'Vehículo', id: v.idVehiculo, descripcion: `El vehículo ${v.placa} quedó en ${v.destinoActual?.municipio || 'otro municipio'}: necesita un viaje de regreso antes de una ruta nueva desde Medellín` });
    } else {
      const previa = ultimaVehiculoAntes.get(v.idVehiculo);
      if (previa && !previa.idSalidaIda) {
        const destinoPrevia = previa.ruta?.destino?.municipio || 'otro municipio';
        const etiquetaPrevia = previa.origen ? `${previa.origen} → ${destinoPrevia}` : `Salida #${previa.idSalida}`;
        vehFuera.push({ tipo: 'Vehículo', id: v.idVehiculo, idRuta: previa.ruta?.idRuta ?? null, idSalidaConflicto: previa.idSalida, descripcion: `El vehículo ${v.placa} va a quedar en ${destinoPrevia} tras la salida ${etiquetaPrevia} (${previa.fechaSalida}): necesita su regreso programado antes de poder asignarlo a esta salida` });
      }
    }
  }
  for (const c of conductores) {
    const nom = c.usuario ? `${c.usuario.nombre} ${c.usuario.apellido}` : `Conductor #${c.idConductor}`;
    if (idSalidaIda) {
      if (c.idDestinoActual !== idaIdDestino) {
        condFuera.push({ tipo: 'Conductor', id: c.idConductor, descripcion: `${nom} no está en el municipio desde el que sale el regreso${c.destinoActual ? ` (quedó en ${c.destinoActual.municipio})` : ' (está en base)'}` });
      }
    } else if (c.idDestinoActual) {
      condFuera.push({ tipo: 'Conductor', id: c.idConductor, descripcion: `${nom} quedó en ${c.destinoActual?.municipio || 'otro municipio'}: necesita un viaje de regreso antes de una ruta nueva desde Medellín` });
    } else {
      const previa = ultimaConductorAntes.get(c.idConductor);
      if (previa && !previa.idSalidaIda) {
        const destinoPrevia = previa.ruta?.destino?.municipio || 'otro municipio';
        const etiquetaPrevia = previa.origen ? `${previa.origen} → ${destinoPrevia}` : `Salida #${previa.idSalida}`;
        condFuera.push({ tipo: 'Conductor', id: c.idConductor, idRuta: previa.ruta?.idRuta ?? null, idSalidaConflicto: previa.idSalida, descripcion: `${nom} va a quedar en ${destinoPrevia} tras la salida ${etiquetaPrevia} (${previa.fechaSalida}): necesita su regreso programado antes de poder asignarlo a esta salida` });
      }
    }
  }

  if (vehFuera.length > 0) {
    throw new AppError(
      idSalidaIda ? 'Uno o más vehículos no están en el municipio desde el que sale el regreso' : 'Uno o más vehículos van a quedar fuera de base y necesitan un viaje de regreso antes de esta salida',
      409, vehFuera, 'VEHICULO_FUERA_DE_BASE'
    );
  }
  if (condFuera.length > 0) {
    throw new AppError(
      idSalidaIda ? 'Uno o más conductores no están en el municipio desde el que sale el regreso' : 'Uno o más conductores van a quedar fuera de base y necesitan un viaje de regreso antes de esta salida',
      409, condFuera, 'CONDUCTOR_FUERA_DE_BASE'
    );
  }
};

const create = async (data, { rol, idSede } = {}) => {
  const { idRuta, fechaSalida, horaSalida, horaLlegadaEstimada, fechaLlegadaEstimada, estado, observaciones, pares, idSalidaIda } = data;

  if (!idRuta) throw new AppError('La ruta (plantilla) es obligatoria', 400);
  const plantilla = await Ruta.findByPk(idRuta);
  if (!plantilla || !plantilla.habilitado) throw new AppError('La ruta no existe o está inhabilitada', 404);

  validarHorarioRuta({ fechaSalida, horaSalida, fechaLlegadaEstimada, horaLlegadaEstimada, exigirFechaSalidaFutura: true });
  await validarSalidaIda(idSalidaIda);

  // El regreso de una sede con operador_sede propio es EXCLUSIVO de esa sede — ni
  // siquiera el admin puede crearlo desde el wizard general (mismo criterio ya
  // aplicado a editar/cambiar-estado de un regreso ya existente, ver
  // update()/updateEstado()). El único camino legítimo para esos destinos es
  // crearRegresoDesdeSede(), que sí manda `rol: 'operador_sede'` acá abajo — por eso
  // se salta el chequeo cuando ese es el caso.
  let salidaIdaCompleta = null;
  if (idSalidaIda) {
    salidaIdaCompleta = await SalidaProgramada.findByPk(idSalidaIda, {
      include: [INCLUDE_PARES, { model: Ruta, as: 'ruta', attributes: ['idDestino'] }],
    });
    if (rol !== 'operador_sede' && salidaIdaCompleta?.ruta && await tieneOperadorSedePropio(salidaIdaCompleta.ruta.idDestino)) {
      throw new AppError('Esa ruta es el regreso de una sede con operador propio — solo esa sede puede programarlo.', 403);
    }
  }

  // REGLA NUEVA DE NEGOCIO (Fase 3, acordada explícitamente): un regreso hereda el/los
  // par(es) vehículo+conductor de la ida — el cliente NO elige convoy para un
  // regreso, sería físicamente absurdo (el convoy que hizo la ida es el que tiene que
  // volver). Se copian automáticamente los pares habilitados de la ida; si el body
  // manda `pares` de todos modos, se rechaza (400) salvo que coincida EXACTAMENTE
  // (vehículo/conductor) con el convoy de la ida. Mismo patrón que
  // crearRegresoDesdeSede.
  let paresEfectivos = pares;
  if (idSalidaIda) {
    const paresIda = (salidaIdaCompleta?.paresVehiculoConductor || []).map((p) => ({
      idVehiculo: p.idVehiculo,
      idConductor: p.idConductor,
    }));
    if (Array.isArray(pares) && pares.length > 0) {
      const mismoConjunto = pares.length === paresIda.length && pares.every((p) =>
        paresIda.some((pi) => pi.idVehiculo === parseInt(p.idVehiculo) && pi.idConductor === parseInt(p.idConductor))
      );
      if (!mismoConjunto) {
        throw new AppError('El regreso debe usar el mismo vehículo/conductor de la ida: no puedes elegir otro convoy.', 400);
      }
    }
    paresEfectivos = paresIda;
  }

  validarPares(paresEfectivos);
  await validarUbicacionParaRuta({ pares: paresEfectivos, idSalidaIda, fechaSalida, horaSalida });

  const destino = await Destino.findByPk(plantilla.idDestino);
  if (!destino) throw new AppError('Destino no encontrado', 404);

  for (const par of paresEfectivos) {
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

  await validarOrigenDistinto({
    idDestino: plantilla.idDestino,
    idSalidaIda,
  });

  const transaction = await sequelize.transaction();
  let idSalidaCreada;
  try {
    const salida = await SalidaProgramada.create({
      idRuta,
      origen: await resolverOrigenRuta(idSalidaIda, transaction),
      idSalidaIda: idSalidaIda || null,
      fechaSalida: fechaSalida || null,
      fechaLlegadaEstimada: fechaLlegadaEstimada || null,
      horaSalida: horaSalida || null,
      horaLlegadaEstimada: horaLlegadaEstimada || null,
      estado: estado || 'Programada',
      observaciones: observaciones || null
    }, { transaction });
    idSalidaCreada = salida.idSalida;

    for (const par of paresEfectivos) {
      await SalidaVehiculoConductor.create(
        { idSalida: salida.idSalida, idVehiculo: par.idVehiculo, idConductor: par.idConductor },
        { transaction }
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return getById(idSalidaCreada);
};

// WS4 "Sedes remotas" — el operador_sede dispara el regreso de su sede con una sola
// acción (fecha/hora de salida + fecha estimada de llegada, hora opcional): arma acá
// el resto de los datos (mismo convoy de la ida) y delega en create() para el resto
// (resolverOrigenRuta, validarUbicacionParaRuta, transacción...).
//
// DECISIÓN DE DISEÑO (Fase 3, no estaba explícita en el plan): create() ahora exige
// `idRuta` (de qué PLANTILLA es la salida) — un regreso automático no tiene wizard
// donde el operador_sede elija una plantilla a mano, así que acá se reutiliza (o crea
// una sola vez) una plantilla "Regreso a Medellín" con destino Medellín. Si en el
// futuro se quiere una plantilla por sede de origen del regreso, este es el único
// punto que habría que tocar.
const crearRegresoDesdeSede = async (idSalidaIda, { fechaSalida, horaSalida, fechaLlegadaEstimada, horaLlegadaEstimada } = {}, { idSede } = {}) => {
  if (!fechaSalida || !horaSalida) {
    throw new AppError('La fecha y la hora de salida del regreso son obligatorias', 400);
  }
  if (!fechaLlegadaEstimada) {
    throw new AppError('La fecha estimada de llegada del regreso es obligatoria', 400);
  }

  const ida = await SalidaProgramada.findByPk(idSalidaIda, {
    include: [INCLUDE_PARES, { model: Ruta, as: 'ruta', attributes: ['idDestino'] }],
  });
  if (!ida || !ida.habilitado) {
    throw new AppError('La ruta no existe o está inhabilitada', 404);
  }
  if (ida.estado !== 'Completada') {
    throw new AppError('Solo se puede programar el regreso de una ruta que ya esté "Completada"', 400);
  }
  const yaTieneRegreso = await SalidaProgramada.findOne({ where: { idSalidaIda } });
  if (yaTieneRegreso) {
    throw new AppError('Esa ruta ya tiene un viaje de regreso programado', 409);
  }
  // La ida debe terminar en la sede de quien dispara el regreso: solo ahí el convoy
  // queda "fuera de base" (validarUbicacionParaRuta, más abajo, es la validación
  // autoritativa) — esto solo da un mensaje más claro.
  if (ida.ruta?.idDestino !== idSede) {
    throw new AppError('Esa ruta no llega a tu sede', 403);
  }

  const medellin = await Destino.findOne({ where: { municipio: 'Medellín', habilitado: true } });
  if (!medellin) {
    throw new AppError('No se encontró el destino "Medellín" en el catálogo', 500);
  }

  // Sin nombre propio para identificarla: una única plantilla "hacia Medellín" se
  // reutiliza para TODOS los regresos (el origen real de cada una lo resuelve la
  // propia SalidaProgramada, no la plantilla) — por eso alcanza con buscarla por
  // idDestino.
  let plantillaRegreso = await Ruta.findOne({ where: { idDestino: medellin.idDestino } });
  if (!plantillaRegreso) {
    plantillaRegreso = await Ruta.create({ idDestino: medellin.idDestino });
  }

  const pares = (ida.paresVehiculoConductor || []).map((p) => ({
    idVehiculo: p.idVehiculo,
    idConductor: p.idConductor,
  }));

  return create({
    idRuta: plantillaRegreso.idRuta,
    idSalidaIda,
    fechaSalida,
    horaSalida,
    fechaLlegadaEstimada,
    horaLlegadaEstimada,
    pares,
  }, { rol: 'operador_sede', idSede });
};

// Campos que operador_sede puede tocar al editar su propio regreso — nada de
// convoy/plantilla/observaciones/estado/habilitado, eso sigue siendo de Medellín.
// Ver update().
const CAMPOS_EDITABLES_SEDE = ['fechaSalida', 'horaSalida', 'fechaLlegadaEstimada', 'horaLlegadaEstimada'];

const update = async (id, data, { rol, idSede } = {}) => {
  const { idRuta, fechaSalida, horaSalida, horaLlegadaEstimada, fechaLlegadaEstimada, estado, observaciones, habilitado, pares } = data;

  const salida = await SalidaProgramada.findByPk(id, { include: [{ model: Ruta, as: 'ruta' }] });
  if (!salida) throw new AppError('Ruta no encontrada', 404);

  if (salida.idSalidaIda) {
    const ida = await SalidaProgramada.findByPk(salida.idSalidaIda, { include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }] });
    if (rol === 'operador_sede') {
      // Solo su propio regreso (mismo criterio que updateEstado/crearRegresoDesdeSede)
      // y solo fecha/hora — es lo único que de verdad le compete.
      const camposExtra = Object.keys(data).filter((k) => !CAMPOS_EDITABLES_SEDE.includes(k));
      if (camposExtra.length > 0) {
        throw new AppError('Solo puedes editar la fecha y hora de salida/llegada de tu regreso', 403);
      }
      if (!ida || ida.ruta?.idDestino !== idSede) {
        throw new AppError('Esa ruta no es un regreso de tu sede', 403);
      }
    } else if (ida?.ruta && await tieneOperadorSedePropio(ida.ruta.idDestino)) {
      // Admin: mismo bloqueo exclusivo que updateEstado.
      throw new AppError('Esta ruta es el regreso de una sede con operador propio — solo esa sede puede editarla.', 403);
    }
  } else if (rol === 'operador_sede') {
    // No es un regreso en absoluto (ej. la ida que trajo el convoy) — nunca es suya.
    throw new AppError('No tienes permiso para editar esta ruta', 403);
  }

  // Edición general solo permitida en Programada (nada comprometido aún) o
  // Cancelada (se puede reprogramar libremente).
  if (!['Programada', 'Cancelada'].includes(salida.estado)) {
    throw new AppError(`No se puede editar una ruta en estado "${salida.estado}". Solo se puede editar cuando está Programada o Cancelada.`, 400);
  }

  // DECISIÓN DE DISEÑO (Fase 3): en el modelo viejo, `idDestino` era editable
  // directo en la ruta/trip. Ahora el destino vive en la plantilla (`ruta`), así que
  // el equivalente es aceptar `idRuta` (cambiar de plantilla) — cambia el destino
  // final indirectamente, sin necesitar un campo `idDestino` propio en
  // SalidaProgramada.
  let plantillaNueva = salida.ruta;
  if (idRuta !== undefined && parseInt(idRuta) !== salida.idRuta) {
    plantillaNueva = await Ruta.findByPk(idRuta);
    if (!plantillaNueva || !plantillaNueva.habilitado) throw new AppError('Ruta no encontrada', 404);
  }

  // Un regreso (idSalidaIda) hereda el convoy de la ida (mismo criterio nuevo que
  // create()) — nunca se le cambia el convoy desde acá.
  if (salida.idSalidaIda && Array.isArray(pares) && pares.length > 0) {
    throw new AppError('El regreso no permite cambiar su vehículo/conductor: hereda el de la ida.', 400);
  }
  if (!salida.idSalidaIda && Array.isArray(pares) && pares.length > 0) {
    // fechaSalida/horaSalida acá son las del body (undefined si esta edición no las
    // toca) -- si no vinieron, se usa la que la salida ya tiene guardada.
    const fechaSalidaEfectiva = fechaSalida || salida.fechaSalida;
    const horaSalidaEfectiva = horaSalida || salida.horaSalida;
    await validarUbicacionParaRuta({ pares, idSalidaIda: salida.idSalidaIda, fechaSalida: fechaSalidaEfectiva, horaSalida: horaSalidaEfectiva, idSalidaExcluir: salida.idSalida });
  }

  // undefined = el campo no vino en el body -> conservar el valor actual.
  // '' / null = vino vacío -> guardar NULL.
  const conservarOLimpiar = (valor, actual) => {
    if (valor === undefined) return actual;
    if (valor === '' || valor === null) return null;
    return valor;
  };
  const nuevaFechaSalida = conservarOLimpiar(fechaSalida, salida.fechaSalida);
  const nuevaHoraSalida = conservarOLimpiar(horaSalida, salida.horaSalida);
  const nuevaFechaLlegadaEstimada = conservarOLimpiar(fechaLlegadaEstimada, salida.fechaLlegadaEstimada);
  const nuevaHoraLlegadaEstimada = conservarOLimpiar(horaLlegadaEstimada, salida.horaLlegadaEstimada);
  const fechaHoraCambio = fechaSalida !== undefined || horaSalida !== undefined
    || fechaLlegadaEstimada !== undefined || horaLlegadaEstimada !== undefined;

  // Reprogramar solo = editarle la fecha/hora a una salida Cancelada -- se reactiva
  // sola si el resultado ya no está vencido.
  const normHora = (h) => (h ? h.slice(0, 5) : h);
  const salidaCambioHora = nuevaFechaSalida !== salida.fechaSalida || normHora(nuevaHoraSalida) !== normHora(salida.horaSalida);
  const reactivarAutomaticamente = estado === undefined && salida.estado === 'Cancelada' && salidaCambioHora
    && motivoSalidaVencida({ fechaSalida: nuevaFechaSalida, horaSalida: nuevaHoraSalida }) === null;

  validarHorarioRuta({
    fechaSalida: nuevaFechaSalida, horaSalida: nuevaHoraSalida,
    fechaLlegadaEstimada: nuevaFechaLlegadaEstimada, horaLlegadaEstimada: nuevaHoraLlegadaEstimada,
    exigirFechaSalidaFutura: nuevaFechaSalida !== salida.fechaSalida,
    // Solo se exige hora nocturna si esta edición mueve la fecha o la hora de salida.
    validarHoraSalida: salidaCambioHora,
  });
  // Si se mueve la fecha de salida y/o llegada, la fechaEstimadaEntrega que ya tenía
  // prometida cada venta de esta salida deja de tener sentido -- se sincroniza a la
  // nueva fecha mínima (mismo criterio de siempre, ver versión vieja de este
  // archivo).
  let ventasSincronizadas = [];
  let minimaEntregaNueva = null;
  if (fechaHoraCambio) {
    minimaEntregaNueva = nuevaFechaLlegadaEstimada || sumarDias(nuevaFechaSalida, 1);
    ventasSincronizadas = await EncomiendaVenta.findAll({
      where: {
        idSalida: id,
        habilitado: true,
        estado: { [Op.ne]: 'Cancelada' },
      },
      attributes: ['idEncomiendaVenta'],
    });
  }

  if (!salida.idSalidaIda && pares !== undefined) validarPares(pares);
  const idDestinoEfectivo = plantillaNueva.idDestino;

  await validarOrigenDistinto({
    idDestino: idDestinoEfectivo,
    idSalidaIda: salida.idSalidaIda,
  });

  // Ventas cuyo destino queda fuera de la ruta tras esta edición -- se dejan
  // `Cancelada` (mismo mecanismo de "venta huérfana" de siempre, ver LOGICA.md).
  // Solo puede cambiar la cobertura si cambia la plantilla (nuevo destino final) —
  // el convoy (pares) ya no afecta a qué destino llega la salida.
  let idsVentasHuerfanas = [];
  const plantillaCambio = idRuta !== undefined && plantillaNueva.idRuta !== salida.idRuta;

  const transaction = await sequelize.transaction();
  try {
    if (!salida.idSalidaIda && pares !== undefined) {
      const paresActuales = await SalidaVehiculoConductor.findAll({ where: { idSalida: id, habilitado: true }, transaction });
      const paresActualesPorId = new Map(paresActuales.map(p => [p.idSalidaVehiculoConductor, p]));
      const idsConservados = new Set();

      for (const par of pares) {
        const parActual = par.idSalidaVehiculoConductor ? paresActualesPorId.get(par.idSalidaVehiculoConductor) : null;
        const esNuevo = !parActual;
        const cambioVehiculo = esNuevo || parActual.idVehiculo !== par.idVehiculo;
        const cambioConductor = esNuevo || parActual.idConductor !== par.idConductor;

        if (cambioVehiculo) {
          const vehiculo = await Vehiculo.findByPk(par.idVehiculo, { transaction });
          if (!vehiculo) throw new AppError('Vehículo no encontrado', 404);
          validarDocumentosVehiculo(vehiculo);

          if (!esNuevo && vehiculo.capacidad) {
            const pesoAsignado = await getPesoAsignadoEnPar(parActual.idSalidaVehiculoConductor, transaction);
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
            fechaSalida: nuevaFechaSalida, fechaLlegadaEstimada: nuevaFechaLlegadaEstimada, idSalidaExcluir: parseInt(id),
          });
        }

        if (esNuevo) {
          const nuevo = await SalidaVehiculoConductor.create(
            { idSalida: id, idVehiculo: par.idVehiculo, idConductor: par.idConductor },
            { transaction }
          );
          idsConservados.add(nuevo.idSalidaVehiculoConductor);
        } else {
          idsConservados.add(parActual.idSalidaVehiculoConductor);
          if (cambioVehiculo || cambioConductor) {
            await parActual.update({ idVehiculo: par.idVehiculo, idConductor: par.idConductor }, { transaction });
          }
        }
      }

      const paresAQuitar = paresActuales.filter(p => !idsConservados.has(p.idSalidaVehiculoConductor));
      for (const par of paresAQuitar) {
        const tienePaquetes = await Paquete.count({
          where: { idSalidaVehiculoConductor: par.idSalidaVehiculoConductor },
          include: [{ model: EncomiendaVenta, as: 'encomienda', attributes: [], required: true, where: { habilitado: true, estado: { [Op.ne]: 'Cancelada' } } }],
          transaction,
        });
        if (tienePaquetes > 0) {
          throw new AppError('No puedes quitar un vehículo de la ruta si ya tiene paquetes asignados en esta ruta.', 400);
        }
        await par.update({ habilitado: false }, { transaction });
      }
    } else if (fechaHoraCambio) {
      const paresActuales = await SalidaVehiculoConductor.findAll({ where: { idSalida: id, habilitado: true }, transaction });
      for (const par of paresActuales) {
        await validarChoqueVehiculoConductor({
          idVehiculo: par.idVehiculo, idConductor: par.idConductor,
          fechaSalida: nuevaFechaSalida, fechaLlegadaEstimada: nuevaFechaLlegadaEstimada, idSalidaExcluir: parseInt(id),
        });
      }
    }

    // Rutas directas: la única forma de que una venta quede fuera de la salida es
    // que cambie la plantilla (destino final distinto) — el convoy ya no afecta a
    // qué destino llega la salida.
    if (plantillaCambio) {
      const ventasDeLaRuta = await EncomiendaVenta.findAll({
        where: { idSalida: id, habilitado: true, estado: { [Op.ne]: 'Cancelada' } },
        include: [{ model: Destinatario, as: 'destinatario', attributes: ['idDestino'] }],
        attributes: ['idEncomiendaVenta'],
        transaction,
      });
      idsVentasHuerfanas = ventasDeLaRuta
        .filter((v) => v.destinatario && v.destinatario.idDestino !== idDestinoEfectivo)
        .map((v) => v.idEncomiendaVenta);
    }

    await salida.update({
      // El origen no se edita: normal -> "Medellín"; regreso -> destino de la ida.
      origen:                await resolverOrigenRuta(salida.idSalidaIda, transaction),
      idRuta:                plantillaNueva.idRuta,
      fechaSalida:           nuevaFechaSalida,
      fechaLlegadaEstimada:  nuevaFechaLlegadaEstimada,
      horaSalida:            nuevaHoraSalida,
      horaLlegadaEstimada:   nuevaHoraLlegadaEstimada,
      estado:                estado !== undefined ? estado : (reactivarAutomaticamente ? 'Programada' : salida.estado),
      observaciones:         observaciones !== undefined ? observaciones : salida.observaciones,
      habilitado:            habilitado !== undefined ? habilitado : salida.habilitado
    }, { transaction });

    if (ventasSincronizadas.length > 0) {
      await EncomiendaVenta.update(
        { fechaEstimadaEntrega: minimaEntregaNueva },
        { where: { idEncomiendaVenta: { [Op.in]: ventasSincronizadas.map(v => v.idEncomiendaVenta) } }, transaction }
      );
    }

    if (idsVentasHuerfanas.length > 0) {
      await EncomiendaVenta.update(
        { estado: 'Cancelada' },
        { where: { idEncomiendaVenta: { [Op.in]: idsVentasHuerfanas } }, transaction }
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return { ruta: await getById(id), ventasSincronizadas, ventasHuerfanas: idsVentasHuerfanas.length, reactivada: reactivarAutomaticamente };
};

// Mismo cálculo que yaDebioSalir() en jobs/autoIniciarRutas.js (offset fijo -05:00
// para Colombia) — se duplica acá en vez de importarlo porque ese archivo ya importa
// este servicio, y hacerlo al revés crearía una dependencia circular.
const motivoSalidaVencida = (salida) => {
  if (!salida.fechaSalida || !salida.horaSalida) return 'fecha';
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (salida.fechaSalida < hoy) return 'fecha';
  if (salida.fechaSalida > hoy) return null;
  const salidaDate = new Date(`${salida.fechaSalida}T${salida.horaSalida}-05:00`);
  return (isNaN(salidaDate.getTime()) || salidaDate <= new Date()) ? 'hora' : null;
};

// ¿Cuáles de estos municipios tienen un operador_sede activo asignado (usuario_sede)?
const idsDestinoConOperadorSede = async (idsDestino) => {
  const asignaciones = await UsuarioSede.findAll({
    where: { idDestino: { [Op.in]: idsDestino }, habilitado: true },
    include: [{
      model: Usuario, as: 'usuario', required: true, where: { habilitado: true },
      include: [{ model: Rol, as: 'rol', required: true, where: { codigo: 'operador_sede' } }],
    }],
    attributes: ['idDestino'],
  });
  return new Set(asignaciones.map(a => a.idDestino));
};

const tieneOperadorSedePropio = async (idDestino) => {
  const sedes = await idsDestinoConOperadorSede([idDestino]);
  return sedes.has(idDestino);
};

const updateEstado = async (id, estado, { rol, idSede, interno = false } = {}) => {
  const estadosValidos = ['Programada', 'En Ruta', 'Completada', 'Cancelada'];
  if (!estadosValidos.includes(estado)) {
    throw new AppError(`Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`, 400);
  }

  // `ruta.destino` (municipio) se necesita más abajo para los correos "tu
  // paquete ya va en camino" que se disparan al arrancar la salida.
  const salida = await SalidaProgramada.findByPk(id, { include: [INCLUDE_PARES, { model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino' }] }] });
  if (!salida) throw new AppError('Ruta no encontrada', 404);

  if (rol === 'operador_sede') {
    if (estado !== 'En Ruta' || salida.estado !== 'Programada') {
      throw new AppError('No tienes permiso para cambiar esta ruta a ese estado', 403);
    }
    const ida = salida.idSalidaIda ? await SalidaProgramada.findByPk(salida.idSalidaIda, { include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }] }) : null;
    if (!ida || ida.ruta?.idDestino !== idSede) {
      throw new AppError('Esa ruta no es un regreso de tu sede', 403);
    }
  } else if (salida.idSalidaIda && !interno) {
    const ida = await SalidaProgramada.findByPk(salida.idSalidaIda, { include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }] });
    if (ida?.ruta && await tieneOperadorSedePropio(ida.ruta.idDestino)) {
      throw new AppError('Esta ruta es el regreso de una sede con operador propio — solo esa sede puede cambiar su estado.', 403);
    }
  }

  if (salida.estado === 'Completada') {
    throw new AppError('No se puede cambiar el estado de una ruta completada', 400);
  }

  if (estado === 'Programada' && salida.estado === 'En Ruta') {
    throw new AppError('No se puede revertir el estado de una ruta en curso a Programada', 400);
  }

  if (estado === 'Programada') {
    const motivo = motivoSalidaVencida(salida);
    if (motivo === 'fecha') {
      throw new AppError('La fecha de salida de esta ruta ya pasó. Edítala con una fecha futura antes de volver a ponerla en Programada.', 400);
    }
    if (motivo === 'hora') {
      throw new AppError('La hora de salida de esta ruta ya pasó (sigue siendo hoy). Edítala con una hora futura antes de volver a ponerla en Programada.', 400);
    }
  }

  if (estado === 'Cancelada' && salida.estado === 'Programada') {
    throw new AppError('No se puede cancelar una ruta que aún no ha iniciado. Edítala o inhabilítala en su lugar.', 400);
  }

  const pares = salida.paresVehiculoConductor || [];

  if (estado === 'En Ruta') {
    for (const par of pares) {
      const conflictoVehiculo = await SalidaVehiculoConductor.findOne({
        where: { idVehiculo: par.idVehiculo, habilitado: true, idSalida: { [Op.ne]: id } },
        include: [{ model: SalidaProgramada, as: 'salida', required: true, where: { habilitado: true, estado: 'En Ruta' }, include: [{ model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }] }],
      });
      if (conflictoVehiculo) {
        const fechaLabel = conflictoVehiculo.salida.fechaSalida ? conflictoVehiculo.salida.fechaSalida.split('-').reverse().join('/') : '';
        const salidaLabel = conflictoVehiculo.salida.origen ? `${conflictoVehiculo.salida.origen} → ${conflictoVehiculo.salida.ruta?.destino?.municipio || 'Sin destino'}${fechaLabel ? `, ${fechaLabel}` : ''}` : `Salida #${conflictoVehiculo.idSalida}`;
        throw new AppError(
          `El vehículo ${par.vehiculo?.placa || ''} está en curso con la salida ${salidaLabel}`,
          409,
          [{
            tipo: 'Conflicto de vehículo',
            id: conflictoVehiculo.idSalida,
            idRuta: conflictoVehiculo.salida.ruta?.idRuta ?? null,
            descripcion: `${par.vehiculo?.placa || 'Vehículo'} está en curso con la salida ${salidaLabel}`
          }],
          'VEHICLE_IN_USE'
        );
      }

      const conflictoConductor = await SalidaVehiculoConductor.findOne({
        where: { idConductor: par.idConductor, habilitado: true, idSalida: { [Op.ne]: id } },
        include: [{ model: SalidaProgramada, as: 'salida', required: true, where: { habilitado: true, estado: 'En Ruta' }, include: [{ model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }] }],
      });
      if (conflictoConductor) {
        const u = par.conductor?.usuario;
        const fechaLabel = conflictoConductor.salida.fechaSalida ? conflictoConductor.salida.fechaSalida.split('-').reverse().join('/') : '';
        const salidaLabel = conflictoConductor.salida.origen ? `${conflictoConductor.salida.origen} → ${conflictoConductor.salida.ruta?.destino?.municipio || 'Sin destino'}${fechaLabel ? `, ${fechaLabel}` : ''}` : `Salida #${conflictoConductor.idSalida}`;
        throw new AppError(
          `El conductor ${u ? `${u.nombre} ${u.apellido}` : ''} está en curso con la salida ${salidaLabel}`,
          409,
          [{
            tipo: 'Conflicto de conductor',
            id: conflictoConductor.idSalida,
            idRuta: conflictoConductor.salida.ruta?.idRuta ?? null,
            descripcion: `${u ? `${u.nombre} ${u.apellido}` : 'El conductor'} está en curso con la salida ${salidaLabel}`
          }],
          'CONDUCTOR_IN_USE'
        );
      }

      if (par.vehiculo) validarDocumentosVehiculo(par.vehiculo);
      if (par.conductor && !tieneLicenciaVigente(par.conductor.categoriasLicencia)) {
        const u = par.conductor.usuario;
        throw new AppError(
          `El conductor ${u ? `${u.nombre} ${u.apellido}` : ''} tiene la licencia de conducción vencida y no puede iniciar la ruta`,
          400
        );
      }
    }

    // 2026-09-17, a pedido de la usuaria: un viaje de regreso (idSalidaIda) ya NO
    // está exento de estos dos chequeos. La excepción original (LOGICA.md, "un
    // regreso sí puede arrancar vacío") existía porque no había forma de cargarle
    // encomiendas a un regreso -- ahora que operador_sede puede registrar ventas
    // contra su propio regreso (destino Medellín, ver ventaValidation.js), la misma
    // regla de "no salir vacío" aplica igual que a cualquier salida normal.
    const encomiendaCount = await EncomiendaVenta.count({
      where: { idSalida: parseInt(id), habilitado: true }
    });
    if (encomiendaCount === 0) {
      throw new AppError('No se puede iniciar la ruta sin encomiendas asignadas. Registra al menos una encomienda antes de poner la ruta En Ruta.', 400);
    }

    const paresVacios = [];
    for (const par of pares) {
      const n = await Paquete.count({
        where: { idSalidaVehiculoConductor: par.idSalidaVehiculoConductor },
        include: [{ model: EncomiendaVenta, as: 'encomienda', attributes: [], required: true, where: { habilitado: true, estado: { [Op.ne]: 'Cancelada' } } }],
      });
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

    const ventasSinFecha = await EncomiendaVenta.findAll({
      where: { idSalida: parseInt(id), habilitado: true, estado: { [Op.ne]: 'Cancelada' }, fechaEstimadaEntrega: null },
      attributes: ['idEncomiendaVenta', 'numeroGuia'],
    });
    if (ventasSinFecha.length > 0) {
      throw new AppError(
        `Hay ${ventasSinFecha.length === 1 ? '1 venta' : ventasSinFecha.length + ' ventas'} sin fecha estimada de entrega. Asígnales una fecha antes de poner la ruta En Ruta.`,
        409,
        ventasSinFecha.map(v => ({
          tipo: 'venta',
          id: v.idEncomiendaVenta,
          guia: v.numeroGuia || `#${v.idEncomiendaVenta}`,
          descripcion: `Guía ${v.numeroGuia || '#' + v.idEncomiendaVenta} no tiene fecha estimada de entrega asignada`,
        })),
        'MISSING_DELIVERY_DATE'
      );
    }

    for (const par of pares) {
      await Vehiculo.update({ estado: 'En Ruta', idDestinoActual: null }, { where: { idVehiculo: par.idVehiculo } });
      await Conductor.update({ estado: 'En Ruta', idDestinoActual: null }, { where: { idConductor: par.idConductor } });
    }
    await AnticipoExcedente.update(
      { estado: 'En Legalización' },
      { where: { idSalida: salida.idSalida, idConductor: { [Op.in]: pares.map((p) => p.idConductor) }, habilitado: true, estado: 'Entregado' } }
    );
    await EncomiendaVenta.update(
      { estado: 'En Ruta' },
      { where: { idSalida: salida.idSalida, habilitado: true, estado: 'Programada' } }
    );

    // Correos "tu paquete ya va en camino" (cliente) / "tienes un paquete en
    // camino" (destinatario) -- se disparan justo acá, cuando la salida
    // REALMENTE arranca (no al registrar la venta, que puede quedar programada
    // para varios días después y dejaría "ya va en camino" siendo falso). Nunca
    // debe bloquear el cambio de estado si Brevo falla -- ver config/email.js,
    // mismo patrón fire-and-forget que el resto de correos transaccionales.
    // 2026-09-18: además de no fallar, ahora TAMPOCO hace esperar: antes el
    // `await` de cada correo (hasta 2 por venta, uno tras otro) dejaba la
    // respuesta del cambio de estado colgada mientras Brevo respondía -- con muchas
    // ventas en la salida eso se notaba. Se dispara en segundo plano; el try/catch
    // de adentro atrapa todo, así que la promesa nunca rechaza sin manejar.
    const idSalidaCorreos = salida.idSalida;
    const origenCorreos = salida.origen;
    const destinoMunicipio = salida.ruta?.destino?.municipio || '';
    (async () => {
    try {
      const { sendPaqueteEnviadoEmail, sendPaquetePorRecibirEmail } = require('../config/email');
      const ventasEnviadas = await EncomiendaVenta.findAll({
        where: { idSalida: idSalidaCorreos, habilitado: true, estado: 'En Ruta' },
        include: [
          { model: Cliente, as: 'cliente', attributes: ['nombre', 'apellido', 'email'] },
          { model: Destinatario, as: 'destinatario', attributes: ['nombreDestinatario', 'correoDestinatario'] },
        ],
      });
      for (const venta of ventasEnviadas) {
        if (venta.cliente?.email) {
          try {
            await sendPaqueteEnviadoEmail(venta.cliente.email, {
              nombreCliente: `${venta.cliente.nombre} ${venta.cliente.apellido}`.trim(),
              numeroGuia: venta.numeroGuia,
              destinoMunicipio,
              fechaEstimadaEntrega: venta.fechaEstimadaEntrega,
            });
          } catch (error) {
            console.error(`No se pudo enviar el correo de "paquete enviado" (venta #${venta.idEncomiendaVenta}):`, error.message);
          }
        }
        if (venta.destinatario?.correoDestinatario) {
          try {
            await sendPaquetePorRecibirEmail(venta.destinatario.correoDestinatario, {
              nombreDestinatario: venta.destinatario.nombreDestinatario,
              numeroGuia: venta.numeroGuia,
              origenMunicipio: origenCorreos,
              fechaEstimadaEntrega: venta.fechaEstimadaEntrega,
            });
          } catch (error) {
            console.error(`No se pudo enviar el correo de "paquete por recibir" (venta #${venta.idEncomiendaVenta}):`, error.message);
          }
        }
      }
    } catch (error) {
      console.error(`No se pudieron enviar los correos de salida "En Ruta" (salida #${idSalidaCorreos}):`, error.message);
    }
    })();
  }

  if ((estado === 'Completada' || estado === 'Cancelada') && salida.estado === 'En Ruta') {
    for (const par of pares) {
      await Vehiculo.update({ estado: 'Disponible' }, { where: { idVehiculo: par.idVehiculo } });
      await Conductor.update({ estado: 'Disponible' }, { where: { idConductor: par.idConductor } });
    }
  }

  if (estado === 'Completada') {
    const ventasActivas = await EncomiendaVenta.findAll({
      where: { idSalida: salida.idSalida, habilitado: true, estado: 'En Ruta' },
      include: [{ model: Paquete, as: 'paquetes' }],
    });

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
          descripcion: `La venta con guía ${venta.numeroGuia || 'sin guía'} tiene paquetes sin dejar en la sede`,
        })),
        'PACKAGES_PENDING'
      );
    }

    for (const venta of ventasActivas) {
      await venta.update({
        estado: determinarEstadoEncomienda(venta.paquetes, venta.estado),
        estadoPago: determinarEstadoPago(venta.paquetes, venta.estadoPago),
      });
    }

    if (salida.estado === 'En Ruta') {
      const idDestinoActual = salida.idSalidaIda ? null : salida.ruta.idDestino;
      for (const par of pares) {
        await Vehiculo.update({ idDestinoActual }, { where: { idVehiculo: par.idVehiculo } });
        await Conductor.update({ idDestinoActual }, { where: { idConductor: par.idConductor } });
      }
    }
  }

  if (estado === 'Cancelada') {
    const ventas = await EncomiendaVenta.findAll({
      where: { idSalida: salida.idSalida, habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
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
  }

  salida.estado = estado;
  await salida.save();
  return getById(id);
};

const toggleHabilitado = async (id, { rol, idSede } = {}) => {
  const salida = await SalidaProgramada.findByPk(id, {
    include: [INCLUDE_PARES, { model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino' }] }],
  });
  if (!salida) throw new AppError('Salida no encontrada', 404);

  if (salida.idSalidaIda) {
    const ida = await SalidaProgramada.findByPk(salida.idSalidaIda, { include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }] });
    if (rol === 'operador_sede') {
      if (!ida || ida.ruta?.idDestino !== idSede) {
        throw new AppError('Esa salida no es un regreso de tu sede', 403);
      }
    } else if (ida?.ruta && await tieneOperadorSedePropio(ida.ruta.idDestino)) {
      throw new AppError('Esta salida es el regreso de una sede con operador propio — solo esa sede puede inhabilitarla.', 403);
    }
  } else if (rol === 'operador_sede') {
    throw new AppError('No tienes permiso para inhabilitar esta salida', 403);
  }

  if (salida.habilitado === true) {
    if (salida.estado === 'En Ruta') {
      throw new AppError(
        'No se puede inhabilitar esta salida porque está en curso. Complétala o cancélala primero.',
        409,
        [{ tipo: 'Salida activa', id: salida.idSalida, idRuta: salida.ruta?.idRuta ?? null, descripcion: 'Esta salida está "En Ruta" y no ha finalizado' }],
        'DEPENDENCY_CONFLICT'
      );
    }

    const { bloqueado, dependencias } = await verificarDependenciasSalida(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar esta salida porque tiene encomiendas activas',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  const seCancelaPorFechaVencida = salida.habilitado === false && salida.estado === 'Programada'
    && motivoSalidaVencida(salida) !== null;

  salida.habilitado = !salida.habilitado;
  if (seCancelaPorFechaVencida) salida.estado = 'Cancelada';
  await salida.save();
  return { ruta: salida, seCancelaPorFechaVencida };
};

const getAniosDisponibles = async ({ rol, idSede } = {}) => {
  const condicionSede = rol === 'operador_sede'
    ? `WHERE (
        r.id_destino = ${parseInt(idSede)}
        OR s.id_salida_ida IN (
          SELECT s2.id_salida FROM salida_programada s2 JOIN ruta r2 ON r2.id_ruta = s2.id_ruta WHERE r2.id_destino = ${parseInt(idSede)}
        )
      )`
    : '';
  const rows = await sequelize.query(
    `SELECT DISTINCT EXTRACT(YEAR FROM s.fecha_salida)::int AS anio FROM salida_programada s JOIN ruta r ON r.id_ruta = s.id_ruta ${condicionSede} ORDER BY anio DESC`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => r.anio);
};

// idRuta: la pantalla de Salidas SIEMPRE está scoped a una plantilla
// (/transporte/rutas/:idRuta/salidas -- ver ListarSalidaProgramada.jsx), así que
// "cuántas salidas hay antes que esta" tiene que contarse dentro de ESE mismo
// conjunto, no contra la tabla completa -- si no, con pocas salidas en la ruta pero
// muchas en el sistema, el cálculo devuelve una página que no existe en la vista
// filtrada (ej. página 3 de una lista de 3 salidas con limit=5) y la tabla se ve
// vacía aunque haya resultados; con un limit más grande a veces "se arregla" solo
// porque cambiar filas por página resetea a la página 1, no porque el cálculo haya
// quedado bien.
const getPageOf = async (id, { limit = 10, idRuta, regresoDeRuta, rol, idSede } = {}) => {
  const record = await SalidaProgramada.findByPk(id, { attributes: ['idSalida'] });
  if (!record) throw new AppError('Salida no encontrada', 404);
  const where = { idSalida: { [Op.gt]: parseInt(id) } };
  if (idRuta) where.idRuta = idRuta;
  // Mismo criterio que buildRutaWhere -- la vista "Rutas de regreso" cuenta contra
  // el conjunto de regresos de ESA ruta, no contra sus idas (que es lo que daría
  // `idRuta` directo, siempre la plantilla compartida "Medellín" para un regreso).
  if (regresoDeRuta) {
    where.idSalidaIda = { [Op.in]: sequelize.literal(`(SELECT id_salida FROM salida_programada WHERE id_ruta = ${parseInt(regresoDeRuta)})`) };
  }
  if (rol === 'operador_sede') {
    where[Op.and] = [buildSedeCondition(idSede)];
    const visible = await SalidaProgramada.findOne({ where: { idSalida: id, [Op.and]: [buildSedeCondition(idSede)] }, attributes: ['idSalida'] });
    if (!visible) throw new AppError('No tienes acceso a esta salida', 403);
  }
  const before = await SalidaProgramada.count({ where });
  const page = Math.floor(before / limit) + 1;
  const row = (before % limit) + 1;
  return { page, row };
};

// Devuelve, para la lista de vehículos/conductores dada, todas las salidas activas
// (Programada/En Ruta) que ya los tienen asignados — materia prima del calendario de
// disponibilidad al registrar/editar una salida.
const getDisponibilidad = async ({ idVehiculos = [], idConductores = [], idSalidaExcluir } = {}) => {
  if (idVehiculos.length === 0 && idConductores.length === 0) return [];

  const or = [];
  if (idVehiculos.length) or.push({ idVehiculo: { [Op.in]: idVehiculos } });
  if (idConductores.length) or.push({ idConductor: { [Op.in]: idConductores } });

  const pares = await SalidaVehiculoConductor.findAll({
    where: {
      habilitado: true,
      [Op.or]: or,
      ...(idSalidaExcluir ? { idSalida: { [Op.ne]: idSalidaExcluir } } : {}),
    },
    include: [
      {
        model: SalidaProgramada,
        as: 'salida',
        required: true,
        where: { habilitado: true, estado: { [Op.in]: ['Programada', 'En Ruta'] } },
        // horaSalida + idSalidaIda: el frontend (useDisponibilidadPares) los necesita
        // para replicar la proyección de validarUbicacionParaRuta -- de las ocupaciones
        // que arrancan antes que la candidata, cuál es la más tardía y si esa es un
        // regreso (idSalidaIda) o no.
        attributes: ['idSalida', 'origen', 'estado', 'fechaSalida', 'horaSalida', 'fechaLlegadaEstimada', 'idSalidaIda'],
        include: [{ model: Ruta, as: 'ruta', attributes: ['idRuta', 'idDestino'], include: [{ model: Destino, as: 'destino', attributes: ['municipio', 'departamento'] }] }],
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
    idSalida: p.salida.idSalida,
    idRuta: p.salida.ruta?.idRuta ?? null,
    origen: p.salida.origen,
    destino: p.salida.ruta?.destino ? { municipio: p.salida.ruta.destino.municipio, departamento: p.salida.ruta.destino.departamento } : null,
    estado: p.salida.estado,
    fechaSalida: p.salida.fechaSalida,
    horaSalida: p.salida.horaSalida,
    fechaLlegadaEstimada: p.salida.fechaLlegadaEstimada,
    idSalidaIda: p.salida.idSalidaIda,
    idVehiculo: p.idVehiculo,
    placa: p.vehiculo?.placa || null,
    idConductor: p.idConductor,
    conductorNombre: p.conductor?.usuario ? `${p.conductor.usuario.nombre} ${p.conductor.usuario.apellido}` : null,
  }));
};

// FUNCIÓN NUEVA (Fase 3, regla de negocio acordada explícitamente): un conductor o
// vehículo está "ocupado en un ciclo activo" si (a) tiene un par habilitado en una
// SalidaProgramada Programada/En Ruta, o (b) su ida ya está Completada pero el
// regreso enlazado sigue Programada/En Ruta -- el ciclo completo (ida+vuelta) tiene
// que cerrar (Completada/Cancelada en ambos tramos) antes de considerarlo libre.
//
// DECISIÓN DE DISEÑO: se acepta {idConductor, idVehiculo} (cualquiera de los dos, o
// ambos) en vez de dos funciones separadas, porque así lo llaman hoy
// validarUbicacionParaRuta/validarChoqueVehiculoConductor (siempre resuelven
// vehículo y conductor del mismo par a la vez). Se expone también para que
// conductorService/vehiculoService puedan filtrar sus listas: la forma más simple,
// dado que ambos servicios ya exponen getAll con filtros por query string, es un
// filtro opcional `?disponibles=true` que excluye a quien esta función marque como
// ocupado (ver conductorService.getAll/vehiculoService.getAll).
const estaOcupadoEnCicloActivo = async ({ idConductor, idVehiculo } = {}) => {
  if (!idConductor && !idVehiculo) return false;
  const or = [];
  if (idVehiculo) or.push({ idVehiculo });
  if (idConductor) or.push({ idConductor });

  const enCurso = await SalidaVehiculoConductor.count({
    where: { habilitado: true, [Op.or]: or },
    include: [{
      model: SalidaProgramada, as: 'salida', required: true,
      where: { estado: { [Op.in]: ['Programada', 'En Ruta'] } },
    }],
  });
  if (enCurso > 0) return true;

  // Si el par vive en una IDA ya Completada, sigue "ocupado" mientras su regreso no
  // cierre (Completada/Cancelada) — el convoy sigue fuera de base.
  const idaConRegresoAbierto = await SalidaVehiculoConductor.count({
    where: { habilitado: true, [Op.or]: or },
    include: [{
      model: SalidaProgramada, as: 'salida', required: true,
      where: { estado: 'Completada', idSalidaIda: null },
      include: [{ model: SalidaProgramada, as: 'salidaRegreso', required: true, where: { estado: { [Op.in]: ['Programada', 'En Ruta'] } }, attributes: ['idSalida'] }],
    }],
  });
  return idaConRegresoAbierto > 0;
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
  tienePaquetesPendientes,
  intentarAutoCompletar,
  crearRegresoDesdeSede,
  estaOcupadoEnCicloActivo,
};
