const { AnticipoExcedente, Conductor, Ruta, RutaVehiculoConductor, Vehiculo, Destino, Usuario, sequelize } = require('../models');
const AppError = require('../errors/appError');
const { Op } = require('sequelize');
const { tieneLicenciaVigente } = require('../utils/licenciaHelper');
const { MAX_DIAS_ANTICIPACION } = require('../utils/horarioLaboral');

const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

// La fecha de entrega del anticipo (cuándo se le dio la plata al conductor) no puede
// ser posterior a la salida de la ruta -- no tiene sentido entregar el anticipo
// después de que el vehículo ya salió. Tampoco puede ser una fecha absurdamente
// vieja: mismo horizonte (MAX_DIAS_ANTICIPACION, 90 días) que ya limita las fechas de
// Ruta/Venta, aplicado hacia atrás en vez de hacia adelante. Fuente de verdad; el
// frontend replica esto en anticipoValidation.js.
const validarFechaEntregaAnticipo = (fechaEntrega, ruta) => {
  if (!fechaEntrega) return;
  if (ruta?.fechaSalida && fechaEntrega > ruta.fechaSalida) {
    throw new AppError(`La fecha de entrega no puede ser posterior a la salida de la ruta (máximo el ${ruta.fechaSalida})`, 400);
  }
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const minima = sumarDias(hoy, -MAX_DIAS_ANTICIPACION);
  if (fechaEntrega < minima) {
    throw new AppError(`La fecha de entrega no puede ser más de ${MAX_DIAS_ANTICIPACION} días en el pasado (mínimo el ${minima})`, 400);
  }
};

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
    // Acepta un solo estado ("Completado") o varios separados por coma
    // ("Completado,Cancelado") -- lo segundo es lo que usa el toggle
    // "Pendientes"/"Historial" del móvil admin (ver LOGICA.md, "Toggle
    // Pendientes/Historial"), para no tener que traer TODOS los anticipos al
    // cliente y filtrar ahí (con límite 100, se podían perder registros fuera
    // de esa ventana -- ver el comentario en admin_home.dart).
    if (estado) {
      const estados = estado.split(',').map((e) => e.trim()).filter(Boolean);
      where.estado = estados.length > 1 ? { [Op.in]: estados } : estados[0];
    }
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
//
// De paso, esta misma búsqueda dice si el anticipo quedó "huérfano": si no aparece
// ningún par activo con ese idRuta+idConductor es porque el par se reasignó a otro
// conductor después de entregarle este anticipo (ver LOGICA.md, "Anticipos huérfanos
// al reasignar conductor") — se expone en `esHuerfano` para el chip de aviso del
// listado (useAnticipoColumns.jsx).
const attachVehiculo = async (anticipo) => {
  let par = null;
  if (anticipo?.ruta) {
    par = await RutaVehiculoConductor.findOne({
      where: { idRuta: anticipo.idRuta, idConductor: anticipo.idConductor, habilitado: true },
      include: [{ model: Vehiculo, as: 'vehiculo' }],
    });
    anticipo.ruta.dataValues.vehiculo = par?.vehiculo || null;
  }
  anticipo.dataValues.esHuerfano = !!anticipo?.ruta && !par;
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

  const fechaEntregaLimpia = cleanDate(fechaEntrega);
  validarFechaEntregaAnticipo(fechaEntregaLimpia, ruta);

  const anticipo = await AnticipoExcedente.create({
    idConductor,
    idRuta: ruta.idRuta,
    valorAnticipo: valorAnticipo || 0,
    valorGastado: 0,
    excedente: 0,
    estado: 'Entregado',
    soporte,
    fechaEntrega: fechaEntregaLimpia
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

  if (['Excedente pendiente', 'Completado', 'Cerrado sin entregar'].includes(anticipo.estado)) {
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
    // Comprobante obligatorio para legalizar -- mismo criterio que la evidencia
    // de entrega final de Paquetes (ver LOGICA.md, "Evidencia de entrega final
    // obligatoria"): un valorGastado sin ningún respaldo es solo un número
    // declarado. `anticipo.soporte` ya refleja lo subido hasta ahora, incluido
    // lo que se haya subido justo antes en esta misma sesión de guardado (el
    // móvil sube el/los archivo(s) vía POST /anticipos/:id/soporte ANTES de
    // mandar este PUT con valorGastado -- ver anticipo_edit.dart).
    if (!anticipo.soporte || anticipo.soporte.length === 0) {
      throw new AppError('Debes subir al menos un comprobante (soporte) antes de legalizar este anticipo.', 400);
    }
  } else if (valorGastado !== undefined) {
    // anticipo.estado === 'Entregado': la ruta todavía no arrancó, así que
    // todavía no hay nada que legalizar.
    throw new AppError('No se puede registrar el valor gastado antes de que la ruta esté en curso.', 400);
  }

  let idRutaFinal;
  let idConductorFinal;
  let rutaResuelta;
  if (idRuta !== undefined || idRutaVehiculoConductor !== undefined) {
    if (!idRuta || !idRutaVehiculoConductor) {
      throw new AppError('Debes indicar la ruta y el vehículo/conductor', 400);
    }
    const ruta = await Ruta.findByPk(idRuta);
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    rutaResuelta = ruta;
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

  const cleanedFechaEntrega = cleanDate(fechaEntrega);
  if (cleanedFechaEntrega !== undefined) {
    // Si esta misma petición no trae idRuta (raro -- el frontend siempre manda
    // ambos mientras el anticipo sigue editable, ver ActualizarAnticipoExcedente.jsx),
    // se valida contra la ruta que el anticipo ya tenía.
    const rutaParaValidar = rutaResuelta || await Ruta.findByPk(anticipo.idRuta);
    validarFechaEntregaAnticipo(cleanedFechaEntrega, rutaParaValidar);
  }

  // Si se provee valorGastado, el estado y excedente se calculan automáticamente
  let autoEstado;
  let autoFechaLegalizacion;
  let newExcedente;
  // A qué ruta apunta el auto-completado de más abajo -- ver ahí. Se resuelve
  // acá (no en el momento de usarlo) porque `esIda`/`rutaDelAnticipo` viven
  // dentro del bloque de abajo y quedan fuera de alcance después.
  let idRutaParaAutoCompletar;

  if (valorGastado !== undefined) {
    // Candado: legalizar = subir valorGastado + soporte, y eso solo lo hace el
    // conductor desde el móvil (el panel admin no ofrece la acción una vez el
    // anticipo pasa a "En Legalización"). No puede hacerlo hasta dejar TODOS los
    // paquetes en las sedes de la ruta — no tiene forma de reunir los soportes
    // del viaje antes de llegar al destino final. Ver LOGICA.md, "Entrega en dos
    // fases". require lazy para no atar el orden de carga de módulos.
    //
    // Excepción: ruta "Cancelada" (2026-09-07) — un viaje cancelado a mitad de
    // camino nunca va a llegar a "todas las sedes completas" (el viaje ya no
    // sigue), así que el candado se salta: el conductor puede legalizar lo que
    // sí alcanzó a gastar hasta donde llegó. rutaService.updateEstado ya NO
    // fuerza el excedente al cancelar justamente para dejarle esta puerta
    // abierta (ver ahí, rama `estado === 'Cancelada'`).
    //
    // Anticipo ida+retorno (2026-09-13, ver LOGICA.md): el anticipo se sigue
    // creando sobre la IDA únicamente, pero cubre el viaje completo — no basta
    // con que la ida complete sus propias sedes, hay que esperar a que el
    // regreso también termine de entregar. Si esta ruta YA es un regreso (caso
    // raro: un anticipo creado directo sobre esa ruta), se queda con el
    // chequeo de siempre sobre sí misma -- no existe "regreso del regreso"
    // (mismo criterio que el guard `!esRegreso` de useRutaColumns.jsx).
    const rutaDelAnticipo = await Ruta.findByPk(anticipo.idRuta, {
      attributes: ['idRuta', 'estado', 'idRutaIda'],
      include: [{ model: Ruta, as: 'rutaRegreso', attributes: ['idRuta', 'estado'] }],
    });
    const esIda = rutaDelAnticipo?.idRutaIda == null;
    // El anticipo vive en la ida, pero lo que de verdad puede necesitar
    // auto-completarse acá es el REGRESO (la ida normalmente ya está
    // Completada desde antes de que el regreso siquiera arrancara) -- ver el
    // uso más abajo, junto a `intentarAutoCompletar`.
    idRutaParaAutoCompletar = esIda ? (rutaDelAnticipo.rutaRegreso?.idRuta ?? anticipo.idRuta) : anticipo.idRuta;
    // Un regreso cancelado tampoco va a llegar nunca a "todas las sedes
    // completas" -- mismo criterio que una ida cancelada, se salta el candado.
    const rutaCancelada = esIda
      ? (rutaDelAnticipo?.estado === 'Cancelada' || rutaDelAnticipo?.rutaRegreso?.estado === 'Cancelada')
      : rutaDelAnticipo?.estado === 'Cancelada';
    if (!rutaCancelada) {
      if (esIda && !rutaDelAnticipo.rutaRegreso) {
        throw new AppError(
          'Aún no puedes legalizar el anticipo: cubre también el viaje de regreso, que todavía no se ha programado.',
          409,
          null,
          'REGRESO_NO_PROGRAMADO'
        );
      }
      const idRutaAValidar = esIda ? rutaDelAnticipo.rutaRegreso.idRuta : anticipo.idRuta;
      const { total, completadas } = await require('./rutaService').calcularSedesRuta(idRutaAValidar);
      if (total > 0 && completadas < total) {
        throw new AppError(
          `Aún no puedes legalizar el anticipo: faltan ${total - completadas} de ${total} sedes por completar${esIda ? ' del regreso' : ''}. Deja todos los paquetes en las sedes de la ruta primero.`,
          409,
          null,
          'SEDES_INCOMPLETAS'
        );
      }
    }

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

  // Corregido 2026-09-13 (la usuaria: un regreso que sale SIN NADA asignado
  // nunca tiene ningún paquete que dispare dejarPaquetesEnSede/
  // actualizarEstadoPaquete, así que jamás llega a auto-completarse por esa
  // vía -- se queda "En Ruta" para siempre. En vez de completarlo apenas
  // arranca (se descartó: no tiene sentido que una ruta se complete sola al
  // segundo de salir, el vehículo todavía tiene que hacer el viaje de
  // vuelta), el disparador correcto es que EL CONDUCTOR legalice el anticipo
  // -- ese es el primer evento real que solo ocurre cuando de verdad ya
  // volvió. Antes esta llamada usaba `anticipo.idRuta` (la IDA, donde vive el
  // anticipo) en vez del REGRESO que de verdad puede seguir "En Ruta" -- la
  // ida ya está Completada desde antes de que el regreso arrancara, así que
  // apuntarle acá era casi siempre un no-op real, sin efecto sobre el
  // problema real. `idRutaParaAutoCompletar` (calculado arriba) ya resuelve
  // el id correcto. Sigue siendo best-effort/seguro para un regreso CON carga
  // real: para ese caso dejarPaquetesEnSede ya lo completó antes de que la
  // legalización llegara siquiera a ser posible (exige sedes completas), así
  // que acá `intentarAutoCompletar` encuentra `estado !== 'En Ruta'` y no
  // hace nada -- esto solo actúa de verdad cuando nada más lo hizo antes.
  // require lazy para no atar el orden de carga. Ver LOGICA.md.
  if (autoEstado) {
    await require('./rutaService').intentarAutoCompletar(idRutaParaAutoCompletar || anticipo.idRuta);
  }

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


// Caso real distinto del "huérfano" (ver LOGICA.md, "Anticipos huérfanos al reasignar
// conductor"): el admin registró un anticipo pensando en dárselo a un conductor, pero
// al final no se lo dio, y para cuando se dio cuenta la ruta ya había arrancado (el
// anticipo ya pasó a "En Legalización"). Nunca va a llegar a "Completado" -- eso
// depende de que el conductor reporte valorGastado desde el móvil, algo absurdo de
// pedirle si nunca recibió esa plata. Fusionado dentro de toggleHabilitado() (ver ahí)
// en vez de ser una acción/botón aparte -- decisión de la usuaria (2026-09-13): un solo
// botón ("Inhabilitar"), no dos. Solo aplica a Entregado/En Legalización -- "Excedente
// pendiente" ya implica un valorGastado real reportado (sí hubo plata de por medio),
// eso sigue bloqueado hasta resolverse por "Confirmar devolución/reposición".
// Ver LOGICA.md, "Cerrar un anticipo que nunca se llegó a entregar".
const ESTADOS_CERRABLES_SIN_ENTREGA = ['Entregado', 'En Legalización'];
const MOTIVO_CIERRE_MAX_LENGTH = 500;

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

const toggleHabilitado = async (id, { motivo } = {}) => {
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) throw new AppError('Anticipo no encontrado', 404);
  if (anticipo.habilitado === true) {
    // Huérfano: el conductor de este anticipo ya no es par activo de su ruta (el par se
    // reasignó a alguien más después de entregarle este anticipo) — nada del flujo
    // normal (legalizar desde el móvil, cerrar la ruta) va a llegar a tocarlo nunca, así
    // que se deja inhabilitar directo sin exigir "Completado". Decisión de la usuaria
    // (2026-09-12): solo para este caso puntual (ver LOGICA.md, "Anticipos huérfanos al
    // reasignar conductor").
    const parVigente = await RutaVehiculoConductor.findOne({
      where: { idRuta: anticipo.idRuta, idConductor: anticipo.idConductor, habilitado: true },
    });
    const yaCerrado = ['Completado', 'Cerrado sin entregar'].includes(anticipo.estado);
    if (!yaCerrado && parVigente) {
      // No es huérfano y todavía no está cerrado -- "Cerrar sin entregar" (2026-09-13,
      // ver LOGICA.md) vive fusionado en este mismo botón en vez de ser una acción
      // aparte: si de verdad no hay plata real de por medio todavía (Entregado/En
      // Legalización), inhabilitar exige declarar un motivo y el anticipo pasa a
      // "Cerrado sin entregar" en el mismo golpe. "Excedente pendiente" ya implica un
      // valorGastado real reportado -- sigue bloqueado, tiene que resolverse por
      // "Confirmar devolución/reposición" primero, no por acá.
      if (ESTADOS_CERRABLES_SIN_ENTREGA.includes(anticipo.estado)) {
        const motivoLimpio = (motivo || '').trim();
        if (!motivoLimpio) {
          throw new AppError(
            'Este anticipo no ha sido completado: para inhabilitarlo hace falta declarar que el conductor nunca recibió esta plata.',
            409,
            [{
              tipo: 'Motivo requerido',
              id: anticipo.idAnticipoExcedente,
              descripcion: 'Inhabilitar este anticipo sin completarlo requiere un motivo'
            }],
            'MOTIVO_REQUERIDO'
          );
        }
        if (motivoLimpio.length > MOTIVO_CIERRE_MAX_LENGTH) {
          throw new AppError(`El motivo no puede superar los ${MOTIVO_CIERRE_MAX_LENGTH} caracteres.`, 400);
        }
        anticipo.estado = 'Cerrado sin entregar';
        anticipo.motivoCierre = motivoLimpio;
      } else {
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
  toggleHabilitado,
  getPageOf,
  getAniosDisponibles,
};