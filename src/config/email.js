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

const sendPasswordRecoveryEmail = async (email, tempPassword) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Recuperación de contraseña - Encomiexpress',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Recuperación de contraseña</h2>
        <p>Has solicitado recuperar tu contraseña en <strong>Encomiexpress</strong>.</p>
        <p>Tu contraseña temporal es:</p>
        <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 2px;">
          ${tempPassword}
        </div>
        <p><strong>Nota:</strong> Esta contraseña es temporal. Te recomendamos cambiarla después de iniciar sesión.</p>
        <p>Si no solicitaste este cambio, por favor ignora este correo.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Encomiexpress - Sistema de gestión de encomiendas</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
};

const sendTrackingEmail = async (emailCliente, numeroGuia, token) => {
  const trackingUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/seguimiento?token=${token}`;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailCliente,
    subject: `Seguimiento de tu encomienda #${numeroGuia}`,
    html: `
      <h2>¡Tu envío ha sido registrado!</h2>
      <p>Número de guía: <strong>${numeroGuia}</strong></p>
      <p>Para ver el estado actualizado de tu paquete, haz clic en el siguiente enlace:</p>
      <a href="${trackingUrl}" target="_blank">Ver estado de mi envío</a>
      <p>Este enlace se actualizará automáticamente cuando haya cambios.</p>
    `
  };
  return transporter.sendMail(mailOptions);
};

module.exports = { transporter, sendPasswordRecoveryEmail, sendTrackingEmail };
