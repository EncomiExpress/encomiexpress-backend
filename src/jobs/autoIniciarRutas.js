const { Ruta } = require('../models');
const rutaService = require('../services/rutaService');

const INTERVALO_MS = 60 * 1000; // revisa cada minuto
const VENTANA_REINTENTO_MS = 60 * 60 * 1000; // deja de reintentar 1 hora después de la salida programada

// Combina fecha_salida (DATEONLY) + hora_salida (TIME) para saber si ya debió salir
const yaDebioSalir = (ruta) => {
  if (!ruta.fechaSalida || !ruta.horaSalida) return false;
  const salida = new Date(`${ruta.fechaSalida}T${ruta.horaSalida}`);
  return !isNaN(salida.getTime()) && salida <= new Date();
};

// Después de VENTANA_REINTENTO_MS sin poder iniciarse, el conflicto (vehículo/conductor
// ocupado, sin encomiendas asignadas, etc.) requiere revisión manual — seguir reintentando
// cada minuto solo satura los logs sin resolver nada.
const dentroDeVentanaDeReintento = (ruta) => {
  const salida = new Date(`${ruta.fechaSalida}T${ruta.horaSalida}`);
  return (new Date() - salida) <= VENTANA_REINTENTO_MS;
};

const rutasYaAvisadas = new Set();

const revisarRutasProgramadas = async () => {
  let rutas;
  try {
    rutas = await Ruta.findAll({ where: { estado: 'Programada', habilitado: true } });
  } catch (error) {
    console.error('❌ Error consultando rutas programadas:', error.message);
    return;
  }

  const idsActuales = new Set(rutas.map(r => r.idRuta));
  for (const id of rutasYaAvisadas) {
    if (!idsActuales.has(id)) rutasYaAvisadas.delete(id); // la ruta ya cambió de estado o se inhabilitó
  }

  for (const ruta of rutas) {
    if (!yaDebioSalir(ruta)) continue;
    if (!dentroDeVentanaDeReintento(ruta)) continue;
    try {
      await rutaService.updateEstado(ruta.idRuta, 'En Curso');
      console.log(`🚚 Ruta #${ruta.idRuta} ("${ruta.nombreRuta || 'sin nombre'}") pasó automáticamente a "En Curso"`);
      rutasYaAvisadas.delete(ruta.idRuta);
    } catch (error) {
      // Ej: sin encomiendas asignadas, o vehículo/conductor ya en curso en otra ruta.
      // Se sigue reintentando cada minuto (por si se resuelve solo), pero el aviso en
      // consola solo se imprime una vez por ruta para no saturar los logs.
      if (!rutasYaAvisadas.has(ruta.idRuta)) {
        rutasYaAvisadas.add(ruta.idRuta);
        console.error(`⚠️  No se pudo iniciar automáticamente la ruta #${ruta.idRuta}: ${error.message}. Revisar manualmente — se dejará de reintentar en 1 hora si no se resuelve.`);
      }
    }
  }
};

const iniciarAutoInicioRutas = () => {
  revisarRutasProgramadas();
  setInterval(revisarRutasProgramadas, INTERVALO_MS);
};

module.exports = { iniciarAutoInicioRutas, revisarRutasProgramadas };
