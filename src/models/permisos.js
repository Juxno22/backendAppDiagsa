// src/models/permisos.js
const connection = require('../config/connection');

const query = (sql, values = []) => new Promise((resolve, reject) => {
    connection.query(sql, values, (err, results) => err ? reject(err) : resolve(results));
});
function fechaLocalYYYYMMDD(fecha = new Date()) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function esFechaAnteriorAHoy(fecha) {
    if (!fecha) return false;
    return String(fecha).split('T')[0] < fechaLocalYYYYMMDD();
}
async function crearPermiso(usuarioId, datos) {
    const {
        fecha_elaboracion, fecha_permiso, tipo,
        num_dias, fecha_inicio, fecha_fin, observaciones,
        num_horas, hora_inicio, hora_fin, dia_permiso,
        repone_hora_inicio, repone_hora_fin, repone_dias, repone_mes,
        entrada_corrido, salida_corrido, dias_corrido, mes_corrido,
        motivo, goce_sueldo,
    } = datos;
    if (esFechaAnteriorAHoy(fecha_permiso)) {
        return {
            success: false,
            message: 'No puedes solicitar permisos para días anteriores',
        };
    }
    if (tipo === 'dia') {
        if (esFechaAnteriorAHoy(fecha_inicio)) {
            return {
                success: false,
                message: 'La fecha de inicio no puede ser anterior a hoy',
            };
        }
        if (esFechaAnteriorAHoy(fecha_fin)) {
            return {
                success: false,
                message: 'La fecha de fin no puede ser anterior a hoy',
            };
        }
        if (fecha_inicio && fecha_fin && fecha_fin < fecha_inicio) {
            return {
                success: false,
                message: 'La fecha de fin no puede ser menor a la fecha de inicio',
            };
        }
    }
    if (tipo === 'horas') {
        if (esFechaAnteriorAHoy(dia_permiso)) {
            return {
                success: false,
                message: 'El día del permiso no puede ser anterior a hoy',
            };
        }
    }
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

async function responderPermiso(id, estado, goce_sueldo = null) {
    if (!['autorizado', 'rechazado'].includes(estado)) {
        return {
            success: false,
            message: 'Estado inválido',
        };
    }
    if (estado === 'autorizado' && !['con_goce', 'sin_goce', 'repone_tiempo'].includes(goce_sueldo)) {
        return {
            success: false,
            message: 'Selecciona el tipo de permiso',
        };
    }
    const result = await query(
        `
        UPDATE permisos
        SET
            estado = ?,
            goce_sueldo = CASE
                WHEN ? = 'autorizado' THEN ?
                ELSE goce_sueldo
            END
        WHERE permisoId = ?
        `,
        [
            estado,
            estado,
            goce_sueldo,
            id,
        ]
    );
    return {
        success: result.affectedRows > 0,
        message: result.affectedRows > 0
            ? 'Permiso actualizado correctamente'
            : 'Permiso no encontrado',
    };
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