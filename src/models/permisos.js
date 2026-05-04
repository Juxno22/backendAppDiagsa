// src/models/permisos.js
const connection = require('../config/connection');

const query = (sql, values = []) => new Promise((resolve, reject) => {
    connection.query(sql, values, (err, results) => err ? reject(err) : resolve(results));
});

async function crearPermiso(usuarioId, datos) {
    const {
        fecha_elaboracion, fecha_permiso, tipo,
        num_dias, fecha_inicio, fecha_fin, observaciones,
        num_horas, hora_inicio, hora_fin, dia_permiso,
        repone_hora_inicio, repone_hora_fin, repone_dias, repone_mes,
        entrada_corrido, salida_corrido, dias_corrido, mes_corrido,
        motivo, goce_sueldo,
    } = datos;

    const result = await query(`
        INSERT INTO permisos (
            usuarioId, fecha_elaboracion, fecha_permiso, tipo,
            num_dias, fecha_inicio, fecha_fin, observaciones,
            num_horas, hora_inicio, hora_fin, dia_permiso,
            repone_hora_inicio, repone_hora_fin, repone_dias, repone_mes,
            entrada_corrido, salida_corrido, dias_corrido, mes_corrido,
            motivo, goce_sueldo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        usuarioId, fecha_elaboracion, fecha_permiso, tipo,
        num_dias || null, fecha_inicio || null, fecha_fin || null, observaciones || null,
        num_horas || null, hora_inicio || null, hora_fin || null, dia_permiso || null,
        repone_hora_inicio || null, repone_hora_fin || null, repone_dias || null, repone_mes || null,
        entrada_corrido || null, salida_corrido || null, dias_corrido || null, mes_corrido || null,
        motivo || null, goce_sueldo || 'con_goce',
    ]);

    return { success: true, permisoId: result.insertId };
}

async function getPermisosByEmpleado(usuarioId) {
    return await query(`
        SELECT p.*, u.nombre, u.apPaterno, u.apMaterno, u.departamento
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        WHERE p.usuarioId = ?
        ORDER BY p.fecha_elaboracion DESC
    `, [usuarioId]);
}

async function getTodosPermisos() {
    return await query(`
        SELECT p.*, u.nombre, u.apPaterno, u.apMaterno, u.departamento
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        ORDER BY p.fecha_elaboracion DESC
    `);
}

async function getPermisoById(permisoId) {
    const rows = await query(`
        SELECT p.*, u.nombre, u.apPaterno, u.apMaterno, u.departamento
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        WHERE p.permisoId = ?
    `, [permisoId]);
    return rows[0] || null;
}

async function responderPermiso(permisoId, estado) {
    await query(
        'UPDATE permisos SET estado = ? WHERE permisoId = ?',
        [estado, permisoId]
    );
    return { success: true };
}

async function deletePermiso(permisoId) {
    await query('DELETE FROM permisos WHERE permisoId = ?', [permisoId]);
    return { success: true };
}

module.exports = {
    crearPermiso,
    getPermisosByEmpleado,
    getTodosPermisos,
    getPermisoById,
    responderPermiso,
    deletePermiso,
};