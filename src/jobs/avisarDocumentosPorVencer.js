const { Vehiculo, PropietarioVehiculo, Conductor, Usuario } = require('../models');
const { sendDocumentoPorVencerEmail } = require('../config/email');

// Revisa una vez al día si algún documento (SOAT/Revisión Técnico-Mecánica/
// Seguro de Terceros de un vehículo, o alguna categoría de la licencia de un
// conductor) vence EXACTAMENTE dentro de 8 días, y le avisa por correo a quien
// es dueño de ese documento -- el propietario del vehículo, o el propio
// conductor para su licencia. Por ahora NO se le avisa a ningún admin (decisión
// pendiente de a cuál/cuáles admins, ver conversación con el cliente) — solo al
// dueño del documento.
//
// Se dispara una sola vez por día calendario (hora Colombia): el intervalo
// corre cada hora y compara contra la última fecha en que ya se revisó, en vez
// de necesitar una librería de cron (mismo estilo "sin dependencias nuevas" que
// jobs/autoIniciarRutas.js). Limitación aceptada: si el servidor se reinicia el
// mismo día ya revisado, se vuelve a revisar y podría reenviar el aviso de ese
// día — no hay tabla de "ya se avisó" persistente, y con un aviso de
// vencimiento un envío repetido no es grave.
const INTERVALO_MS = 60 * 60 * 1000; // revisa cada hora si ya tocó el chequeo diario
const DIAS_ANTICIPACION = 8;

const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

// Suma días a una fecha DATEONLY ("YYYY-MM-DD") con aritmética en UTC pura —
// evita cualquier corrimiento de día por el timezone del servidor.
const sumarDias = (fechaStr, dias) => {
  const d = new Date(`${fechaStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const DOCUMENTOS_VEHICULO = [
  { campo: 'vencimientoSOAT', nombre: 'el SOAT' },
  { campo: 'vencimientoRevisionTecnica', nombre: 'la revisión técnico-mecánica' },
  { campo: 'vencimientoSeguroTerceros', nombre: 'el seguro de terceros' },
];

const avisarDocumentosVehiculos = async (fechaObjetivo) => {
  const vehiculos = await Vehiculo.findAll({
    where: { habilitado: true },
    include: [{ model: PropietarioVehiculo, as: 'propietario', attributes: ['nombre', 'apellido', 'email'] }],
  });

  for (const vehiculo of vehiculos) {
    const email = vehiculo.propietario?.email;
    if (!email) continue;

    for (const doc of DOCUMENTOS_VEHICULO) {
      const vencimiento = vehiculo[doc.campo];
      if (!vencimiento || String(vencimiento) !== fechaObjetivo) continue;

      try {
        await sendDocumentoPorVencerEmail(email, {
          nombre: `${vehiculo.propietario.nombre} ${vehiculo.propietario.apellido}`.trim(),
          tipoDocumento: doc.nombre,
          identificador: vehiculo.placa,
          fechaVencimiento: vencimiento,
        });
        console.log(`📅 Aviso de vencimiento enviado: ${doc.nombre} del vehículo ${vehiculo.placa}`);
      } catch (error) {
        console.error(`No se pudo enviar el aviso de vencimiento (vehículo #${vehiculo.idVehiculo}, ${doc.campo}):`, error.message);
      }
    }
  }
};

const avisarLicenciasConductores = async (fechaObjetivo) => {
  const conductores = await Conductor.findAll({
    where: { habilitado: true },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email'] }],
  });

  for (const conductor of conductores) {
    const email = conductor.usuario?.email;
    if (!email) continue;

    for (const cat of (conductor.categoriasLicencia || [])) {
      if (!cat?.vencimiento || String(cat.vencimiento) !== fechaObjetivo) continue;

      try {
        await sendDocumentoPorVencerEmail(email, {
          nombre: `${conductor.usuario.nombre} ${conductor.usuario.apellido}`.trim(),
          tipoDocumento: `tu licencia de conducción (categoría ${cat.categoria})`,
          identificador: '',
          fechaVencimiento: cat.vencimiento,
        });
        console.log(`📅 Aviso de vencimiento enviado: licencia (${cat.categoria}) del conductor #${conductor.idConductor}`);
      } catch (error) {
        console.error(`No se pudo enviar el aviso de vencimiento (conductor #${conductor.idConductor}, licencia ${cat.categoria}):`, error.message);
      }
    }
  }
};

const revisarDocumentosPorVencer = async () => {
  const fechaObjetivo = sumarDias(hoyBogota(), DIAS_ANTICIPACION);
  try {
    await avisarDocumentosVehiculos(fechaObjetivo);
    await avisarLicenciasConductores(fechaObjetivo);
  } catch (error) {
    console.error('❌ Error revisando documentos por vencer:', error.message);
  }
};

let ultimaFechaRevisada = null;

const revisarSiTocaHoy = () => {
  const hoy = hoyBogota();
  if (hoy === ultimaFechaRevisada) return;
  ultimaFechaRevisada = hoy;
  revisarDocumentosPorVencer();
};

const iniciarAvisoDocumentosPorVencer = () => {
  revisarSiTocaHoy();
  setInterval(revisarSiTocaHoy, INTERVALO_MS);
};

module.exports = { iniciarAvisoDocumentosPorVencer, revisarDocumentosPorVencer };
