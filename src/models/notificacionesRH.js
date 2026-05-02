// src/models/notificacionesRH.js
const connection = require('../config/connection');

const query = (sql, values = []) => new Promise((resolve, reject) => {
    connection.query(sql, values, (error, results) => {
        if (error) reject(error);
        else resolve(results);
    });
});

// ─── Días antes de notificar ──────────────────────────────────
const DIAS_ANTES = 5;

// ─── Meses de evaluación ──────────────────────────────────────
const EVALUACIONES = [
    { tipo: 'evaluacion_1mes', meses: 1, label: '1er Mes'  },
    { tipo: 'evaluacion_2mes', meses: 2, label: '2do Mes'  },
    { tipo: 'evaluacion_3mes', meses: 3, label: '3er Mes'  },
];

/**
 * Calcula la fecha de evaluación sumando N meses a la fecha de contratación.
 * Respeta el mismo día del mes.
 */
function calcularFechaEvaluacion(fechaContratacion, meses) {
    const fecha = new Date(fechaContratacion);
    fecha.setMonth(fecha.getMonth() + meses);
    return fecha.toISOString().split('T')[0];
}

/**
 * Genera las notificaciones pendientes para todos los empleados.
 * Se llama al crear un nuevo usuario o como job periódico.
 * @param {number} usuarioId - Si se pasa, solo genera para ese usuario
 */
async function generarNotificaciones(usuarioId = null) {
    try {
        // Obtener empleados (todos o uno específico)
        const whereClause = usuarioId ? 'WHERE usuarioId = ?' : '';
        const params      = usuarioId ? [usuarioId] : [];

        const empleados = await query(
            `SELECT usuarioId, fechaContratacion FROM usuarios ${whereClause}`,
            params
        );

        for (const emp of empleados) {
            for (const eval_ of EVALUACIONES) {
                const fechaEval     = calcularFechaEvaluacion(emp.fechaContratacion, eval_.meses);
                const fechaNotificar = new Date(fechaEval);
                fechaNotificar.setDate(fechaNotificar.getDate() - DIAS_ANTES);
                const fechaNotificarStr = fechaNotificar.toISOString().split('T')[0];

                // Verificar si ya existe esta notificación
                const existe = await query(
                    `SELECT notificacionId FROM notificaciones_rh
                     WHERE usuarioId = ? AND tipo = ?`,
                    [emp.usuarioId, eval_.tipo]
                );

                if (existe.length === 0) {
                    await query(
                        `INSERT INTO notificaciones_rh
                            (usuarioId, tipo, fecha_evaluacion, fecha_notificar)
                         VALUES (?, ?, ?, ?)`,
                        [emp.usuarioId, eval_.tipo, fechaEval, fechaNotificarStr]
                    );
                }
            }
        }

        return { success: true, message: 'Notificaciones generadas' };
    } catch (error) {
        console.error('Error al generar notificaciones:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Obtiene las notificaciones pendientes para RH.
 * Solo muestra las que ya es momento de notificar (fecha_notificar <= hoy)
 * y que no han sido leídas.
 * @param {boolean} soloNoLeidas - Si true, solo trae las no leídas
 */
async function getNotificacionesRH(soloNoLeidas = false) {
    const whereLeida = soloNoLeidas ? 'AND n.leida = 0' : '';

    return await query(`
        SELECT
            n.notificacionId,
            n.usuarioId,
            n.tipo,
            n.fecha_evaluacion,
            n.fecha_notificar,
            n.leida,
            n.createdAt,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            p.nombre_puesto,
            CASE n.tipo
                WHEN 'evaluacion_1mes' THEN 'Evaluación 1er Mes'
                WHEN 'evaluacion_2mes' THEN 'Evaluación 2do Mes'
                WHEN 'evaluacion_3mes' THEN 'Evaluación 3er Mes'
            END AS titulo_notificacion
        FROM notificaciones_rh n
        LEFT JOIN usuarios u ON n.usuarioId = u.usuarioId
        LEFT JOIN puesto   p ON u.puestoId  = p.puestoId
        WHERE n.fecha_notificar <= CURDATE()
          ${whereLeida}
        ORDER BY n.leida ASC, n.fecha_evaluacion ASC
    `);
}

/**
 * Marca una notificación como leída.
 * @param {number} notificacionId
 */
async function marcarComoLeida(notificacionId) {
    await query(
        'UPDATE notificaciones_rh SET leida = 1 WHERE notificacionId = ?',
        [notificacionId]
    );
    return { success: true };
}

/**
 * Cuenta las notificaciones no leídas para mostrar el badge.
 */
async function contarNoLeidas() {
    const result = await query(
        `SELECT COUNT(*) AS total FROM notificaciones_rh
         WHERE leida = 0 AND fecha_notificar <= CURDATE()`
    );
    return result[0].total || 0;
}

module.exports = {
    generarNotificaciones,
    getNotificacionesRH,
    marcarComoLeida,
    contarNoLeidas,
};