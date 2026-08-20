const cloudinaryRoot = require('cloudinary'); // módulo raíz — trae adentro .v2
const CloudinaryStorage = require('multer-storage-cloudinary'); // ← sin llaves, es la función directa
const multer = require('multer');

const cloudinary = cloudinaryRoot.v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Esta versión de multer-storage-cloudinary accede a `cloudinary.v2.uploader`
// internamente, así que hay que pasarle el módulo raíz (con el .v2 adentro),
// no el objeto `v2` ya desempacado — si no, revienta con
// "Cannot read properties of undefined (reading 'uploader')".
const storage = new CloudinaryStorage({
  cloudinary: cloudinaryRoot,
  folder: 'encomiexpress',        // ← en v2.x va directo, no dentro de params
  allowedFormats: ['jpg', 'jpeg', 'png', 'pdf'],
});

// Sin este límite, cualquier archivo autenticado (PDF o imagen) se sube sin tope de peso.
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } }); // 8 MB

module.exports = { cloudinary, upload };