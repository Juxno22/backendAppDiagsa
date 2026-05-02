const connection = require("../config/connection");
//Operaciones del empleado
const query = (sql, values = []) => {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) {
                console.error("Error en la consulta:", error);
                reject(error);
            } else {
                resolve(results);
            }
        });
    });
};
/**
 * obtener la información completa de un empleado por su ID.
 * Se hace JOIN con las tablas relacionadas.
 * @param {number} usuarioId - ID del empleado autenticado.
 * @returns {Object|null} Datos del empleado o null si no existe.
 */
async function getEmpleadoById(usuarioId) {
    const sql = `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.fechaContratacion,
            u.departamento,
            u.jefe_inmediato,
            p.nombre_puesto,
            t.nombre_tipo,
            s.cantidad_sueldo,
            r.nombre_rol,
            u.puestoId,
            u.tipoId,
            u.sueldoId,
            u.rolId,
            u.foto,
            u.sueldo,
            -- Días usados en el periodo actual
            COALESCE((
                SELECT SUM(DATEDIFF(v.fecha_fin_vacaciones, v.fecha_inicio_vacaciones) + 1)
                FROM vacaciones v
                WHERE v.usuarioId = u.usuarioId
                  AND v.estado_final = 'Aceptadas'
                  AND v.fecha_inicio_vacaciones >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            ), 0) AS dias_usados
        FROM usuarios u
        LEFT JOIN puesto   p ON u.puestoId  = p.puestoId
        LEFT JOIN tipos    t ON u.tipoId    = t.tipoId
        LEFT JOIN sueldos  s ON u.sueldoId  = s.sueldoId
        LEFT JOIN roles    r ON u.rolId     = r.rolId
        WHERE u.usuarioId = ?
    `;
    const rows = await query(sql, [usuarioId]);
    if (rows.length === 0) return null;

    const emp = rows[0];
    // Calcular días LFT y restantes
    const dias = calcularDiasVacacionesLFT(emp.fechaContratacion);
    const diasRestantes = Math.max(0, dias - emp.dias_usados);

    return { ...emp, dias_vacaciones_lft: dias, dias_restantes: diasRestantes };
}
/**
 * Obtener todas las solicitudes de vacaciones de un empleado,
 * ordenadas de la más reciente a la más antigua.
 * @param {number} usuarioId - ID del empleado.
 * @returns {Array} Lista de solicitudes de vacaciones.
 */
async function getVacacionesByEmpleado(usuarioId) {
    const sql = `
        SELECT
            v.vacacionesId,
            v.fecha_inicio_vacaciones,
            v.fecha_fin_vacaciones,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH,
            DATEDIFF(v.fecha_fin_vacaciones, v.fecha_inicio_vacaciones) + 1 AS dias_solicitados
        FROM vacaciones v
        WHERE v.usuarioId = ?
        ORDER BY v.fecha_inicio_vacaciones DESC
    `;
    return await query(sql, [usuarioId]);
}
/**
 * Crear una nueva solicitud de vacaciones para un empleado.
 * Validar que las fechas sean coherentes antes de insertar.
 * @param {number} usuarioId           - ID del empleado que solicita.
 * @param {string} fechaInicio         - Fecha de inicio (YYYY-MM-DD).
 * @param {string} fechaFin            - Fecha de fin (YYYY-MM-DD).
 * @param {number} dias_vacacionesId   - ID del catálogo de días de vacaciones.
 * @returns {Object} { success, message, vacacionesId? }
 */
async function solicitarVacaciones(usuarioId, fechaInicio, fechaFin, dias_vacacionesId) {
    if (new Date(fechaInicio) >= new Date(fechaFin)) {
        return { success: false, message: 'La fecha de inicio debe ser anterior a la fecha de fin' };
    }

    const diasExist = await query(
        'SELECT * FROM diasvacaciones WHERE dias_vacacionesId = ?',
        [dias_vacacionesId]
    );
    if (diasExist.length === 0) {
        return { success: false, message: 'El periodo de vacaciones no existe' };
    }

    // ← Obtener datos del empleado para guardarlos en la solicitud
    const empRows = await query(
        'SELECT usuarioId, nombre, apPaterno, apMaterno, usuario FROM usuarios WHERE usuarioId = ?',
        [usuarioId]
    );
    if (empRows.length === 0) {
        return { success: false, message: 'El empleado no existe' };
    }
    const emp = empRows[0];

    const dias = Math.floor(
        (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const result = await query(`
        INSERT INTO vacaciones
            (usuarioId, fecha_inicio_vacaciones, fecha_fin_vacaciones,
             estado_final, dias_vacacionesId, dias_solicitados,
             nombre, apPaterno, apMaterno, usuario)
        VALUES (?, ?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?)
    `, [
        usuarioId, fechaInicio, fechaFin,
        dias_vacacionesId, dias,
        emp.nombre, emp.apPaterno, emp.apMaterno, emp.usuario
    ]);

    return {
        success: true,
        message: 'Solicitud de vacaciones creada exitosamente',
        vacacionesId: result.insertId,
    };
}

//operaciones del supervisor
/**
 * Obtener la lista completa de todos los empleados.
 * @returns {Array} Lista de empleados con sus datos principales.
 */
async function getAllEmpleados() {
    const sql = `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.foto,
            u.fechaContratacion,
            u.departamento,
            u.jefe_inmediato,
            p.nombre_puesto,
            t.nombre_tipo,
            s.cantidad_sueldo,
            r.nombre_rol
        FROM usuarios u
        LEFT JOIN puesto   p ON u.puestoId  = p.puestoId
        LEFT JOIN tipos    t ON u.tipoId    = t.tipoId
        LEFT JOIN sueldos  s ON u.sueldoId  = s.sueldoId
        LEFT JOIN roles    r ON u.rolId     = r.rolId
        ORDER BY u.apPaterno, u.apMaterno, u.nombre
    `;
    return await query(sql);
}
/**
 * Actualizar los datos de un empleado existente.
 * Solo se actualizan los campos que el supervisor envíe (PATCH parcial).
 * Campos actualizables: nombre, apPaterno, apMaterno, puestoId,
 * tipoId, sueldoId, rolId, fechaContratacion, departamento, jefe_inmediato.
 * El campo 'usuario' (username) y 'contrasenia' NO se modifican aquí;
 * @param {number} usuarioId   - ID del empleado a actualizar.
 * @param {Object} datosNuevos - Campos a actualizar con sus nuevos valores.
 * @returns {Object} { success, message }
 */
async function updateEmpleado(usuarioId, datosNuevos) {
    const camposPermitidos = [
    "nombre", "apPaterno", "apMaterno",
    "puestoId", "tipoId", "sueldoId", "sueldo", "rolId",
    "fechaContratacion", "departamento", "jefe_inmediato",
    "genero", "estado_civil", "numero_seguro_social",
    "RFC", "fecha_nacimiento", "curp", "celular",
    "es_padre_madre", "fecha_contrato_indeterminado_3m",
];
    //filtrar solo los campos permitidos
    const camposAActualizar = Object.keys(datosNuevos).filter((k) =>
        camposPermitidos.includes(k),
    );
    if (camposAActualizar.length === 0) {
        return {
            success: false,
            message: "No se enviaron campos a actualizar",
        };
    }
    //verificar que el empleado exista antes ded actualizar
    const empleado = await query(
        "SELECT usuarioId FROM usuarios WHERE usuarioId = ?",
        [usuarioId],
    );
    if (empleado.length === 0) {
        return {
            success: false,
            message: "Empleado no existente",
        };
    }
    //contruir la clausula SET dinamicamente
    const setClause = camposAActualizar.map((c) => `${c} = ?`).join(", ");
    const valores = camposAActualizar.map((c) => datosNuevos[c]);
    valores.push(usuarioId); //para el WHERE
    await query(`UPDATE usuarios SET ${setClause} WHERE usuarioId = ?`, valores);
    return {
        success: true,
        message: "Empleado actualizado exitosamente",
    };
}
/**
 * Crear una nueva evaluación para un empleado.
 * Solo el supervisor (o RH) puede registrar evaluaciones.
 * @param {Object} evalData - Datos de la evaluación:
 *   @param {number} evalData.usuarioId                        - ID del empleado evaluado.
 *   @param {string} evalData.fecha_evaluacion                 - Fecha (YYYY-MM-DD).
 *   @param {number} evalData.periodo_evaluacionesId           - ID del catálogo de periodos.
 *   @param {number} evalData.promedio_final                   - Calificación (ej. 0-100).
 *   @param {string} evalData.recontratacion                   - 'Si' | 'No'.
 *   @param {string} [evalData.comentario_empleado]            - Opcional.
 *   @param {string} [evalData.comentario_jefe_inmediato]      - Opcional.
 *   @param {string} [evalData.comentario_siguiente_evaluacion]- Opcional.
 *   @param {string} evalData.comentario_final                 - Requerido.
 * @returns {Object} { success, message, evaluacionesId? }
 */
async function createEvaluacion(evalData) {
    const {
        usuarioId,
        fecha_evaluacion,
        periodo_evaluacionesId,
        promedio_final,
        recontratacion,
        comentario_empleado = null,
        comentario_jefe_inmediato = null,
        comentario_siguiente_evaluacion = null,
        comentario_final,
    } = evalData;
    //validar que el empleado exista
    const empleado = await query(
        "SELECT usuarioId FROM usuarios WHERE usuarioId = ?",
        [usuarioId],
    );
    if (empleado.length === 0) {
        return {
            success: false,
            message: "El empleado no existe",
        };
    }
    //validar el periodo de evaluacion
    const periodo = await query(
        "SELECT periodo_evaluacionesId FROM periodoevaluaciones WHERE periodo_evaluacionesId = ?",
        [periodo_evaluacionesId],
    );
    if (periodo.length === 0) {
        return {
            success: false,
            message: "El periodo de evaluaciones no existe",
        };
    }
    const sql = `
        INSERT INTO evaluaciones
            (usuarioId, fecha_evaluacion, periodo_evaluacionesId, promedio_final,
             recontratacion, comentario_empleado, comentario_jefe_inmediato,
             comentario_siguiente_evaluacion, comentario_final)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await query(sql, [
        usuarioId,
        fecha_evaluacion,
        periodo_evaluacionesId,
        promedio_final,
        recontratacion,
        comentario_empleado,
        comentario_jefe_inmediato,
        comentario_siguiente_evaluacion,
        comentario_final,
    ]);
    return {
        success: true,
        message: "Evaluacion creada exitosamente",
        evaluacionesId: result.insertId,
    };
}
/**
 * Obtener todas las evaluaciones de un empleado específico.
 * @param {number} usuarioId - ID del empleado.
 * @returns {Array} Lista de evaluaciones ordenadas por fecha desc.
 */
async function getEvaluacionesByEmpleado(usuarioId) {
    const sql = `
        SELECT
            e.evaluacionesId,
            e.fecha_evaluacion,
            pe.periodo AS periodo_evaluacion,
            e.promedio_final,
            e.recontratacion,
            e.comentario_empleado,
            e.comentario_jefe_inmediato,
            e.comentario_siguiente_evaluacion,
            e.comentario_final
        FROM evaluaciones e
        LEFT JOIN periodoevaluaciones pe ON e.periodo_evaluacionesId = pe.periodo_evaluacionesId
        WHERE e.usuarioId = ?
        ORDER BY e.fecha_evaluacion DESC
    `;
    return await query(sql, [usuarioId]);
}
/**
 * Registrar la respuesta del jefe inmediato a una solicitud de vacaciones.
 * Si tanto el jefe como RH han respondido, actualiza el estado_final
 * según la lógica de negocio: ambos deben aceptar para que sean 'Aceptadas'.
 * @param {number} vacacionesId          - ID de la solicitud de vacaciones.
 * @param {string} respuesta             - 'Aceptadas' | 'Denegadas'.
 * @param {string} respondedorRol        - 'jefe' | 'rh' (quién responde).
 * @returns {Object} { success, message }
 */
async function responderVacaciones(vacacionesId, respuesta, respondedorRol) {
    //validar que la solicitud exista
    const vacacion = await query(
        "SELECT * FROM vacaciones WHERE vacacionesId = ?",
        [vacacionesId],
    );
    if (vacacion.length === 0) {
        return {
            success: false,
            message: "La solicitud de vacaciones no existe",
        };
    }
    const actual = vacacion[0];
    //actualizar la columna correcta segun corresponda
    if (respondedorRol === "jefe") {
        await query(
            "UPDATE vacaciones SET respuesta_jefe_inmediato = ? WHERE vacacionesId = ?",
            [respuesta, vacacionesId],
        );
        actual.respuesta_jefe_inmediato = respuesta;
    } else if (respondedorRol === "rh") {
        await query(
            "UPDATE vacaciones SET respuesta_RH = ? WHERE vacacionesId = ?",
            [respuesta, vacacionesId],
        );
        actual.respuesta_rh = respuesta;
    } else {
        return {
            success: false,
            message: "Rol de respondedor no valido",
        };
    }
    /*
     * Recalcular estado_final cuando ambos ya respondieron.
     * Regla: si CUALQUIERA deniega → estado_final = 'Denegadas'.
     *        Solo si ambos aceptan → estado_final = 'Aceptadas'.
     */
    const jefeResp =
        respondedorRol === "jefe" ? respuesta : actual.respuesta_jefe_inmediato;
    const rhResp = respondedorRol === "rh" ? respuesta : actual.respuesta_RH;
    if (jefeResp && rhResp) {
        const estado_final =
            jefeResp === "Aceptadas" && rhResp === "Aceptadas"
                ? "Aceptadas"
                : "Denegadas";
        await query(
            "UPDATE vacaciones SET estado_final = ? WHERE vacacionesId = ?",
            [estado_final, vacacionesId],
        );
    }
    return {
        success: true,
        message: "Respuesta registrada exitosamente",
    };
}
/**
 * Obtener todas las solicitudes de vacaciones pendientes (sin respuesta del jefe o de RH).
 * @returns {Array} Lista de solicitudes pendientes con datos del empleado.
 */
async function getVacacionesPendientes() {
    const sql = `
        SELECT
            v.vacacionesId,
            v.fecha_inicio_vacaciones,
            v.fecha_fin_vacaciones,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH,
            DATEDIFF(v.fecha_fin_vacaciones, v.fecha_inicio_vacaciones) + 1 AS dias_solicitados,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario
        FROM vacaciones v
        LEFT JOIN diasVacaciones dv ON v.dias_vacacionesId = dv.dias_vacacionesId
        LEFT JOIN usuarios u        ON v.usuarioId         = u.usuarioId
        WHERE v.respuesta_jefe_inmediato IS NULL
           OR v.respuesta_RH IS NULL
        ORDER BY v.fecha_inicio_vacaciones ASC
    `;
    return await query(sql);
}
/**
 * Obtener las notificaciones de un empleado combinando
 * sus vacaciones y evaluaciones en una sola lista ordenada por fecha.
 * @param {number} usuarioId - ID del empleado.
 * @returns {Array} Lista de notificaciones ordenadas por fecha desc.
 */
async function getNotificacionesByEmpleado(usuarioId) {
    const sqlVacaciones = `
    SELECT
        v.vacacionesId  AS id,
        'vacaciones'    AS tipo,
        v.fecha_inicio_vacaciones AS fecha,
        v.estado_final  AS estado,
        -- Usar la fecha más reciente entre inicio y cuando se respondió
        GREATEST(
            v.fecha_inicio_vacaciones,
            COALESCE(v.fecha_fin_vacaciones, v.fecha_inicio_vacaciones)
        ) AS fecha_actualizacion
    FROM vacaciones v
    WHERE v.usuarioId = ?
    `;

    const sqlEvaluaciones = `
    SELECT
        e.evaluacionesId AS id,
        'evaluacion'     AS tipo,
        e.fecha_evaluacion AS fecha,
        'Evaluado' AS estado,
        e.fecha_evaluacion AS fecha_actualizacion
    FROM evaluaciones e
    WHERE e.usuarioId = ?
    `;
    const [vacaciones, evaluaciones] = await Promise.all([
        query(sqlVacaciones, [usuarioId]),
        query(sqlEvaluaciones, [usuarioId]),
    ]);
    // Combinar y ordenar por fecha descendente
    const notificaciones = [...vacaciones, ...evaluaciones].sort(
        (a, b) => new Date(b.fecha_actualizacion) - new Date(a.fecha_actualizacion),
    );
    return notificaciones;
}
/**
 * Calcula los días de vacaciones según la Ley Federal del Trabajo
 * basado en los años de antigüedad del empleado.
 * @param {string} fechaContratacion - Fecha de contratación (YYYY-MM-DD)
 * @returns {number} Días de vacaciones correspondientes
 */
function calcularDiasVacacionesLFT(fechaContratacion) {
    const hoy = new Date();
    const inicio = new Date(fechaContratacion);
    const años = Math.floor((hoy - inicio) / (1000 * 60 * 60 * 24 * 365));

    if (años < 1) return 0; // Menos de 1 año — sin derecho aún
    if (años === 1) return 12;
    if (años === 2) return 14;
    if (años === 3) return 16;
    if (años === 4) return 18;
    if (años <= 9) return 20;
    if (años <= 14) return 22;
    if (años <= 19) return 24;
    if (años <= 24) return 26;
    return 28;
}
/**
 * Obtiene los días de vacaciones que le corresponden
 * al empleado según su antigüedad (LFT).
 * @param {number} usuarioId - ID del empleado
 * @returns {Object} { dias, años, fechaContratacion }
 */
async function getDiasVacacionesLFT(usuarioId) {
    const rows = await query(
        "SELECT fechaContratacion FROM usuarios WHERE usuarioId = ?",
        [usuarioId],
    );
    if (rows.length === 0) return null;

    const fechaContratacion = rows[0].fechaContratacion;
    const inicio = new Date(fechaContratacion);
    const hoy = new Date();
    const años = Math.floor((hoy - inicio) / (1000 * 60 * 60 * 24 * 365));
    const dias = calcularDiasVacacionesLFT(fechaContratacion);

    return { dias, años, fechaContratacion };
}
/**
 * Calcula los días de vacaciones disponibles del empleado.
 * Descuenta los días ya usados en solicitudes ACEPTADAS del año en curso.
 * Si ya usó todos sus días, bloquea hasta el siguiente año de antigüedad.
 *
 * @param {number} usuarioId - ID del empleado
 * @returns {Object} { dias, diasUsados, diasRestantes, años, fechaContratacion, bloqueadoHasta }
 */
async function getDiasVacacionesLFT(usuarioId) {
    const rows = await query(
        "SELECT fechaContratacion FROM usuarios WHERE usuarioId = ?",
        [usuarioId],
    );
    if (rows.length === 0) return null;
    const fechaContratacion = rows[0].fechaContratacion;
    const hoy = new Date();
    const inicio = new Date(fechaContratacion);
    const años = Math.floor((hoy - inicio) / (1000 * 60 * 60 * 24 * 365));
    const dias = calcularDiasVacacionesLFT(fechaContratacion);
    /*
     * Calcular días ya usados en el periodo vacacional actual.
     * El periodo vacacional va desde el último aniversario hasta el próximo.
     * Ejemplo: contratado el 15/03/2022 → periodo 15/03/2024 al 15/03/2025
     */
    const ultimoAniversario = new Date(inicio);
    ultimoAniversario.setFullYear(hoy.getFullYear());
    if (ultimoAniversario > hoy) {
        ultimoAniversario.setFullYear(hoy.getFullYear() - 1);
    }
    const proximoAniversario = new Date(ultimoAniversario);
    proximoAniversario.setFullYear(ultimoAniversario.getFullYear() + 1);
    // Sumar días de vacaciones ACEPTADAS en el periodo actual
    const vacacionesUsadas = await query(
        `
        SELECT DATEDIFF(fecha_fin_vacaciones, fecha_inicio_vacaciones) + 1 AS dias_usados
        FROM vacaciones
        WHERE usuarioId     = ?
          AND estado_final  = 'Aceptadas'
          AND fecha_inicio_vacaciones >= ?
          AND fecha_inicio_vacaciones <  ?
    `,
        [
            usuarioId,
            ultimoAniversario.toISOString().split("T")[0],
            proximoAniversario.toISOString().split("T")[0],
        ],
    );
    const diasUsados = vacacionesUsadas.reduce(
        (acc, v) => acc + (v.dias_usados || 0),
        0,
    );
    const diasRestantes = Math.max(0, dias - diasUsados);
    // Si agotó sus días, calcular cuándo se liberan (próximo aniversario)
    const bloqueadoHasta =
        diasRestantes === 0 ? proximoAniversario.toISOString().split("T")[0] : null;
    return {
        dias,
        diasUsados,
        diasRestantes,
        años,
        fechaContratacion,
        periodoDesde: ultimoAniversario.toISOString().split("T")[0],
        periodoHasta: proximoAniversario.toISOString().split("T")[0],
        bloqueadoHasta,
    };
}
/**
 * Elimina un empleado de la BD.
 * Solo se puede eliminar si no tiene evaluaciones registradas.
 * @param {number} usuarioId - ID del empleado a eliminar
 * @returns {Object} { success, message }
 */
async function deleteEmpleado(usuarioId, rolSolicitante) {
    // Verificar que el empleado exista
    const empleado = await query(
        "SELECT usuarioId, rolId FROM usuarios WHERE usuarioId = ?",
        [usuarioId],
    );
    if (empleado.length === 0) {
        return { success: false, message: "Empleado no encontrado" };
    }
    const rolEmpleado = empleado[0].rolId;
    // ── Reglas según quien elimina ────────────────────────────
    if (rolSolicitante === 2) {
        // Supervisor solo puede eliminar empleados (rolId = 1)
        if (rolEmpleado !== 1) {
            return {
                success: false,
                message: "El supervisor solo puede eliminar empleados",
            };
        }
    } else if (rolSolicitante === 3) {
        // RH no puede eliminarse a sí mismo ni a otros RH
        if (rolEmpleado === 3) {
            return { success: false, message: "No se puede eliminar un usuario RH" };
        }
    } else {
        return {
            success: false,
            message: "No tienes permisos para eliminar usuarios",
        };
    }
    // Verificar que no tenga evaluaciones
    const evaluaciones = await query(
        "SELECT evaluacionesId FROM evaluaciones WHERE usuarioId = ? LIMIT 1",
        [usuarioId],
    );
    if (evaluaciones.length > 0) {
        return {
            success: false,
            message: "No se puede eliminar un empleado con evaluaciones registradas",
        };
    }
    await query("DELETE FROM usuarios WHERE usuarioId = ?", [usuarioId]);
    return { success: true, message: "Empleado eliminado correctamente" };
};
/**
 * Obtiene TODAS las solicitudes de vacaciones con historial completo.
 * Incluyendo las ya respondidas.
 * @returns {Array}
 */
async function getTodasVacaciones() {
    return await query(`
        SELECT
            v.vacacionesId,
            v.fecha_inicio_vacaciones,
            v.fecha_fin_vacaciones,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH,
            DATEDIFF(v.fecha_fin_vacaciones, v.fecha_inicio_vacaciones) + 1 AS dias_solicitados,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.usuarioId
        FROM vacaciones v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        ORDER BY v.vacacionesId DESC
    `);
}
module.exports = {
    getEmpleadoById,
    getVacacionesByEmpleado,
    solicitarVacaciones,
    getAllEmpleados,
    updateEmpleado,
    createEvaluacion,
    deleteEmpleado,
    getEvaluacionesByEmpleado,
    responderVacaciones,
    getVacacionesPendientes,
    getNotificacionesByEmpleado,
    getDiasVacacionesLFT,
    getTodasVacaciones
};
