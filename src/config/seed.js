// Bootstrap: crea el admin inicial en la BD de las variables de entorno activas.
// A diferencia de POST /api/seed (bloqueado en producción), este sí corre ahí —
// una sola vez, después de database/init.sql. La contraseña sale de
// ADMIN_INITIAL_PASSWORD (obligatoria, sin valor por defecto).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, Usuario } = require('../models');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).{8,64}$/;

const run = async () => {
  await sequelize.authenticate();

  const existingAdmin = await Usuario.findOne({ where: { email: 'admin@encomiexpress.com' } });
  if (existingAdmin) {
    console.log('El usuario admin ya existe — no se toca (no se resetea su contraseña).');
  } else {
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!password) {
      throw new Error('ADMIN_INITIAL_PASSWORD no está definida en tu .env — defínela antes de correr el seed');
    }
    if (!PASSWORD_REGEX.test(password)) {
      throw new Error('ADMIN_INITIAL_PASSWORD es débil — debe tener 8-64 caracteres, con mayúsculas, minúsculas, números y un carácter especial');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await Usuario.create({
      idRol: 1,
      tipoIdentificacion: 'CC',
      numeroIdentificacion: '12345678',
      nombre: 'Administrador',
      apellido: 'Sistema',
      telefono: '3000000000',
      email: 'admin@encomiexpress.com',
      password: hashedPassword,
      habilitado: true,
    });
    console.log('Usuario admin creado: admin@encomiexpress.com');
  }

  await sequelize.close();
};

run().catch((err) => {
  console.error('Error al ejecutar el seed:', err.message);
  process.exit(1);
});
