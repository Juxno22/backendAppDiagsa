// src/models/vacantes.js
const connection = require('../config/connection');
const query = (sql, values = []) => new Promise((resolve, reject) => {
    connection.query(sql, values, (err, results) => err ? reject(err) : resolve(results));
});

// Crear solicitud — Supervisor, Gerente o Auxiliar
async function solicitarVacante(solicitanteId, datos) {
    const {
        departamento, puesto, num_plazas, descripcion,
        requisitos, motivo, prioridad, fecha_requerida
    } = datos;

    if (!departamento || !puesto)
        return { success: false, message: 'Departamento y puesto son requeridos' };

    const result = await query(`
        INSERT INTO vacantes (
            solicitanteId, departamento, puesto, num_plazas,
            descripcion, requisitos, motivo, prioridad, fecha_requerida, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
    `, [
        solicitanteId, departamento, puesto, num_plazas || 1,
        descripcion || null, requisitos || null, motivo || null,
        prioridad || 'media', fecha_requerida || null,
    ]);

    return { success: true, vacanteId: result.insertId };
}

// Obtener propias — Supervisor, Gerente, Auxiliar
async function getVacantesSolicitante(solicitanteId) {
    return await query(`
        SELECT v.*,
               u.nombre, u.apPaterno, u.departamento AS dep_solicitante
        FROM vacantes v
        LEFT JOIN usuarios u ON v.solicitanteId = u.usuarioId
        WHERE v.solicitanteId = ?
        ORDER BY v.createdAt DESC
    `, [solicitanteId]);
}

// Obtener todas — RH
async function getAllVacantes() {
    return await query(`
        SELECT v.*,
               u.nombre, u.apPaterno, u.apMaterno,
               u.departamento AS dep_solicitante
        FROM vacantes v
        LEFT JOIN usuarios u ON v.solicitanteId = u.usuarioId
        ORDER BY
            FIELD(v.prioridad, 'alta', 'media', 'baja'),
            v.createdAt DESC
    `);
}

// RH gestiona — cambia estado y agrega notas
async function gestionarVacanteRH(vacanteId, datos) {
    const { estado, notas_rh } = datos;

    const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'cubierta', 'cancelada'];
    if (estado && !ESTADOS_VALIDOS.includes(estado))
        return { success: false, message: 'Estado inválido' };

    await query(`
        UPDATE vacantes SET
            estado   = COALESCE(?, estado),
            notas_rh = COALESCE(?, notas_rh)
        WHERE vacanteId = ?
    `, [estado || null, notas_rh || null, vacanteId]);

    return { success: true, message: 'Vacante actualizada' };
}

// Eliminar vacante — solo RH
async function deleteVacante(vacanteId) {
    await query('DELETE FROM vacantes WHERE vacanteId = ?', [vacanteId]);
    return { success: true };
}

module.exports = {
    solicitarVacante,
    getVacantesSolicitante,
    getAllVacantes,
    gestionarVacanteRH,
    deleteVacante,
};