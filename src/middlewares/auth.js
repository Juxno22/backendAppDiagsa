// src/middlewares/auth.js
const jwt = require('jsonwebtoken');

const ROL_RH         = 3;
const ROL_SUPERVISOR = 2;
const ROL_GERENTE    = 5;
const ROL_AUXILIAR   = 6;
const ROL_COLABORADOR = 1;
const ROL_OPERATIVO  = 4;

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(403).json({ success: false, message: 'Token inválido' });
    }
}

// Solo RH
function soloRH(req, res, next) {
    if (req.user?.rolId !== ROL_RH)
        return res.status(403).json({ success: false, message: 'Acceso solo para RH' });
    next();
}

// RH o Supervisor
function soloSupervisor(req, res, next) {
    if (![ROL_RH, ROL_SUPERVISOR].includes(req.user?.rolId))
        return res.status(403).json({ success: false, message: 'Acceso no autorizado' });
    next();
}

// RH, Supervisor, Gerente o Auxiliar
function soloMandos(req, res, next) {
    if (![ROL_RH, ROL_SUPERVISOR, ROL_GERENTE, ROL_AUXILIAR].includes(req.user?.rolId))
        return res.status(403).json({ success: false, message: 'Acceso no autorizado' });
    next();
}

// Verifica si puede ver empleados de un departamento
function puedeVerDepartamento(req, departamento) {
    const rolId = req.user?.rolId;
    if ([ROL_RH, ROL_SUPERVISOR].includes(rolId)) return true;
    if ([ROL_GERENTE, ROL_AUXILIAR].includes(rolId))
        return req.user?.departamento === departamento;
    return false;
}

module.exports = {
    authMiddleware,
    soloRH,
    soloSupervisor,
    soloMandos,
    puedeVerDepartamento,
    ROL_RH, ROL_SUPERVISOR, ROL_GERENTE,
    ROL_AUXILIAR, ROL_COLABORADOR, ROL_OPERATIVO,
};