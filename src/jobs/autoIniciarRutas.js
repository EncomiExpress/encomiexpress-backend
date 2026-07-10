const { Ruta } = require('../models');
const rutaService = require('../services/rutaService');

const INTERVALO_MS = 60 * 1000; // revisa cada minuto

// Combina fecha_salida (DATEONLY) + hora_salida (TIME) para saber si ya debió salir
const yaDebioSalir = (ruta) => {
  if (!ruta.fechaSalida || !ruta.horaSalida) return false;
  const salida = new Date(`${ruta.fechaSalida}T${ruta.horaSalida}`);
  return !isNaN(salida.getTime()) && salida <= new Date();
};

const revisarRutasProgramadas = async () => {
  let rutas;
  try {
    rutas = await Ruta.findAll({ where: { estado: 'Programada', habilitado: true } });
  } catch (error) {
    console.error('❌ Error consultando rutas programadas:', error.message);
    return;
  }

  for (const ruta of rutas) {
    if (!yaDebioSalir(ruta)) continue;
    try {
      await rutaService.updateEstado(ruta.idRuta, 'En Curso');
      console.log(`🚚 Ruta #${ruta.idRuta} ("${ruta.nombreRuta || 'sin nombre'}") pasó automáticamente a "En Curso"`);
    } catch (error) {
      // Ej: sin encomiendas asignadas, o vehículo/conductor ya en curso en otra ruta.
      // Se registra y se reintenta en el próximo ciclo; no debe tumbar el resto del batch.
      console.error(`⚠️  No se pudo iniciar automáticamente la ruta #${ruta.idRuta}: ${error.message}`);
    }
  }
};

const iniciarAutoInicioRutas = () => {
  revisarRutasProgramadas();
  setInterval(revisarRutasProgramadas, INTERVALO_MS);
};

module.exports = { iniciarAutoInicioRutas, revisarRutasProgramadas };
