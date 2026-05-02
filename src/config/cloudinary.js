// src/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer — almacenamiento en memoria (no en disco)
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: (req, file, cb) => {
        const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
        if (permitidos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
        }
    },
});

/**
 * Sube una imagen a Cloudinary.
 * @param {Buffer} buffer    - Buffer de la imagen
 * @param {string} folder    - Carpeta en Cloudinary
 * @param {string} publicId  - Nombre del archivo
 * @returns {Promise<string>} URL de la imagen
 */
async function subirImagen(buffer, folder = 'diagsa_empleados', publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,                    // ← 'diagsa_empleados'
                public_id:   publicId,     // ← 'empleado_3'
                overwrite:   true,
                transformation: [
                    { width: 200, height: 200, crop: 'fill', gravity: 'face' },
                    { quality: 60, fetch_format: 'webp' },
                ],
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        stream.end(buffer);
    });
}

module.exports = { cloudinary, upload, subirImagen };