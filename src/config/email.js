const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const ICONS = {
  candado: '🔒',
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
  const mailOptions = {
    from: process.env.EMAIL_USER,
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
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { transporter, sendPasswordRecoveryEmail };
