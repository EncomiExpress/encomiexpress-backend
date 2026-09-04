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
  // Actualización parcial: cada control del panel (Ventas: Tarifa por kg
  // hierro/normal, Tarifa por paquete) solo manda su propio campo -- sin esto,
  // guardar uno pisaría los otros con "undefined".
  const cambios = {};
  if (data.tarifaPorKgHierro !== undefined) cambios.tarifaPorKgHierro = data.tarifaPorKgHierro;
  if (data.tarifaPorKgNormal !== undefined) cambios.tarifaPorKgNormal = data.tarifaPorKgNormal;
  if (data.tarifaPorPaquete !== undefined) cambios.tarifaPorPaquete = data.tarifaPorPaquete;
  await configuracion.update(cambios);
  return configuracion;
};

module.exports = { getConfiguracion, updateConfiguracion };
