const { Paquete, RutaVehiculoConductor, EncomiendaVenta, Destinatario, Ruta, Destino, Conductor } = require('../models');
const { Op } = require('sequelize');
const encomiendaService = require('../services/encomiendaService');
const AppError = require('../errors/appError');

exports.getByConductor = async (req, res, next) => {
  try {
    // El idConductor sale del token, no del query param — así un conductor nunca
    // puede pedir los paquetes de otro con solo cambiar el número en la URL.
    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden acceder a sus paquetes' });
    }
    const idConductor = conductor.idConductor;

    const pares = await RutaVehiculoConductor.findAll({ where: { idConductor, habilitado: true }, attributes: ['idRutaVehiculoConductor'] });
    const ids = pares.map(p => p.idRutaVehiculoConductor);

    const paquetes = await Paquete.findAll({
      where: { idRutaVehiculoConductor: { [Op.in]: ids } },
      include: [
        // El Destino anidado en el destinatario es el municipio real de la venta
        // (parada intermedia o destino final) — el móvil agrupa por él para el
        // botón "dejar en sede" (ver driver_paquetes.dart).
        { model: EncomiendaVenta, as: 'encomienda', include: [{ model: Destinatario, as: 'destinatario', include: [{ model: Destino, as: 'destino' }] }] },
        { model: RutaVehiculoConductor, as: 'asignacion', include: [{ model: Ruta, as: 'ruta', include: [{ model: Destino, as: 'destino' }] }] },
      ],
      order: [['idPaquete', 'DESC']]
    });

    res.json({ success: true, data: paquetes });
  } catch (error) {
    next(error);
  }
};

exports.subirEvidencia = async (req, res, next) => {
  try {
    const { id } = req.params;

    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden actualizar sus paquetes' });
    }

    const paquete = await Paquete.findByPk(id, { include: [{ model: RutaVehiculoConductor, as: 'asignacion' }] });
    if (!paquete) {
      return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    }
    // Solo el conductor del tramo troncal puede tocar este paquete por esta vía
    // (el flujo viejo de "repartidor local" se retiró — ver LOGICA.md).
    const esConductorTroncal = paquete.asignacion?.idConductor === conductor.idConductor;
    if (!esConductorTroncal) {
      return res.status(403).json({ success: false, message: 'Este paquete no está asignado a tu cuenta' });
    }

    // El resultado que entrega Cloudinary no trae ningún campo `.path` (eso es
    // convención de multer.diskStorage) — la URL real de la imagen es
    // `secure_url`. Mismo bug ya corregido antes en el soporte de anticipos.
    const fileUrl = req.file?.secure_url || null;
    if (!fileUrl) return res.status(400).json({ success: false, message: 'Archivo no proporcionado' });

    const estado = req.body.estado;
    if (!estado) return res.status(400).json({ success: false, message: 'El campo "estado" es requerido' });

    const paqueteActualizado = await encomiendaService.actualizarEstadoPaquete(id, estado, { observacion: req.body.observacion || '', fotoEntrega: fileUrl });
    res.json({ success: true, message: 'Evidencia subida y paquete actualizado', data: paqueteActualizado });
  } catch (error) {
    next(error);
  }
};

exports.dejarEnSede = async (req, res, next) => {
  try {
    // El idConductor sale del token, no del body — un conductor solo legaliza sus
    // propios paquetes.
    const conductor = await Conductor.findOne({ where: { idUsuario: req.usuario.idUsuario } });
    if (!conductor) {
      return res.status(403).json({ success: false, message: 'Solo los conductores pueden legalizar la entrega en sede' });
    }

    const idRuta = parseInt(req.body.idRuta, 10);
    const idDestino = parseInt(req.body.idDestino, 10);
    if (!idRuta || !idDestino) {
      return res.status(400).json({ success: false, message: 'Los campos "idRuta" e "idDestino" son requeridos' });
    }

    // Foto y novedades opcionales — el conductor puede legalizar sin subir nada.
    const fotoEntrega = req.file?.secure_url || null;

    const resultado = await encomiendaService.dejarPaquetesEnSede(conductor.idConductor, {
      idRuta,
      idDestino,
      novedades: req.body.novedades || '',
      fotoEntrega,
    });

    res.json({
      success: true,
      message: `Se ${resultado.actualizados === 1 ? 'dejó 1 paquete' : `dejaron ${resultado.actualizados} paquetes`} en la sede`,
      data: resultado,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/paquetes/sede — paquetes "En sede de destino" de las sedes que cubre
// el distribuidor autenticado (usuario_sede). El idUsuario sale del token.
exports.getPorSede = async (req, res, next) => {
  try {
    if (req.usuario.rol?.codigo !== 'distribuidor') {
      return res.status(403).json({ success: false, message: 'Solo los distribuidores pueden acceder a los paquetes en sede' });
    }
    const paquetes = await encomiendaService.getPaquetesEnSede(req.usuario.idUsuario);
    res.json({ success: true, data: paquetes });
  } catch (error) {
    next(error);
  }
};

// GET /api/paquetes/sede/historial — paquetes que el distribuidor autenticado ya
// cerró (Entregado/Devuelto). Ver getHistorialSedeDistribuidor().
exports.getHistorialSede = async (req, res, next) => {
  try {
    if (req.usuario.rol?.codigo !== 'distribuidor') {
      return res.status(403).json({ success: false, message: 'Solo los distribuidores pueden acceder a su historial de entregas' });
    }
    const paquetes = await encomiendaService.getHistorialSedeDistribuidor(req.usuario.idUsuario);
    res.json({ success: true, data: paquetes });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/paquetes/:id/entrega-final — el distribuidor de la sede registra la
// entrega final: accion = 'Entregado' | 'Devuelto' | 'Intento'. Foto y novedad
// OBLIGATORIAS en las 3 (a diferencia del conductor en dejarEnSede, que sigue
// opcional — ver LOGICA.md, "Evidencia de entrega final obligatoria"): este es
// el momento de cara al cliente final, el que importaría en una disputa. La
// validación de longitud de "novedad" vive en encomiendaService.registrarEntregaFinal;
// acá solo se valida la presencia (forma de la petición).
exports.registrarEntregaFinal = async (req, res, next) => {
  try {
    if (req.usuario.rol?.codigo !== 'distribuidor') {
      return res.status(403).json({ success: false, message: 'Solo los distribuidores pueden gestionar la entrega final' });
    }
    const { id } = req.params;
    const accion = req.body.accion;
    if (!accion) {
      return res.status(400).json({ success: false, message: 'El campo "accion" es requerido' });
    }
    const fotoEntrega = req.file?.secure_url || null;
    if (!fotoEntrega) {
      return res.status(400).json({ success: false, message: 'La foto de evidencia es obligatoria' });
    }
    const paquete = await encomiendaService.registrarEntregaFinal(id, {
      accion,
      novedad: req.body.novedad || '',
      fotoEntrega,
      idUsuarioDistribuidor: req.usuario.idUsuario,
    });
    // Mensaje según la acción real -- antes decía "Entrega registrada" siempre,
    // aunque el distribuidor hubiera marcado "No entregado" o solo un intento
    // fallido, lo cual sonaba a que sí se entregó.
    const MENSAJES = {
      Entregado: 'Entrega registrada',
      Devuelto: 'Paquete marcado como no entregado',
      Intento: 'Intento registrado',
    };
    res.json({ success: true, message: MENSAJES[accion] || 'Registro actualizado', data: paquete });
  } catch (error) {
    next(error);
  }
};

// GET /api/paquetes/:id/historial-entrega — panel web (módulo Ventas, modal
// "Ver historial") Y móvil del distribuidor (ambas pestañas de su pantalla
// Paquetes). Sin authorize/authorizePermission en la ruta a propósito -- dos
// caminos de acceso distintos que no se pueden expresar con un solo
// middleware: admin con permiso 'consultar_venta' (sin restricción de sede) o
// distribuidor que cubra la sede de este paquete específico
// (distribuidorCubrePaquete, mismo criterio que registrarEntregaFinal). Ver
// encomiendaService.getHistorialEntregaFinal y LOGICA.md, "Historial de
// entrega final — también en el móvil".
exports.getHistorialEntrega = async (req, res, next) => {
  try {
    const { id } = req.params;
    const permisos = req.usuario.rol?.permisos?.map((p) => p.nombre) || [];
    const esAdmin = permisos.includes('consultar_venta');
    const esDistribuidor = req.usuario.rol?.codigo === 'distribuidor';

    if (!esAdmin && !esDistribuidor) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    if (!esAdmin) {
      const cubre = await encomiendaService.distribuidorCubrePaquete(id, req.usuario.idUsuario);
      if (!cubre) {
        return res.status(403).json({ success: false, message: 'No tienes acceso al historial de este paquete' });
      }
    }

    const historial = await encomiendaService.getHistorialEntregaFinal(id);
    res.json({ success: true, data: historial });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
