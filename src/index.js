const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors    = require('cors');
const apiRoutes = require('./routes/index');

const server = express();
const PORT   = process.env.PORT || 3000;
server.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use('/api', apiRoutes);

server.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint no encontrado'
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});