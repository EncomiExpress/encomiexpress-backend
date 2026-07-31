const { Ruta, RutaVehiculoConductor, Vehiculo, Conductor, Destino, EncomiendaVenta, Usuario, AnticipoExcedente, Paquete, sequelize } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasRuta } = require('../middlewares/validateDependencies');
const { tieneLicenciaVigente } = require('../utils/licenciaHelper');

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

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaSalida', 'estado', 'idRuta', 'habilitado', 'nombreRuta'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaSalida';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" (ej. mismo estado)
  // pueden salir en distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idRuta') return [[field, direction]];
  return [[field, direction], ['idRuta', direction]];
};

const buildRutaWhere = ({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino }) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estado) where.estado = estado;
  if (idDestino) where.idDestino = parseInt(idDestino);

  // idVehiculo/idConductor ya no son columnas directas de "ruta" — se resuelven vía
  // subquery contra la tabla intermedia (usado por los links "highlight" desde las
  // páginas de Vehículo/Conductor).
  if (idConductor) {
    where.idRuta = { [Op.in]: sequelize.literal(
      `(SELECT id_ruta FROM ruta_vehiculo_conductor WHERE id_conductor = ${parseInt(idConductor)} AND habilitado = true)`
    ) };
  }
  if (idVehiculo) {
    const condicion = { [Op.in]: sequelize.literal(
      `(SELECT id_ruta FROM ruta_vehiculo_conductor WHERE id_vehiculo = ${parseInt(idVehiculo)} AND habilitado = true)`
    ) };
    where.idRuta = where.idRuta ? { [Op.and]: [where.idRuta, condicion] } : condicion;
  }

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
      { nombreRuta: { [Op.iLike]: `%${trimmed}%` } },
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

const getAll = async ({ habilitado, estado, anio, mes, page = 1, limit = 10, sortBy, q, idConductor, idVehiculo, idDestino } = {}) => {
  const where = buildRutaWhere({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino });

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const include = [INCLUDE_PARES, { model: Destino, as: 'destino' }];

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
    order: order.length > 0 ? order : [['fechaSalida', 'DESC'], ['horaSalida', 'DESC'], ['idRuta', 'DESC']],
    distinct: true,
  });

  const enCursoIds = data.filter(r => r.estado === 'En Curso').map(r => r.idRuta);
  if (enCursoIds.length > 0) {
    const pendientes = await AnticipoExcedente.findAll({
      where: { idRuta: { [Op.in]: enCursoIds }, estado: 'En Legalización', habilitado: true },
      attributes: ['idRuta'],
    });
    const pendientesSet = new Set(pendientes.map(a => a.idRuta));
    data.forEach(r => { r.dataValues.pendienteLegalizacion = pendientesSet.has(r.idRuta); });
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

const getById = async (id) => {
  const ruta = await Ruta.findByPk(id, {
    include: [INCLUDE_PARES, { model: Destino, as: 'destino' }]
  });

  if (!ruta) {
    throw new AppError('Ruta no encontrada', 404);
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

// Ventana de "enfriamiento" de COOLDOWN_DIAS después de la salida de cualquier otra
// ruta (Programada o En Curso) del mismo vehículo o conductor — ver validarEnfriamiento
// más abajo. El conflicto "el conductor todavía anda de viaje" (más allá de esta
// ventana) sigue resolviéndose aparte con Conductor.estado/Vehiculo.estado='En Ruta' +
// el chequeo que ya existe al pasar una ruta a 'En Curso' (ver updateEstado, códigos
// VEHICLE_IN_USE/CONDUCTOR_IN_USE).
// Un vehículo o conductor que ya tiene otra ruta (Programada/En Curso) necesita
// COOLDOWN_DIAS de margen antes Y después de esa salida — no se puede asumir que ya
// volvió (la duración real de un viaje depende del destino, no se puede adivinar), y
// tampoco importa en qué orden se programen las rutas: una ruta que sale el día D
// bloquea [D-COOLDOWN_DIAS, D+COOLDOWN_DIAS] para ese mismo vehículo/conductor. Cada
// ruta existente arma su propia ventana independiente — no se acumulan ni se fusionan
// entre rutas separadas por más días que el margen (ej. una ruta el día 5 y otra el día
// 20 del mismo conductor no bloquean nada entre medio). El choque exacto (misma fecha)
// queda cubierto como caso particular (distancia 0).
const COOLDOWN_DIAS = 2;

const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

const validarEnfriamiento = async ({ idVehiculo, idConductor, fechaSalida, idRutaExcluir }) => {
  if (!fechaSalida) return;

  // Ventana simétrica: cualquier otra ruta del mismo vehículo/conductor a menos de
  // COOLDOWN_DIAS de distancia (antes o después) de la fecha candidata choca — así no
  // importa el orden en que se programen (crear primero la más tardía y después una más
  // temprana muy pegada a esa no se escapa de la validación).
  const desde = sumarDias(fechaSalida, -COOLDOWN_DIAS);
  const hasta = sumarDias(fechaSalida, COOLDOWN_DIAS);
  const conflicto = await RutaVehiculoConductor.findOne({
    where: {
      habilitado: true,
      [Op.or]: [{ idVehiculo }, { idConductor }],
      ...(idRutaExcluir ? { idRuta: { [Op.ne]: idRutaExcluir } } : {}),
    },
    include: [{
      model: Ruta,
      as: 'ruta',
      required: true,
      where: {
        estado: { [Op.in]: ['Programada', 'En Curso'] },
        fechaSalida: { [Op.between]: [desde, hasta] },
      },
    }],
  });

  if (conflicto) {
    const rangoDesde = sumarDias(conflicto.ruta.fechaSalida, -COOLDOWN_DIAS);
    const rangoHasta = sumarDias(conflicto.ruta.fechaSalida, COOLDOWN_DIAS);
    throw new AppError(
      `Este vehículo o conductor ya tiene otra ruta (#${conflicto.idRuta}) programada el ${conflicto.ruta.fechaSalida} y necesita ${COOLDOWN_DIAS} días de margen. No se puede programar otra entre el ${rangoDesde} y el ${rangoHasta}.`,
      409,
      [{
        tipo: 'Enfriamiento de vehículo/conductor',
        id: conflicto.idRuta,
        descripcion: `La Ruta #${conflicto.idRuta} ya tiene este vehículo/conductor asignado, con salida el ${conflicto.ruta.fechaSalida}`
      }],
      'COOLDOWN_CONFLICT'
    );
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

const create = async (data) => {
  const { idDestino, nombreRuta, fechaSalida, horaSalida, horaLlegadaEstimada, estado, observaciones, pares } = data;

  validarPares(pares);

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

    await validarEnfriamiento({ idVehiculo: par.idVehiculo, idConductor: par.idConductor, fechaSalida });
  }

  const transaction = await sequelize.transaction();
  let idRutaCreada;
  try {
    const ruta = await Ruta.create({
      nombreRuta: nombreRuta || null,
      idDestino,
      fechaSalida: fechaSalida || null,
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

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return getById(idRutaCreada);
};

const update = async (id, data) => {
  const { nombreRuta, idDestino, fechaSalida, horaSalida, horaLlegadaEstimada, estado, observaciones, habilitado, pares } = data;

  const ruta = await Ruta.findByPk(id);
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  // Edición general solo permitida en Programada (nada comprometido aún) o
  // Cancelada (se puede reprogramar libremente). "En Curso"/"Completada" ya
  // tienen guías/anticipos/estados en cascada que dependen de estos datos —
  // cambiarlos por fuera de updateEstado corrompería esa cadena.
  if (!['Programada', 'Cancelada'].includes(ruta.estado)) {
    throw new AppError(`No se puede editar una ruta en estado "${ruta.estado}". Solo se puede editar cuando está Programada o Cancelada.`, 400);
  }

  if (idDestino !== undefined) {
    const destinoNuevo = await Destino.findByPk(idDestino);
    if (!destinoNuevo) throw new AppError('Destino no encontrado', 404);
  }

  const nuevaFechaSalida = fechaSalida !== undefined ? fechaSalida : ruta.fechaSalida;
  const nuevaHoraSalida = horaSalida !== undefined ? horaSalida : ruta.horaSalida;
  const fechaHoraCambio = fechaSalida !== undefined || horaSalida !== undefined;

  if (pares !== undefined) validarPares(pares);

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
          await validarEnfriamiento({
            idVehiculo: par.idVehiculo, idConductor: par.idConductor,
            fechaSalida: nuevaFechaSalida, idRutaExcluir: parseInt(id),
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
        await validarEnfriamiento({
          idVehiculo: par.idVehiculo, idConductor: par.idConductor,
          fechaSalida: nuevaFechaSalida, idRutaExcluir: parseInt(id),
        });
      }
    }

    await ruta.update({
      nombreRuta:            nombreRuta            !== undefined ? nombreRuta            : ruta.nombreRuta,
      idDestino:             idDestino             !== undefined ? idDestino             : ruta.idDestino,
      fechaSalida:           nuevaFechaSalida,
      horaSalida:            nuevaHoraSalida,
      horaLlegadaEstimada:   horaLlegadaEstimada   !== undefined ? horaLlegadaEstimada   : ruta.horaLlegadaEstimada,
      estado:                estado                !== undefined ? estado                : ruta.estado,
      observaciones:         observaciones         !== undefined ? observaciones         : ruta.observaciones,
      habilitado:            habilitado            !== undefined ? habilitado            : ruta.habilitado
    }, { transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return getById(id);
};

const updateEstado = async (id, estado) => {
  const estadosValidos = ['Programada', 'En Curso', 'Completada', 'Cancelada'];
  if (!estadosValidos.includes(estado)) {
    throw new AppError(`Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`, 400);
  }

  const ruta = await Ruta.findByPk(id, { include: [INCLUDE_PARES] });
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  if (ruta.estado === 'Completada') {
    throw new AppError('No se puede cambiar el estado de una ruta completada', 400);
  }

  if (estado === 'Programada' && ruta.estado === 'En Curso') {
    throw new AppError('No se puede revertir el estado de una ruta en curso a Programada', 400);
  }

  if (estado === 'Cancelada' && ruta.estado === 'Programada') {
    throw new AppError('No se puede cancelar una ruta que aún no ha iniciado. Edítala o inhabilítala en su lugar.', 400);
  }

  const pares = ruta.paresVehiculoConductor || [];

  if (estado === 'En Curso') {
    for (const par of pares) {
      const conflictoVehiculo = await RutaVehiculoConductor.findOne({
        where: { idVehiculo: par.idVehiculo, habilitado: true, idRuta: { [Op.ne]: id } },
        include: [{ model: Ruta, as: 'ruta', required: true, where: { estado: 'En Curso' } }],
      });
      if (conflictoVehiculo) {
        throw new AppError(
          `El vehículo ${par.vehiculo?.placa || ''} ya está en curso en otra ruta (Ruta #${conflictoVehiculo.idRuta})`,
          409,
          [{
            tipo: 'Conflicto de vehículo',
            id: conflictoVehiculo.idRuta,
            descripcion: `${par.vehiculo?.placa || 'Vehículo'} ya está asignado a la Ruta #${conflictoVehiculo.idRuta} que se encuentra En Curso`
          }],
          'VEHICLE_IN_USE'
        );
      }

      const conflictoConductor = await RutaVehiculoConductor.findOne({
        where: { idConductor: par.idConductor, habilitado: true, idRuta: { [Op.ne]: id } },
        include: [{ model: Ruta, as: 'ruta', required: true, where: { estado: 'En Curso' } }],
      });
      if (conflictoConductor) {
        const u = par.conductor?.usuario;
        throw new AppError(
          `El conductor ${u ? `${u.nombre} ${u.apellido}` : ''} ya está en curso en otra ruta (Ruta #${conflictoConductor.idRuta})`,
          409,
          [{
            tipo: 'Conflicto de conductor',
            id: conflictoConductor.idRuta,
            descripcion: `${u ? `${u.nombre} ${u.apellido}` : 'El conductor'} ya está asignado a la Ruta #${conflictoConductor.idRuta} que se encuentra En Curso`
          }],
          'CONDUCTOR_IN_USE'
        );
      }

      // Revalidación de documentos/licencia justo al iniciar — antes solo se
      // validaba al crear/asignar el par, nunca al pasar a "En Curso". Si un
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
    if (encomiendaCount === 0) {
      throw new AppError('No se puede iniciar la ruta sin encomiendas asignadas. Registra al menos una encomienda antes de poner la ruta En Curso.', 400);
    }

    for (const par of pares) {
      await Vehiculo.update({ estado: 'En Ruta' }, { where: { idVehiculo: par.idVehiculo } });
      await Conductor.update({ estado: 'En Ruta' }, { where: { idConductor: par.idConductor } });
    }
    await AnticipoExcedente.update(
      { estado: 'En Legalización' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'Entregado' } }
    );
    await EncomiendaVenta.update(
      { estado: 'En Tránsito' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'Programada' } }
    );
  }

  if (estado === 'Completada') {
    const anticipoPendiente = await AnticipoExcedente.findOne({
      where: { idRuta: ruta.idRuta, habilitado: true, estado: 'En Legalización' },
      attributes: ['idAnticipoExcedente'],
    });
    if (anticipoPendiente) {
      throw new AppError('El conductor aún no ha registrado los gastos del anticipo. Ingresa esa información antes de completar la ruta.', 409);
    }
  }

  if ((estado === 'Completada' || estado === 'Cancelada') && ruta.estado === 'En Curso') {
    for (const par of pares) {
      await Vehiculo.update({ estado: 'Disponible' }, { where: { idVehiculo: par.idVehiculo } });
      await Conductor.update({ estado: 'Disponible' }, { where: { idConductor: par.idConductor } });
    }
  }

  if (estado === 'Completada') {
    await EncomiendaVenta.update(
      { estado: 'Entregada' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'En Tránsito' } }
    );
  }

  if (estado === 'Cancelada') {
    // Las ventas quedan pendientes de reasignación a otra ruta (no se cancelan):
    // pueden seguir su curso una vez se les asigne una ruta activa.
    await EncomiendaVenta.update(
      { estado: 'Programada' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: { [Op.in]: ['Programada', 'En Tránsito'] } } }
    );
    // El excedente se calcula aquí (no solo se fuerza el estado) porque la ruta se
    // cancela antes de que el conductor legalice: si se dejara en 0, "Confirmar
    // devolución" quedaría bloqueado para siempre (exige excedente > 0) y esa plata
    // entregada quedaría huérfana, sin forma de cerrarse en el sistema.
    const anticiposActivos = await AnticipoExcedente.findAll({
      where: { idRuta: ruta.idRuta, habilitado: true, estado: { [Op.in]: ['Entregado', 'En Legalización'] } }
    });
    for (const anticipo of anticiposActivos) {
      anticipo.excedente = anticipo.valorAnticipo - anticipo.valorGastado;
      anticipo.estado = 'Excedente pendiente';
      await anticipo.save();
    }
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

  ruta.habilitado = !ruta.habilitado;
  await ruta.save();
  return ruta;
};

const getAniosDisponibles = async () => {
  const rows = await sequelize.query(
    'SELECT DISTINCT EXTRACT(YEAR FROM fecha_salida)::int AS anio FROM ruta ORDER BY anio DESC',
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => r.anio);
};

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await Ruta.findByPk(id, { attributes: ['idRuta', 'fechaSalida', 'horaSalida'] });
  if (!record) throw new AppError('Ruta no encontrada', 404);
  const before = await Ruta.count({
    where: {
      [Op.or]: [
        { fechaSalida: { [Op.gt]: record.fechaSalida } },
        {
          fechaSalida: record.fechaSalida,
          horaSalida: { [Op.gt]: record.horaSalida },
        },
        {
          fechaSalida: record.fechaSalida,
          horaSalida: record.horaSalida,
          idRuta: { [Op.gt]: parseInt(id) },
        },
      ],
    },
  });
  const page = Math.floor(before / limit) + 1;
  const row = (before % limit) + 1;
  return { page, row };
};

// Devuelve, para la lista de vehículos/conductores dada, todas las rutas activas
// (Programada/En Curso) que ya los tienen asignados — es la materia prima que usa el
// frontend para pintar el calendario de disponibilidad al registrar/editar una ruta
// (un día cae "ocupado" si está a ≤COOLDOWN_DIAS de alguna de estas fechas; ver
// validarEnfriamiento más arriba, misma regla, calculada en el cliente para poder
// mostrarla antes de que el usuario intente guardar). idRutaExcluir se usa al editar,
// para no chocar contra la propia ruta que se está editando.
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
        where: { estado: { [Op.in]: ['Programada', 'En Curso'] } },
        attributes: ['idRuta', 'nombreRuta', 'fechaSalida'],
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
    nombreRuta: p.ruta.nombreRuta,
    fechaSalida: p.ruta.fechaSalida,
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
};
