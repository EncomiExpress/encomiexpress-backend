// Se envía por la API HTTP de Brevo (puerto 443) en vez de SMTP directo: Render
// bloquea el tráfico saliente a los puertos SMTP (25/465/587) en sus servicios
// gratuitos, así que un transporte SMTP como Nodemailer nunca conecta ahí.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const sendBrevoEmail = async ({ to, subject, html }) => {
  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'EncomiExpress', email: process.env.EMAIL_USER },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Brevo respondió ${response.status}: ${body}`);
  }

  return response.json();
};

const ICONS = {
  candado: '🔒',
  paquete: '📦',
  bienvenida: '🎉',
  camion: '🚚',
  buzon: '📬',
  calendario: '📅',
  recibo: '🧾',
  campana: '🔔',
  sede: '📍',
  exito: '✅',
};

// Formatea una fecha DATEONLY ("YYYY-MM-DD") a texto largo en español, sin pasar
// por Date/timezone -- un Date de un DATEONLY puro se puede correr un día si el
// runtime no está en UTC, así que se arma el texto directo del string.
const formatFechaLarga = (fecha) => {
  if (!fecha) return '';
  const [anio, mes, dia] = String(fecha).split('-');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mesNombre = MESES[parseInt(mes, 10) - 1] || '';
  return `${parseInt(dia, 10)} de ${mesNombre} de ${anio}`;
};

const buildEmailShell = ({ badgeBg, icon, heading, bodyHtml, extraHtml = '' }) => `
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a0e0c;">
    <div style="height:5px;background:linear-gradient(90deg,#1A2E6E,#CC1818,#1A2E6E);"></div>
    <div style="padding:34px 36px 4px;text-align:center;">
      <span style="font-size:24px;font-weight:800;font-family:Arial,Helvetica,sans-serif;letter-spacing:-.3px;">
        <span style="color:#CC1818;">Encomi</span><span style="color:#1A2E6E;">Express</span>
      </span>
    </div>
    <div style="width:64px;height:64px;line-height:64px;border-radius:50%;background:${badgeBg};margin:22px auto 16px;text-align:center;font-size:26px;">
      ${icon}
    </div>
    <h2 style="text-align:center;font-size:21px;margin:0 0 8px;padding:0 36px;color:#1a0e0c;">${heading}</h2>
    <div style="text-align:center;font-size:14.5px;line-height:1.6;color:#5b5450;margin:0 0 22px;padding:0 36px;">
      ${bodyHtml}
    </div>
    ${extraHtml}
    <div style="border-top:1px solid #eee2d8;padding:18px 36px 28px;text-align:center;">
      <span style="font-size:11.5px;color:#a89c93;">EncomiExpress &middot; Sistema de gesti&oacute;n de encomiendas</span>
    </div>
  </div>
`;

const sendPasswordRecoveryEmail = async (email, resetUrl) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Recuperación de contraseña - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#CC181820',
      icon: ICONS.candado,
      heading: 'Recuperación de contraseña',
      bodyHtml: `Has solicitado recuperar tu contraseña en <b>EncomiExpress</b>. Haz clic en el siguiente botón para elegir una nueva:`,
      extraHtml: `
        <div style="text-align:center;margin:0 0 20px;">
          <a href="${resetUrl}" target="_blank" style="display:inline-block;background:#CC1818;color:#ffffff;text-decoration:none;font-weight:700;font-size:14.5px;padding:12px 28px;border-radius:8px;">
            Elegir nueva contraseña
          </a>
        </div>
        <p style="font-size:12.5px;color:#8a7f78;line-height:1.6;text-align:center;margin:0 0 26px;padding:0 36px;">
          Este enlace vence en 30 minutos y solo se puede usar una vez.<br>
          Si no solicitaste este cambio, ignora este correo — tu contraseña actual sigue siendo válida.
        </p>
      `,
    }),
  });
};

const sendPaqueteDevueltoEmail = async (email, { nombreCliente = '', numeroGuia = '', motivo = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'No fue posible entregar tu paquete - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#F59E0B20',
      icon: ICONS.paquete,
      heading: 'No fue posible entregar tu paquete',
      bodyHtml: `
        Hola${nombreCliente ? ` <b>${nombreCliente}</b>` : ''}, por ahora no fue posible entregar tu
        paquete con guía <b>${numeroGuia}</b> al destinatario. Quedó retenido en la sede de destino.
        ${motivo ? `<br><br>Novedad: ${motivo}` : ''}
        <br><br>Seguiremos intentando la entrega y nos pondremos en contacto contigo para coordinar los pasos a seguir.
      `,
    }),
  });
};

// Dónde entra y qué puede hacer cada rol, en una frase corta -- ver
// database/init.sql (INSERT INTO rol) para la fuente de verdad de qué rol
// tiene acceso a qué superficie. `admin` entra sobre todo por el panel web,
// pero también tiene su propia sección en la app móvil (gestión de
// anticipos), así que se menciona ambas.
const BIENVENIDA_POR_ROL = {
  admin: {
    donde: 'el panel web (y la app móvil para gestionar anticipos)',
    quePuede: 'gestionar usuarios, rutas, ventas, clientes y conductores',
  },
  operador_sede: {
    donde: 'el panel web',
    quePuede: 'registrar tus ventas y gestionar tus clientes desde tu sede',
  },
  conductor: {
    donde: 'la app móvil',
    quePuede: 'ver tus rutas asignadas, gestionar tus anticipos y confirmar tus entregas en sede',
  },
  distribuidor: {
    donde: 'la app móvil',
    quePuede: 'gestionar la entrega final de los paquetes que lleguen a tu sede',
  },
};

// Bienvenida al crear un Usuario (panel: admin/operador_sede/distribuidor) o un
// Conductor (que siempre nace con su propio Usuario, ver conductorService.create)
// -- ambos ganan credenciales de acceso nuevas, así que ambos la reciben.
// `rolLabel` es opcional y en minúscula sin artículo (ej. "conductor",
// "distribuidor de sede") para que encaje en "te damos la bienvenida como ___".
// `rolCodigo` (ej. 'admin', 'conductor') busca en BIENVENIDA_POR_ROL para
// agregar, brevemente, por dónde entra y qué puede hacer -- un código que no
// esté en la tabla simplemente omite esa parte, sin romper el correo.
const sendBienvenidaEmail = async (email, { nombre = '', rolLabel = '', rolCodigo = '' } = {}) => {
  const info = BIENVENIDA_POR_ROL[rolCodigo];
  return sendBrevoEmail({
    to: email,
    subject: '¡Bienvenido a EncomiExpress!',
    html: buildEmailShell({
      badgeBg: '#05966920',
      icon: ICONS.bienvenida,
      heading: '¡Bienvenido a EncomiExpress!',
      bodyHtml: `
        ¡Hola${nombre ? ` <b>${nombre}</b>` : ''}! Le damos la bienvenida a la familia <b>EncomiExpress</b>${rolLabel ? ` como ${rolLabel}` : ''}.
        <br><br>
        Tu cuenta ya está activa y lista para usarse${info ? ` desde ${info.donde}` : ''}.
        ${info ? `<br><br>Ahí vas a poder ${info.quePuede}.` : ''}
        <br><br>
        Estamos muy contentos de tenerte en el equipo y confiamos en que, juntos, seguiremos haciendo de cada envío una entrega exitosa.
        <br><br>
        ¡Felicidades por unirte y bienvenido a bordo!
      `,
    }),
  });
};

// Al conductor de la ida se le confirma la salida del paquete cuando la salida
// pasa a "En Ruta" (no al registrar la venta -- ahí el camión puede salir varios
// días después, y "ya va en camino" sería falso). Ver salidaProgramadaService.js,
// updateEstado().
const sendPaqueteEnviadoEmail = async (email, { nombreCliente = '', numeroGuia = '', destinoMunicipio = '', fechaEstimadaEntrega = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Tu paquete ya va en camino - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#1A2E6E20',
      icon: ICONS.camion,
      heading: '¡Tu paquete ya va en camino!',
      bodyHtml: `
        Hola${nombreCliente ? ` <b>${nombreCliente}</b>` : ''}, te confirmamos que tu paquete con guía <b>${numeroGuia}</b>
        ya salió${destinoMunicipio ? ` con destino a <b>${destinoMunicipio}</b>` : ''}.
        ${fechaEstimadaEntrega ? `<br><br>Fecha estimada de entrega: <b>${formatFechaLarga(fechaEstimadaEntrega)}</b>.` : ''}
        <br><br>Te mantendremos informado ante cualquier novedad durante el trayecto.
      `,
    }),
  });
};

// Mismo disparador que sendPaqueteEnviadoEmail (salida "En Ruta"), pero para el
// destinatario -- avisa que un paquete viene en camino hacia él, no que él envió
// algo.
const sendPaquetePorRecibirEmail = async (email, { nombreDestinatario = '', numeroGuia = '', origenMunicipio = '', fechaEstimadaEntrega = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Tienes un paquete en camino - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#0EA5E920',
      icon: ICONS.buzon,
      heading: '¡Tienes un paquete en camino!',
      bodyHtml: `
        Hola${nombreDestinatario ? ` <b>${nombreDestinatario}</b>` : ''}, te escribimos para avisarte que tienes un paquete en camino
        con guía <b>${numeroGuia}</b>${origenMunicipio ? ` desde ${origenMunicipio}` : ''}. Llegará muy pronto.
        ${fechaEstimadaEntrega ? `<br><br>Fecha estimada de entrega: <b>${formatFechaLarga(fechaEstimadaEntrega)}</b>.` : ''}
        <br><br>Gracias por confiar en EncomiExpress.
      `,
    }),
  });
};

// Aviso a quien es dueño del documento (propietario del vehículo para SOAT/
// Revisión Técnico-Mecánica/Seguro de Terceros, o el propio conductor para su
// licencia) 8 días antes de que venza -- ver jobs/avisarDocumentosPorVencer.js.
// Por ahora solo se le avisa al dueño del documento (no a un admin todavía, ver
// LOGICA.md/decisión pendiente).
const sendDocumentoPorVencerEmail = async (email, { nombre = '', tipoDocumento = '', identificador = '', fechaVencimiento = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Un documento está por vencer - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#F59E0B20',
      icon: ICONS.calendario,
      heading: 'Documento próximo a vencer',
      bodyHtml: `
        Hola${nombre ? ` <b>${nombre}</b>` : ''}, te recordamos que ${tipoDocumento}${identificador ? ` de <b>${identificador}</b>` : ''}
        vence el <b>${formatFechaLarga(fechaVencimiento)}</b> (en 8 días).
        <br><br>
        Por favor gestiona la renovación a tiempo para evitar que se bloquee la asignación a nuevas rutas.
      `,
    }),
  });
};

// P9, Notificación 2 — al remitente, apenas se registra la venta (encomiendaService.
// create()). Distinta de sendPaqueteEnviadoEmail: esta es "ya quedó registrada tu
// encomienda", no "ya salió" -- el camión puede partir días después, así que acá NO
// se dice "en camino" para no adelantar algo que todavía no pasó.
const sendEncomiendaRegistradaClienteEmail = async (email, { nombreCliente = '', numeroGuia = '', destinoMunicipio = '', fechaEstimadaEntrega = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Registramos tu encomienda - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#1A2E6E20',
      icon: ICONS.recibo,
      heading: '¡Registramos tu encomienda!',
      bodyHtml: `
        Hola${nombreCliente ? ` <b>${nombreCliente}</b>` : ''}, confirmamos el registro de tu encomienda con guía <b>${numeroGuia}</b>
        ${destinoMunicipio ? `con destino a <b>${destinoMunicipio}</b>` : ''}.
        ${fechaEstimadaEntrega ? `<br><br>Fecha estimada de entrega: <b>${formatFechaLarga(fechaEstimadaEntrega)}</b>.` : ''}
        <br><br>Te avisaremos apenas salga en camino.
      `,
    }),
  });
};

// P9, Notificación 2 — mismo disparador, para el destinatario: le anticipa que le
// llegará algo, antes incluso de que el camión salga.
const sendEncomiendaRegistradaDestinatarioEmail = async (email, { nombreDestinatario = '', numeroGuia = '', origenMunicipio = '', fechaEstimadaEntrega = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Te enviaron una encomienda - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#0EA5E920',
      icon: ICONS.recibo,
      heading: 'Te enviaron una encomienda',
      bodyHtml: `
        Hola${nombreDestinatario ? ` <b>${nombreDestinatario}</b>` : ''}, te informamos que se registró una encomienda para ti
        con guía <b>${numeroGuia}</b>${origenMunicipio ? ` desde ${origenMunicipio}` : ''}.
        ${fechaEstimadaEntrega ? `<br><br>Fecha estimada de entrega: <b>${formatFechaLarga(fechaEstimadaEntrega)}</b>.` : ''}
        <br><br>Te avisaremos apenas salga en camino.
      `,
    }),
  });
};

// P9, Notificación 3 — al destinatario, cuando el distribuidor registra un intento
// fallido ('Intento') o cierra el paquete como no entregado ('Devuelto'). Invita a
// coordinar la entrega o pasar a recoger -- distinto de sendPaqueteDevueltoEmail
// (esa avisa al REMITENTE que su paquete no se pudo entregar; esta le habla
// directo al destinatario, que es quien puede resolverlo).
const sendInsistenciaDestinatarioEmail = async (email, { nombreDestinatario = '', numeroGuia = '', municipioSede = '', esFinal = false } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'No pudimos entregarte tu encomienda - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#F59E0B20',
      icon: ICONS.campana,
      heading: 'No pudimos entregarte tu encomienda',
      bodyHtml: `
        Hola${nombreDestinatario ? ` <b>${nombreDestinatario}</b>` : ''}, intentamos entregarte la encomienda con guía <b>${numeroGuia}</b>
        y no fue posible.
        ${esFinal
          ? `<br><br>Quedó retenida en nuestra sede${municipioSede ? ` en <b>${municipioSede}</b>` : ''}. Por favor coordina con nosotros la recepción o pasa a recogerla.`
          : `<br><br>Seguiremos intentando la entrega, pero también puedes coordinar con nosotros o pasar a recogerla en nuestra sede${municipioSede ? ` en <b>${municipioSede}</b>` : ''}.`}
      `,
    }),
  });
};

// P9, Notificación 4 (parte "Llegó a la sede") — al destinatario, cuando el
// conductor deja el paquete en la sede de destino (encomiendaService.
// dejarPaquetesEnSede()). Un correo por VENTA, no por paquete (varios paquetes de
// la misma venta comparten guía y destinatario).
const sendPaqueteEnSedeEmail = async (email, { nombreDestinatario = '', numeroGuia = '', municipioSede = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Tu encomienda llegó a la sede - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#0EA5E920',
      icon: ICONS.sede,
      heading: '¡Tu encomienda llegó a la sede!',
      bodyHtml: `
        Hola${nombreDestinatario ? ` <b>${nombreDestinatario}</b>` : ''}, tu encomienda con guía <b>${numeroGuia}</b> ya llegó
        a nuestra sede${municipioSede ? ` en <b>${municipioSede}</b>` : ''}. Muy pronto coordinaremos la entrega contigo.
      `,
    }),
  });
};

// P9, Notificación 4 (parte "Entregado") — al remitente, cuando el distribuidor
// cierra el paquete como entregado (encomiendaService.registrarEntregaFinal(),
// accion === 'Entregado'). Cierra el ciclo que abrió sendEncomiendaRegistradaClienteEmail/
// sendPaqueteEnviadoEmail.
const sendEncomiendaEntregadaEmail = async (email, { nombreCliente = '', numeroGuia = '' } = {}) => {
  return sendBrevoEmail({
    to: email,
    subject: 'Tu encomienda fue entregada - EncomiExpress',
    html: buildEmailShell({
      badgeBg: '#05966920',
      icon: ICONS.exito,
      heading: '¡Tu encomienda fue entregada!',
      bodyHtml: `
        Hola${nombreCliente ? ` <b>${nombreCliente}</b>` : ''}, te confirmamos que tu encomienda con guía <b>${numeroGuia}</b>
        fue entregada exitosamente a su destinatario.
        <br><br>Gracias por confiar en EncomiExpress.
      `,
    }),
  });
};

module.exports = {
  sendPasswordRecoveryEmail,
  sendPaqueteDevueltoEmail,
  sendBienvenidaEmail,
  sendPaqueteEnviadoEmail,
  sendPaquetePorRecibirEmail,
  sendDocumentoPorVencerEmail,
  sendEncomiendaRegistradaClienteEmail,
  sendEncomiendaRegistradaDestinatarioEmail,
  sendInsistenciaDestinatarioEmail,
  sendPaqueteEnSedeEmail,
  sendEncomiendaEntregadaEmail,
};
