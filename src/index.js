const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/index');

const server = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : [
        'https://diagsa.vercel.app',
        'http://localhost:3001',
    ];

server.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));

server.use(express.json({ limit: '10mb' }));
server.use(express.urlencoded({ extended: true, limit: '10mb' }));

server.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API RH funcionando correctamente',
        timestamp: new Date().toISOString(),
    });
});

server.use('/api', apiRoutes);

server.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint no encontrado',
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});