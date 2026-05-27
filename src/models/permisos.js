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

function calcularEstadoPermiso({ respuesta_supervisor, estado_rh }) {
    if (respuesta_supervisor === 'rechazado') return 'rechazado';
    if (estado_rh === 'rechazado') return 'rechazado';

    if (respuesta_supervisor === 'autorizado' && estado_rh === 'autorizado') {
        return 'autorizado';
    }

    return 'pendiente';
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
            usuarioId,
            fecha_elaboracion,
            fecha_permiso,
            tipo,
            num_dias,
            fecha_inicio,
            fecha_fin,
            observaciones,
            num_horas,
            hora_inicio,
            hora_fin,
            dia_permiso,
            repone_hora_inicio,
            repone_hora_fin,
            repone_dias,
            repone_mes,
            entrada_corrido,
            salida_corrido,
            dias_corrido,
            mes_corrido,
            motivo,
            goce_sueldo,
            estado,
            respuesta_supervisor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', NULL)
    `, [
        usuarioId,
        fecha_elaboracion,
        fecha_permiso,
        tipo,
        num_dias || null,
        fecha_inicio || null,
        fecha_fin || null,
        observaciones || null,
        num_horas || null,
        hora_inicio || null,
        hora_fin || null,
        dia_permiso || null,
        repone_hora_inicio || null,
        repone_hora_fin || null,
        repone_dias || null,
        repone_mes || null,
        entrada_corrido || null,
        salida_corrido || null,
        dias_corrido || null,
        mes_corrido || null,
        motivo || null,

        // RH lo puede redefinir al autorizar.
        goce_sueldo || null,
    ]);

    return {
        success: true,
        permisoId: result.insertId,
    };
}

async function getPermisosByEmpleado(usuarioId) {
    return await query(`
        SELECT
            p.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            d.nombre AS nombre_departamento
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        WHERE p.usuarioId = ?
        ORDER BY p.fecha_elaboracion DESC, p.permisoId DESC
    `, [usuarioId]);
}

async function getTodosPermisos() {
    return await query(`
        SELECT
            p.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            d.nombre AS nombre_departamento,
            sup.nombre AS supervisor_nombre,
            sup.apPaterno AS supervisor_apPaterno
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN usuarios sup ON p.supervisor_usuarioId = sup.usuarioId
        ORDER BY p.fecha_elaboracion DESC, p.permisoId DESC
    `);
}

async function getPermisosSupervisor(usuarioSupervisorId) {
    return await query(
        `
        SELECT DISTINCT
            p.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            d.nombre AS nombre_departamento
        FROM permisos p
        INNER JOIN usuarios u
            ON p.usuarioId = u.usuarioId
        INNER JOIN usuario_accesos ua
            ON ua.usuarioId = ?
           AND ua.activo = 1
           AND ua.sucursalId = u.sucursalId
           AND (
                ua.departamentoId IS NULL
                OR ua.departamentoId = u.departamentoId
           )
        LEFT JOIN sucursales s
            ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d
            ON u.departamentoId = d.departamentoId
        WHERE u.usuarioId <> ?
            AND u.rolId <> 2
        ORDER BY p.fecha_elaboracion DESC, p.permisoId DESC
        `,
        [usuarioSupervisorId, usuarioSupervisorId]
    );
}

async function usuarioPuedeResponderPermiso(usuarioSupervisorId, permisoId) {
    const rows = await query(
        `
        SELECT
            p.permisoId
        FROM permisos p
        INNER JOIN usuarios u
            ON p.usuarioId = u.usuarioId
        INNER JOIN usuario_accesos ua
            ON ua.usuarioId = ?
           AND ua.activo = 1
           AND ua.sucursalId = u.sucursalId
           AND (
                ua.departamentoId IS NULL
                OR ua.departamentoId = u.departamentoId
           )
        WHERE p.permisoId = ?
          AND u.usuarioId <> ?
          AND u.rolId <> 2
        LIMIT 1
        `,
        [usuarioSupervisorId, permisoId, usuarioSupervisorId]
    );

    return rows.length > 0;
}

async function getPermisoById(permisoId) {
    const rows = await query(`
        SELECT
            p.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            d.nombre AS nombre_departamento,
            sup.nombre AS supervisor_nombre,
            sup.apPaterno AS supervisor_apPaterno
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN usuarios sup ON p.supervisor_usuarioId = sup.usuarioId
        WHERE p.permisoId = ?
        LIMIT 1
    `, [permisoId]);

    return rows[0] || null;
}

async function responderPermiso(permisoId, estado, opciones = {}) {
    const {
        respondedor = 'rh',
        usuarioRespondedorId = null,
        goce_sueldo = null,
        comentario = null,
    } = opciones;

    if (!['autorizado', 'rechazado'].includes(estado)) {
        return {
            success: false,
            message: 'Estado inválido',
        };
    }

    const rows = await query(
        'SELECT * FROM permisos WHERE permisoId = ? LIMIT 1',
        [permisoId]
    );

    if (rows.length === 0) {
        return {
            success: false,
            message: 'Permiso no encontrado',
        };
    }

    const permisoActual = rows[0];

    if (respondedor === 'supervisor') {
        await query(
            `
        UPDATE permisos
        SET
            respuesta_supervisor = ?,
            supervisor_usuarioId = ?,
            fecha_respuesta_supervisor = NOW(),
            comentario_supervisor = ?,
            estado = 'pendiente'
        WHERE permisoId = ?
        `,
            [
                estado,
                usuarioRespondedorId,
                comentario || null,
                permisoId,
            ]
        );
        return {
            success: true,
            message: estado === 'autorizado'
                ? 'Permiso autorizado por supervisor. Pendiente de RH.'
                : 'Permiso marcado como rechazado por supervisor. Pendiente de revisión final por RH.',
            estado_final: 'pendiente',
        };
    }

    if (respondedor === 'rh') {
        if (!permisoActual.respuesta_supervisor) {
            return {
                success: false,
                message: 'El supervisor debe responder este permiso antes de RH',
            };
        }
        if (
            estado === 'autorizado' &&
            permisoActual.respuesta_supervisor !== 'autorizado'
        ) {
            return {
                success: false,
                message: 'No puedes autorizar un permiso rechazado por supervisor. Solo puedes rechazarlo o pedir revisión.',
            };
        }
        if (
            estado === 'autorizado' &&
            !['con_goce', 'sin_goce', 'repone_tiempo'].includes(goce_sueldo)
        ) {
            return {
                success: false,
                message: 'Selecciona el tipo de permiso',
            };
        }
        await query(
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
                goce_sueldo || null,
                permisoId,
            ]
        );
        return {
            success: true,
            message: estado === 'autorizado'
                ? 'Permiso autorizado correctamente'
                : 'Permiso rechazado correctamente',
            estado_final: estado,
        };
    }   
    return {
        success: false,
        message: 'Respondedor inválido',
    };
}

async function deletePermiso(permisoId) {
    await query('DELETE FROM permisos WHERE permisoId = ?', [permisoId]);

    return {
        success: true,
    };
}

module.exports = {
    crearPermiso,
    getPermisosByEmpleado,
    getTodosPermisos,
    getPermisosSupervisor,
    getPermisoById,
    usuarioPuedeResponderPermiso,
    responderPermiso,
    deletePermiso,
};