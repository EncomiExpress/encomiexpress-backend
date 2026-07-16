const configuracionService = require('../services/configuracionService');

exports.get = async (req, res, next) => {
  try {
    const configuracion = await configuracionService.getConfiguracion();
    res.json({ success: true, data: configuracion });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const configuracion = await configuracionService.updateConfiguracion(req.body);
    res.json({ success: true, message: 'Configuración actualizada exitosamente', data: configuracion });
  } catch (error) {
    next(error);
  }
};
