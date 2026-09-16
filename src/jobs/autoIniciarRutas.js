const { SalidaProgramada } = require('../models');
const salidaProgramadaService = require('../services/salidaProgramadaService');

const INTERVALO_MS = 60 * 1000; // revisa cada minuto
const VENTANA_REINTENTO_MS = 60 * 60 * 1000; // deja de reintentar 1 hora después de la salida programada

// Combina fecha_salida (DATEONLY) + hora_salida (TIME) para saber si ya debió salir.
// El "-05:00" es obligatorio: sin él, new Date() interpreta el string como hora LOCAL
// del servidor (Render corre en UTC), no como hora Colombia — una salida programada
// para las 2:00pm terminaba iniciándose a las 9:00am (5 horas antes de lo debido).
// Colombia no tiene horario de verano, así que el offset fijo -05:00 siempre es
// correcto.
const yaDebioSalir = (salida) => {
  if (!salida.fechaSalida || !salida.horaSalida) return false;
  const fechaHora = new Date(`${salida.fechaSalida}T${salida.horaSalida}-05:00`);
  return !isNaN(fechaHora.getTime()) && fechaHora <= new Date();
};

// Después de VENTANA_REINTENTO_MS sin poder iniciarse, el conflicto (sin encomiendas
// asignadas, documento vencido, etc.) requiere revisión manual — seguir reintentando
// cada minuto solo satura los logs sin resolver nada. EXCEPCIÓN: si el motivo es que
// el vehículo/conductor sigue ocupado en otra ruta "En Ruta" (VEHICLE_IN_USE/
// CONDUCTOR_IN_USE), no aplica esta ventana — ese conflicto se resuelve solo apenas
// la otra ruta se complete, no necesita que alguien entre a arreglarlo a mano.
const dentroDeVentanaDeReintento = (salida) => {
  const fechaHora = new Date(`${salida.fechaSalida}T${salida.horaSalida}-05:00`);
  return (new Date() - fechaHora) <= VENTANA_REINTENTO_MS;
};

const SIN_LIMITE_DE_REINTENTO = new Set(['VEHICLE_IN_USE', 'CONDUCTOR_IN_USE']);

// idSalida -> { avisada: bool, ultimoErrorCode: string|undefined }
const salidasEstado = new Map();

const debeReintentar = (salida, info) => {
  if (!info) return true; // primer intento conocido, siempre se prueba
  if (SIN_LIMITE_DE_REINTENTO.has(info.ultimoErrorCode)) return true;
  return dentroDeVentanaDeReintento(salida);
};

const revisarRutasProgramadas = async () => {
  let salidas;
  try {
    salidas = await SalidaProgramada.findAll({ where: { estado: 'Programada', habilitado: true } });
  } catch (error) {
    console.error('❌ Error consultando rutas programadas:', error.message);
    return;
  }

  const idsActuales = new Set(salidas.map(s => s.idSalida));
  for (const id of salidasEstado.keys()) {
    if (!idsActuales.has(id)) salidasEstado.delete(id); // la salida ya cambió de estado o se inhabilitó
  }

  for (const salida of salidas) {
    if (!yaDebioSalir(salida)) continue;
    const info = salidasEstado.get(salida.idSalida);
    if (!debeReintentar(salida, info)) continue;
    try {
      // { interno: true }: este job corre para CUALQUIER salida Programada por
      // fecha/hora, sea de un regreso de sede o no — no es un admin cambiando el
      // estado a mano, así que no debe chocar con la exclusividad de operador_sede
      // sobre su propio regreso (ver salidaProgramadaService.updateEstado). El botón
      // manual sigue siendo solo para arrancar antes de lo programado o reintentar
      // si esto falla.
      await salidaProgramadaService.updateEstado(salida.idSalida, 'En Ruta', { interno: true });
      console.log(`🚚 Ruta #${salida.idSalida} ("${salida.origen || 'sin origen'}") pasó automáticamente a "En Ruta"`);
      salidasEstado.delete(salida.idSalida);
    } catch (error) {
      // Ej: sin encomiendas asignadas, documento vencido, o vehículo/conductor ya en
      // curso en otra ruta. Se sigue reintentando cada minuto (por si se resuelve solo),
      // pero el aviso en consola solo se imprime una vez por salida para no saturar los logs.
      const yaAvisada = info?.avisada || false;
      salidasEstado.set(salida.idSalida, { avisada: true, ultimoErrorCode: error.errorCode });
      if (!yaAvisada) {
        const mensajeReintento = SIN_LIMITE_DE_REINTENTO.has(error.errorCode)
          ? 'Se reintentará automáticamente sin límite de tiempo hasta que el otro vehículo/conductor quede libre.'
          : 'Revisar manualmente — se dejará de reintentar en 1 hora si no se resuelve.';
        console.error(`⚠️  No se pudo iniciar automáticamente la ruta #${salida.idSalida}: ${error.message}. ${mensajeReintento}`);
      }
    }
  }
};

const iniciarAutoInicioRutas = () => {
  revisarRutasProgramadas();
  setInterval(revisarRutasProgramadas, INTERVALO_MS);
};

module.exports = { iniciarAutoInicioRutas, revisarRutasProgramadas };
