// src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const ROL_RHADMIN     = 7;
const ROL_RH          = 1;
const ROL_SUPERVISOR  = 2;
const ROL_GERENTE     = 3;
const ROL_COLABORADOR = 4;
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token no proporcionado',
        });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(403).json({
            success: false,
            message: 'Token inválido',
        });
    }
}
// Solo RH
function soloRH(req, res, next) {
    if (![ROL_RHADMIN, ROL_RH].includes(req.user?.rolId)) {
        return res.status(403).json({
            success: false,
            message: 'Acceso solo para RH',
        });
    }
    next();
}
//Supervisor
function soloSupervisor(req, res, next) {
    if (![ROL_RHADMIN, ROL_RH, ROL_SUPERVISOR].includes(req.user?.rolId)) {
        return res.status(403).json({
            success: false,
            message: 'Acceso no autorizado',
        });
    }

    next();
}
//Mandos
function soloMandos(req, res, next) {
    if (![ROL_RHADMIN, ROL_RH, ROL_SUPERVISOR, ROL_GERENTE].includes(req.user?.rolId)) {
        return res.status(403).json({
            success: false,
            message: 'Acceso no autorizado',
        });
    }

    next();
}

// Verifica si puede ver empleados de un departamento.
// Esta función se queda como apoyo para Gerente.
function puedeVerDepartamento(req, departamento) {
    const rolId = req.user?.rolId;

    if ([ROL_RH, ROL_SUPERVISOR].includes(rolId)) return true;

    if (rolId === ROL_GERENTE) {
        return req.user?.departamento === departamento;
    }

    return false;
}
function soloRHAdmin(req, res, next) {
    if (req.user?.rolId !== ROL_RHADMIN) {
        return res.status(403).json({
            success: false,
            message: 'Acceso solo para RHadmin',
        });
    }
    next();
}
module.exports = {
    authMiddleware,
    soloRH,
    soloSupervisor,
    soloMandos,
    soloRHAdmin,
    puedeVerDepartamento,
    ROL_RHADMIN,
    ROL_RH,
    ROL_SUPERVISOR,
    ROL_GERENTE,
    ROL_COLABORADOR,
};