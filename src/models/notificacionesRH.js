// src/models/notificacionesRH.js
const connection = require('../config/connection');
const { fechaMexicoYYYYMMDD } = require('../utils/fecha');

const query = (sql, values = []) =>
    new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });

// Roles usados en tu sistema actual
const ROL_RH = 1;
const ROL_RHADMIN = 7;

// Días antes de notificar evaluaciones de 1, 2 y 3 meses
const DIAS_ANTES_EVALUACION = 5;

// Ventana operativa para no saturar RH.
// Solo se crean/muestran/cuentan evaluaciones cuya fecha real cae entre hoy y los próximos 15 días.
const VENTANA_EVALUACIONES_DIAS = 15;
const TIPOS_EVALUACION = ['evaluacion_1mes', 'evaluacion_2mes', 'evaluacion_3mes'];

const EVALUACIONES = [
    { tipo: 'evaluacion_1mes', meses: 1, label: 'Evaluación 1er mes' },
    { tipo: 'evaluacion_2mes', meses: 2, label: 'Evaluación 2do mes' },
    { tipo: 'evaluacion_3mes', meses: 3, label: 'Evaluación 3er mes' },
];

function fechaSQL(fecha) {
    if (!fecha) return null;

    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

function parseFechaLocal(fecha) {
    if (!fecha) return null;

    const soloFecha = String(fecha).split('T')[0];
    const d = new Date(`${soloFecha}T12:00:00`);

    if (Number.isNaN(d.getTime())) return null;

    return d;
}

function diffDiasYYYYMMDD(fechaA, fechaB) {
    const a = parseFechaLocal(fechaA);
    const b = parseFechaLocal(fechaB);

    if (!a || !b) return 999999;

    return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function evaluacionDebeNotificarse(fechaContratacion, mesesEvaluacion) {
    const hoy = fechaSQL(new Date());
    const fechaEvaluacion = sumarMeses(fechaContratacion, mesesEvaluacion);

    if (!fechaEvaluacion) {
        return {
            debeCrear: false,
            fechaEvaluacion: null,
            fechaNotificar: null,
            motivo: 'sin_fecha_contratacion',
        };
    }

    const diasParaEvaluacion = diffDiasYYYYMMDD(fechaEvaluacion, hoy);

    /*
     * Blindaje:
     * - Si ya pasó, no se crea.
     * - Si falta más de 15 días, no se crea todavía.
     * - Si cae entre hoy y los próximos 15 días, sí se crea.
     * Esto evita que al migrar usuarios antiguos se creen evaluaciones atrasadas.
     */
    if (diasParaEvaluacion < 0) {
        return {
            debeCrear: false,
            fechaEvaluacion,
            fechaNotificar: null,
            motivo: 'evaluacion_pasada',
        };
    }

    if (diasParaEvaluacion > VENTANA_EVALUACIONES_DIAS) {
        return {
            debeCrear: false,
            fechaEvaluacion,
            fechaNotificar: null,
            motivo: 'fuera_de_ventana',
        };
    }

    return {
        debeCrear: true,
        fechaEvaluacion,
        fechaNotificar: restarDias(fechaEvaluacion, DIAS_ANTES_EVALUACION),
        motivo: 'ok',
    };
}
function fechaEventoPorDias(dias = 0) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + dias);

    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

function sumarMeses(fechaBase, meses) {
    const fecha = new Date(fechaBase);
    fecha.setMonth(fecha.getMonth() + meses);
    return fechaSQL(fecha);
}

function restarDias(fechaBase, dias) {
    const fecha = new Date(fechaBase);
    fecha.setDate(fecha.getDate() - dias);
    return fechaSQL(fecha);
}

function prioridadValida(prioridad) {
    return ['baja', 'media', 'alta'].includes(prioridad) ? prioridad : 'media';
}

async function enviarPushRH({ titulo, mensaje, url }) {
    try {
        // Este require es opcional. Si todavía no tienes pushNotifications.js,
        // no rompe las notificaciones internas.
        const { enviarPushARol } = require('./pushNotifications');

        await Promise.allSettled([
            enviarPushARol(ROL_RH, { titulo, mensaje, url }),
            enviarPushARol(ROL_RHADMIN, { titulo, mensaje, url }),
        ]);
    } catch {
        // Silencioso: las notificaciones internas deben seguir funcionando aunque push falle.
    }
}

/**
 * Crea una notificación interna para RH/RHadmin.
 * Evita duplicados por tipo + origen_tabla + origen_id.
 */
async function crearNotificacionRH({
    usuarioId = null,
    tipo,
    titulo,
    mensaje,
    url = '/rh',
    prioridad = 'media',
    origen_tabla = null,
    origen_id = null,
    fecha_evento = null,
    fecha_notificar = null,
    fecha_evaluacion = null,
    enviarPush = false,
}) {
    if (!tipo || !titulo || !mensaje) {
        return {
            success: false,
            message: 'tipo, titulo y mensaje son requeridos',
        };
    }

    const fechaNotificarFinal = fecha_notificar || fechaSQL(new Date());
    const fechaEventoFinal = fechaSQL(fecha_evento);
    const fechaEvaluacionFinal = fechaSQL(fecha_evaluacion);

    if (origen_tabla && origen_id) {
        const existe = await query(
            `
        SELECT notificacionId
        FROM notificaciones_rh
        WHERE tipo = ?
          AND origen_tabla = ?
          AND origen_id = ?
          AND (
                (? IS NULL AND fecha_evento IS NULL)
                OR DATE(fecha_evento) = DATE(?)
              )
          AND (
                (? IS NULL AND fecha_evaluacion IS NULL)
                OR DATE(fecha_evaluacion) = DATE(?)
              )
        LIMIT 1
        `,
            [
                tipo,
                origen_tabla,
                origen_id,
                fechaEventoFinal,
                fechaEventoFinal,
                fechaEvaluacionFinal,
                fechaEvaluacionFinal,
            ]
        );

        if (existe.length > 0) {
            return {
                success: true,
                message: 'La notificación ya existía para esta fecha',
                notificacionId: existe[0].notificacionId,
                duplicated: true,
            };
        }
    }

    const result = await query(
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
            fecha_evaluacion,
            fecha_notificar,
            leida
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `,
        [
            usuarioId,
            tipo,
            titulo,
            mensaje,
            url,
            prioridadValida(prioridad),
            origen_tabla,
            origen_id,
            fechaEventoFinal,
            fechaEvaluacionFinal,
            fechaNotificarFinal,
        ]
    );

    if (enviarPush) {
        await enviarPushRH({
            titulo,
            mensaje,
            url,
        });
    }

    return {
        success: true,
        message: 'Notificación creada',
        notificacionId: result.insertId,
    };
}

/**
 * Compatibilidad con tu flujo anterior:
 * antes se llamaba generarNotificaciones(usuarioId).
 * Ahora genera evaluaciones, cumpleaños, vacaciones y permisos.
 */
async function generarNotificaciones(usuarioId = null) {
    return generarNotificacionesPendientesRH({ usuarioId });
}

async function generarNotificacionesEvaluaciones(usuarioId = null) {
    const where = usuarioId ? 'WHERE u.usuarioId = ?' : '';
    const params = usuarioId ? [usuarioId] : [];

    const empleados = await query(
        `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.fechaContratacion,
            p.nombre_puesto
        FROM usuarios u
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        ${where}
        `,
        params
    );

    let creadas = 0;
    let omitidas = 0;

    for (const emp of empleados) {
        if (!emp.fechaContratacion) {
            omitidas += 1;
            continue;
        }

        const nombreCompleto = `${emp.nombre || ''} ${emp.apPaterno || ''} ${emp.apMaterno || ''}`.trim();

        for (const evalItem of EVALUACIONES) {
            const validacion = evaluacionDebeNotificarse(
                emp.fechaContratacion,
                evalItem.meses
            );

            if (!validacion.debeCrear) {
                omitidas += 1;
                continue;
            }

            const result = await crearNotificacionRH({
                usuarioId: emp.usuarioId,
                tipo: evalItem.tipo,
                titulo: evalItem.label,
                mensaje: `${nombreCompleto} tiene próxima ${evalItem.label.toLowerCase()} programada para ${validacion.fechaEvaluacion}.`,
                url: `/rh/empleados/${emp.usuarioId}`,
                prioridad: 'media',
                origen_tabla: 'usuarios',
                origen_id: emp.usuarioId,
                fecha_evento: validacion.fechaEvaluacion,
                fecha_evaluacion: validacion.fechaEvaluacion,
                fecha_notificar: validacion.fechaNotificar,
                enviarPush: false,
            });

            if (result.success && !result.duplicated) creadas += 1;
        }
    }

    return {
        success: true,
        message: 'Notificaciones de evaluaciones generadas',
        creadas,
        omitidas,
        ventanaDias: VENTANA_EVALUACIONES_DIAS,
    };
}

async function generarNotificacionesCumpleanosManana({ enviarPush = false } = {}) {
    return generarNotificacionesCumpleanosPorDia({
        dias: 1,
        enviarPush,
    });
}
async function generarNotificacionesCumpleanosPorDia({
    dias = 1,
    enviarPush = false,
} = {}) {
    const tipo = dias === 0 ? 'cumpleanos_hoy' : 'cumpleanos_manana';
    const titulo = dias === 0 ? '🎂 Cumpleaños hoy' : '🎂 Cumpleaños mañana';
    const fechaEvento = fechaEventoPorDias(dias);

    const cumpleanos = await query(
        `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.fecha_nacimiento,
            u.departamento,
            u.sucursalId,
            u.departamentoId,
            s.nombre_sucursal AS nombre_sucursal,
            d.nombre AS nombre_departamento,
            TIMESTAMPDIFF(
                YEAR,
                u.fecha_nacimiento,
                DATE_ADD(CURDATE(), INTERVAL ? DAY)
            ) AS edad
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        WHERE DAY(u.fecha_nacimiento) = DAY(DATE_ADD(CURDATE(), INTERVAL ? DAY))
          AND MONTH(u.fecha_nacimiento) = MONTH(DATE_ADD(CURDATE(), INTERVAL ? DAY))
          AND u.fecha_nacimiento IS NOT NULL
        `,
        [dias, dias, dias]
    );

    let creadas = 0;

    for (const emp of cumpleanos) {
        const nombreCompleto = `${emp.nombre || ''} ${emp.apPaterno || ''} ${emp.apMaterno || ''}`.trim();

        const departamento =
            emp.nombre_departamento ||
            emp.departamento ||
            'SIN DEPARTAMENTO';

        const sucursal =
            emp.nombre_sucursal ||
            'SIN SUCURSAL';

        const infoExtra = `Departamento: ${departamento} · Sucursal: ${sucursal}`;

        const mensaje =
            dias === 0
                ? `Hoy cumple años ${nombreCompleto}${emp.edad ? ` (${emp.edad} años)` : ''}. ${infoExtra}.`
                : `Mañana cumple años ${nombreCompleto}${emp.edad ? ` (${emp.edad} años)` : ''}. ${infoExtra}.`;

        const result = await crearNotificacionRH({
            usuarioId: emp.usuarioId,
            tipo,
            titulo,
            mensaje,
            url: '/rh/cumpleanos',
            prioridad: dias === 0 ? 'media' : 'baja',
            origen_tabla: 'usuarios',
            origen_id: emp.usuarioId,
            fecha_evento: fechaEvento,
            fecha_notificar: fechaSQL(new Date()),
            enviarPush,
        });

        if (result.success && !result.duplicated) {
            creadas += 1;
        }
    }

    return {
        success: true,
        message: dias === 0 ? 'Cumpleaños de hoy procesados' : 'Cumpleaños de mañana procesados',
        creadas,
        total: cumpleanos.length,
    };
}

async function generarNotificacionesVacacionesPendientes({ enviarPush = false } = {}) {
    const vacaciones = await query(
        `
        SELECT
            v.vacacionesId,
            v.usuarioId,
            v.fecha_inicio_vacaciones,
            v.fecha_fin_vacaciones,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.departamento
        FROM vacaciones v
        INNER JOIN usuarios u ON v.usuarioId = u.usuarioId
        WHERE (
                v.estado_final IS NULL
                OR v.estado_final = ''
                OR v.estado_final = 'Pendiente'
              )
          AND (
                v.respuesta_RH IS NULL
                OR v.respuesta_RH = ''
                OR v.respuesta_RH = 'Pendiente'
              )
        `
    );

    let creadas = 0;

    for (const vac of vacaciones) {
        const nombreCompleto = `${vac.nombre || ''} ${vac.apPaterno || ''} ${vac.apMaterno || ''}`.trim();

        const result = await crearNotificacionRH({
            usuarioId: vac.usuarioId,
            tipo: 'solicitud_vacaciones',
            titulo: 'Nueva solicitud de vacaciones',
            mensaje: `${nombreCompleto} tiene una solicitud de vacaciones pendiente del ${fechaSQL(vac.fecha_inicio_vacaciones)} al ${fechaSQL(vac.fecha_fin_vacaciones)}.`,
            url: '/rh/vacaciones',
            prioridad: 'alta',
            origen_tabla: 'vacaciones',
            origen_id: vac.vacacionesId,
            fecha_evento: vac.fecha_inicio_vacaciones,
            fecha_notificar: fechaSQL(new Date()),
            enviarPush,
        });

        if (result.success && !result.duplicated) creadas += 1;
    }

    return {
        success: true,
        message: 'Notificaciones de vacaciones procesadas',
        creadas,
        total: vacaciones.length,
    };
}

async function generarNotificacionesPermisosPendientes({ enviarPush = false } = {}) {
    const permisos = await query(
        `
        SELECT
            p.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.departamento
        FROM permisos p
        INNER JOIN usuarios u ON p.usuarioId = u.usuarioId
        WHERE p.estado IS NULL
           OR p.estado = ''
           OR p.estado = 'pendiente'
           OR p.estado = 'Pendiente'
        `
    );

    let creadas = 0;

    for (const permiso of permisos) {
        const nombreCompleto = `${permiso.nombre || ''} ${permiso.apPaterno || ''} ${permiso.apMaterno || ''}`.trim();

        const fechaPermiso =
            permiso.fecha_permiso ||
            permiso.fecha ||
            permiso.createdAt ||
            new Date();

        const result = await crearNotificacionRH({
            usuarioId: permiso.usuarioId,
            tipo: 'solicitud_permiso',
            titulo: 'Nueva solicitud de permiso',
            mensaje: `${nombreCompleto} tiene una solicitud de permiso pendiente.`,
            url: '/rh/permisos',
            prioridad: 'alta',
            origen_tabla: 'permisos',
            origen_id: permiso.permisoId,
            fecha_evento: fechaPermiso,
            fecha_notificar: fechaSQL(new Date()),
            enviarPush,
        });

        if (result.success && !result.duplicated) creadas += 1;
    }

    return {
        success: true,
        message: 'Notificaciones de permisos procesadas',
        creadas,
        total: permisos.length,
    };
}


async function generarNotificacionesVacantesPendientes({ enviarPush = false } = {}) {
    const vacantes = await query(
        `
        SELECT
            v.vacanteId,
            v.solicitanteId,
            v.departamento,
            v.puesto,
            v.num_plazas,
            v.motivo,
            v.prioridad,
            v.fecha_requerida,
            v.estado,
            v.createdAt,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.departamento AS dep_solicitante,
            u.sucursalId,
            u.departamentoId
        FROM vacantes v
        LEFT JOIN usuarios u ON v.solicitanteId = u.usuarioId
        WHERE v.estado IS NULL
           OR v.estado = ''
           OR LOWER(v.estado) = 'pendiente'
        `
    );

    let creadas = 0;

    for (const vacante of vacantes) {
        const nombreSolicitante = `${vacante.nombre || ''} ${vacante.apPaterno || ''} ${vacante.apMaterno || ''}`.trim();
        const puesto = vacante.puesto || 'SIN PUESTO';
        const departamento = vacante.departamento || vacante.dep_solicitante || 'SIN DEPARTAMENTO';
        const plazas = Number(vacante.num_plazas || 1);

        const result = await crearNotificacionRH({
            usuarioId: vacante.solicitanteId || null,
            tipo: 'solicitud_vacante',
            titulo: 'Nueva solicitud de vacante',
            mensaje: `${nombreSolicitante || 'Un usuario'} solicitó ${plazas} vacante${plazas !== 1 ? 's' : ''} para ${puesto}. Departamento: ${departamento}.`,
            url: '/rh/vacantes',
            prioridad: vacante.prioridad === 'alta' ? 'alta' : 'media',
            origen_tabla: 'vacantes',
            origen_id: vacante.vacanteId,
            fecha_evento: vacante.fecha_requerida || vacante.createdAt || new Date(),
            fecha_notificar: fechaSQL(new Date()),
            enviarPush,
        });

        if (result.success && !result.duplicated) creadas += 1;
    }

    return {
        success: true,
        message: 'Notificaciones de vacantes procesadas',
        creadas,
        total: vacantes.length,
    };
}

/**
 * Genera todas las notificaciones pendientes que RH debe revisar.
 * Puedes llamarla:
 * - al iniciar sesión
 * - desde /rh/notificaciones
 * - desde un cron diario
 */
async function generarNotificacionesPendientesRH({ usuarioId = null, enviarPush = false } = {}) {
    const resultados = [];

    resultados.push(await generarNotificacionesEvaluaciones(usuarioId));

    resultados.push(await generarNotificacionesCumpleanosPorDia({
        dias: 0,
        enviarPush,
    }));

    resultados.push(await generarNotificacionesCumpleanosPorDia({
        dias: 1,
        enviarPush,
    }));

    resultados.push(await generarNotificacionesVacacionesPendientes({ enviarPush }));
    resultados.push(await generarNotificacionesPermisosPendientes({ enviarPush }));
    resultados.push(await generarNotificacionesVacantesPendientes({ enviarPush }));

    const totalCreadas = resultados.reduce((sum, r) => sum + Number(r.creadas || 0), 0);

    return {
        success: true,
        message: 'Notificaciones RH procesadas',
        creadas: totalCreadas,
        resultados,
    };
}
/**
 * Obtiene notificaciones internas para RH.
 * Si generar=true, primero crea pendientes nuevas.
 */
async function getNotificacionesRH(soloNoLeidas = false, opciones = {}) {
    const { generar = true, lectorUsuarioId = null, limit = 200 } = opciones;

    if (!lectorUsuarioId) {
        throw new Error('Falta lectorUsuarioId para consultar notificaciones RH');
    }

    if (generar) {
        await generarNotificacionesPendientesRH({ enviarPush: false });
    }

    const whereLeida = soloNoLeidas
        ? 'AND COALESCE(nul.leida, 0) = 0'
        : '';

    return query(
        `
        SELECT
            n.notificacionId,
            n.usuarioId,
            n.tipo,
            COALESCE(
                n.titulo,
                CASE n.tipo
                    WHEN 'evaluacion_1mes' THEN 'Evaluación 1er mes'
                    WHEN 'evaluacion_2mes' THEN 'Evaluación 2do mes'
                    WHEN 'evaluacion_3mes' THEN 'Evaluación 3er mes'
                    WHEN 'cumpleanos_hoy' THEN 'Cumpleaños hoy'
                    WHEN 'cumpleanos_manana' THEN 'Cumpleaños mañana'
                    WHEN 'solicitud_vacaciones' THEN 'Solicitud de vacaciones'
                    WHEN 'solicitud_permiso' THEN 'Solicitud de permiso'
                    WHEN 'solicitud_vacante' THEN 'Solicitud de vacante'
                    ELSE 'Notificación RH'
                END
            ) AS titulo,
            COALESCE(n.mensaje, '') AS mensaje,
            COALESCE(n.url, '/rh') AS url,
            COALESCE(n.prioridad, 'media') AS prioridad,
            n.origen_tabla,
            n.origen_id,
            n.fecha_evento,
            n.fecha_evaluacion,
            n.fecha_notificar,
            COALESCE(nul.leida, 0) AS leida,
            nul.leidaAt,
            n.createdAt,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            p.nombre_puesto
        FROM notificaciones_rh n
        LEFT JOIN notificaciones_rh_lecturas nul
          ON nul.notificacionId = n.notificacionId
         AND nul.usuarioId = ?
        LEFT JOIN usuarios u ON n.usuarioId = u.usuarioId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE n.fecha_notificar <= CURDATE()
          ${whereLeida}
          AND (
              n.tipo NOT IN ('evaluacion_1mes', 'evaluacion_2mes', 'evaluacion_3mes')
              OR (
                  n.tipo IN ('evaluacion_1mes', 'evaluacion_2mes', 'evaluacion_3mes')
                  AND n.fecha_evaluacion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
              )
          )
        ORDER BY
            COALESCE(nul.leida, 0) ASC,
            FIELD(COALESCE(n.prioridad, 'media'), 'alta', 'media', 'baja'),
            n.fecha_notificar ASC,
            n.createdAt DESC,
            n.notificacionId DESC
        LIMIT ?
        `,
        [
            lectorUsuarioId,
            VENTANA_EVALUACIONES_DIAS,
            Math.min(Number(limit) || 200, 200),
        ]
    );
}

async function marcarComoLeida(notificacionId, lectorUsuarioId) {
    if (!notificacionId) {
        return {
            success: false,
            message: 'Falta notificacionId',
        };
    }

    if (!lectorUsuarioId) {
        return {
            success: false,
            message: 'Falta usuario autenticado',
        };
    }

    await query(
        `
        INSERT INTO notificaciones_rh_lecturas (
            notificacionId,
            usuarioId,
            leida,
            leidaAt
        )
        VALUES (?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE
            leida = 1,
            leidaAt = NOW(),
            updatedAt = CURRENT_TIMESTAMP
        `,
        [notificacionId, lectorUsuarioId]
    );

    return { success: true };
}

async function marcarTodasComoLeidas(lectorUsuarioId) {
    if (!lectorUsuarioId) {
        return {
            success: false,
            message: 'Falta usuario autenticado',
        };
    }

    const result = await query(
        `
        INSERT INTO notificaciones_rh_lecturas (
            notificacionId,
            usuarioId,
            leida,
            leidaAt
        )
        SELECT
            n.notificacionId,
            ? AS usuarioId,
            1 AS leida,
            NOW() AS leidaAt
        FROM notificaciones_rh n
        LEFT JOIN notificaciones_rh_lecturas nul
          ON nul.notificacionId = n.notificacionId
         AND nul.usuarioId = ?
        WHERE n.fecha_notificar <= CURDATE()
          AND COALESCE(nul.leida, 0) = 0
          AND (
              n.tipo NOT IN ('evaluacion_1mes', 'evaluacion_2mes', 'evaluacion_3mes')
              OR (
                  n.tipo IN ('evaluacion_1mes', 'evaluacion_2mes', 'evaluacion_3mes')
                  AND n.fecha_evaluacion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
              )
          )
        ON DUPLICATE KEY UPDATE
            leida = 1,
            leidaAt = NOW(),
            updatedAt = CURRENT_TIMESTAMP
        `,
        [
            lectorUsuarioId,
            lectorUsuarioId,
            VENTANA_EVALUACIONES_DIAS,
        ]
    );

    return {
        success: true,
        message: 'Notificaciones visibles marcadas como leídas',
        affectedRows: result.affectedRows || 0,
    };
}

async function contarNoLeidas(lectorUsuarioId) {
    if (!lectorUsuarioId) {
        return 0;
    }

    const result = await query(
        `
        SELECT COUNT(*) AS total
        FROM notificaciones_rh n
        LEFT JOIN notificaciones_rh_lecturas nul
          ON nul.notificacionId = n.notificacionId
         AND nul.usuarioId = ?
        WHERE n.fecha_notificar <= CURDATE()
          AND COALESCE(nul.leida, 0) = 0
          AND (
              n.tipo NOT IN ('evaluacion_1mes', 'evaluacion_2mes', 'evaluacion_3mes')
              OR (
                  n.tipo IN ('evaluacion_1mes', 'evaluacion_2mes', 'evaluacion_3mes')
                  AND n.fecha_evaluacion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
              )
          )
        `,
        [
            lectorUsuarioId,
            VENTANA_EVALUACIONES_DIAS,
        ]
    );

    return result[0]?.total || 0;
}

module.exports = {
    crearNotificacionRH,
    generarNotificaciones,
    generarNotificacionesPendientesRH,
    generarNotificacionesEvaluaciones,
    generarNotificacionesCumpleanosManana,
    generarNotificacionesCumpleanosPorDia,
    generarNotificacionesVacacionesPendientes,
    generarNotificacionesPermisosPendientes,
    generarNotificacionesVacantesPendientes,
    getNotificacionesRH,
    marcarComoLeida,
    marcarTodasComoLeidas,
    contarNoLeidas,
};
