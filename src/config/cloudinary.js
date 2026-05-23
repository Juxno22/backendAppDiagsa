// src/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});
// Multer para imágenes — foto de perfil
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
    fileFilter: (req, file, cb) => {
        const permitidos = ['image/jpeg', 'image/png', 'image/webp'];

        if (permitidos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
        }
    },
});
// Multer para PDFs — documentos RH
const uploadPDF = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    },
});
/**
 * Sube una imagen a Cloudinary.
 */
async function subirImagen(buffer, folder = 'diagsa_empleados', publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'image',
                folder,
                public_id: publicId,
                overwrite: true,
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

/**
 * Subir una imagen de evidencia ppara quejas y sugerencias
 */
async function subirImagenEvidencia(buffer, folder = 'diagsa_quejas_sugerencias', publicId){
    return new Promise((resolve, reject)=>{
        const stream = cloudinary.uploader.upload_stream({
            resource_type: 'image',
            folder,
            public_id: publicId,
            overwrite: true,
            transformation: [
                {with: 1600, height: 1600, crop: 'limit'},
                {quality: 'auto', fetch_format: 'auto'},
            ],
        }, (error, result)=>{
            if(error) reject(error);
            else{
                resolve({
                    url: resolve.secure_url,
                    public_id: result.public_id,
                })
            }
        })
        stream.end(buffer);
    })
};
/**
 * Sube un PDF a Cloudinary como raw.
 */
async function subirPDF(buffer, folder = 'diagsa_documentos', publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'raw',
                folder,
                public_id: publicId,
                overwrite: true,
                use_filename: true,
                unique_filename: false,
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        stream.end(buffer);
    });
}
module.exports = {
    cloudinary,
    upload,
    uploadPDF,
    subirImagen,
    subirImagenEvidencia,
    subirPDF,
};