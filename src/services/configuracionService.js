const { Configuracion } = require('../models');

// Fila única (id=1); se crea sola con el valor por defecto del modelo si
// todavía no existe (ej. una base de datos que no corrió init.sql actualizado).
const getOrCreate = async () => {
  const [configuracion] = await Configuracion.findOrCreate({ where: { id: 1 } });
  return configuracion;
};

const getConfiguracion = async () => {
  return getOrCreate();
};

const updateConfiguracion = async (data) => {
  const configuracion = await getOrCreate();
  await configuracion.update({ tarifaPorKg: data.tarifaPorKg });
  return configuracion;
};

module.exports = { getConfiguracion, updateConfiguracion };
