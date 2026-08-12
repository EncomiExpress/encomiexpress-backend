const { Ruta } = require('../models');
const rutaService = require('../services/rutaService');

const INTERVALO_MS = 60 * 1000; // revisa cada minuto
const VENTANA_REINTENTO_MS = 60 * 60 * 1000; // deja de reintentar 1 hora después de la salida programada

// Combina fecha_salida (DATEONLY) + hora_salida (TIME) para saber si ya debió salir.
// El "-05:00" es obligatorio: sin él, new Date() interpreta el string como hora LOCAL
// del servidor (Render corre en UTC), no como hora Colombia — una ruta programada para
// las 2:00pm terminaba iniciándose a las 9:00am (5 horas antes de lo debido). Colombia
// no tiene horario de verano, así que el offset fijo -05:00 siempre es correcto.
const yaDebioSalir = (ruta) => {
  if (!ruta.fechaSalida || !ruta.horaSalida) return false;
  const salida = new Date(`${ruta.fechaSalida}T${ruta.horaSalida}-05:00`);
  return !isNaN(salida.getTime()) && salida <= new Date();
};

// Después de VENTANA_REINTENTO_MS sin poder iniciarse, el conflicto (sin encomiendas
// asignadas, documento vencido, etc.) requiere revisión manual — seguir reintentando
// cada minuto solo satura los logs sin resolver nada. EXCEPCIÓN: si el motivo es que
// el vehículo/conductor sigue ocupado en otra ruta "En Ruta" (VEHICLE_IN_USE/
// CONDUCTOR_IN_USE), no aplica esta ventana — ese conflicto se resuelve solo apenas
// la otra ruta se complete, no necesita que alguien entre a arreglarlo a mano.
const dentroDeVentanaDeReintento = (ruta) => {
  const salida = new Date(`${ruta.fechaSalida}T${ruta.horaSalida}-05:00`);
  return (new Date() - salida) <= VENTANA_REINTENTO_MS;
};

const SIN_LIMITE_DE_REINTENTO = new Set(['VEHICLE_IN_USE', 'CONDUCTOR_IN_USE']);

// idRuta -> { avisada: bool, ultimoErrorCode: string|undefined }
const rutasEstado = new Map();

const debeReintentar = (ruta, info) => {
  if (!info) return true; // primer intento conocido, siempre se prueba
  if (SIN_LIMITE_DE_REINTENTO.has(info.ultimoErrorCode)) return true;
  return dentroDeVentanaDeReintento(ruta);
};

const revisarRutasProgramadas = async () => {
  let rutas;
  try {
    rutas = await Ruta.findAll({ where: { estado: 'Programada', habilitado: true } });
  } catch (error) {
    console.error('❌ Error consultando rutas programadas:', error.message);
    return;
  }

  const idsActuales = new Set(rutas.map(r => r.idRuta));
  for (const id of rutasEstado.keys()) {
    if (!idsActuales.has(id)) rutasEstado.delete(id); // la ruta ya cambió de estado o se inhabilitó
  }

  for (const ruta of rutas) {
    if (!yaDebioSalir(ruta)) continue;
    const info = rutasEstado.get(ruta.idRuta);
    if (!debeReintentar(ruta, info)) continue;
    try {
      await rutaService.updateEstado(ruta.idRuta, 'En Ruta');
      console.log(`🚚 Ruta #${ruta.idRuta} ("${ruta.origen || 'sin origen'}") pasó automáticamente a "En Ruta"`);
      rutasEstado.delete(ruta.idRuta);
    } catch (error) {
      // Ej: sin encomiendas asignadas, documento vencido, o vehículo/conductor ya en
      // curso en otra ruta. Se sigue reintentando cada minuto (por si se resuelve solo),
      // pero el aviso en consola solo se imprime una vez por ruta para no saturar los logs.
      const yaAvisada = info?.avisada || false;
      rutasEstado.set(ruta.idRuta, { avisada: true, ultimoErrorCode: error.errorCode });
      if (!yaAvisada) {
        const mensajeReintento = SIN_LIMITE_DE_REINTENTO.has(error.errorCode)
          ? 'Se reintentará automáticamente sin límite de tiempo hasta que el otro vehículo/conductor quede libre.'
          : 'Revisar manualmente — se dejará de reintentar en 1 hora si no se resuelve.';
        console.error(`⚠️  No se pudo iniciar automáticamente la ruta #${ruta.idRuta}: ${error.message}. ${mensajeReintento}`);
      }
    }
  }
};

const iniciarAutoInicioRutas = () => {
  revisarRutasProgramadas();
  setInterval(revisarRutasProgramadas, INTERVALO_MS);
};

module.exports = { iniciarAutoInicioRutas, revisarRutasProgramadas };
