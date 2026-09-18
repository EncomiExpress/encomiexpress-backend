const { EncomiendaVenta, Destinatario, Paquete, PaqueteEntregaFinal, Cliente, SalidaProgramada, SalidaVehiculoConductor, Ruta, Vehiculo, Conductor, Destino, Usuario, UsuarioSede, Configuracion, sequelize } = require('../models');
const AppError = require('../errors/appError');
const crypto = require('crypto');
const { normalizarEstadoPaquete, determinarEstadoEncomienda, determinarEstadoPago } = require('./paqueteStateUtils');
const { sendPaqueteDevueltoEmail } = require('../config/email');
const { MAX_DIAS_ANTICIPACION } = require('../utils/horarioLaboral');
const { repartirTotalEntrePaquetes } = require('../utils/repartoTotal');

const MODALIDADES_RECAUDO_VALIDAS = ['Pago Inmediato', 'Contraentrega'];
// Póliza de seguro opcional sobre el valor declarado de la mercancía (1%), por
// paquete individual -- decisión de negocio confirmada por el cliente (P5).
const PORCENTAJE_POLIZA = 0.01;

// El valor declarado lo captura el remitente en el wizard, pero el 1% de la
// póliza SIEMPRE se calcula acá, nunca se confía en un valorPoliza que llegue en
// el body -- así nadie puede manipular el monto de la póliza desde el payload.
// Sin valor declarado (o 0/negativo), ambos campos quedan NULL: la póliza es
// opcional y no aplica.
const resolverPoliza = (pkg) => {
  const valorDeclarado = pkg.valorDeclarado != null && pkg.valorDeclarado !== '' ? parseFloat(pkg.valorDeclarado) : null;
  if (!valorDeclarado || valorDeclarado <= 0) return { valorDeclarado: null, valorPoliza: null };
  return { valorDeclarado, valorPoliza: Math.round(valorDeclarado * PORCENTAJE_POLIZA * 100) / 100 };
};

// Parte del total de la venta que le toca a cada paquete (Paquete.valorCobro), en el
// mismo orden que `paquetes`. La venta guarda un solo total, pero el distribuidor
// entrega y cobra paquete por paquete -- ver utils/repartoTotal.js para la regla. Usa
// las tarifas vigentes (por kg y por paquete de Configuracion, y la base del destino
// de la salida) solo como pesos relativos entre los paquetes: la suma siempre es el
// total, aunque haya sido editado a mano. Cada paquete necesita peso/dimensiones/
// tipoCarga/valorPoliza.
const calcularValoresCobro = async ({ total, paquetes, salida, transaction }) => {
  const configuracion = await Configuracion.findOne({ where: { id: 1 }, transaction });
  const destino = salida?.ruta?.idDestino
    ? await Destino.findByPk(salida.ruta.idDestino, { attributes: ['idDestino', 'tarifaBase'], transaction })
    : null;
  return repartirTotalEntrePaquetes(total, paquetes, {
    tarifaBase: destino?.tarifaBase,
    tarifaPorKgHierro: configuracion?.tarifaPorKgHierro,
    tarifaPorKgNormal: configuracion?.tarifaPorKgNormal,
    tarifaPorPaquete: configuracion?.tarifaPorPaquete,
  });
};
// Tope de la "novedad"/observación de un paquete en Entrega en dos fases — mismo
// valor que ya usa "Observaciones" en Ruta/Venta (ver rutasValidator.js/
// salidasValidator.js), aunque acá no hay un validators/paquetesValidator.js: este
// módulo valida a mano en el controller/servicio, no vía express-validator (gap
// preexistente, no se creó uno nuevo solo para esto).
const NOVEDAD_MAX_LENGTH = 500;

const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

// La fecha estimada de entrega de un paquete no puede caer antes de que el vehículo
// llegue a su destino — no tiene sentido prometer una entrega antes de que la salida
// esté físicamente allá. Tope superior: MAX_DIAS_ANTICIPACION (90) días desde hoy,
// mismo horizonte y misma constante que ya limita fechaSalida/fechaLlegadaEstimada de
// una SalidaProgramada (ver salidaProgramadaService.validarHorarioRuta) — sin este
// tope alguien podía dejar "prometida" una entrega a meses/años vista. Si
// salida.fechaLlegadaEstimada es null (salida creada antes de esta validación), el
// mínimo se cae al de un día después de la salida.
const validarFechaEntrega = (fechaEstimadaEntrega, salida) => {
  if (!fechaEstimadaEntrega || !salida.fechaSalida) return;
  // "Hoy" en hora Colombia — mismo patrón que salidaProgramadaService.validarHorarioRuta,
  // para que el tope no dependa de en qué zona horaria corre el servidor (Render corre
  // en UTC).
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const maxPermitido = sumarDias(hoy, MAX_DIAS_ANTICIPACION);
  if (fechaEstimadaEntrega > maxPermitido) {
    throw new AppError(`La fecha estimada de entrega no puede ser más de ${MAX_DIAS_ANTICIPACION} días a partir de hoy (máximo el ${maxPermitido})`, 400);
  }
  if (salida.fechaLlegadaEstimada) {
    if (fechaEstimadaEntrega < salida.fechaLlegadaEstimada) {
      throw new AppError(`La fecha estimada de entrega debe ser igual o posterior a la llegada de la ruta (mínimo el ${salida.fechaLlegadaEstimada})`, 400);
    }
    return;
  }
  const minima = sumarDias(salida.fechaSalida, 1);
  if (fechaEstimadaEntrega < minima) {
    throw new AppError(`La fecha estimada de entrega debe ser al menos un día después de la salida de la ruta (mínimo el ${minima})`, 400);
  }
};

// Una venta solo puede quedar asignada/reactivada sobre una salida que de verdad la
// pueda transportar: tiene que seguir "Programada" (no haber salido, terminado o
// sido cancelada) Y seguir habilitada (una salida puede quedar inhabilitada —
// soft-delete — sin que su `estado` deje de decir "Programada", son dos campos
// independientes). Usado en create()/update() y en toggleHabilitado() al
// rehabilitar — ver LOGICA.md, "Ventas — Cancelada e inhabilitar/habilitar".
const salidaSigueSirviendo = (salida) => !!salida && salida.estado === 'Programada' && salida.habilitado !== false;

// Una salida ahora puede tener varios pares vehículo+conductor (convoy) — este
// include se reutiliza en todas las consultas que devuelven una venta con su salida,
// para que el frontend pueda mostrar el vehículo/conductor correcto de cada paquete
// (ya no hay uno solo por salida). Mismo patrón que INCLUDE_PARES en
// salidaProgramadaService.js.
const INCLUDE_PARES = {
  model: SalidaVehiculoConductor,
  as: 'paresVehiculoConductor',
  where: { habilitado: true },
  required: false,
  // separate: true -- una salida con convoy (2+ pares) multiplicaba filas a nivel
  // SQL dentro de SALIDA_INCLUDE. En getAll(), paginado con LIMIT/OFFSET y
  // subQuery:false, esas filas de más se comían cupo de la página (ver LOGICA.md,
  // "getAll de Ventas devolvía páginas cortas por el convoy, getPageOf quedaba
  // desincronizado").
  separate: true,
  include: [
    { model: Vehiculo, as: 'vehiculo' },
    { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
  ],
};

const SALIDA_INCLUDE = {
  model: SalidaProgramada,
  as: 'salida',
  required: false,
  include: [
    INCLUDE_PARES,
    // La plantilla (idDestino) -- ya no vive en la propia fila de la salida.
    { model: Ruta, as: 'ruta', required: false, include: [{ model: Destino, as: 'destino', required: false }] },
    // Liviano a propósito (solo estado) — el panel web lo usa para saber si puede
    // ofrecer "Marcar devuelto a Medellín" sobre un paquete No entregado de esta
    // venta (Parte B, plan-ventas-regreso-paquetes.md): solo mientras el regreso de
    // ESTA ida está "En Ruta".
    { model: SalidaProgramada, as: 'salidaRegreso', required: false, attributes: ['idSalida', 'estado'] },
  ],
};

// Vehículo/conductor específico de CADA paquete (una venta puede repartir sus paquetes
// entre varios vehículos de la misma salida) — usado por la guía PDF y por el detalle de venta.
const paqueteIncludeConAsignacion = (extra = {}) => ({
  model: Paquete,
  as: 'paquetes',
  include: [
    {
      model: SalidaVehiculoConductor,
      as: 'asignacion',
      required: false,
      include: [
        { model: Vehiculo, as: 'vehiculo', required: false },
        { model: Conductor, as: 'conductor', required: false, include: [{ model: Usuario, as: 'usuario', required: false }] },
      ],
    },
  ],
  ...extra,
});

// Genera numeroGuia por año (EE-2026-483920), uno POR VENTA (no por paquete, ver
// migración 005) — una venta puede tener varios paquetes, pero todos comparten
// esta misma guía.
//
// Los 6 dígitos son ALEATORIOS, no un contador visible — un número secuencial revela
// cuántos envíos se han hecho y en qué orden, algo que no hace falta exponer. Como el
// espacio de 6 dígitos (1.000.000 de valores) es finito, se verifica que no exista ya
// y se reintenta unas pocas veces en el caso (raro) de que choque con uno existente.
// pg_advisory_xact_lock serializa este paso entre transacciones concurrentes del mismo
// año, para que dos ventas nunca puedan "reservar" el mismo número al mismo tiempo;
// se libera solo al terminar la transacción completa.
const generarNumeroGuia = async (transaction) => {
  // Año en hora Colombia, no la del servidor (Render corre en UTC) — sin esto, la
  // última noche del año (7pm-medianoche hora Colombia) ya generaría guías con el
  // año siguiente.
  const anio = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 4);

  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', {
    replacements: { clave: `guia-${anio}` },
    transaction,
  });

  for (let intento = 0; intento < 5; intento++) {
    const secuencia = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const numeroGuia = `EE-${anio}-${secuencia}`;
    const existente = await EncomiendaVenta.findOne({ where: { numeroGuia }, transaction });
    if (!existente) return numeroGuia;
  }

  throw new AppError('No se pudo generar un número de guía único, intenta de nuevo.', 500);
};

// "numeroGuia" es columna propia de encomienda_venta (P12) — un sort/campo normal,
// sin subquery correlacionada (antes había que ir a buscar la guía del paquete más
// antiguo de cada venta).
const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaRegistro', 'estado', 'estadoPago', 'numeroGuia', 'idEncomiendaVenta', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaRegistro';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, cuando varias filas comparten el mismo valor en "field"
  // (ej. mismo fechaRegistro, mismo estado), Postgres puede devolverlas en distinto orden
  // relativo según el LIMIT/OFFSET de cada consulta — se ve como que una fila "salta" de
  // posición al cambiar el tamaño de página, aunque nada haya cambiado en los datos.
  if (field === 'idEncomiendaVenta') return [[field, direction]];
  return [[field, direction], ['idEncomiendaVenta', direction]];
};

const getAll = async ({ estado, idCliente, idSalida, habilitado, estadoPago, modalidadRecaudo, q, page = 1, limit = 10, sortBy, rol, idSede } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (idCliente) where.idCliente = idCliente;
  if (idSalida) where.idSalida = parseInt(idSalida);
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estadoPago) where.estadoPago = estadoPago;
  if (modalidadRecaudo) where.modalidadRecaudo = modalidadRecaudo;
  // "Solo lo mío" para operador_sede — filtra por quién registró la venta. Un
  // listado nuevo empieza vacío. Ver LOGICA.md, "Sedes remotas".
  if (rol === 'operador_sede') where.idSede = idSede;

  if (q) {
    const { Op } = sequelize.Sequelize;
    const trimmed = q.trim();
    const conditions = [
      { numeroGuia: { [Op.iLike]: `%${trimmed}%` } },
      { estado: { [Op.iLike]: `%${trimmed}%` } },
      { estadoPago: { [Op.iLike]: `%${trimmed}%` } },
      { '$cliente.nombre$': { [Op.iLike]: `%${trimmed}%` } },
      { '$cliente.apellido$': { [Op.iLike]: `%${trimmed}%` } },
      { '$salida.origen$': { [Op.iLike]: `%${trimmed}%` } },
      // Destino final de la VENTA (el del destinatario), que es lo que se ve en la
      // columna "Destino" del listado.
      { '$destinatario.destino.municipio$': { [Op.iLike]: `%${trimmed}%` } },
      { '$destinatario.destino.departamento$': { [Op.iLike]: `%${trimmed}%` } },
    ];
    const partes = trimmed.split(/\s+/).filter(Boolean);
    if (partes.length > 1) {
      const primero = `%${partes[0]}%`;
      const resto = `%${partes.slice(1).join(' ')}%`;
      conditions.push({ [Op.and]: [{ '$cliente.nombre$': { [Op.iLike]: primero } }, { '$cliente.apellido$': { [Op.iLike]: resto } }] });
      conditions.push({ [Op.and]: [{ '$cliente.apellido$': { [Op.iLike]: primero } }, { '$cliente.nombre$': { [Op.iLike]: resto } }] });
    }

    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const { count, rows: data } = await EncomiendaVenta.findAndCountAll({
    where,
    include: [
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'sedeRegistro' }] },
      SALIDA_INCLUDE,
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion({ separate: true }),
    ],
    limit,
    offset,
    order: order.length > 0 ? order : [['fechaRegistro', 'DESC'], ['idEncomiendaVenta', 'DESC']],
    distinct: true,
    subQuery: false,
  });

  // Para cada venta con algún paquete "Devuelto", ¿su sede tiene ahora mismo un
  // regreso "En Ruta"? Lo usa ModalConsultarVenta.jsx para el botón "Marcar
  // devuelto a Medellín" — ver idsDestinoConRegresoActivo.
  const idsDestinoDevuelto = [...new Set(
    data
      .filter((v) => (v.paquetes || []).some((p) => p.estado === 'Devuelto'))
      .map((v) => v.destinatario?.idDestino)
      .filter((id) => id != null)
  )];
  if (idsDestinoDevuelto.length > 0) {
    const sedesConRegreso = await idsDestinoConRegresoActivo(idsDestinoDevuelto);
    data.forEach((v) => {
      if (v.destinatario?.idDestino != null) {
        v.dataValues.regresoActivoDesdeSede = sedesConRegreso.has(v.destinatario.idDestino);
      }
    });
  }

  return { data, total: count };
};

const getById = async (id, { rol, idSede } = {}) => {
  const encomienda = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'sedeRegistro' }] },
      SALIDA_INCLUDE,
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
    ],
  });

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }

  if (rol === 'operador_sede' && encomienda.idSede !== idSede) {
    throw new AppError('No tienes acceso a esta venta', 403);
  }

  if (encomienda.destinatario?.idDestino != null && (encomienda.paquetes || []).some((p) => p.estado === 'Devuelto')) {
    const sedesConRegreso = await idsDestinoConRegresoActivo([encomienda.destinatario.idDestino]);
    encomienda.dataValues.regresoActivoDesdeSede = sedesConRegreso.has(encomienda.destinatario.idDestino);
  }

  return encomienda;
};

// Suma el peso de los paquetes ya asignados a un par vehículo+conductor específico (sin
// contar ventas canceladas ni inhabilitadas, ni, si se indica, la propia venta que se
// está editando) — usado para saber cuánta capacidad de ESE vehículo ya está ocupada
// antes de aceptar un paquete nuevo. A diferencia del modelo anterior (capacidad por
// ruta completa), ahora cada vehículo del convoy tiene su propio cupo independiente.
const getPesoUsadoEnPar = async (idSalidaVehiculoConductor, excluirIdEncomienda, transaction) => {
  const { Op } = sequelize.Sequelize;
  const ventaWhere = { habilitado: true, estado: { [Op.ne]: 'Cancelada' } };
  if (excluirIdEncomienda) {
    ventaWhere.idEncomiendaVenta = { [Op.ne]: excluirIdEncomienda };
  }
  const paquetes = await Paquete.findAll({
    where: { idSalidaVehiculoConductor },
    include: [{ model: EncomiendaVenta, as: 'encomienda', where: ventaWhere, attributes: [] }],
    attributes: ['peso'],
    transaction,
  });
  return paquetes.reduce((sum, p) => sum + parseFloat(p.peso || 0), 0);
};

// Valida la capacidad de cada vehículo usado por los paquetes de la venta, no la
// salida completa: cada paquete trae su propio idSalidaVehiculoConductor (a cuál
// vehículo del convoy va), se agrupan por ese campo y se valida cada uno contra la
// capacidad de SU vehículo. También confirma que el par elegido de verdad pertenezca
// a la salida indicada.
const validarCapacidadPares = async (idSalida, paquetes, transaction, excluirIdEncomienda) => {
  const pesoNuevoPorPar = new Map();
  for (const pkg of (paquetes || [])) {
    const idPar = pkg.idSalidaVehiculoConductor;
    if (!idPar) continue;
    pesoNuevoPorPar.set(idPar, (pesoNuevoPorPar.get(idPar) || 0) + parseFloat(pkg.peso || 0));
  }

  for (const [idSalidaVehiculoConductor, pesoNuevo] of pesoNuevoPorPar) {
    const par = await SalidaVehiculoConductor.findOne({
      where: { idSalidaVehiculoConductor, habilitado: true },
      include: [{ model: Vehiculo, as: 'vehiculo' }],
      transaction,
    });
    if (!par || par.idSalida !== idSalida) {
      throw new AppError('El vehículo/conductor elegido no pertenece a esta ruta', 400);
    }
    if (!par.vehiculo || !par.vehiculo.capacidad) continue;

    const pesoUsado = await getPesoUsadoEnPar(idSalidaVehiculoConductor, excluirIdEncomienda, transaction);
    const capacidad = parseFloat(par.vehiculo.capacidad);
    const disponible = capacidad - pesoUsado;

    if (pesoNuevo > disponible) {
      // No hacemos rollback aquí — el try/catch de create()/update() ya lo hace al
      // capturar este error. Llamarlo dos veces revienta con "Transaction cannot be
      // rolled back because it has been finished with state: rollback".
      throw new AppError(
        `El vehículo ${par.vehiculo.placa} ya no tiene espacio suficiente en esta ruta. Quedan ${disponible.toFixed(2)} kg disponibles y estos paquetes pesan ${pesoNuevo.toFixed(2)} kg.`,
        400
      );
    }
  }
};

// Rutas directas: el municipio de destino de la venta tiene que ser EXACTAMENTE el
// destino final de la salida (que vive en su plantilla, compartido por todo el
// convoy) — ya no hay paradas intermedias que puedan cubrir un municipio distinto.
// Esto es un chequeo GENERAL de "esta salida sirve para ese municipio" (usado antes
// de saber a qué par en particular se le va a asignar cada paquete, o en
// rutaCubreDestinoVenta donde no hay paquetes de por medio).
const validarRutaLlegaAlDestino = async (salida, idDestinoVenta) => {
  if (!idDestinoVenta || idDestinoVenta === salida.ruta?.idDestino) return;
  throw new AppError('La ruta elegida no llega al municipio de destino de la venta', 400);
};

// Validación fina POR PAQUETE: con rutas directas, todos los pares del convoy de una
// misma salida llegan al mismo (único) destino final, así que basta con
// validarRutaLlegaAlDestino a nivel de salida — no hace falta distinguir por par.

// Versión booleana de salidaSigueSirviendo() + validarRutaLlegaAlDestino() juntas,
// para los caminos que NO están asignando una salida nueva (ahí sí tiene sentido
// lanzar el error de validarRutaLlegaAlDestino tal cual) sino decidiendo si una
// venta puede volver a "Programada" con la salida que YA tenía (rehabilitar,
// reactivar). Antes esos dos caminos solo miraban salidaSigueSirviendo() -- si la
// salida en sí seguía sana (Programada + habilitada) la venta volvía a Programada
// sin más, aunque esa salida ya no pasara por el municipio de esta venta (se le
// cambió el destino final en una edición posterior, ver "Tercer motivo de
// Cancelada" en LOGICA.md).
const rutaCubreDestinoVenta = async (salida, idDestinoVenta) => {
  if (!salidaSigueSirviendo(salida)) return false;
  try {
    await validarRutaLlegaAlDestino(salida, idDestinoVenta);
    return true;
  } catch {
    return false;
  }
};

// Un regreso solo transporta ventas nuevas cuando lo registra el operador_sede de la
// sede desde la que ESE regreso sale (WS5, "Sedes remotas") — el destino de la ida
// que enlaza es justo esa sede (ahora vía la plantilla de la ida). Para cualquier
// otro caller (admin incluido) un regreso sigue sin transportar ventas nuevas (ver
// LOGICA.md, "Ventas — no se puede asignar una venta a un viaje de regreso").
const esRegresoDeLaSede = async (salida, idSede, transaction) => {
  if (!salida.idSalidaIda || idSede === undefined) return false;
  const salidaIda = await SalidaProgramada.findByPk(salida.idSalidaIda, {
    include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }],
    transaction,
  });
  return salidaIda?.ruta?.idDestino === idSede;
};

// ¿Cuáles de estos municipios (destinos) tienen AHORA MISMO algún regreso "En Ruta"
// saliendo de ahí (su destino final, origen del regreso)? Usado para "Marcar
// devuelto a Medellín" (Parte B) -- corte geográfico, no por ida
// específica (ver registrarDevolucionPaquete/getPaquetesRetornoConductor, y
// LOGICA.md, "Paquetes de retorno — corte por sede, no por ida", 2026-09-13).
const idsDestinoConRegresoActivo = async (idsDestino) => {
  if (!idsDestino || idsDestino.length === 0) return new Set();
  const { Op } = sequelize.Sequelize;
  const regresos = await SalidaProgramada.findAll({
    where: { estado: 'En Ruta', idSalidaIda: { [Op.ne]: null } },
    include: [{
      model: SalidaProgramada, as: 'salidaIda', required: true, attributes: ['idSalida'],
      include: [{ model: Ruta, as: 'ruta', required: true, attributes: ['idDestino'], where: { idDestino: { [Op.in]: idsDestino } } }],
    }],
    attributes: ['idSalida'],
  });
  const activos = new Set();
  for (const r of regresos) {
    if (r.salidaIda?.ruta) activos.add(r.salidaIda.ruta.idDestino);
  }
  return activos;
};

const create = async (data, { rol, idSede } = {}) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      idCliente,
      idSalida,
      fechaEstimadaEntrega,
      observaciones,
      total,
      modalidadRecaudo,
      destinatario,
      paquetes,
    } = data;

    const cliente = await Cliente.findByPk(idCliente);
    if (!cliente) {
      throw new AppError('Cliente no encontrado', 400);
    }

    if (!idSalida) {
      throw new AppError('La ruta es obligatoria', 400);
    }
    const salida = await SalidaProgramada.findByPk(idSalida, { include: [{ model: Ruta, as: 'ruta' }], transaction });
    if (!salida) {
      throw new AppError('Ruta no encontrada', 400);
    }
    // Mismo criterio que update(): una venta nueva solo puede nacer asignada a una
    // salida que siga sirviendo (Programada Y habilitada).
    if (!salidaSigueSirviendo(salida)) {
      throw new AppError('Solo se puede asignar la venta a una ruta que esté Programada', 400);
    }
    // Un viaje de regreso (salida.idSalidaIda) no transporta ventas nuevas — solo
    // lleva al convoy de vuelta a la base (y, a futuro, los paquetes no entregados
    // que regresan) — EXCEPTO cuando quien registra es el operador_sede de la sede
    // desde la que ese regreso sale (WS5, "Sedes remotas").
    const esVentaDeRegresoDeSede = salida.idSalidaIda && rol === 'operador_sede' && await esRegresoDeLaSede(salida, idSede, transaction);
    if (salida.idSalidaIda && !esVentaDeRegresoDeSede) {
      throw new AppError('No se puede asignar una venta a un viaje de regreso: elige una ruta de ida', 400);
    }
    // Si no mandan fecha estimada de entrega, se autocompleta con la llegada de la
    // salida (o salida+1 si no tiene llegada) — el mínimo permitido de todos modos,
    // así que siempre es válida.
    const fechaEstimadaEntregaFinal = fechaEstimadaEntrega
      || salida.fechaLlegadaEstimada
      || (salida.fechaSalida ? sumarDias(salida.fechaSalida, 1) : null);
    validarFechaEntrega(fechaEstimadaEntregaFinal, salida);

    if (!destinatario || !destinatario.idDestino) {
      throw new AppError('El municipio de destino del destinatario es obligatorio', 400);
    }
    const destinoDestinatario = await Destino.findByPk(destinatario.idDestino);
    if (!destinoDestinatario) {
      throw new AppError('El destino del destinatario no existe', 400);
    }
    // Contra el origen REAL de la salida elegida (salida.origen), no contra
    // Medellín a secas (A.1, plan-ventas-regreso-paquetes.md) — en una salida
    // normal el origen es Medellín, así que el comportamiento no cambia; en un
    // regreso el origen es el municipio de la sede.
    if (destinoDestinatario.municipio === salida.origen) {
      throw new AppError(`El destino del destinatario no puede ser ${salida.origen}: es el municipio de origen de esta ruta`, 400);
    }
    await validarRutaLlegaAlDestino(salida, destinatario.idDestino);

    if (paquetes && paquetes.length > 0) {
      for (const pkg of paquetes) {
        if (!pkg.idSalidaVehiculoConductor) {
          throw new AppError('Cada paquete debe tener un vehículo asignado', 400);
        }
      }
    }
    await validarCapacidadPares(idSalida, paquetes, transaction);

    if (
      modalidadRecaudo &&
      !MODALIDADES_RECAUDO_VALIDAS.some((v) => v.toLowerCase() === modalidadRecaudo.toLowerCase())
    ) {
      throw new AppError(`Modalidad de recaudo inválida. Opciones: ${MODALIDADES_RECAUDO_VALIDAS.join(', ')}`, 400);
    }

    const modalidadRecaudoResuelta = modalidadRecaudo
      ? (MODALIDADES_RECAUDO_VALIDAS.find((v) => v.toLowerCase() === modalidadRecaudo.toLowerCase()) || null)
      : null;
    // Pago Inmediato se cobra en el momento mismo del registro (no hay nada
    // pendiente por cobrar después, a diferencia de Contraentrega) — la venta y
    // cada uno de sus paquetes nacen "Pagado" directamente. Contraentrega nace
    // "Pendiente" en ambos niveles; el cobro real se resuelve por paquete en
    // registrarEntregaFinal. Ver paqueteStateUtils.determinarEstadoPago.
    const esPagoInmediato = modalidadRecaudoResuelta === 'Pago Inmediato';
    const estadoPagoResuelto = esPagoInmediato ? 'Pagada' : 'Pendiente';

    const encomienda = await EncomiendaVenta.create(
      {
        idCliente,
        idSalida,
        // Una sola guía por VENTA (P12) — todos los paquetes de esta venta la
        // comparten, no se genera una por paquete.
        numeroGuia: await generarNumeroGuia(transaction),
        fechaEstimadaEntrega: fechaEstimadaEntregaFinal || null,
        observaciones: observaciones || null,
        total: total || 0,
        modalidadRecaudo: modalidadRecaudoResuelta,
        estadoPago: estadoPagoResuelto,
        estado: 'Programada',
        // Nunca lo que mande el body — sale del contexto de sesión de quien
        // registra. Alimenta el filtro "solo lo mío" de Ventas (WS3).
        idSede: rol === 'operador_sede' ? idSede : null,
      },
      { transaction }
    );

    if (destinatario) {
      await Destinatario.create(
        {
          idEncomiendaVenta: encomienda.idEncomiendaVenta,
          idDestino: destinatario.idDestino,
          nombreDestinatario: destinatario.nombreDestinatario,
          tipoIdentificacionDestinatario: destinatario.tipoIdentificacionDestinatario || null,
          numeroIdentificacionDestinatario: destinatario.numeroIdentificacionDestinatario || null,
          telefonoDestinatario: destinatario.telefonoDestinatario || null,
          correoDestinatario: destinatario.correoDestinatario || null,
          direccionDestinatario: destinatario.direccionDestinatario || null,
        },
        { transaction }
      );
    }

    if (paquetes && paquetes.length > 0) {
      const polizas = paquetes.map(resolverPoliza);
      const valoresCobro = await calcularValoresCobro({
        total,
        paquetes: paquetes.map((pkg, i) => ({ ...pkg, valorPoliza: polizas[i].valorPoliza })),
        salida,
        transaction,
      });
      for (const [i, pkg] of paquetes.entries()) {
        const { valorDeclarado, valorPoliza } = polizas[i];
        await Paquete.create(
          {
            idEncomiendaVenta: encomienda.idEncomiendaVenta,
            idSalidaVehiculoConductor: pkg.idSalidaVehiculoConductor,
            descripcionContenido: pkg.descripcionContenido || null,
            peso: pkg.peso || null,
            alto: pkg.alto || null,
            ancho: pkg.ancho || null,
            profundidad: pkg.profundidad || null,
            tipoCarga: pkg.tipoCarga || 'normal',
            estadoPago: esPagoInmediato ? 'Pagado' : 'Pendiente',
            valorDeclarado,
            valorPoliza,
            valorCobro: valoresCobro[i],
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    const encomiendaCompleta = await EncomiendaVenta.findByPk(encomienda.idEncomiendaVenta, {
      include: [
        { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'sedeRegistro' }] },
        SALIDA_INCLUDE,
        { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
        paqueteIncludeConAsignacion(),
      ],
    });

    // P9, Notificación 2 — "tu encomienda fue registrada", al remitente y al
    // destinatario, apenas se guarda la venta (ya con la transacción confirmada).
    // Nunca debe bloquear el registro si Brevo falla — mismo patrón fire-and-forget
    // que el resto de correos transaccionales, ver config/email.js.
    try {
      const { sendEncomiendaRegistradaClienteEmail, sendEncomiendaRegistradaDestinatarioEmail } = require('../config/email');
      const destinoMunicipio = encomiendaCompleta.destinatario?.destino?.municipio || '';
      if (encomiendaCompleta.cliente?.email) {
        await sendEncomiendaRegistradaClienteEmail(encomiendaCompleta.cliente.email, {
          nombreCliente: `${encomiendaCompleta.cliente.nombre} ${encomiendaCompleta.cliente.apellido}`.trim(),
          numeroGuia: encomiendaCompleta.numeroGuia,
          destinoMunicipio,
          fechaEstimadaEntrega: encomiendaCompleta.fechaEstimadaEntrega,
        });
      }
      if (encomiendaCompleta.destinatario?.correoDestinatario) {
        await sendEncomiendaRegistradaDestinatarioEmail(encomiendaCompleta.destinatario.correoDestinatario, {
          nombreDestinatario: encomiendaCompleta.destinatario.nombreDestinatario,
          numeroGuia: encomiendaCompleta.numeroGuia,
          origenMunicipio: encomiendaCompleta.salida?.origen || '',
          fechaEstimadaEntrega: encomiendaCompleta.fechaEstimadaEntrega,
        });
      }
    } catch (error) {
      console.error(`No se pudo enviar el correo de "encomienda registrada" (venta #${encomienda.idEncomiendaVenta}):`, error.message);
    }

    return encomiendaCompleta;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const update = async (id, data, { rol, idSede } = {}) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      idSalida,
      fechaEstimadaEntrega,
      observaciones,
      total,
      modalidadRecaudo,
      habilitado,
      destinatario,
      paquetes,
    } = data;

    const encomienda = await EncomiendaVenta.findByPk(id);

    if (!encomienda) {
      throw new AppError('Encomienda no encontrada', 404);
    }
    // Mismo criterio que getById/getPageOf: operador_sede solo edita lo suyo.
    if (rol === 'operador_sede' && encomienda.idSede !== idSede) {
      throw new AppError('No tienes acceso a esta venta', 403);
    }

    // Cancelada sí se puede editar (a diferencia de antes) — es la forma de
    // reasignarle ruta/fecha, igual que una salida Cancelada. Ver LOGICA.md, "Ventas
    // — Cancelada e inhabilitar/habilitar".
    if (!['Programada', 'Cancelada'].includes(encomienda.estado)) {
      throw new AppError(`Esta venta ya está en estado "${encomienda.estado}": no se puede editar`, 400);
    }

    if (
      modalidadRecaudo &&
      !MODALIDADES_RECAUDO_VALIDAS.some((v) => v.toLowerCase() === modalidadRecaudo.toLowerCase())
    ) {
      throw new AppError(`Modalidad de recaudo inválida. Opciones: ${MODALIDADES_RECAUDO_VALIDAS.join(', ')}`, 400);
    }

    const parseDecimal = (value) => {
      if (value === undefined || value === null || value === '') return 0;
      return typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.')) || 0;
    };

    const nuevoTotal =
      total !== undefined
        ? parseDecimal(total)
        : parseDecimal(encomienda.total);

    // La ruta es obligatoria siempre — una venta nunca puede quedar sin ruta. Si se
    // manda idSalida en la petición tiene que ser un id válido; si no se manda, se
    // deja la que ya tenía.
    let nuevoIdSalida = encomienda.idSalida;
    if (idSalida !== undefined) {
      if (idSalida && !isNaN(parseInt(idSalida)) && parseInt(idSalida) > 0) {
        nuevoIdSalida = parseInt(idSalida);
      } else {
        throw new AppError('La ruta es obligatoria', 400);
      }
    }

    const salidaNueva = await SalidaProgramada.findByPk(nuevoIdSalida, { include: [{ model: Ruta, as: 'ruta' }], transaction });
    if (!salidaNueva) {
      throw new AppError('Ruta no encontrada', 400);
    }
    // Una venta solo puede quedar asignada a una salida que siga sirviendo — sin
    // esto, reactivar una Cancelada (o simplemente editar una Programada) podría
    // dejarla apuntando a una salida que ya salió, se completó, se canceló o quedó
    // inhabilitada, sin que nadie lo note. Ver LOGICA.md.
    if (!salidaSigueSirviendo(salidaNueva)) {
      throw new AppError('Solo se puede asignar la venta a una ruta que esté Programada', 400);
    }
    // Un viaje de regreso no transporta ventas nuevas — ver el mismo chequeo en
    // create(). Acá solo aplica si la salida REALMENTE está cambiando.
    const salidaCambio = nuevoIdSalida !== encomienda.idSalida;
    const esReasignacionARegresoDeLaSede = salidaCambio && salidaNueva.idSalidaIda && rol === 'operador_sede'
      && await esRegresoDeLaSede(salidaNueva, idSede, transaction);
    if (salidaCambio && salidaNueva.idSalidaIda && !esReasignacionARegresoDeLaSede) {
      throw new AppError('No se puede asignar una venta a un viaje de regreso: elige una ruta de ida', 400);
    }
    const nuevaFechaEstimadaEntrega = fechaEstimadaEntrega !== undefined ? fechaEstimadaEntrega : encomienda.fechaEstimadaEntrega;
    validarFechaEntrega(nuevaFechaEstimadaEntrega, salidaNueva);
    const destinatarioExistente = await Destinatario.findOne({ where: { idEncomiendaVenta: id }, transaction });

    // El destino efectivo (el que llega en el body, o el ya guardado) tiene que ser
    // el destino final de la salida nueva.
    const idDestinoEfectivo = (destinatario && destinatario.idDestino !== undefined)
      ? destinatario.idDestino
      : (destinatarioExistente ? destinatarioExistente.idDestino : null);
    await validarRutaLlegaAlDestino(salidaNueva, idDestinoEfectivo);

    if (paquetes && paquetes.length > 0) {
      for (const pkg of paquetes) {
        if (!pkg.idSalidaVehiculoConductor) {
          throw new AppError('Cada paquete debe tener un vehículo asignado', 400);
        }
      }
    }
    // Si esta venta no manda paquetes nuevos, se valida con los que ya tenía (no
    // están cambiando, pero igual cuentan para el peso de su vehículo).
    const paquetesParaValidar = paquetes && paquetes.length > 0
      ? paquetes
      : await Paquete.findAll({ where: { idEncomiendaVenta: id }, attributes: ['peso', 'idSalidaVehiculoConductor'], transaction });
    await validarCapacidadPares(nuevoIdSalida, paquetesParaValidar, transaction, parseInt(id));

    // Modalidad de recaudo: solo se puede llegar hasta acá (update no bloqueado)
    // mientras la venta sigue Programada/Cancelada, o sea antes de que cualquier
    // paquete haya salido de "Por entregar" — así que si la modalidad cambia, el
    // re-sync de Paquete.estadoPago de abajo siempre es "todos a Pagado" o "todos
    // a Pendiente", nunca hay estados intermedios que respetar. Ver PLAN_recaudo_
    // por_paquete.md, sección 9, punto 1.
    const modalidadRecaudoAnterior = encomienda.modalidadRecaudo;
    const modalidadRecaudoResuelta = modalidadRecaudo !== undefined
      ? (modalidadRecaudo ? MODALIDADES_RECAUDO_VALIDAS.find(v => v.toLowerCase() === modalidadRecaudo.toLowerCase()) || modalidadRecaudoAnterior : null)
      : modalidadRecaudoAnterior;
    const modalidadRecaudoCambio = modalidadRecaudoResuelta !== modalidadRecaudoAnterior;
    const esPagoInmediatoVigente = modalidadRecaudoResuelta === 'Pago Inmediato';
    const estadoPagoPaqueteVigente = esPagoInmediatoVigente ? 'Pagado' : 'Pendiente';

    // Antes del update de abajo: después ya no se puede saber si el total cambió.
    const totalAnterior = parseDecimal(encomienda.total);

    // Si llegó hasta acá sin lanzar error, la salida/fecha nuevas ya son válidas
    // (Programada, fechaEstimadaEntrega dentro de rango) — una venta Cancelada se
    // reactiva sola a Programada en la misma operación, sin pedir un segundo paso
    // manual. Ver LOGICA.md, "Ventas — Cancelada e inhabilitar/habilitar".
    await encomienda.update(
      {
        idSalida: nuevoIdSalida,
        fechaEstimadaEntrega: nuevaFechaEstimadaEntrega,
        observaciones: observaciones !== undefined ? observaciones : encomienda.observaciones,
        total: nuevoTotal,
        modalidadRecaudo: modalidadRecaudoResuelta,
        estadoPago: modalidadRecaudoCambio ? (esPagoInmediatoVigente ? 'Pagada' : 'Pendiente') : encomienda.estadoPago,
        habilitado: habilitado !== undefined ? habilitado : encomienda.habilitado,
        estado: encomienda.estado === 'Cancelada' ? 'Programada' : encomienda.estado,
      },
      { transaction }
    );

    if (destinatario) {
      let idDestinoResuelto = destinatarioExistente?.idDestino ?? null;
      if (destinatario.idDestino !== undefined) {
        const destinoDestinatario = await Destino.findByPk(destinatario.idDestino);
        if (!destinoDestinatario) {
          throw new AppError('El destino del destinatario no existe', 400);
        }
        // Contra el origen REAL de la salida (salidaNueva.origen), no contra
        // Medellín a secas — ver el mismo cambio y su porqué en create() (A.1,
        // plan-ventas-regreso-paquetes.md).
        if (destinoDestinatario.municipio === salidaNueva.origen) {
          throw new AppError(`El destino del destinatario no puede ser ${salidaNueva.origen}: es el municipio de origen de esta ruta`, 400);
        }
        idDestinoResuelto = destinatario.idDestino;
      }

      if (destinatarioExistente) {
        await destinatarioExistente.update(
          {
            idDestino: idDestinoResuelto,
            nombreDestinatario:
              destinatario.nombreDestinatario || destinatarioExistente.nombreDestinatario,
            tipoIdentificacionDestinatario: destinatario.tipoIdentificacionDestinatario || null,
            numeroIdentificacionDestinatario: destinatario.numeroIdentificacionDestinatario || null,
            telefonoDestinatario: destinatario.telefonoDestinatario || null,
            correoDestinatario: destinatario.correoDestinatario || null,
            direccionDestinatario: destinatario.direccionDestinatario || null,
          },
          { transaction }
        );
      } else {
        await Destinatario.create(
          {
            idEncomiendaVenta: id,
            idDestino: idDestinoResuelto,
            nombreDestinatario: destinatario.nombreDestinatario,
            tipoIdentificacionDestinatario: destinatario.tipoIdentificacionDestinatario || null,
            numeroIdentificacionDestinatario: destinatario.numeroIdentificacionDestinatario || null,
            telefonoDestinatario: destinatario.telefonoDestinatario || null,
            correoDestinatario: destinatario.correoDestinatario || null,
            direccionDestinatario: destinatario.direccionDestinatario || null,
          },
          { transaction }
        );
      }
    }

    if (paquetes && paquetes.length > 0) {
      // Diff en vez de "borrar todo y recrear": cada paquete físico ya trae su propio
      // idPaquete con estado/historial de entrega/foto/asignación de vehículo -- editar
      // la venta (o incluso editar OTRO paquete) nunca debe perder ese rastro para uno
      // que no cambió. Los que ya existían se actualizan en el mismo registro
      // (incluyendo si se reasignaron a otro vehículo del convoy); los realmente
      // nuevos (sin idPaquete) se crean; los que ya no vienen en el payload (se
      // quitaron en el formulario) se eliminan. numeroGuia ya no aplica acá -- es de
      // la venta completa, fijado una sola vez en create().
      const existentes = await Paquete.findAll({ where: { idEncomiendaVenta: id }, transaction });
      const existentesPorId = new Map(existentes.map((p) => [p.idPaquete, p]));
      const idsConservados = new Set();

      for (const pkg of paquetes) {
        const { valorDeclarado, valorPoliza } = resolverPoliza(pkg);
        const datos = {
          idSalidaVehiculoConductor: pkg.idSalidaVehiculoConductor,
          descripcionContenido: pkg.descripcionContenido || null,
          peso: pkg.peso || null,
          alto: pkg.alto || null,
          ancho: pkg.ancho || null,
          profundidad: pkg.profundidad || null,
          tipoCarga: pkg.tipoCarga || 'normal',
          valorDeclarado,
          valorPoliza,
        };

        if (pkg.idPaquete && existentesPorId.has(pkg.idPaquete)) {
          idsConservados.add(pkg.idPaquete);
          await existentesPorId.get(pkg.idPaquete).update(datos, { transaction });
        } else {
          // Paquete nuevo del diff: nace con el estadoPago de la modalidad
          // vigente de la venta (misma regla que create()), sin esperar a que la
          // modalidad "haya cambiado" — un paquete nuevo nunca tuvo un
          // estadoPago previo que preservar. numeroGuia NO se toca acá: es de la
          // venta (encomienda.numeroGuia, fijado desde create()), un paquete nuevo
          // agregado al editar comparte la misma guía que sus hermanos.
          await Paquete.create(
            { idEncomiendaVenta: id, estadoPago: estadoPagoPaqueteVigente, ...datos },
            { transaction }
          );
        }
      }

      const idsAEliminar = existentes
        .filter((p) => !idsConservados.has(p.idPaquete))
        .map((p) => p.idPaquete);
      if (idsAEliminar.length > 0) {
        await Paquete.destroy({ where: { idPaquete: idsAEliminar }, transaction });
      }
    }

    // Si la modalidad de recaudo cambió, re-sincronizar el estadoPago de TODOS los
    // paquetes de la venta (no solo los nuevos del diff de arriba) — ver el
    // comentario sobre modalidadRecaudoCambio más arriba. Ningún paquete pudo
    // haber avanzado más allá de "Por entregar" mientras la venta seguía editable.
    if (modalidadRecaudoCambio) {
      await Paquete.update(
        { estadoPago: estadoPagoPaqueteVigente },
        { where: { idEncomiendaVenta: id }, transaction }
      );
    }

    // Valor a cobrar de cada paquete (Paquete.valorCobro): se vuelve a repartir el
    // total cuando cambió algo que lo determina -- los paquetes, el total o la salida
    // (la tarifa base sale del destino de la salida). update() solo corre con la venta
    // Programada/Cancelada, o sea que ningún paquete ha avanzado: recalcular todos es
    // seguro. Editar solo la fecha u observaciones NO lo toca, para no repartir de
    // nuevo con tarifas que pudieron cambiar desde que se registró la venta.
    if ((paquetes && paquetes.length > 0) || salidaCambio || nuevoTotal !== totalAnterior) {
      const paquetesActuales = await Paquete.findAll({
        where: { idEncomiendaVenta: id },
        order: [['idPaquete', 'ASC']],
        transaction,
      });
      if (paquetesActuales.length > 0) {
        const valoresCobro = await calcularValoresCobro({
          total: nuevoTotal,
          paquetes: paquetesActuales.map((p) => p.toJSON()),
          salida: salidaNueva,
          transaction,
        });
        for (const [i, paquete] of paquetesActuales.entries()) {
          await paquete.update({ valorCobro: valoresCobro[i] }, { transaction });
        }
      }
    }

    await transaction.commit();

    const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'sedeRegistro' }] },
        SALIDA_INCLUDE,
        { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
        paqueteIncludeConAsignacion(),
      ],
    });

    return encomiendaActualizada;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// El conductor del tramo troncal legaliza DE UNA SOLA VEZ todos los paquetes que
// dejó en la sede del destino final de su ruta: pasan de "Por entregar" -> "En
// sede de destino". La entrega final al destinatario la hace después el
// distribuidor de esa sede (rol 'distribuidor'), con la ruta ya cerrada. Foto y
// novedades son opcionales — el conductor solo deja constancia de que descargó el
// lote. Ver LOGICA.md, "Entrega en dos fases".
const dejarPaquetesEnSede = async (idConductor, { idSalida, idDestino, novedades = '', fotoEntrega = null } = {}) => {
  const { Op } = sequelize.Sequelize;

  if (!idSalida || !idDestino) {
    throw new AppError('Faltan datos de la ruta o de la sede', 400);
  }
  // Sigue siendo opcional (a diferencia de la novedad de registrarEntregaFinal,
  // ver comentario ahí) — este es un traspaso interno masivo (camión -> sede),
  // no la entrega real al destinatario, así que no se le exige evidencia. Solo
  // se le pone tope de longitud si el conductor sí escribe algo.
  if (novedades.length > NOVEDAD_MAX_LENGTH) {
    throw new AppError(`La novedad no puede exceder ${NOVEDAD_MAX_LENGTH} caracteres`, 400);
  }

  const salida = await SalidaProgramada.findByPk(idSalida, {
    attributes: ['idSalida', 'estado', 'idRuta'],
    include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }],
  });
  if (!salida) throw new AppError('Ruta no encontrada', 404);
  if (salida.estado !== 'En Ruta') {
    throw new AppError('Solo se pueden dejar paquetes en sede mientras la ruta está "En Ruta"', 409);
  }

  // Pares (vehículo+conductor) de ESTE conductor en ESTA salida.
  const pares = await SalidaVehiculoConductor.findAll({
    where: { idSalida, idConductor, habilitado: true },
    attributes: ['idSalidaVehiculoConductor', 'idVehiculo'],
  });
  if (pares.length === 0) {
    throw new AppError('No tienes ningún vehículo asignado en esta ruta', 403);
  }
  const parIds = pares.map((p) => p.idSalidaVehiculoConductor);
  const vehiculoIds = [...new Set(pares.map((p) => p.idVehiculo))];

  // Rutas directas: la única sede posible es el destino final de la salida
  // (compartido por todo el convoy).
  if (salida.ruta?.idDestino !== idDestino) {
    throw new AppError('Esa sede no pertenece al recorrido de esta ruta', 409);
  }

  // Paquetes "Por entregar" de esos pares cuya venta va dirigida a esta sede
  // (Destinatario.idDestino) y no está cancelada.
  const candidatos = await Paquete.findAll({
    where: { idSalidaVehiculoConductor: { [Op.in]: parIds }, estado: 'Por entregar' },
    include: [{
      model: EncomiendaVenta, as: 'encomienda', required: true,
      where: { estado: { [Op.ne]: 'Cancelada' } },
      include: [{ model: Destinatario, as: 'destinatario', required: true, where: { idDestino } }],
    }],
  });
  if (candidatos.length === 0) {
    throw new AppError('No hay paquetes pendientes por dejar en esta sede', 409);
  }

  const idsPaquete = candidatos.map((p) => p.idPaquete);
  const ventaIds = [...new Set(candidatos.map((p) => p.idEncomiendaVenta))];

  await sequelize.transaction(async (t) => {
    await Paquete.update(
      {
        estado: 'En sede de destino',
        fechaUltimoEstado: new Date(),
        ...(novedades ? { observacionEstado: novedades } : {}),
        ...(fotoEntrega ? { fotoEntrega } : {}),
      },
      { where: { idPaquete: { [Op.in]: idsPaquete } }, transaction: t }
    );

    // Recalcular el estado de cada venta afectada. Con todos sus paquetes en "En
    // sede de destino" (no terminal) la venta SIGUE "En Ruta" — el cierre lo
    // dispara el distribuidor al resolver la entrega final.
    for (const idEncomiendaVenta of ventaIds) {
      const venta = await EncomiendaVenta.findByPk(idEncomiendaVenta, { transaction: t });
      if (!venta) continue;
      const paquetesVenta = await Paquete.findAll({ where: { idEncomiendaVenta }, transaction: t });
      await venta.update({
        estado: determinarEstadoEncomienda(paquetesVenta, venta.estado),
        estadoPago: determinarEstadoPago(paquetesVenta, venta.estadoPago),
      }, { transaction: t });
    }

    // Trazabilidad en vivo: el conductor (y su vehículo) acaba de dejar carga en
    // esta sede, así que su "ubicación actual" pasa a ser este municipio. Se va
    // actualizando sede por sede a medida que avanza el recorrido; al completar la
    // ruta ya coincide con el destino final. Ver LOGICA.md "Entrega en dos fases".
    await Conductor.update({ idDestinoActual: idDestino }, { where: { idConductor }, transaction: t });
    if (vehiculoIds.length > 0) {
      await Vehiculo.update({ idDestinoActual: idDestino }, { where: { idVehiculo: { [Op.in]: vehiculoIds } }, transaction: t });
    }
  });

  // Con esta sede lista, la ruta puede quedar completa (todas las sedes + anticipo
  // cerrado). Best-effort tras el commit — si aún falta algo no hace nada.
  // require lazy para no atar el orden de carga de módulos.
  const autoCompletar = require('./salidaProgramadaService').intentarAutoCompletar;
  const autoResult = await autoCompletar(idSalida);

  // P9, Notificación 4 ("Llegó a la sede") — al destinatario, un correo por VENTA
  // (no por paquete: varios paquetes de la misma venta comparten guía y
  // destinatario). Nunca debe bloquear la operación si Brevo falla.
  try {
    const { sendPaqueteEnSedeEmail } = require('../config/email');
    const sede = await Destino.findByPk(idDestino, { attributes: ['municipio'] });
    const destinatariosPorVenta = new Map();
    for (const p of candidatos) {
      if (destinatariosPorVenta.has(p.idEncomiendaVenta)) continue;
      const destinatario = p.encomienda?.destinatario;
      if (destinatario?.correoDestinatario) {
        destinatariosPorVenta.set(p.idEncomiendaVenta, {
          email: destinatario.correoDestinatario,
          nombre: destinatario.nombreDestinatario,
          numeroGuia: p.encomienda.numeroGuia,
        });
      }
    }
    for (const { email, nombre, numeroGuia } of destinatariosPorVenta.values()) {
      try {
        await sendPaqueteEnSedeEmail(email, { nombreDestinatario: nombre, numeroGuia, municipioSede: sede?.municipio || '' });
      } catch (error) {
        console.error(`No se pudo enviar el correo de "llegó a la sede" (guía ${numeroGuia}):`, error.message);
      }
    }
  } catch (error) {
    console.error(`No se pudieron enviar los correos de "llegó a la sede" (salida #${idSalida}):`, error.message);
  }

  return {
    actualizados: candidatos.length,
    idSalida,
    idDestino,
    ventasAfectadas: ventaIds.length,
    rutaCompletada: autoResult.completada === true,
  };
};

// Paquetes "En sede de destino" que le tocan a un distribuidor — los de las
// sedes (municipios) que ese usuario cubre (usuario_sede). El idUsuario sale del
// token, no del query. Ver getPorSede en paqueteController.
const getPaquetesEnSede = async (idUsuarioDistribuidor) => {
  const { Op } = sequelize.Sequelize;

  const sedes = await UsuarioSede.findAll({
    where: { idUsuario: idUsuarioDistribuidor, habilitado: true },
    attributes: ['idDestino'],
  });
  const idsDestino = sedes.map((s) => s.idDestino);
  if (idsDestino.length === 0) return [];

  return Paquete.findAll({
    where: { estado: 'En sede de destino' },
    include: [
      {
        model: EncomiendaVenta, as: 'encomienda', required: true,
        where: { estado: { [Op.ne]: 'Cancelada' }, habilitado: true },
        include: [
          { model: Cliente, as: 'cliente', attributes: ['idCliente', 'nombre', 'apellido', 'telefono'] },
          {
            model: Destinatario, as: 'destinatario', required: true,
            where: { idDestino: { [Op.in]: idsDestino } },
            include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio', 'departamento'] }],
          },
        ],
      },
      {
        model: SalidaVehiculoConductor, as: 'asignacion',
        include: [{ model: SalidaProgramada, as: 'salida', attributes: ['idSalida', 'origen', 'estado'], include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'], include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }] }],
      },
    ],
    order: [['fechaUltimoEstado', 'DESC'], ['idPaquete', 'DESC']],
  });
};

// Paquetes que ESTE distribuidor ya cerró (Entregado/Devuelto) — su propio
// historial, a diferencia de getPaquetesEnSede (arriba) que solo trae lo
// pendiente. Filtra por idUsuarioEntrega (quién lo cerró), no por sede — un
// distribuidor solo puede cerrar paquetes de sus propias sedes de todos modos
// (registrarEntregaFinal ya lo valida), así que equivale a lo mismo, pero es
// más directo. Sin paginación de servidor a propósito, mismo patrón que
// getByConductor/getMisAnticipos — el móvil pagina en el cliente ("Mostrar 5
// más"). Ver LOGICA.md, "Historial de entrega final — tab del distribuidor".
const getHistorialSedeDistribuidor = async (idUsuarioDistribuidor) => {
  const { Op } = sequelize.Sequelize;

  return Paquete.findAll({
    where: { estado: { [Op.in]: ['Entregado', 'Devuelto'] }, idUsuarioEntrega: idUsuarioDistribuidor },
    include: [
      {
        model: EncomiendaVenta, as: 'encomienda', required: true,
        include: [
          { model: Cliente, as: 'cliente', attributes: ['idCliente', 'nombre', 'apellido', 'telefono'] },
          {
            model: Destinatario, as: 'destinatario', required: true,
            include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio', 'departamento'] }],
          },
        ],
      },
      {
        model: SalidaVehiculoConductor, as: 'asignacion',
        include: [{ model: SalidaProgramada, as: 'salida', attributes: ['idSalida', 'origen', 'estado'], include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'], include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] }] }],
      },
    ],
    order: [['fechaUltimoEstado', 'DESC'], ['idPaquete', 'DESC']],
  });
};

const ACCIONES_ENTREGA_FINAL = ['Entregado', 'Devuelto', 'Intento'];

// Tope de intentos fallidos por paquete (decisión de la usuaria, 2026-09-08):
// un número fijo de intentos, sin ningún control de cada cuánto se puede
// registrar uno -- el distribuidor decide libremente cuándo insistir, el
// sistema no impone ninguna cadencia ni compara fechas entre intentos
// (fechaUltimoIntento solo queda guardada como dato, nunca se usa para
// bloquear). "No entregado" sigue disponible en cualquier momento (decisión
// explícita: el distribuidor puede cerrarlo antes si ya sabe que es
// imposible entregar, ej. dirección inexistente) -- el tope solo bloquea
// seguir sumando 'Intento'. Ver LOGICA.md, "Tope de intentos de entrega".
const MAX_INTENTOS_ENTREGA = 5;

// Entrega final al destinatario, desde "En sede de destino" — la registra el
// distribuidor de la sede (rol 'distribuidor', un Usuario), no un conductor.
//   - 'Entregado' / 'Devuelto': estado terminal. En la UI 'Devuelto' se muestra
//     como "No entregado" (el valor interno no cambia).
//   - 'Intento': NO cambia el estado (sigue "En sede de destino") — solo suma al
//     contador de insistidera (intentosEntrega) y actualiza fechaUltimoIntento.
// Novedad y foto OBLIGATORIAS en las 3 (2026-09-08). Ver LOGICA.md, "Entrega en dos
// fases" y "Evidencia de entrega final obligatoria".
const registrarEntregaFinal = async (idPaquete, { accion, novedad = '', fotoEntrega = null, idUsuarioDistribuidor } = {}) => {
  if (!ACCIONES_ENTREGA_FINAL.includes(accion)) {
    throw new AppError(`Acción inválida. Debe ser una de: ${ACCIONES_ENTREGA_FINAL.join(', ')}`, 400);
  }

  const paquete = await Paquete.findByPk(idPaquete, {
    include: [{ model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] }],
  });
  if (!paquete) throw new AppError('Paquete no encontrado', 404);

  if (paquete.estado !== 'En sede de destino') {
    throw new AppError('Solo se puede gestionar la entrega final de un paquete que esté "En sede de destino"', 409);
  }

  const encomienda = paquete.encomienda;
  if (encomienda?.estado === 'Cancelada') {
    throw new AppError('No se puede gestionar un paquete de una venta cancelada', 409);
  }

  const idDestinoVenta = encomienda?.destinatario?.idDestino;
  if (!idDestinoVenta) {
    throw new AppError('Esta venta no tiene un municipio de destino registrado', 409);
  }
  const cubreSede = await UsuarioSede.findOne({
    where: { idUsuario: idUsuarioDistribuidor, idDestino: idDestinoVenta, habilitado: true },
  });
  if (!cubreSede) {
    throw new AppError('No tienes asignada la sede de este paquete', 403);
  }

  if (!novedad.trim()) {
    throw new AppError('La novedad es obligatoria para registrar la entrega final', 400);
  }
  if (novedad.length > NOVEDAD_MAX_LENGTH) {
    throw new AppError(`La novedad no puede exceder ${NOVEDAD_MAX_LENGTH} caracteres`, 400);
  }

  const esIntento = accion === 'Intento';
  if (esIntento && (paquete.intentosEntrega || 0) >= MAX_INTENTOS_ENTREGA) {
    throw new AppError(`Ya se registraron ${MAX_INTENTOS_ENTREGA} intentos para este paquete — no se pueden registrar más. Márcalo como Entregado o No entregado.`, 409);
  }

  await sequelize.transaction(async (t) => {
    // Historial completo -- una fila por cada llamada, sin importar la acción
    // (ver models/paqueteEntregaFinal.js). novedad/fotoEntrega ya vienen
    // garantizados no vacíos (validados arriba y en el controller), así que acá
    // ya no hace falta el `|| valorAnterior` que sí tenía sentido cuando eran
    // opcionales.
    await PaqueteEntregaFinal.create({
      idPaquete: paquete.idPaquete,
      accion,
      novedad,
      foto: fotoEntrega,
      idUsuarioDistribuidor,
    }, { transaction: t });

    if (esIntento) {
      await paquete.update({
        intentosEntrega: (paquete.intentosEntrega || 0) + 1,
        fechaUltimoIntento: new Date(),
        observacionEstado: novedad,
        fotoEntrega,
        idUsuarioEntrega: idUsuarioDistribuidor,
      }, { transaction: t });
    } else {
      // Regla de recaudo por paquete (ver PLAN_recaudo_por_paquete.md): en
      // Contraentrega, este paquete se cobra si y solo si se entregó. Un
      // 'Devuelto' se queda 'Pendiente' — cerrado sin cobro, en firme.
      const datosPaquete = {
        estado: accion, // 'Entregado' | 'Devuelto'
        observacionEstado: novedad,
        fotoEntrega,
        fechaUltimoEstado: new Date(),
        idUsuarioEntrega: idUsuarioDistribuidor,
      };
      if (accion === 'Entregado' && encomienda?.modalidadRecaudo === 'Contraentrega') {
        datosPaquete.estadoPago = 'Pagado';
      }
      await paquete.update(datosPaquete, { transaction: t });

      // Cierre de la venta si ya ningún paquete queda pendiente, y recálculo del
      // rollup de pago (determinarEstadoPago) en el mismo punto.
      if (encomienda) {
        const paquetes = await Paquete.findAll({ where: { idEncomiendaVenta: paquete.idEncomiendaVenta }, transaction: t });
        await encomienda.update({
          estado: determinarEstadoEncomienda(paquetes, encomienda.estado),
          estadoPago: determinarEstadoPago(paquetes, encomienda.estadoPago),
        }, { transaction: t });
      }
    }
  });

  // Correo al cliente cuando el paquete queda "Devuelto" (no entregado) — solo en
  // la transición, sin bloquear la operación si el envío falla.
  if (accion === 'Devuelto' && encomienda) {
    try {
      const cliente = await Cliente.findByPk(encomienda.idCliente);
      if (cliente?.email) {
        await sendPaqueteDevueltoEmail(cliente.email, {
          nombreCliente: `${cliente.nombre} ${cliente.apellido}`.trim(),
          numeroGuia: encomienda.numeroGuia,
          motivo: novedad || '',
        });
      }
    } catch (error) {
      console.error(`No se pudo enviar el correo de paquete no entregado (paquete #${idPaquete}):`, error.message);
    }
  }

  // P9, Notificación 3 — al DESTINATARIO (no al remitente, ver el bloque de arriba)
  // cuando el distribuidor registra un intento fallido ('Intento') o cierra el
  // paquete como no entregado ('Devuelto') -- lo invita a coordinar/recoger en
  // sede. Nunca debe bloquear la operación si el envío falla.
  if ((accion === 'Intento' || accion === 'Devuelto') && encomienda?.destinatario?.correoDestinatario) {
    try {
      const { sendInsistenciaDestinatarioEmail } = require('../config/email');
      const sede = encomienda.destinatario.idDestino
        ? await Destino.findByPk(encomienda.destinatario.idDestino, { attributes: ['municipio'] })
        : null;
      await sendInsistenciaDestinatarioEmail(encomienda.destinatario.correoDestinatario, {
        nombreDestinatario: encomienda.destinatario.nombreDestinatario,
        numeroGuia: encomienda.numeroGuia,
        municipioSede: sede?.municipio || '',
        esFinal: accion === 'Devuelto',
      });
    } catch (error) {
      console.error(`No se pudo enviar el correo de insistencia al destinatario (paquete #${idPaquete}):`, error.message);
    }
  }

  // P9, Notificación 4 (parte "Entregado") — al remitente, cuando el distribuidor
  // cierra el paquete como entregado. Cierra el ciclo abierto por "encomienda
  // registrada"/"ya va en camino".
  if (accion === 'Entregado' && encomienda) {
    try {
      const { sendEncomiendaEntregadaEmail } = require('../config/email');
      const cliente = await Cliente.findByPk(encomienda.idCliente);
      if (cliente?.email) {
        await sendEncomiendaEntregadaEmail(cliente.email, {
          nombreCliente: `${cliente.nombre} ${cliente.apellido}`.trim(),
          numeroGuia: encomienda.numeroGuia,
        });
      }
    } catch (error) {
      console.error(`No se pudo enviar el correo de encomienda entregada (paquete #${idPaquete}):`, error.message);
    }
  }

  return Paquete.findByPk(idPaquete, {
    include: [
      { model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] },
      { model: Usuario, as: 'usuarioEntrega', attributes: ['idUsuario', 'nombre', 'apellido'] },
    ],
  });
};

// Historial completo de entrega final de un paquete (ver models/paqueteEntregaFinal.js)
// -- todas las filas, en orden cronológico (más viejo primero, se lee como una
// historia: intento 1, intento 2, ..., el cierre). Usado por el modal "Ver
// historial" de ModalConsultarVenta.jsx (web) -- no existía antes de esta tabla,
// así que un paquete cerrado antes de que se agregara simplemente no tiene filas.
const getHistorialEntregaFinal = async (idPaquete) => {
  const paquete = await Paquete.findByPk(idPaquete, { attributes: ['idPaquete'] });
  if (!paquete) throw new AppError('Paquete no encontrado', 404);

  return PaqueteEntregaFinal.findAll({
    where: { idPaquete },
    include: [{ model: Usuario, as: 'distribuidor', attributes: ['idUsuario', 'nombre', 'apellido'] }],
    order: [['fecha', 'ASC'], ['idPaqueteEntregaFinal', 'ASC']],
  });
};

// Autorización para GET /paquetes/:id/historial-entrega desde el móvil del
// distribuidor -- mismo criterio que registrarEntregaFinal (cubreSede): solo
// puede ver el historial de un paquete cuya sede (destino de la venta) cubra
// vía usuario_sede. El admin (vía consultar_venta) no pasa por acá, tiene
// acceso sin esta restricción -- ver paqueteController.getHistorialEntrega.
const distribuidorCubrePaquete = async (idPaquete, idUsuarioDistribuidor) => {
  const paquete = await Paquete.findByPk(idPaquete, {
    include: [{ model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario' }] }],
  });
  const idDestino = paquete?.encomienda?.destinatario?.idDestino;
  if (!idDestino) return false;

  const cubre = await UsuarioSede.findOne({
    where: { idUsuario: idUsuarioDistribuidor, idDestino, habilitado: true },
  });
  return !!cubre;
};

// Devuelto -> Devuelto a base (Parte B, plan-ventas-regreso-paquetes.md): un
// paquete "No entregado" que un convoy de regreso trae físicamente de vuelta a
// Medellín. Acción explícita por paquete, nunca automática al completar la
// ruta de regreso. Puede registrarla:
//   - un conductor de un convoy de regreso, desde el móvil (idConductor presente)
//   - el admin, desde el panel web (esAdmin true, idConductorDevolucion queda NULL)
// Ventana de acción: tiene que haber ALGÚN regreso "En Ruta" que SALGA AHORA
// del municipio donde quedó varado este paquete (destino final de la ida a la
// que pertenece esa sede, ver idsDestinoConRegresoActivo). El paquete NO cambia
// de id_salida/id_salida_vehiculo_conductor: sigue asociado
// a su salida de ida original, para trazabilidad.
const registrarDevolucionPaquete = async (idPaquete, { idConductor = null, esAdmin = false } = {}) => {
  const { Op } = sequelize.Sequelize;
  const paquete = await Paquete.findByPk(idPaquete, {
    include: [{
      model: EncomiendaVenta, as: 'encomienda', attributes: ['idEncomiendaVenta', 'idSalida'],
      include: [{ model: Destinatario, as: 'destinatario', attributes: ['idDestino'] }],
    }],
  });
  if (!paquete) throw new AppError('Paquete no encontrado', 404);

  if (normalizarEstadoPaquete(paquete.estado) !== 'Devuelto') {
    throw new AppError(
      paquete.estado === 'Devuelto a base'
        ? 'Este paquete ya fue confirmado de vuelta en Medellín'
        : 'Solo se puede confirmar la devolución de un paquete "No entregado"',
      409
    );
  }

  const idDestinoSede = paquete.encomienda?.destinatario?.idDestino;
  if (!idDestinoSede) {
    throw new AppError('Este paquete no tiene un destino asociado', 409);
  }

  if (esAdmin) {
    // Cualquier regreso "En Ruta" que salga de ese municipio sirve — el admin
    // no conduce ningún convoy en particular, solo confirma que el paquete
    // llegó.
    const sedesActivas = await idsDestinoConRegresoActivo([idDestinoSede]);
    if (!sedesActivas.has(idDestinoSede)) {
      throw new AppError('No hay ningún regreso en curso desde la sede de este paquete', 409);
    }
  } else {
    if (!idConductor) throw new AppError('No se pudo identificar al conductor', 403);
    // Tiene que ser justo el regreso que ESTE conductor está manejando ahora
    // mismo (no cualquier otro regreso que también salga del mismo
    // municipio) — mismo criterio que getPaquetesRetornoConductor.
    const parRegreso = await SalidaVehiculoConductor.findOne({
      where: { idConductor, habilitado: true },
      include: [{
        model: SalidaProgramada, as: 'salida', required: true,
        where: { estado: 'En Ruta', idSalidaIda: { [Op.ne]: null } },
        include: [{ model: SalidaProgramada, as: 'salidaIda', attributes: ['idSalida'], include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }] }],
      }],
    });
    if (!parRegreso || parRegreso.salida.salidaIda?.ruta?.idDestino !== idDestinoSede) {
      throw new AppError('No estás en un regreso activo desde la sede de este paquete', 403);
    }
  }

  await paquete.update({
    estado: 'Devuelto a base',
    idConductorDevolucion: esAdmin ? null : idConductor,
    fechaDevolucion: new Date(),
  });

  return Paquete.findByPk(idPaquete, {
    include: [{
      model: Conductor, as: 'conductorDevolucion',
      include: [{ model: Usuario, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellido'] }],
    }],
  });
};

// "Paquetes de retorno" (B.4, plan-ventas-regreso-paquetes.md) -- tab Paquetes
// del conductor en la app móvil, SOLO cuando su salida activa ahora mismo es un
// regreso ("En Ruta", idSalidaIda seteado) y él está en su convoy. Trae los
// paquetes "No entregado" (todavía accionables) Y "Devuelto a base" (ya
// confirmados por él o por otro conductor/el admin -- el móvil los muestra
// como "Ya confirmado por [nombre]", no los oculta) del municipio del que
// SALE este regreso (destino final de la ida enlazada, vía su plantilla).
// Lista vacía = no hay ninguna salida de regreso activa para este
// conductor ahora mismo, o no quedó ningún paquete de ese tipo en su sede.
const getPaquetesRetornoConductor = async (idConductor) => {
  const { Op } = sequelize.Sequelize;

  const parRegreso = await SalidaVehiculoConductor.findOne({
    where: { idConductor, habilitado: true },
    include: [{
      model: SalidaProgramada, as: 'salida', required: true,
      where: { estado: 'En Ruta', idSalidaIda: { [Op.ne]: null } },
    }],
  });
  if (!parRegreso) return [];

  const ida = await SalidaProgramada.findByPk(parRegreso.salida.idSalidaIda, { include: [{ model: Ruta, as: 'ruta', attributes: ['idDestino'] }] });
  if (!ida?.ruta) return [];

  return Paquete.findAll({
    where: { estado: { [Op.in]: ['Devuelto', 'Devuelto a base'] } },
    include: [
      {
        // Mismo criterio que getByConductor (2026-09-13, ver LOGICA.md): una
        // venta que se canceló o se inhabilitó DESPUÉS de que su paquete quedó
        // "Devuelto" no debe seguir pidiéndole al conductor que confirme su
        // regreso — ya no es responsabilidad de nadie resolverla por acá.
        model: EncomiendaVenta, as: 'encomienda', required: true,
        where: { habilitado: true, estado: { [Op.ne]: 'Cancelada' } },
        include: [
          // El conductor necesita saber a quién corresponde el paquete YA DE
          // VUELTA en Medellín -- eso es el cliente (quien lo envió y a quien
          // se le va a resolver acá), no el destinatario original en el
          // municipio donde no se pudo entregar. Corregido 2026-09-13.
          { model: Cliente, as: 'cliente', attributes: ['idCliente', 'nombre', 'apellido', 'telefono'] },
          {
            model: Destinatario, as: 'destinatario', required: true,
            where: { idDestino: ida.ruta.idDestino },
            include: [{ model: Destino, as: 'destino' }],
          },
        ],
      },
      {
        model: Conductor, as: 'conductorDevolucion', required: false,
        include: [{ model: Usuario, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellido'] }],
      },
    ],
    order: [['idPaquete', 'DESC']],
  });
};

// Trae "Devuelto" (no entregado, el paquete puede seguir allá en el destino) y
// "Devuelto a base" (2026-09-13: la usuaria notó que en cuanto el conductor del
// regreso confirma "Llegó a Medellín" el paquete desaparecía de este listado sin
// dejar rastro visible salvo abriendo el modal puntual de la venta -- pero sigue
// siendo, en los dos casos, un paquete que nunca llegó al destinatario, así que
// el mismo listado le sirve a ambos; la columna Estado del frontend distingue
// cuál es cuál). Ver paqueteStateUtils.js, ESTADOS_PAQUETE.
const getPaquetesDevueltos = async ({ q, anio, mes, habilitado, page = 1, limit = 10 } = {}) => {
  const { Op } = sequelize.Sequelize;
  const where = { estado: { [Op.in]: ['Devuelto', 'Devuelto a base'] } };
  if (q) {
    const trimmed = q.trim();
    // numeroGuia es de la venta dueña (P12), no del paquete -- se busca vía el
    // include de abajo ($encomienda.numero_guia$), igual que cliente.nombre/apellido.
    where[Op.or] = [
      { '$encomienda.numero_guia$': { [Op.iLike]: `%${trimmed}%` } },
      { '$encomienda.cliente.nombre$': { [Op.iLike]: `%${trimmed}%` } },
      { '$encomienda.cliente.apellido$': { [Op.iLike]: `%${trimmed}%` } },
      { '$encomienda.cliente.email$': { [Op.iLike]: `%${trimmed}%` } },
    ];
  }
  // Mismo patrón año/mes que anticipoService.getAll — fechaUltimoEstado se filtra
  // por rango, no por LIKE.
  if (anio) {
    const anioNum = parseInt(anio);
    const mesNum = mes ? parseInt(mes) : null;
    const mesInicio = mesNum || 1;
    const inicio = `${anioNum}-${String(mesInicio).padStart(2, '0')}-01`;
    const fin = mesNum
      ? (mesNum === 12 ? `${anioNum + 1}-01-01` : `${anioNum}-${String(mesNum + 1).padStart(2, '0')}-01`)
      : `${anioNum + 1}-01-01`;
    where.fechaUltimoEstado = { [Op.gte]: inicio, [Op.lt]: fin };
  }

  // El paquete no tiene su propio "habilitado" (columna eliminada — su ciclo de vida
  // depende enteramente de la venta dueña, ver Paquete.model). Por eso este filtro no
  // toca `where` de Paquete, sino el `where` del include de la venta: un paquete
  // "inhabilitado" en este listado es, en realidad, un paquete cuya venta lo está.
  const whereEncomienda = {};
  if (habilitado !== undefined) whereEncomienda.habilitado = habilitado === 'true';

  const offset = (page - 1) * limit;
  const { count, rows: data } = await Paquete.findAndCountAll({
    where,
    include: [
      {
        model: EncomiendaVenta,
        as: 'encomienda',
        required: true,
        where: whereEncomienda,
        include: [
          { model: Cliente, as: 'cliente' },
          // El municipio donde de verdad quedó varado el paquete (2026-09-13,
          // reemplaza la columna "Ruta" del listado) — antes se mostraba el
          // origen→destino de la ida completa (ver LOGICA.md, "Paquetes de
          // retorno — corte por sede, no por ida").
          { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
        ],
      },
      // Quién y cuándo confirmó "Llegó a Medellín" (solo aplica a "Devuelto a
      // base") -- mismo dato que ya se le muestra al conductor en la app móvil,
      // ver getPaquetesRetornoConductor.
      {
        model: Conductor, as: 'conductorDevolucion', required: false,
        include: [{ model: Usuario, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellido'] }],
      },
    ],
    limit,
    offset,
    order: [['fechaUltimoEstado', 'DESC'], ['idPaquete', 'DESC']],
    distinct: true,
    subQuery: false,
  });

  return { data, total: count };
};

const getAniosDisponiblesPaquetesDevueltos = async () => {
  const rows = await sequelize.query(
    "SELECT DISTINCT EXTRACT(YEAR FROM fecha_ultimo_estado)::int AS anio FROM paquete WHERE estado IN ('Devuelto', 'Devuelto a base') ORDER BY anio DESC",
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => r.anio);
};

const toggleHabilitado = async (id, { rol, idSede } = {}) => {
  const encomienda = await EncomiendaVenta.findByPk(id);

  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }
  // Mismo criterio que getById/update: operador_sede solo inhabilita/habilita lo suyo.
  if (rol === 'operador_sede' && encomienda.idSede !== idSede) {
    throw new AppError('No tienes acceso a esta venta', 403);
  }

  let pasoACancelada = false;

  if (encomienda.habilitado) {
    // Inhabilitar: solo bloquea una venta "En Ruta" (paquetes físicamente en tránsito
    // en este momento) — a diferencia de antes, ya NO exige pasar primero por
    // "Cancelada" para poder inhabilitar una Programada (ver LOGICA.md, "Ventas —
    // Cancelada e inhabilitar/habilitar"). El estado no se toca acá; el filtro
    // `habilitado:true` que usan las cascadas de la salida (ver
    // salidaProgramadaService.js) ya protege a una venta inhabilitada de ser
    // arrastrada mientras está oculta.
    if (encomienda.estado === 'En Ruta') {
      throw new AppError(
        'No se puede inhabilitar una venta que está en tránsito',
        409,
        [{ tipo: 'Estado activo', id: encomienda.idEncomiendaVenta, descripcion: 'Esta venta está "En Ruta" y no ha finalizado' }],
        'DEPENDENCY_CONFLICT'
      );
    }
  } else if (encomienda.estado === 'Programada') {
    // Rehabilitar una Programada: mientras estuvo inhabilitada, su salida pudo
    // haber avanzado (salió, se completó, se canceló) sin que la sincronización de
    // fechas de salidaProgramadaService.update() la tocara (esa sincronización solo
    // alcanza a las ventas habilitadas). Se revisa acá, en el único momento en que
    // vuelve a quedar "viva".
    const salida = await SalidaProgramada.findByPk(encomienda.idSalida, { include: [{ model: Ruta, as: 'ruta' }] });
    const destinatarioRehabilitar = await Destinatario.findOne({ where: { idEncomiendaVenta: id }, attributes: ['idDestino'] });
    if (!(await rutaCubreDestinoVenta(salida, destinatarioRehabilitar?.idDestino))) {
      // La salida ya no sirve para esta venta (salió/terminó/se canceló, quedó
      // inhabilitada, o sigue sana pero le cambiaron el destino final) — queda
      // Cancelada para forzar la reasignación (editable, ver update() más abajo).
      encomienda.estado = 'Cancelada';
      pasoACancelada = true;
    } else {
      // La salida sigue Programada — se corrige la fecha SOLO si ya no alcanza el
      // mínimo actual (no se pisa un margen manual que sigue siendo válido).
      const minimaEntrega = salida.fechaLlegadaEstimada || sumarDias(salida.fechaSalida, 1);
      if (!encomienda.fechaEstimadaEntrega || encomienda.fechaEstimadaEntrega < minimaEntrega) {
        encomienda.fechaEstimadaEntrega = minimaEntrega;
      }
    }
  }

  encomienda.habilitado = !encomienda.habilitado;
  await encomienda.save();

  const encomiendaActualizada = await EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'sedeRegistro' }] },
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
      SALIDA_INCLUDE,
    ],
  });

  return { encomienda: encomiendaActualizada, pasoACancelada };
};

// Reactiva una venta "Cancelada" a "Programada" sin pasar por el wizard de Editar —
// para el caso en que no hace falta cambiar ningún dato: la salida ya volvió a
// servir sola (ej. se canceló y se reprogramó) y no hay nada que reasignar. Único
// llamador: el clic en "Programada" del menú de Estado en el listado (frontend:
// EstadoVentaCancelada.jsx), que solo lo habilita cuando ya confirmó
// rutaSigueSirviendo/salidaSigueSirviendo() del lado del cliente — se revalida
// igual acá, fuente de verdad. Ver LOGICA.md, "Ventas — Cancelada e
// inhabilitar/habilitar".
const reactivar = async (id, { rol, idSede } = {}) => {
  const encomienda = await EncomiendaVenta.findByPk(id);
  if (!encomienda) {
    throw new AppError('Encomienda no encontrada', 404);
  }
  // Mismo criterio que getById/update/toggleHabilitado: operador_sede solo
  // reactiva lo suyo.
  if (rol === 'operador_sede' && encomienda.idSede !== idSede) {
    throw new AppError('No tienes acceso a esta venta', 403);
  }
  if (encomienda.habilitado === false) {
    throw new AppError('Esta venta está inhabilitada: habilítala primero', 400);
  }
  if (encomienda.estado !== 'Cancelada') {
    throw new AppError(`Esta venta ya está en estado "${encomienda.estado}": no hace falta reactivarla`, 400);
  }

  const salida = await SalidaProgramada.findByPk(encomienda.idSalida, { include: [{ model: Ruta, as: 'ruta' }] });
  const destinatarioReactivar = await Destinatario.findOne({ where: { idEncomiendaVenta: id }, attributes: ['idDestino'] });
  if (!(await rutaCubreDestinoVenta(salida, destinatarioReactivar?.idDestino))) {
    throw new AppError('La ruta de esta venta ya no está disponible: edítala para asignarle una ruta nueva', 400);
  }

  // Mismo criterio que toggleHabilitado() al rehabilitar una venta "Programada" (ver
  // arriba): se corrige la fecha SOLO si ya no alcanza el mínimo actual de la
  // salida — no se pisa un margen manual que sigue siendo válido.
  const minimaEntrega = salida.fechaLlegadaEstimada || sumarDias(salida.fechaSalida, 1);
  if (!encomienda.fechaEstimadaEntrega || encomienda.fechaEstimadaEntrega < minimaEntrega) {
    encomienda.fechaEstimadaEntrega = minimaEntrega;
  }
  encomienda.estado = 'Programada';
  await encomienda.save();

  return EncomiendaVenta.findByPk(id, {
    include: [
      { model: Cliente, as: 'cliente', include: [{ model: Destino, as: 'sedeRegistro' }] },
      { model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] },
      paqueteIncludeConAsignacion(),
      SALIDA_INCLUDE,
    ],
  });
};

// El orden por defecto de getAll es [fechaRegistro DESC, idEncomiendaVenta DESC] —
// el desempate también tiene que ser DESC (Op.gt), no ASC. Con fechaRegistro
// siendo un DATEONLY, es normal que varias ventas del mismo día empaten ahí y
// dependan del desempate para quedar en el orden correcto.
const getPageOf = async (id, { limit = 10, rol, idSede } = {}) => {
  const Op = sequelize.Sequelize.Op;
  const record = await EncomiendaVenta.findByPk(id, { attributes: ['idEncomiendaVenta', 'fechaRegistro', 'idSede'] });
  if (!record) throw new AppError('Encomienda no encontrada', 404);
  if (rol === 'operador_sede' && record.idSede !== idSede) {
    throw new AppError('No tienes acceso a esta venta', 403);
  }
  const where = {
    [Op.or]: [
      { fechaRegistro: { [Op.gt]: record.fechaRegistro } },
      { fechaRegistro: record.fechaRegistro, idEncomiendaVenta: { [Op.gt]: parseInt(id) } },
    ],
  };
  if (rol === 'operador_sede') where.idSede = idSede;
  const before = await EncomiendaVenta.count({ where });
  return { page: Math.floor(before / limit) + 1 };
};

// Límites reales para el filtro de período del Dashboard — evita que "Desde" acepte
// cualquier año arbitrario (ej. 1956) y que "Hasta" acepte fechas futuras sin sentido.
// Se calcula con MIN/MAX directo en la BD (no sobre una página de ventas ya cargada)
// para que siga siendo correcto sin importar cuántas ventas haya en total.
const getRangoFechas = async () => {
  const resultado = await EncomiendaVenta.findOne({
    attributes: [
      [sequelize.fn('MIN', sequelize.col('fecha_registro')), 'primerRegistro'],
      [sequelize.fn('MAX', sequelize.col('fecha_registro')), 'ultimoRegistro'],
    ],
    raw: true,
  });
  return {
    primerRegistro: resultado?.primerRegistro || null,
    ultimoRegistro: resultado?.ultimoRegistro || null,
  };
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado,
  reactivar,
  getPageOf,
  getRangoFechas,
  dejarPaquetesEnSede,
  getPaquetesEnSede,
  getHistorialSedeDistribuidor,
  registrarEntregaFinal,
  getHistorialEntregaFinal,
  distribuidorCubrePaquete,
  registrarDevolucionPaquete,
  getPaquetesRetornoConductor,
  getPaquetesDevueltos,
  getAniosDisponiblesPaquetesDevueltos,
};
