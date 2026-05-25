const connection = require('../config/connection');

const query = (sql, values = []) =>
    new Promise((resolve, reject) => {
        connection.query(sql, values, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });

const TIPOS_VALIDOS = [
    'general',
    'evaluacion',
    'permiso',
    'vacaciones',
    'queja_sugerencia',
    'vacante',
    'documento',
    'otro',
];

const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta'];
const ESTADOS_VALIDOS = ['pendiente', 'leido', 'atendido', 'archivado'];

function limpiarTexto(valor) {
    return String(valor || '').trim();
}

async function crearMensajeInterno(data = {}, remitenteId) {
    const destinatarioId = Number(data.destinatarioId || 0);
    const tipo = limpiarTexto(data.tipo || 'general');
    const titulo = limpiarTexto(data.titulo);
    const mensaje = limpiarTexto(data.mensaje);
    const url = limpiarTexto(data.url);
    const prioridad = limpiarTexto(data.prioridad || 'media');
    const fechaRecordatorio = data.fecha_recordatorio || data.fechaRecordatorio || null;
    const fechaLimite = data.fecha_limite || data.fechaLimite || null;

    if (!remitenteId) {
        return {
            success: false,
            message: 'No se pudo identificar al remitente',
        };
    }

    if (!destinatarioId) {
        return {
            success: false,
            message: 'Selecciona un destinatario',
        };
    }

    if (Number(remitenteId) === Number(destinatarioId)) {
        return {
            success: false,
            message: 'No puedes enviarte un mensaje a ti mismo',
        };
    }

    if (!TIPOS_VALIDOS.includes(tipo)) {
        return {
            success: false,
            message: 'Tipo de mensaje inválido',
        };
    }

    if (!PRIORIDADES_VALIDAS.includes(prioridad)) {
        return {
            success: false,
            message: 'Prioridad inválida',
        };
    }

    if (!titulo || titulo.length < 3) {
        return {
            success: false,
            message: 'El título debe tener al menos 3 caracteres',
        };
    }

    if (!mensaje || mensaje.length < 5) {
        return {
            success: false,
            message: 'El mensaje debe tener al menos 5 caracteres',
        };
    }

    const existeDestinatario = await query(
        `
        SELECT usuarioId
        FROM usuarios
        WHERE usuarioId = ?
        LIMIT 1
        `,
        [destinatarioId]
    );

    if (existeDestinatario.length === 0) {
        return {
            success: false,
            message: 'El destinatario no existe',
        };
    }

    const result = await query(
        `
        INSERT INTO mensajes_internos (
            remitenteId,
            destinatarioId,
            tipo,
            titulo,
            mensaje,
            url,
            prioridad,
            fecha_recordatorio,
            fecha_limite
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            remitenteId,
            destinatarioId,
            tipo,
            titulo,
            mensaje,
            url || null,
            prioridad,
            fechaRecordatorio || null,
            fechaLimite || null,
        ]
    );

    return {
        success: true,
        message: 'Mensaje enviado correctamente',
        mensajeId: result.insertId,
    };
}

async function getMensajesRecibidos(usuarioId, filtros = {}) {
    const estado = limpiarTexto(filtros.estado || '');
    const tipo = limpiarTexto(filtros.tipo || '');

    const where = ['m.destinatarioId = ?'];
    const values = [usuarioId];

    if (estado && estado !== 'todos') {
        where.push('m.estado = ?');
        values.push(estado);
    }

    if (tipo && tipo !== 'todos') {
        where.push('m.tipo = ?');
        values.push(tipo);
    }

    return await query(
        `
        SELECT
            m.mensajeId,
            m.remitenteId,
            m.destinatarioId,
            m.tipo,
            m.titulo,
            m.mensaje,
            m.url,
            m.prioridad,
            m.estado,
            m.fecha_recordatorio,
            m.fecha_limite,
            m.leidoAt,
            m.atendidoAt,
            m.createdAt,
            m.updatedAt,

            r.nombre AS remitente_nombre,
            r.apPaterno AS remitente_apPaterno,
            r.apMaterno AS remitente_apMaterno,
            r.usuario AS remitente_usuario,
            rr.nombre_rol AS remitente_rol,

            d.nombre AS destinatario_nombre,
            d.apPaterno AS destinatario_apPaterno,
            d.apMaterno AS destinatario_apMaterno,
            d.usuario AS destinatario_usuario
        FROM mensajes_internos m
        LEFT JOIN usuarios r ON m.remitenteId = r.usuarioId
        LEFT JOIN roles rr ON r.rolId = rr.rolId
        LEFT JOIN usuarios d ON m.destinatarioId = d.usuarioId
        WHERE ${where.join(' AND ')}
        ORDER BY
            FIELD(m.estado, 'pendiente', 'leido', 'atendido', 'archivado'),
            FIELD(m.prioridad, 'alta', 'media', 'baja'),
            m.createdAt DESC
        `,
        values
    );
}

async function getMensajesEnviados(remitenteId, filtros = {}) {
    const estado = limpiarTexto(filtros.estado || '');
    const tipo = limpiarTexto(filtros.tipo || '');

    const where = ['m.remitenteId = ?'];
    const values = [remitenteId];

    if (estado && estado !== 'todos') {
        where.push('m.estado = ?');
        values.push(estado);
    }

    if (tipo && tipo !== 'todos') {
        where.push('m.tipo = ?');
        values.push(tipo);
    }

    return await query(
        `
        SELECT
            m.mensajeId,
            m.remitenteId,
            m.destinatarioId,
            m.tipo,
            m.titulo,
            m.mensaje,
            m.url,
            m.prioridad,
            m.estado,
            m.fecha_recordatorio,
            m.fecha_limite,
            m.leidoAt,
            m.atendidoAt,
            m.createdAt,

            d.nombre AS destinatario_nombre,
            d.apPaterno AS destinatario_apPaterno,
            d.apMaterno AS destinatario_apMaterno,
            d.usuario AS destinatario_usuario,
            dr.nombre_rol AS destinatario_rol
        FROM mensajes_internos m
        LEFT JOIN usuarios d ON m.destinatarioId = d.usuarioId
        LEFT JOIN roles dr ON d.rolId = dr.rolId
        WHERE ${where.join(' AND ')}
        ORDER BY m.createdAt DESC
        `,
        values
    );
}

async function marcarMensajeLeido(mensajeId, usuarioId) {
    const result = await query(
        `
        UPDATE mensajes_internos
        SET
            estado = CASE
                WHEN estado = 'pendiente' THEN 'leido'
                ELSE estado
            END,
            leidoAt = COALESCE(leidoAt, NOW())
        WHERE mensajeId = ?
          AND destinatarioId = ?
          AND estado IN ('pendiente', 'leido')
        `,
        [mensajeId, usuarioId]
    );

    return {
        success: result.affectedRows > 0,
        message: result.affectedRows > 0
            ? 'Mensaje marcado como leído'
            : 'No se encontró el mensaje',
    };
}

async function marcarMensajeAtendido(mensajeId, usuarioId) {
    const result = await query(
        `
        UPDATE mensajes_internos
        SET
            estado = 'atendido',
            leidoAt = COALESCE(leidoAt, NOW()),
            atendidoAt = NOW()
        WHERE mensajeId = ?
          AND destinatarioId = ?
          AND estado IN ('pendiente', 'leido')
        `,
        [mensajeId, usuarioId]
    );

    return {
        success: result.affectedRows > 0,
        message: result.affectedRows > 0
            ? 'Mensaje marcado como atendido'
            : 'No se encontró el mensaje',
    };
}

async function archivarMensaje(mensajeId, usuarioId) {
    const result = await query(
        `
        UPDATE mensajes_internos
        SET estado = 'archivado'
        WHERE mensajeId = ?
          AND destinatarioId = ?
        `,
        [mensajeId, usuarioId]
    );

    return {
        success: result.affectedRows > 0,
        message: result.affectedRows > 0
            ? 'Mensaje archivado'
            : 'No se encontró el mensaje',
    };
}

async function getCountMensajesPendientes(usuarioId) {
    const rows = await query(
        `
        SELECT COUNT(*) AS total
        FROM mensajes_internos
        WHERE destinatarioId = ?
          AND estado IN ('pendiente', 'leido')
        `,
        [usuarioId]
    );

    return rows[0]?.total || 0;
}

module.exports = {
    crearMensajeInterno,
    getMensajesRecibidos,
    getMensajesEnviados,
    marcarMensajeLeido,
    marcarMensajeAtendido,
    archivarMensaje,
    getCountMensajesPendientes,
};