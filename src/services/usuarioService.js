const bcrypt = require('bcryptjs');
const { sequelize, Usuario, Rol, Conductor, Cliente, UsuarioSede, Destino } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { tieneRutasActivas, tieneAnticiposPendientes, tieneEncomiendasActivasPorCliente } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['nombre', 'apellido', 'email', 'idUsuario', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idUsuario';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" pueden salir en
  // distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idUsuario') return [[field, direction]];
  return [[field, direction], ['idUsuario', direction]];
};

const getAll = async ({ habilitado, idRol, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (idRol !== undefined) where.idRol = idRol;
  if (q) {
    const trimmed = q.trim();
    const query = `%${trimmed}%`;
    const conditions = [
      { nombre: { [Op.iLike]: query } },
      { apellido: { [Op.iLike]: query } },
      { email: { [Op.iLike]: query } },
      { tipoIdentificacion: { [Op.iLike]: query } },
      { numeroIdentificacion: { [Op.iLike]: query } },
      { '$rol.nombre$': { [Op.iLike]: query } },
    ];
    const partes = trimmed.split(/\s+/).filter(Boolean);
    if (partes.length > 1) {
      const primero = `%${partes[0]}%`;
      const resto = `%${partes.slice(1).join(' ')}%`;
      conditions.push({ [Op.and]: [{ nombre: { [Op.iLike]: primero } }, { apellido: { [Op.iLike]: resto } }] });
      conditions.push({ [Op.and]: [{ apellido: { [Op.iLike]: primero } }, { nombre: { [Op.iLike]: resto } }] });
    }
    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;

  const include = [
    { model: Rol, as: 'rol' },
    // separate: true -> consulta aparte, no infla el LIMIT/distinct del listado.
    // Solo trae filas para distribuidores; vacío para cualquier otro rol.
    {
      model: UsuarioSede, as: 'sedes', separate: true, where: { habilitado: true }, required: false,
      include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio', 'departamento'] }],
    },
  ];
  const order = buildOrder(sortBy);

  const { count, rows: data } = await Usuario.findAndCountAll({
    where,
    include,
    attributes: { exclude: ['password'] },
    limit,
    offset,
    // Estado neutral (sin sortBy): más reciente primero, salvo el admin inicial
    // (id=1), que siempre queda de primero — es la cuenta con la que arranca el
    // sistema y conviene ubicarla rápido. Si se ordena por otra columna, el
    // admin se mezcla como cualquier otra fila (no aplica el CASE).
    order: order.length > 0
      ? order
      : [[sequelize.literal('CASE WHEN id_usuario = 1 THEN 0 ELSE 1 END'), 'ASC'], ['idUsuario', 'DESC']],
    distinct: true,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const usuario = await Usuario.findByPk(id, {
    include: [
      { model: Rol, as: 'rol' },
      // Sedes que cubre, si es un distribuidor (vacío para cualquier otro rol) —
      // para precargar el multiselect de sedes en "Actualizar Usuario".
      {
        model: UsuarioSede, as: 'sedes', required: false, where: { habilitado: true },
        include: [{ model: Destino, as: 'destino', attributes: ['idDestino', 'municipio', 'departamento'] }],
      },
    ],
    attributes: { exclude: ['password'] }
  });

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  return usuario;
};

// Códigos (Rol.codigo, no el nombre editable) de los roles que exigen
// exactamente una sede propia vía usuario_sede — 'distribuidor' (entrega
// final, solo móvil) y 'operador_sede' (panel web restringido, ver LOGICA.md
// "Sedes remotas"). Cada uno cubre UNA sola sede.
const ROLES_CON_SEDE = ['distribuidor', 'operador_sede'];

// Normaliza el array de ids de sede que llega del cliente y valida que sea un
// destino real y habilitado. Solo aplica a ROLES_CON_SEDE — para cualquier otro
// rol el campo se ignora. El campo sigue viajando como array (contrato con el
// front y con usuario_sede) pero se rechaza si trae más de un id.
const resolverSedes = async (rolCodigo, sedes) => {
  if (!ROLES_CON_SEDE.includes(rolCodigo)) return [];
  const limpias = Array.isArray(sedes)
    ? [...new Set(sedes.map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (limpias.length === 0) {
    throw new AppError('Este rol debe tener una sede asignada', 400);
  }
  if (limpias.length > 1) {
    throw new AppError('Este rol cubre una sola sede', 400);
  }
  const existentes = await Destino.count({ where: { idDestino: { [Op.in]: limpias }, habilitado: true } });
  if (existentes !== limpias.length) {
    throw new AppError('La sede indicada no existe o está inhabilitada', 400);
  }
  return limpias;
};

const create = async (data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, password, idRol, sedes } = data;

  // Solo se compara contra cuentas ACTIVAS (habilitado: true) — un registro
  // inhabilitado (ex-empleado, error de registro corregido) no deja su correo/
  // documento bloqueados para siempre. Ver LOGICA.md, "Usuario — correo/
  // documento únicos solo entre activos".
  const existingEmail = await Usuario.findOne({ where: { email, habilitado: true } });
  if (existingEmail) {
    throw new AppError('El email ya está registrado', 400);
  }

  const existingDoc = await Usuario.findOne({ where: { numeroIdentificacion, habilitado: true } });
  if (existingDoc) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  const rol = await Rol.findByPk(idRol);
  if (!rol) {
    throw new AppError('El rol indicado no existe', 400);
  }
  const sedesLimpias = await resolverSedes(rol.codigo, sedes);

  const hashedPassword = await bcrypt.hash(password, 10);

  const usuario = await sequelize.transaction(async (t) => {
    const creado = await Usuario.create({
      tipoIdentificacion,
      numeroIdentificacion,
      nombre,
      apellido,
      telefono,
      email,
      password: hashedPassword,
      idRol
    }, { transaction: t });

    if (sedesLimpias.length > 0) {
      await UsuarioSede.bulkCreate(
        sedesLimpias.map((idDestino) => ({ idUsuario: creado.idUsuario, idDestino })),
        { transaction: t }
      );
    }
    return creado;
  });

  return {
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    nombre: usuario.nombre
  };
};

const update = async (id, data, currentUserId) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, idRol, habilitado, password, sedes } = data;

  // El admin id=1 solo puede editar su propia información — ningún otro admin
  // puede modificarle nombre, correo, rol, contraseña, etc. Ver misma nota en
  // toggleHabilitado: evita que otra cuenta deje sin control al dueño original.
  if (parseInt(id) === 1 && currentUserId !== 1) {
    throw new AppError('Esta cuenta administradora solo puede editarse a sí misma', 400);
  }

  const usuario = await Usuario.findByPk(id, { include: [{ model: Rol, as: 'rol' }] });

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  // Mismo criterio que create(): solo contra cuentas ACTIVAS. Esto también aplica
  // al editar directamente un registro inhabilitado (el módulo Usuarios ya lo
  // permite) — así se le puede corregir/reasignar un correo o documento que
  // quedó "atrapado" en él sin tener que habilitarlo primero.
  if (email && email !== usuario.email) {
    const existingEmail = await Usuario.findOne({ where: { email, habilitado: true } });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  if (numeroIdentificacion && numeroIdentificacion !== usuario.numeroIdentificacion) {
    const existingDoc = await Usuario.findOne({ where: { numeroIdentificacion, habilitado: true } });
    if (existingDoc) {
      throw new AppError('El número de identificación ya está registrado', 400);
    }
  }

  const datosActualizados = {
    tipoIdentificacion: tipoIdentificacion || usuario.tipoIdentificacion,
    numeroIdentificacion: numeroIdentificacion || usuario.numeroIdentificacion,
    nombre: nombre || usuario.nombre,
    apellido: apellido || usuario.apellido,
    telefono: telefono !== undefined ? telefono : usuario.telefono,
    email: email || usuario.email,
    idRol: idRol || usuario.idRol,
    habilitado: habilitado !== undefined ? habilitado : usuario.habilitado
  };

  if (password) {
    datosActualizados.password = await bcrypt.hash(password, 10);
  }

  // Resolver el rol final (el que llega, o el que ya tenía) para decidir qué hacer
  // con las sedes. Se tocan solo si: (a) llega el array `sedes` en el body, o
  // (b) el usuario pasa a un rol de ROLES_CON_SEDE y hay que exigirle al menos una.
  const rolCambia = idRol && parseInt(idRol, 10) !== usuario.idRol;
  const rolFinal = rolCambia ? await Rol.findByPk(idRol) : usuario.rol;
  const requiereSedeFinal = ROLES_CON_SEDE.includes(rolFinal?.codigo);

  let sedesLimpias = null; // null = no tocar; [] = borrar todas
  if (requiereSedeFinal) {
    if (sedes !== undefined) {
      sedesLimpias = await resolverSedes(rolFinal.codigo, sedes);
    } else if (rolCambia) {
      throw new AppError('Este rol debe tener al menos una sede asignada', 400);
    }
  } else if (rolCambia || sedes !== undefined) {
    // Dejó de requerir sede (o nunca la requirió y mandaron sedes por error): se
    // limpian las coberturas, ya no aplican.
    sedesLimpias = [];
  }

  await sequelize.transaction(async (t) => {
    await usuario.update(datosActualizados, { transaction: t });
    if (sedesLimpias !== null) {
      await UsuarioSede.destroy({ where: { idUsuario: usuario.idUsuario }, transaction: t });
      if (sedesLimpias.length > 0) {
        await UsuarioSede.bulkCreate(
          sedesLimpias.map((idDestino) => ({ idUsuario: usuario.idUsuario, idDestino })),
          { transaction: t }
        );
      }
    }
  });

  return {
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    nombre: usuario.nombre
  };
};

const toggleHabilitado = async (id, currentUserId) => {
  if (parseInt(id) === currentUserId) {
    throw new AppError('No puedes inhabilitar tu propia cuenta', 400);
  }

  // El admin id=1 (el inicial, creado por init.sql/seed.js) nunca se puede inhabilitar,
  // sin importar quién lo intente — evita que otro admin deje sin acceso al dueño
  // original del sistema.
  if (parseInt(id) === 1) {
    throw new AppError('Esta cuenta administradora no se puede inhabilitar', 400);
  }

  const usuario = await Usuario.findByPk(id, {
    include: [{ model: Rol, as: 'rol' }],
    attributes: { exclude: ['password'] },
  });

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  if (usuario.habilitado === true && usuario.rol?.codigo === 'admin') {
    const adminsHabilitados = await Usuario.count({
      include: [{ model: Rol, as: 'rol', where: { codigo: 'admin' } }],
      where: { habilitado: true },
    });
    if (adminsHabilitados <= 1) {
      throw new AppError('No se puede inhabilitar este usuario: debe quedar al menos un administrador activo', 400);
    }
  }

  if (usuario.habilitado === true) {
    const conductor = await Conductor.findOne({ where: { idUsuario: usuario.idUsuario } });
    if (conductor) {
      const rutasActivas = await tieneRutasActivas(conductor.idConductor);
      if (rutasActivas) throw new AppError('No se puede inhabilitar el usuario porque el conductor asociado tiene rutas activas', 400);

      const anticiposPendientes = await tieneAnticiposPendientes(conductor.idConductor);
      if (anticiposPendientes) throw new AppError('No se puede inhabilitar el usuario porque el conductor asociado tiene anticipos pendientes', 400);
    }
    try {
      const cliente = await Cliente.findOne({ where: { numeroIdentificacion: usuario.numeroIdentificacion } });
      if (cliente) {
        const encomiendasActivas = await tieneEncomiendasActivasPorCliente(cliente.idCliente);
        if (encomiendasActivas) throw new AppError('No se puede inhabilitar el usuario porque el cliente asociado tiene encomiendas activas', 400);
      }
    } catch (e) {
      // No bloquear el flujo si ocurre un error al verificar cliente; dejar que la inhabilitación continúe según otras reglas.
    }
  }

  // Al REHABILITAR (pasa de false a true): el correo/documento de este usuario
  // solo se comparan contra activos al crear/editar (ver create()/update()), así
  // que mientras estuvo inhabilitado alguien más pudo haber tomado ese mismo
  // correo o documento para una cuenta nueva. Se revalida acá, justo antes de
  // volverlo a marcar activo, en vez de vaciar el campo o dejarlo chocar contra
  // el índice único de la base de datos con un error crudo. Ver LOGICA.md,
  // "Usuario — correo/documento únicos solo entre activos".
  if (usuario.habilitado === false) {
    const emailEnUso = await Usuario.findOne({
      where: { email: usuario.email, habilitado: true, idUsuario: { [Op.ne]: usuario.idUsuario } },
    });
    if (emailEnUso) {
      throw new AppError(`No se puede habilitar: el correo ${usuario.email} ya está en uso por otro usuario activo. Cámbialo primero desde Editar.`, 400);
    }
    const documentoEnUso = await Usuario.findOne({
      where: { numeroIdentificacion: usuario.numeroIdentificacion, habilitado: true, idUsuario: { [Op.ne]: usuario.idUsuario } },
    });
    if (documentoEnUso) {
      throw new AppError(`No se puede habilitar: el documento ${usuario.tipoIdentificacion} ${usuario.numeroIdentificacion} ya está en uso por otro usuario activo. Cámbialo primero desde Editar.`, 400);
    }
  }

  usuario.habilitado = !usuario.habilitado;
  await usuario.save();

  return usuario;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado
};
