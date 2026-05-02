// src/models/evaluaciones.js
const connection = require('../config/connection');

const query = (sql, values = []) => {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });
};

async function getSecciones() {
    const secciones = await query(`
        SELECT seccionId, nombre, orden
        FROM evaluacion_secciones
        ORDER BY orden
    `);
    const seccionesConPreguntas = await Promise.all(
        secciones.map(async (s) => {
            const preguntas = await query(`
                SELECT preguntaId, pregunta, orden
                FROM evaluacion_preguntas
                WHERE seccionId = ?
                ORDER BY orden
            `, [s.seccionId]);
            return { ...s, preguntas };
        })
    );
    return seccionesConPreguntas;
}

async function getSeccionesSimple() {
    return await query(`
        SELECT seccionId, nombre, orden
        FROM evaluacion_secciones
        ORDER BY orden
    `);
}

async function createEvaluacionCompleta(evalData) {
    const {
        usuarioId,
        plantillaId = null,
        fecha_evaluacion,
        periodo_evaluacionesId,
        promedio_final,
        recontratacion,
        comentario_empleado             = null,
        comentario_jefe_inmediato       = null,
        comentario_siguiente_evaluacion = null,
        comentario_final                = null,
        respuestas = [],
    } = evalData;

    // Validar empleado
    const empleado = await query(
        'SELECT usuarioId FROM usuarios WHERE usuarioId = ?',
        [usuarioId]
    );
    if (empleado.length === 0) {
        return { success: false, message: 'El empleado no existe' };
    }

    // Validar periodo
    const periodo = await query(
        'SELECT periodo_evaluacionesId FROM periodoevaluaciones WHERE periodo_evaluacionesId = ?',
        [periodo_evaluacionesId]
    );
    if (periodo.length === 0) {
        return { success: false, message: 'El periodo de evaluación no existe' };
    }

    if (!respuestas || respuestas.length === 0) {
        return { success: false, message: 'Debes incluir las respuestas de la evaluación' };
    }

    return new Promise((resolve) => {
        connection.beginTransaction(async (errTx) => {
            if (errTx) {
                resolve({ success: false, message: 'Error al iniciar transacción' });
                return;
            }

            try {
                // 1. Insertar evaluación — sin evaluador_id
                const resultEval = await query(`
                    INSERT INTO evaluaciones (
                        usuarioId, plantillaId, periodo_evaluacionesId,
                        fecha_evaluacion, promedio_final, recontratacion,
                        comentario_empleado, comentario_jefe_inmediato,
                        comentario_siguiente_evaluacion, comentario_final
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    usuarioId, plantillaId, periodo_evaluacionesId,
                    fecha_evaluacion, promedio_final, recontratacion,
                    comentario_empleado, comentario_jefe_inmediato,
                    comentario_siguiente_evaluacion, comentario_final,
                ]);

                const evaluacionesId = resultEval.insertId;

                // 2. Insertar respuestas
                for (const r of respuestas) {
                    await query(`
                        INSERT INTO evaluacion_respuestas
                            (evaluacionId, preguntaId, puntuacion)
                        VALUES (?, ?, ?)
                    `, [evaluacionesId, r.preguntaId, r.puntuacion]);
                }

                // 3. Commit
                connection.commit((errCommit) => {
                    if (errCommit) {
                        connection.rollback(() => {
                            resolve({ success: false, message: 'Error al confirmar la evaluación' });
                        });
                        return;
                    }
                    resolve({
                        success: true,
                        message: 'Evaluación creada correctamente',
                        evaluacionesId,
                    });
                });

            } catch (error) {
                connection.rollback(() => {
                    console.error('Error en createEvaluacionCompleta:', error);
                    resolve({ success: false, message: error.message || 'Error al crear la evaluación' });
                });
            }
        });
    });
}

async function getEvaluacionesByEmpleado(usuarioId) {
    return await query(`
        SELECT
            e.evaluacionesId,
            e.fecha_evaluacion,
            e.promedio_final,
            e.recontratacion,
            e.comentario_final,
            pe.periodo AS periodo_evaluacion
        FROM evaluaciones e
        LEFT JOIN periodoevaluaciones pe ON e.periodo_evaluacionesId = pe.periodo_evaluacionesId
        WHERE e.usuarioId = ?
        ORDER BY e.fecha_evaluacion DESC, e.evaluacionesId DESC
    `, [usuarioId]);
}

async function getEvaluacionById(evaluacionesId) {
    const rows = await query(`
        SELECT
            e.*,
            pe.periodo      AS periodo_evaluacion,
            u.nombre        AS empleado_nombre,
            u.apPaterno     AS empleado_apPaterno,
            u.apMaterno     AS empleado_apMaterno,
            u.usuario       AS empleado_usuario,
            u.departamento,
            u.jefe_inmediato,
            u.fechaContratacion,
            p.nombre_puesto
        FROM evaluaciones e
        LEFT JOIN periodoevaluaciones pe ON e.periodo_evaluacionesId = pe.periodo_evaluacionesId
        LEFT JOIN usuarios u             ON e.usuarioId              = u.usuarioId
        LEFT JOIN puesto p               ON u.puestoId               = p.puestoId
        WHERE e.evaluacionesId = ?
    `, [evaluacionesId]);

    if (rows.length === 0) return null;

    const evaluacion = rows[0];

    const respuestas = await query(`
        SELECT
            er.respuestaId,
            er.puntuacion,
            ep.preguntaId,
            ep.pregunta,
            ep.orden AS pregunta_orden,
            es.seccionId,
            es.nombre AS seccion_nombre,
            es.orden  AS seccion_orden
        FROM evaluacion_respuestas er
        LEFT JOIN evaluacion_preguntas ep ON er.preguntaId  = ep.preguntaId
        LEFT JOIN evaluacion_secciones es ON ep.seccionId   = es.seccionId
        WHERE er.evaluacionId = ?
        ORDER BY es.orden, ep.orden
    `, [evaluacionesId]);

    const seccionesMap = {};
    for (const r of respuestas) {
        if (!seccionesMap[r.seccionId]) {
            seccionesMap[r.seccionId] = {
                seccionId: r.seccionId,
                nombre:    r.seccion_nombre,
                orden:     r.seccion_orden,
                preguntas: [],
                promedio:  0,
            };
        }
        seccionesMap[r.seccionId].preguntas.push({
            preguntaId: r.preguntaId,
            pregunta:   r.pregunta,
            orden:      r.pregunta_orden,
            puntuacion: r.puntuacion,
        });
    }

    const secciones = Object.values(seccionesMap).map((s) => {
        const total = s.preguntas.reduce((acc, p) => acc + p.puntuacion, 0);
        s.promedio = s.preguntas.length > 0
            ? Math.round((total / s.preguntas.length) * 100) / 100
            : 0;
        return s;
    });

    return { ...evaluacion, secciones };
}

async function getAllEvaluaciones() {
    return await query(`
        SELECT
            e.evaluacionesId,
            e.fecha_evaluacion,
            e.promedio_final,
            e.recontratacion,
            pe.periodo     AS periodo_evaluacion,
            u.nombre       AS empleado_nombre,
            u.apPaterno    AS empleado_apPaterno,
            u.apMaterno    AS empleado_apMaterno,
            u.usuario      AS empleado_usuario,
            p.nombre_puesto
        FROM evaluaciones e
        LEFT JOIN periodoevaluaciones pe ON e.periodo_evaluacionesId = pe.periodo_evaluacionesId
        LEFT JOIN usuarios u             ON e.usuarioId              = u.usuarioId
        LEFT JOIN puesto p               ON u.puestoId               = p.puestoId
        ORDER BY e.fecha_evaluacion DESC, e.evaluacionesId DESC
    `);
}

module.exports = {
    getSecciones,
    getSeccionesSimple,
    createEvaluacionCompleta,
    getEvaluacionesByEmpleado,
    getEvaluacionById,
    getAllEvaluaciones,
};