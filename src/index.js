const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors    = require('cors');
const apiRoutes = require('./routes/index');

const server = express();
const PORT   = process.env.PORT || 3000;
app.use(cors({
    origin: [
        'https://diagsa.vercel.app',
        'http://localhost:3001', // para desarrollo local
    ],
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