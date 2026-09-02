const { AnticipoExcedente, Conductor, Ruta, RutaVehiculoConductor, Vehiculo, Destino, Usuario, sequelize } = require('../models');
const AppError = require('../errors/appError');
const { Op } = require('sequelize');
const { tieneLicenciaVigente } = require('../utils/licenciaHelper');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = {
    fechaEntrega: 'fechaEntrega',
    estado: 'estado',
    idAnticipo: 'idAnticipoExcedente',
    habilitado: 'habilitado',
  };
  const parts = sortBy.split('.');
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en el campo ordenado pueden
  // salir en distinto orden relativo según el LIMIT de cada consulta.
  if (parts[0] === 'conductor') {
    return [
      [{ model: Conductor, as: 'conductor' }, { model: Usuario, as: 'usuario' }, 'nombre', direction],
      ['idAnticipoExcedente', direction],
    ];
  }
  const field = allowed[parts[0]] || 'idAnticipoExcedente';
  if (field === 'idAnticipoExcedente') return [[field, direction]];
  return [[field, direction], ['idAnticipoExcedente', direction]];
};

const getAll = async ({ idConductor, idRuta, estado, habilitado, anio, mes, q, page = 1, limit = 10, sortBy } = {}) => {
  try {
    const where = {};
    if (idConductor) where.idConductor = idConductor;
    if (idRuta) where.idRuta = parseInt(idRuta);
    if (estado) where.estado = estado;
    if (habilitado !== undefined) where.habilitado = habilitado === 'true';
    if (anio) {
      // fecha_entrega es tipo DATE en Postgres — se filtra por rango, no por LIKE.
      const anioNum = parseInt(anio);
      const mesNum = mes ? parseInt(mes) : null;
      const mesInicio = mesNum || 1;
      const inicio = `${anioNum}-${String(mesInicio).padStart(2, '0')}-01`;
      const fin = mesNum
        ? (mesNum === 12 ? `${anioNum + 1}-01-01` : `${anioNum}-${String(mesNum + 1).padStart(2, '0')}-01`)
        : `${anioNum + 1}-01-01`;
      where.fechaEntrega = { [Op.gte]: inicio, [Op.lt]: fin };
    }
    if (q) {
      const trimmed = q.trim();
      const query = `%${trimmed}%`;
      const conditions = [
        { estado: { [Op.iLike]: query } },
        // `soporte` ya no es un texto plano (es un array JSONB de URLs), así
        // que no aplica un ILIKE de texto — se sacó de la búsqueda.
        { '$conductor.usuario.nombre$': { [Op.iLike]: query } },
        { '$conductor.usuario.apellido$': { [Op.iLike]: query } },
        { '$ruta.origen$': { [Op.iLike]: query } },
      ];
      const partes = trimmed.split(/\s+/).filter(Boolean);
      if (partes.length > 1) {
        const primero = `%${partes[0]}%`;
        const resto = `%${partes.slice(1).join(' ')}%`;
        conditions.push({ [Op.and]: [{ '$conductor.usuario.nombre$': { [Op.iLike]: primero } }, { '$conductor.usuario.apellido$': { [Op.iLike]: resto } }] });
        conditions.push({ [Op.and]: [{ '$conductor.usuario.apellido$': { [Op.iLike]: primero } }, { '$conductor.usuario.nombre$': { [Op.iLike]: resto } }] });
      }
      where[Op.or] = conditions;
    }

    const offset = (page - 1) * limit;
    const order = buildOrder(sortBy);

    const { count, rows: data } = await AnticipoExcedente.findAndCountAll({
      where,
      include: [
        { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
        {
          model: Ruta,
          as: 'ruta',
          include: [{ model: Destino, as: 'destino' }]
        }
      ],
      limit,
      offset,
      order: order.length > 0 ? order : [['idAnticipoExcedente', 'DESC']],
      distinct: true,
    });

    await Promise.all(data.map(attachVehiculo));

    return { data, total: count };
  } catch (error) {
    throw error;
  }
};

const ANTICIPO_INCLUDE = [
  { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
  {
    model: Ruta,
    as: 'ruta',
    include: [{ model: Destino, as: 'destino' }]
  }
];

// El vehículo de un anticipo es el que le tocó a SU conductor en esa ruta (una ruta
// puede repartirse entre varios vehículos+conductor) — ya no hay una asociación
// directa Ruta→Vehiculo, así que se resuelve aparte contra la tabla intermedia y se
// anexa en ruta.vehiculo para no romper la forma que ya esperaba el frontend.
const attachVehiculo = async (anticipo) => {
  if (anticipo?.ruta) {
    const par = await RutaVehiculoConductor.findOne({
      where: { idRuta: anticipo.idRuta, idConductor: anticipo.idConductor, habilitado: true },
      include: [{ model: Vehiculo, as: 'vehiculo' }],
    });
    anticipo.ruta.dataValues.vehiculo = par?.vehiculo || null;
  }
  return anticipo;
};

const getAnticipoCompleto = async (id) => {
  const anticipo = await AnticipoExcedente.findByPk(id, { include: ANTICIPO_INCLUDE });
  return attachVehiculo(anticipo);
};

const getById = async (id) => {
  const anticipo = await getAnticipoCompleto(id);

  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  return anticipo;
};

const create = async (data) => {
  const { idRuta, idRutaVehiculoConductor, valorAnticipo, soporte, fechaEntrega } = data;

  if (!idRuta) {
    throw new AppError('La ruta es obligatoria', 400);
  }
  if (!idRutaVehiculoConductor) {
    throw new AppError('Debes seleccionar el vehículo y conductor de la ruta', 400);
  }

  const ruta = await Ruta.findByPk(idRuta);
  if (!ruta) {
    throw new AppError('Ruta no encontrada', 404);
  }

  // Una ruta ahora puede tener varios pares vehículo+conductor — hay que confirmar
  // que el par elegido de verdad pertenece a esta ruta, y de ahí sale el conductor
  // (ya no se selecciona aparte, así nunca queda desincronizado).
  const par = await RutaVehiculoConductor.findOne({ where: { idRutaVehiculoConductor, habilitado: true } });
  if (!par || par.idRuta !== ruta.idRuta) {
    throw new AppError('El vehículo/conductor elegido no pertenece a esta ruta', 400);
  }
  const idConductor = par.idConductor;

  const conductor = await Conductor.findByPk(idConductor);
  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  if (!tieneLicenciaVigente(conductor.categoriasLicencia)) {
    throw new AppError('El conductor tiene la licencia de conducción vencida y no puede recibir anticipos', 400);
  }

  // La regla pasa de "un anticipo activo por ruta" a "un anticipo activo por
  // conductor dentro de la ruta" — con varios conductores por ruta, cada uno
  // puede tener el suyo sin chocar entre sí.
  const anticipoExistente = await AnticipoExcedente.findOne({
    where: { idRuta: ruta.idRuta, idConductor, habilitado: true, estado: { [Op.in]: ['Entregado', 'En Legalización'] } }
  });
  if (anticipoExistente) {
    throw new AppError('Este conductor ya tiene un anticipo activo en esta ruta.', 409);
  }

  const cleanDate = (value) => {
    if (value === null || value === '' || value === 'Invalid date') {
      return null;
    }
    return value;
  };

  const anticipo = await AnticipoExcedente.create({
    idConductor,
    idRuta: ruta.idRuta,
    valorAnticipo: valorAnticipo || 0,
    valorGastado: 0,
    excedente: 0,
    estado: 'Entregado',
    soporte,
    fechaEntrega: cleanDate(fechaEntrega)
  });

  return getAnticipoCompleto(anticipo.idAnticipoExcedente);
};

// Qué se puede tocar en cada estado (ver CLAUDE.md, "Edición de Anticipos"):
//   Entregado                      → ruta/conductor/valorAnticipo/fechaEntrega (valorGastado no)
//   En Legalización                → solo valorGastado (obligatorio)
//   Excedente pendiente/Completado → nada (avanza con "Confirmar devolución", ver entregarExcedente)
const update = async (id, data) => {
  const {
    idRuta,
    idRutaVehiculoConductor,
    valorAnticipo,
    valorGastado,
    estado,
    soporte,
    fechaEntrega,
    fechaLegalizacion,
    fechaEntregaExcedente
  } = data;

  const anticipo = await AnticipoExcedente.findByPk(id);

  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  if (['Excedente pendiente', 'Completado'].includes(anticipo.estado)) {
    throw new AppError(`No se puede editar un anticipo en estado "${anticipo.estado}".`, 400);
  }

  const enLegalizacion = anticipo.estado === 'En Legalización';

  if (enLegalizacion) {
    if (idRuta !== undefined || idRutaVehiculoConductor !== undefined || valorAnticipo !== undefined || fechaEntrega !== undefined) {
      throw new AppError('La ruta, el vehículo/conductor, el valor del anticipo y la fecha de entrega ya no se pueden modificar: la ruta ya está en curso.', 400);
    }
    if (valorGastado === undefined) {
      throw new AppError('Debes registrar el valor gastado para legalizar este anticipo.', 400);
    }
  } else if (valorGastado !== undefined) {
    // anticipo.estado === 'Entregado': la ruta todavía no arrancó, así que
    // todavía no hay nada que legalizar.
    throw new AppError('No se puede registrar el valor gastado antes de que la ruta esté en curso.', 400);
  }

  let idRutaFinal;
  let idConductorFinal;
  if (idRuta !== undefined || idRutaVehiculoConductor !== undefined) {
    if (!idRuta || !idRutaVehiculoConductor) {
      throw new AppError('Debes indicar la ruta y el vehículo/conductor', 400);
    }
    const ruta = await Ruta.findByPk(idRuta);
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    // El conductor del anticipo siempre sigue al del par vehículo+conductor elegido
    // (una ruta puede tener varios) — no se selecciona aparte, para que nunca
    // queden desincronizados.
    const par = await RutaVehiculoConductor.findOne({ where: { idRutaVehiculoConductor, habilitado: true } });
    if (!par || par.idRuta !== ruta.idRuta) {
      throw new AppError('El vehículo/conductor elegido no pertenece a esta ruta', 400);
    }
    const anticipoExistente = await AnticipoExcedente.findOne({
      where: {
        idRuta: ruta.idRuta,
        idConductor: par.idConductor,
        habilitado: true,
        estado: { [Op.in]: ['Entregado', 'En Legalización'] },
        idAnticipoExcedente: { [Op.ne]: id },
      }
    });
    if (anticipoExistente) {
      throw new AppError('Este conductor ya tiene un anticipo activo en esta ruta.', 409);
    }
    const conductorDeRuta = await Conductor.findByPk(par.idConductor);
    if (conductorDeRuta && !tieneLicenciaVigente(conductorDeRuta.categoriasLicencia)) {
      throw new AppError('El conductor de esta ruta tiene la licencia de conducción vencida y no puede recibir anticipos', 400);
    }
    idRutaFinal = ruta.idRuta;
    idConductorFinal = par.idConductor;
  }

  const cleanDate = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '' || value === 'Invalid date') return null;
    return value;
  };

  // Si se provee valorGastado, el estado y excedente se calculan automáticamente
  let autoEstado;
  let autoFechaLegalizacion;
  let newExcedente;

  if (valorGastado !== undefined) {
    // El gasto puede superar lo entregado — queda un excedente negativo (la
    // empresa le debe reponer la diferencia al conductor) en vez de bloquearlo.
    // `excedente` positivo = a favor de la empresa, negativo = a favor del
    // conductor; en ambos casos queda "Excedente pendiente" hasta que se
    // confirme el cierre (entregarExcedente) — solo si da exactamente 0 no
    // queda nada por resolver y pasa directo a Completado.
    newExcedente = parseFloat(anticipo.valorAnticipo) - parseFloat(valorGastado);
    autoEstado = newExcedente === 0 ? 'Completado' : 'Excedente pendiente';
    autoFechaLegalizacion = new Date();
  }

  const cleanedFechaEntrega = cleanDate(fechaEntrega);
  const cleanedFechaLegalizacion = cleanDate(fechaLegalizacion);
  const cleanedFechaEntregaExcedente = cleanDate(fechaEntregaExcedente);

  await anticipo.update({
    idRuta: idRutaFinal !== undefined ? idRutaFinal : anticipo.idRuta,
    idConductor: idConductorFinal !== undefined ? idConductorFinal : anticipo.idConductor,
    valorAnticipo: valorAnticipo !== undefined ? valorAnticipo : anticipo.valorAnticipo,
    valorGastado: valorGastado !== undefined ? valorGastado : anticipo.valorGastado,
    excedente: newExcedente !== undefined ? newExcedente : anticipo.excedente,
    estado: autoEstado || estado || anticipo.estado,
    soporte: soporte !== undefined ? soporte : anticipo.soporte,
    fechaEntrega: cleanedFechaEntrega !== undefined ? cleanedFechaEntrega : anticipo.fechaEntrega,
    fechaLegalizacion: autoFechaLegalizacion || (cleanedFechaLegalizacion !== undefined ? cleanedFechaLegalizacion : anticipo.fechaLegalizacion),
    fechaEntregaExcedente: cleanedFechaEntregaExcedente !== undefined ? cleanedFechaEntregaExcedente : anticipo.fechaEntregaExcedente
  });

  return getAnticipoCompleto(id);
};

const entregarExcedente = async (id, { soporte }) => {
  const anticipo = await AnticipoExcedente.findByPk(id);

  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  if (parseFloat(anticipo.excedente) === 0) {
    throw new AppError('No hay ningún saldo pendiente por resolver', 400);
  }

  await anticipo.update({
    estado: 'Completado',
    // `soporte` es un array — si llega uno nuevo se agrega a los que ya
    // había, no los reemplaza.
    soporte: soporte ? [...(anticipo.soporte || []), soporte] : anticipo.soporte,
    fechaEntregaExcedente: new Date()
  });

  return getAnticipoCompleto(id);
};


const cambiarEstado = async (id, estado) => {
  const estadosValidos = ['Entregado', 'En Legalización', 'Excedente pendiente', 'Completado'];
  if (!estadosValidos.includes(estado)) {
    throw new AppError(`Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`, 400);
  }
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) throw new AppError('Anticipo no encontrado', 404);

  const noRevertibles = ['En Legalización', 'Excedente pendiente', 'Completado'];
  if (noRevertibles.includes(anticipo.estado) && estado === 'Entregado') {
    throw new AppError(
      `No se puede revertir a "entregado" desde el estado "${anticipo.estado}". Este cambio es irreversible.`,
      400
    );
  }

  anticipo.estado = estado;
  await anticipo.save();
  return getAnticipoCompleto(id);
};

// fileUrls: array de URLs recién subidas a Cloudinary — se agregan a las que
// ya tenía el anticipo (nunca se pisan las anteriores).
const updateSoporte = async (id, fileUrls) => {
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  const soporte = [...(anticipo.soporte || []), ...fileUrls];
  await anticipo.update({ soporte });

  return { soporte };
};

const toggleHabilitado = async (id) => {
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) throw new AppError('Anticipo no encontrado', 404);
  if (anticipo.habilitado === true) {
    if (anticipo.estado !== 'Completado') {
      throw new AppError(
        'No se puede inhabilitar un anticipo que aún no ha sido cerrado',
        409,
        [{
          tipo: 'Estado del anticipo',
          id: anticipo.idAnticipoExcedente,
          descripcion: `El anticipo del ${anticipo.fechaEntrega || 'sin fecha'}, por $${anticipo.valorAnticipo}, está en estado "${anticipo.estado}" y no ha sido cerrado aún`
        }],
        'DEPENDENCY_CONFLICT'
      );
    }
  }
  anticipo.habilitado = !anticipo.habilitado;
  await anticipo.save();

  const anticipoCompleto = await getAnticipoCompleto(id);

  return anticipoCompleto;
};

// El orden por defecto de getAll (sin sortBy) es idAnticipoExcedente DESC, no
// fechaEntrega — este cálculo tiene que replicar ese mismo orden.
const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await AnticipoExcedente.findByPk(id, { attributes: ['idAnticipoExcedente'] });
  if (!record) throw new AppError('Anticipo no encontrado', 404);
  const before = await AnticipoExcedente.count({
    where: { idAnticipoExcedente: { [Op.gt]: parseInt(id) } },
  });
  const page = Math.floor(before / limit) + 1;
  const row = (before % limit) + 1;
  return { page, row };
};

const getAniosDisponibles = async () => {
  const rows = await sequelize.query(
    'SELECT DISTINCT EXTRACT(YEAR FROM fecha_entrega)::int AS anio FROM anticipo_excedente WHERE fecha_entrega IS NOT NULL ORDER BY anio DESC',
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => r.anio);
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  entregarExcedente,
  updateSoporte,
  cambiarEstado,
  toggleHabilitado,
  getPageOf,
  getAniosDisponibles,
};