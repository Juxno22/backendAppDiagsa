const connection = require("../config/connection");
const { construirFiltroAccesoUsuarios } = require('../utils/accesos');
const { getDescuentosByUsuario } = require('./descuentos');
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
// Agrega todos los campos nuevos al SELECT
async function getEmpleadoById(usuarioId) {
    const sql = `
        SELECT
            u.usuarioId, u.nombre, u.apPaterno, u.apMaterno,
            u.usuario, u.fechaContratacion, u.departamento, u.jefe_inmediato,
            u.sucursalId, u.departamentoId,
            s.nombre_sucursal AS nombre_sucursal,
            d.nombre AS nombre_departamento,
            p.nombre_puesto, t.nombre_tipo,
            r.nombre_rol, u.puestoId, u.tipoId, u.rolId,
            u.foto, u.sueldo, u.sueldo_bruto, u.fondo_ahorro, u.sueldo_neto,
            u.sueldo_compensacion, u.sueldo_final,

            u.genero, u.estado_civil, u.numero_seguro_social,
            u.RFC, u.fecha_nacimiento, u.curp, u.celular,
            u.es_padre_madre, u.fecha_contrato_indeterminado_3m,

            u.talla_playera, u.talla_pantalon, u.talla_calzado,
            u.talla_faja, u.talla_guantes,

            u.numero_cuenta, u.clabe_interbancaria, u.codigo_postal,
            u.infonavit, u.fonacot, u.pdf_rfc, u.pdf_psicometrico, u.razon_social,
            u.nombre_banco, u.codigo_postal_fiscal,

            u.emergencia_nombre, u.emergencia_telefono, u.emergencia_parentesco,

            u.domicilio_calle, u.domicilio_colonia, u.domicilio_localidad,
            u.domicilio_cp, u.domicilio_num_ext, u.domicilio_num_int,
            u.domicilio_municipio, u.domicilio_estado,
            u.domicilio_lat, u.domicilio_lng,

            COALESCE((
                SELECT SUM(DATEDIFF(v.fecha_fin_vacaciones, v.fecha_inicio_vacaciones) + 1)
                FROM vacaciones v
                WHERE v.usuarioId = u.usuarioId
                  AND v.estado_final = 'Aceptadas'
                  AND v.fecha_inicio_vacaciones >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            ), 0) AS dias_usados
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN tipos t ON u.tipoId = t.tipoId
        LEFT JOIN roles r ON u.rolId = r.rolId
        WHERE u.usuarioId = ?
        LIMIT 1
    `;
    const rows = await query(sql, [usuarioId]);
    if (rows.length === 0) return null;
    const emp = rows[0];
    const dias = calcularDiasVacacionesLFT(emp.fechaContratacion);
    const diasRestantes = Math.max(0, dias - Number(emp.dias_usados || 0));
    const uniformes = await getUniformesEmpleado(usuarioId);
    const [vehiculos, hijos, descuentos] = await Promise.all([
        query(`
            SELECT *
            FROM vehiculos
            WHERE usuarioId = ?
              AND tiene_vehiculo = 1
            ORDER BY vehiculoId
        `, [emp.usuarioId]),
        query(`
            SELECT *
            FROM hijos
            WHERE usuarioId = ?
            ORDER BY hijoId
        `, [emp.usuarioId]),
        getDescuentosByUsuario(emp.usuarioId, false)
    ]);
    return {
        ...emp,
        dias_vacaciones_lft: dias,
        dias_restantes: diasRestantes,
        vehiculos: vehiculos || [],
        vehiculo: vehiculos?.[0] || null,
        hijos: hijos || [],
        descuentos: descuentos || [],
        uniformes,
    };
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
function fechaLocalYYYYMMDD(fecha = new Date()) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function sumarDiasYYYYMMDD(dias) {
    const fecha = new Date();
    fecha.setHours(0, 0, 0, 0);
    fecha.setDate(fecha.getDate() + dias);
    return fechaLocalYYYYMMDD(fecha);
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
    if (new Date(fechaInicio) > new Date(fechaFin)) {
        return {
            success: false,
            message: 'La fecha de inicio debe ser anterior a la fecha de fin',
        };
    }

    const fechaMinimaVacaciones = sumarDiasYYYYMMDD(14);

    if (String(fechaInicio).split('T')[0] < fechaMinimaVacaciones) {
        return {
            success: false,
            message: 'Las vacaciones deben solicitarse con mínimo 2 semanas de anticipación',
        };
    }

    const diasExist = await query(
        'SELECT * FROM diasvacaciones WHERE dias_vacacionesId = ?',
        [dias_vacacionesId]
    );

    if (diasExist.length === 0) {
        return {
            success: false,
            message: 'El periodo de vacaciones no existe',
        };
    }

    const empRows = await query(
        `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.sucursalId,
            u.departamentoId,
            COALESCE(d.nombre, u.departamento) AS departamento,
            s.nombre_sucursal
        FROM usuarios u
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        WHERE u.usuarioId = ?
        LIMIT 1
        `,
        [usuarioId]
    );

    if (empRows.length === 0) {
        return {
            success: false,
            message: 'El empleado no existe',
        };
    }

    const emp = empRows[0];

    const dias = Math.floor(
        (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const result = await query(
        `
        INSERT INTO vacaciones (
            usuarioId,
            fecha_inicio_vacaciones,
            fecha_fin_vacaciones,
            dias_solicitados,
            estado_final,
            respuesta_jefe_inmediato,
            respuesta_RH,
            dias_vacacionesId,
            nombre,
            apPaterno,
            apMaterno,
            usuario
        )
        VALUES (?, ?, ?, ?, 'Pendiente', NULL, NULL, ?, ?, ?, ?, ?)
        `,
        [
            usuarioId,
            fechaInicio,
            fechaFin,
            dias,
            dias_vacacionesId,
            emp.nombre,
            emp.apPaterno,
            emp.apMaterno,
            emp.usuario,
        ]
    );

    const vacacionesId = result.insertId;

    const checkNueva = await query(
        `
        SELECT
            vacacionesId,
            estado_final,
            respuesta_jefe_inmediato,
            respuesta_RH
        FROM vacaciones
        WHERE vacacionesId = ?
        LIMIT 1
        `,
        [vacacionesId]
    );

    console.log('[solicitarVacaciones] solicitud creada:', checkNueva[0]);

    const nombreEmpleado = `${emp.nombre || ''} ${emp.apPaterno || ''} ${emp.apMaterno || ''}`.trim();
    const fechaInicioFmt = String(fechaInicio).split('T')[0];
    const fechaFinFmt = String(fechaFin).split('T')[0];

    try {
        await query(
            `
            INSERT INTO notificaciones_rh (
                usuarioId,
                tipo,
                titulo,
                mensaje,
                url,
                prioridad,
                origen_tabla,
                origen_id,
                fecha_evento,
                fecha_notificar,
                leida
            )
            VALUES (
                NULL,
                'solicitud_vacaciones',
                'Nueva solicitud de vacaciones',
                ?,
                '/rh/vacaciones',
                'alta',
                'vacaciones',
                ?,
                CURDATE(),
                CURDATE(),
                0
            )
            `,
            [
                `${nombreEmpleado} solicitó vacaciones del ${fechaInicioFmt} al ${fechaFinFmt}.`,
                vacacionesId,
            ]
        );
    } catch (error) {
        console.error('[solicitarVacaciones] Error creando notificación RH:', error);
    }

    try {
        const supervisores = await query(
            `
            SELECT DISTINCT
                sup.usuarioId
            FROM usuarios emp
            INNER JOIN usuario_accesos ua
                ON ua.sucursalId = emp.sucursalId
               AND ua.activo = 1
               AND (
                    ua.departamentoId IS NULL
                    OR ua.departamentoId = emp.departamentoId
               )
            INNER JOIN usuarios sup
                ON sup.usuarioId = ua.usuarioId
            WHERE emp.usuarioId = ?
              AND sup.rolId = 2
              AND sup.usuarioId <> emp.usuarioId
            `,
            [usuarioId]
        );

        for (const supervisor of supervisores) {
            await query(
                `
                INSERT INTO mensajes_internos (
                    remitenteId,
                    destinatarioId,
                    tipo,
                    titulo,
                    mensaje,
                    url,
                    prioridad,
                    estado,
                    fecha_recordatorio,
                    fecha_limite
                )
                VALUES (?, ?, 'vacaciones', ?, ?, ?, 'alta', 'pendiente', CURDATE(), ?)
                `,
                [
                    usuarioId,
                    supervisor.usuarioId,
                    'Solicitud de vacaciones pendiente',
                    `${nombreEmpleado} solicitó vacaciones del ${fechaInicioFmt} al ${fechaFinFmt}. Favor de revisar la solicitud.`,
                    '/supervisor/vacaciones',
                    fechaInicioFmt,
                ]
            );
        }

        console.log('[solicitarVacaciones] supervisores notificados:', supervisores.length);
    } catch (error) {
        console.error('[solicitarVacaciones] Error creando mensaje a supervisor:', error);
    }

    return {
        success: true,
        message: 'Solicitud de vacaciones creada exitosamente',
        vacacionesId,
    };
}

async function getAllEmpleadosPorAcceso(req) {
    const filtro = await construirFiltroAccesoUsuarios(req);

    const sql = `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal AS nombre_sucursal,
            u.jefe_inmediato,
            p.nombre_puesto,
            t.nombre_tipo,
            r.nombre_rol,
            u.puestoId,
            u.tipoId,
            u.rolId,
            u.foto,
            u.sueldo,
            u.fechaContratacion,
            u.sueldo_neto,
            u.sueldo_compensacion,
            u.sueldo_final
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN tipos t ON u.tipoId = t.tipoId
        LEFT JOIN roles r ON u.rolId = r.rolId
        ${filtro.where}
        ORDER BY s.nombre_sucursal, u.departamento, u.apPaterno, u.nombre
    `;

    return await query(sql, filtro.params);
}
// Filtra por departamento si es Gerente o Auxiliar
async function getAllEmpleados(rolId, departamento) {
    let sql = `
        SELECT
            u.usuarioId, u.nombre, u.apPaterno, u.apMaterno,
            u.usuario, u.departamento, u.jefe_inmediato,
            p.nombre_puesto, t.nombre_tipo, r.nombre_rol,
            u.puestoId, u.tipoId, u.rolId, u.foto, u.sueldo,
            u.fechaContratacion, u.sueldo_neto
        FROM usuarios u
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN tipos  t ON u.tipoId   = t.tipoId
        LEFT JOIN roles  r ON u.rolId    = r.rolId
    `;
    const params = [];

    // Gerente y Auxiliar solo ven su departamento
    if ([5, 6].includes(rolId) && departamento) {
        sql += ' WHERE u.departamento = ?';
        params.push(departamento);
    }

    sql += ' ORDER BY u.apPaterno, u.nombre';
    return await query(sql, params);
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
    //valiiidacion de campos numericos
    const camposNumericos = ["sueldo_bruto", "fondo_ahorro", "sueldo_neto", "sueldo_compensacion", "sueldo_final",];
    for (const campo of camposNumericos) {
        if (datosNuevos[campo] !== undefined && datosNuevos[campo] !== null && datosNuevos[campo] !== '') {
            const numero = Number(datosNuevos[campo]);
            if (isNaN(numero)) {
                return {
                    success: false,
                    message: `${campo} inválido`
                };
            }
            datosNuevos[campo] = numero;
        }
    }
    //RFC y CURP con mayusculas
    if (datosNuevos?.RFC) {
        datosNuevos.RFC = datosNuevos.RFC.toUpperCase().trim();
    }
    if (datosNuevos?.curp) {
        datosNuevos.curp = datosNuevos.curp.toUpperCase().trim();
    }
    //Valiidacion de clabe interbancaria
    if (datosNuevos.clabe_interbancaria) {
        const clabe = datosNuevos.clabe_interbancaria.replace(/\s/g, '');
        if (!/^\d{18}$/.test(clabe)) {
            return {
                success: false,
                message: 'CLABE inválida'
            };
        }
        datosNuevos.clabe_interbancaria = clabe;
    }
    //Validacion NSS
    if (datosNuevos.numero_seguro_social) {
        const nss = datosNuevos.numero_seguro_social.replace(/\s/g, '');
        if (!/^\d{11}$/.test(nss)) {
            return {
                success: false,
                message: 'NSS inválido'
            };
        }
        datosNuevos.numero_seguro_social = nss;
    }
    //Validacion de numero de telefono
    if (datosNuevos.celular) {
        const celular = datosNuevos.celular.replace(/\D/g, '');
        if (celular.length !== 10) {
            return {
                success: false,
                message: 'Celular inválido'
            };
        }
        datosNuevos.celular = celular;
    }
    // Calcular sueldo final cuando venga sueldo neto o compensación.
    // sueldo_final = sueldo_neto + sueldo_compensacion
    if (
        datosNuevos.sueldo_neto !== undefined ||
        datosNuevos.sueldo_compensacion !== undefined ||
        datosNuevos.sueldo_final !== undefined
    ) {
        const sueldoNeto = Number(datosNuevos.sueldo_neto || 0);
        const sueldoCompensacion = Number(datosNuevos.sueldo_compensacion || 0);

        datosNuevos.sueldo_compensacion = sueldoCompensacion;
        datosNuevos.sueldo_final = Math.round((sueldoNeto + sueldoCompensacion) * 100) / 100;
    }
    const camposPermitidos = [
        "nombre", "apPaterno", "apMaterno",
        "puestoId", "tipoId", "sueldoId", "sueldo", "rolId",
        "sucursalId", "departamentoId",
        "fechaContratacion", "departamento", "jefe_inmediato",
        "genero", "estado_civil", "numero_seguro_social",
        "RFC", "fecha_nacimiento", "curp", "celular",
        "es_padre_madre", "fecha_contrato_indeterminado_3m",
        "talla_playera", "talla_pantalon", "talla_calzado",
        "talla_faja", "talla_guantes",
        "sueldo_bruto", "fondo_ahorro", "sueldo_neto",
        "sueldo_compensacion", "sueldo_final",
        "numero_cuenta", "clabe_interbancaria", "codigo_postal",
        "infonavit", "fonacot",
        "emergencia_nombre", "emergencia_telefono", "emergencia_parentesco",
        "domicilio_calle", "domicilio_colonia", "domicilio_localidad",
        "domicilio_cp", "domicilio_num_ext", "domicilio_num_int",
        "domicilio_municipio", "domicilio_estado",
        "domicilio_lat", "domicilio_lng", "razon_social",
        "nombre_banco", "codigo_postal_fiscal",
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
async function getVacacionesPendientes(req = null) {
    const filtro = req
        ? await construirFiltroAccesoUsuarios(req)
        : { where: '', params: [] };

    const whereBase = filtro.where || 'WHERE 1 = 1';

    const sql = `
        SELECT
            v.vacacionesId,
            v.fecha_inicio_vacaciones,
            v.fecha_fin_vacaciones,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH,
            DATEDIFF(v.fecha_fin_vacaciones, v.fecha_inicio_vacaciones) + 1 AS dias_solicitados,
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.sucursalId,
            u.departamentoId,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto
        FROM vacaciones v
        LEFT JOIN diasVacaciones dv ON v.dias_vacacionesId = dv.dias_vacacionesId
        LEFT JOIN usuarios u        ON v.usuarioId = u.usuarioId
        LEFT JOIN sucursales s      ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d   ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p          ON u.puestoId = p.puestoId
        ${whereBase}
          AND (
                v.respuesta_jefe_inmediato IS NULL
             OR v.respuesta_RH IS NULL
          )
        ORDER BY v.fecha_inicio_vacaciones ASC
    `;

    return await query(sql, filtro.params);
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
function calcularAniosServicio(fechaContratacion, fechaReferencia = new Date()) {
    const inicio = new Date(fechaContratacion);
    const hoy = new Date(fechaReferencia);

    let anios = hoy.getFullYear() - inicio.getFullYear();

    const mesHoy = hoy.getMonth();
    const diaHoy = hoy.getDate();
    const mesInicio = inicio.getMonth();
    const diaInicio = inicio.getDate();

    const aunNoCumpleAniversario =
        mesHoy < mesInicio ||
        (mesHoy === mesInicio && diaHoy < diaInicio);

    if (aunNoCumpleAniversario) {
        anios -= 1;
    }

    return Math.max(0, anios);
}

function calcularDiasVacacionesLFT(fechaContratacion) {
    const anios = calcularAniosServicio(fechaContratacion);

    if (anios < 1) return 0;
    if (anios === 1) return 12;
    if (anios === 2) return 14;
    if (anios === 3) return 16;
    if (anios === 4) return 18;
    if (anios === 5) return 20;
    if (anios >= 6 && anios <= 10) return 22;
    if (anios >= 11 && anios <= 15) return 24;
    if (anios >= 16 && anios <= 20) return 26;
    if (anios >= 21 && anios <= 25) return 28;
    if (anios >= 26 && anios <= 30) return 30;

    return 30;
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
    const años = calcularAniosServicio(fechaContratacion, hoy);
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
// ── deleteEmpleado — registra la baja ─────────────────────────
async function deleteEmpleado(usuarioId, rolSolicitante, datosBaja = {}) {
    if (![1, 7].includes(Number(rolSolicitante))) {
        return { success: false, message: 'Solo RH puede eliminar empleados' };
    }
    const rows = await query(`
        SELECT u.*, p.nombre_puesto
        FROM usuarios u
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE u.usuarioId = ?
    `, [usuarioId]);
    if (rows.length === 0) return { success: false, message: 'Empleado no encontrado' };
    const emp = rows[0];
    // Calcular tiempo laboral
    let tiempoLaboral = '';
    if (emp.fechaContratacion) {
        const cont = new Date(emp.fechaContratacion);
        const hoy = new Date();
        const años = hoy.getFullYear() - cont.getFullYear();
        const meses = hoy.getMonth() - cont.getMonth();
        tiempoLaboral = `${años} año${años !== 1 ? 's' : ''} ${Math.abs(meses)} mes${Math.abs(meses) !== 1 ? 'es' : ''}`;
    }
    // Registrar en historial de bajas
    await query(`
        INSERT INTO bajas (
            usuarioId, nombre, apPaterno, apMaterno, usuario,
            departamento, puesto, fecha_contratacion, sueldo,
            fecha_baja, motivo_baja, motivo_detalle,
            tiempo_laboral, finiquito, observaciones, registrado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?)
    `, [
        emp.usuarioId, emp.nombre, emp.apPaterno, emp.apMaterno, emp.usuario,
        emp.departamento, emp.nombre_puesto, emp.fechaContratacion, emp.sueldo,
        datosBaja.motivo_baja || 'otro',
        datosBaja.motivo_detalle || null,
        tiempoLaboral,
        datosBaja.finiquito || null,
        datosBaja.observaciones || null,
        datosBaja.registrado_por || null,
    ]);
    await query('DELETE FROM usuarios WHERE usuarioId = ?', [usuarioId]);
    return { success: true, message: 'Empleado eliminado y baja registrada' };
};
/**
 * Obtiene TODAS las solicitudes de vacaciones con historial completo.
 * Incluyendo las ya respondidas.
 * @returns {Array}
 */
async function getTodasVacaciones(req = null) {
    const filtro = req
        ? await construirFiltroAccesoUsuarios(req)
        : { where: '', params: [] };

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
            u.usuarioId,
            u.sucursalId,
            u.departamentoId,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto
        FROM vacaciones v
        LEFT JOIN usuarios u      ON v.usuarioId = u.usuarioId
        LEFT JOIN sucursales s    ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p        ON u.puestoId = p.puestoId
        ${filtro.where}
        ORDER BY v.vacacionesId DESC
    `, filtro.params);
}
async function usuarioPuedeVerVacacion(req, vacacionesId) {
    const filtro = await construirFiltroAccesoUsuarios(req);

    const whereBase = filtro.where || 'WHERE 1 = 1';

    const rows = await query(
        `
        SELECT v.vacacionesId
        FROM vacaciones v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        ${whereBase}
          AND v.vacacionesId = ?
        LIMIT 1
        `,
        [...filtro.params, vacacionesId]
    );

    return rows.length > 0;
}
async function upsertVehiculo(usuarioId, datos) {
    const existe = await query(
        'SELECT vehiculoId FROM vehiculos WHERE usuarioId = ?', [usuarioId]
    );
    const {
        tiene_vehiculo, tipo, marca, modelo,
        anio, color, placas, num_serie,
    } = datos;

    if (existe.length > 0) {
        await query(`
            UPDATE vehiculos SET
                tiene_vehiculo = ?, tipo = ?, marca = ?, modelo = ?,
                anio = ?, color = ?, placas = ?, num_serie = ?
            WHERE usuarioId = ?
        `, [tiene_vehiculo, tipo || null, marca || null, modelo || null,
            anio || null, color || null, placas || null, num_serie || null,
            usuarioId]);
    } else {
        await query(`
            INSERT INTO vehiculos
                (usuarioId, tiene_vehiculo, tipo, marca, modelo, anio, color, placas, num_serie)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [usuarioId, tiene_vehiculo, tipo || null, marca || null, modelo || null,
            anio || null, color || null, placas || null, num_serie || null]);
    }
    return { success: true };
}
async function getHijosByEmpleado(usuarioId) {
    return await query(
        'SELECT * FROM hijos WHERE usuarioId = ? ORDER BY hijoId', [usuarioId]
    );
}

async function addHijo(usuarioId, nombre, fecha_nacimiento, genero = null) {
    const normalizarGeneroHijo = (valor) => {
        const v = String(valor || '').trim().toLowerCase();
        if (v === 'masculino') return 'Masculino';
        if (v === 'femenino') return 'Femenino';
        return null;
    };

    const generoNormalizado = normalizarGeneroHijo(genero);

    if (genero && !generoNormalizado) {
        throw new Error('Género inválido. Usa Masculino o Femenino');
    }

    const result = await query(
        `
        INSERT INTO hijos (
            usuarioId,
            nombre,
            fecha_nacimiento,
            genero
        ) VALUES (?, ?, ?, ?)
        `,
        [
            usuarioId,
            nombre,
            fecha_nacimiento || null,
            generoNormalizado,
        ]
    );

    return {
        success: true,
        hijoId: result.insertId,
    };
}

async function deleteHijo(hijoId) {
    await query('DELETE FROM hijos WHERE hijoId = ?', [hijoId]);
    return { success: true };
}

//Operaciones para guardar uniformes en posecion del empleado
async function getUniformesEmpleado(usuarioId) {
    return await query(
        `SELECT uniformeId, usuarioId, tipo, descripcion, talla, cantidad,
            fecha_entrega, observaciones, activo, createdAt, updatedAt
         FROM usuario_uniformes
         WHERE usuarioId = ?
            AND activo = 1
         ORDER BY
            fecha_entrega DESC,
            uniformeId DESC
        `, [usuarioId]
    );
};

async function addUniformeEmpleado(usuarioId, data = {}) {
    const tipo = String(data.tipo || '').trim().toUpperCase();
    const descripcion = String(data.descripcion || '').trim().toUpperCase();
    const talla = String(data.talla || '').trim().toUpperCase();
    const cantidad = Number(data.cantidad || 0);
    const fecha_entrega = data.fecha_entrega || null;
    const observaciones = String(data.observaciones || '').trim().toUpperCase();

    if (!tipo) {
        return {
            success: false,
            message: 'El tipo de uniforme es obligatorio',
        }
    }

    if (!cantidad || cantidad <= 0) {
        return {
            success: false,
            message: 'La cantidad debe de ser mayor a 0',
        }
    }

    const result = await query(
        `INSERT INTO usuario_uniformes (
            usuarioId, tipo, descripcion, talla,
            cantidad, fecha_entrega, observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
        usuarioId,
        tipo,
        descripcion || null,
        talla || null,
        cantidad,
        fecha_entrega || null,
        observaciones || null,
    ]
    );

    return {
        success: true,
        message: 'Uniforme agregado correctamente',
        uniformeId: result.insertId,
    };
};

async function updateUniformeEmpleado(uniformeId, usuarioId, data = {}) {
    const tipo = String(data.tipo || '').trim().toUpperCase();
    const descripcion = String(data.descripcion || '').trim().toUpperCase();
    const talla = String(data.talla || '').trim().toUpperCase();
    const cantidad = Number(data.cantidad || 0);
    const fecha_entrega = data.fecha_entrega || null;
    const observaciones = String(data.observaciones || '').trim().toUpperCase();

    if (!tipo) {
        return {
            success: false,
            message: 'El tipo de uniforme es obligatorio',
        }
    }

    if (!cantidad || cantidad <= 0) {
        return {
            success: false,
            message: 'La cantidad debe ser mayor a 0',
        }
    }

    const result = await query(
        `UPDATE usuario_uniformes SET
            tipo = ?,
            descripcion = ?,
            talla = ?,
            cantidad = ?,
            fecha_entrega = ?,
            observaciones = ?
         WHERE uniformeId = ?
            AND usuarioId = ?
        `, [
        tipo,
        descripcion || null,
        talla || null,
        cantidad,
        fecha_entrega || null,
        observaciones || null,
        uniformeId,
        usuarioId,
    ]
    )

    return {
        success: true,
        message: result.affectedRows > 0 ? 'Uniforme actualizado correctamente' : 'No se encontro el unifome',
    };
};

async function deleteUniformeEmpleado(uniformeId, usuarioId) {
    const result = await query(
        `UPDATE usuario_uniformes SET activo = 0,
         WHERE uniformeId = ? AND usuarioId = ?
        `, [uniformeId, usuarioId]
    )

    return {
        success: true,
        message: result.affectedRows > 0 ? 'Uniforme elimindado correctmente' : 'No se encontro el uniforme'
    };
};

async function replaceUniformesEmpleado(usuarioId, uniformes = []) {
    await query(
        `UPDATE usuario_uniformes SET activo = 0 WHERE usuarioId = ?
        `, [usuarioId]
    );

    for (const item of uniformes) {
        const tipo = String(item.tipo || '').trim();
        const cantidad = Number(item.cantidad || 0);

        if (!tipo || cantidad <= 0) continue;

        await addUniformeEmpleado(usuarioId, item);
    }

    return {
        success: true,
        message: 'Uniformes actualizados correctamente',
    }
};

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
    getTodasVacaciones,
    upsertVehiculo,
    getHijosByEmpleado,
    addHijo,
    deleteHijo,
    getAllEmpleadosPorAcceso,
    getUniformesEmpleado,
    addUniformeEmpleado,
    updateUniformeEmpleado,
    deleteUniformeEmpleado,
    replaceUniformesEmpleado,
    usuarioPuedeVerVacacion,
};
