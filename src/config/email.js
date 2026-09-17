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

// Bienvenida al crear un Usuario (panel: admin/operador_sede/distribuidor) o un
// Conductor (que siempre nace con su propio Usuario, ver conductorService.create)
// -- ambos ganan credenciales de acceso nuevas, así que ambos la reciben.
// `rolLabel` es opcional y en minúscula sin artículo (ej. "conductor",
// "distribuidor de sede") para que encaje en "te damos la bienvenida como ___".
const sendBienvenidaEmail = async (email, { nombre = '', rolLabel = '' } = {}) => {
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
        Tu cuenta ya está activa y lista para usarse. Estamos muy contentos de tenerte en el equipo y confiamos en que, juntos, seguiremos haciendo de cada envío una entrega exitosa.
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

module.exports = {
  sendPasswordRecoveryEmail,
  sendPaqueteDevueltoEmail,
  sendBienvenidaEmail,
  sendPaqueteEnviadoEmail,
  sendPaquetePorRecibirEmail,
  sendDocumentoPorVencerEmail,
};
