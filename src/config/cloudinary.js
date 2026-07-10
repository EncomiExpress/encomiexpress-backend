const cloudinary = require('cloudinary').v2;
const CloudinaryStorage = require('multer-storage-cloudinary'); // ← sin llaves, es la función directa
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  folder: 'encomiexpress',        // ← en v2.x va directo, no dentro de params
  allowedFormats: ['jpg', 'jpeg', 'png', 'pdf'],
});

const upload = multer({ storage });

module.exports = { cloudinary, upload };