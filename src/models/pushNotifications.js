const webpush = require('web-push');
const connection = require('../config/connection');

const query = (sql, values = []) =>
    new Promise((resolve, reject) => {
        connection.query(sql, values, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@diagsa.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

function validarConfiguracionPush() {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        throw new Error('Faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en variables de entorno');
    }
}

async function guardarSuscripcionPush(usuarioId, subscription, userAgent = null) {
    validarConfiguracionPush();

    if (!usuarioId) {
        return { success: false, message: 'Falta usuarioId' };
    }

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return { success: false, message: 'Suscripción push inválida' };
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys.p256dh;
    const auth = subscription.keys.auth;

    const existente = await query(
        `
        SELECT subscriptionId
        FROM push_subscriptions
        WHERE usuarioId = ?
          AND endpoint = ?
        LIMIT 1
        `,
        [usuarioId, endpoint]
    );

    if (existente.length > 0) {
        await query(
            `
            UPDATE push_subscriptions
            SET p256dh = ?,
                auth = ?,
                userAgent = ?,
                activo = 1,
                updatedAt = CURRENT_TIMESTAMP
            WHERE subscriptionId = ?
            `,
            [p256dh, auth, userAgent, existente[0].subscriptionId]
        );

        return {
            success: true,
            message: 'Suscripción push actualizada',
            subscriptionId: existente[0].subscriptionId,
        };
    }

    const result = await query(
        `
        INSERT INTO push_subscriptions (
            usuarioId,
            endpoint,
            p256dh,
            auth,
            userAgent,
            activo
        )
        VALUES (?, ?, ?, ?, ?, 1)
        `,
        [usuarioId, endpoint, p256dh, auth, userAgent]
    );

    return {
        success: true,
        message: 'Suscripción push guardada',
        subscriptionId: result.insertId,
    };
}

async function registrarPushLog({
    usuarioId = null,
    titulo,
    mensaje,
    url = null,
    enviado = 0,
    error = null,
}) {
    await query(
        `
        INSERT INTO push_logs (
            usuarioId,
            titulo,
            mensaje,
            url,
            enviado,
            error
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [usuarioId, titulo, mensaje, url, enviado ? 1 : 0, error]
    );
}

async function enviarPushASuscripcion(row, payload) {
    const subscription = {
        endpoint: row.endpoint,
        keys: {
            p256dh: row.p256dh,
            auth: row.auth,
        },
    };

    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));

        await registrarPushLog({
            usuarioId: row.usuarioId,
            titulo: payload.title,
            mensaje: payload.body,
            url: payload.url || null,
            enviado: 1,
            error: null,
        });

        return { success: true, subscriptionId: row.subscriptionId };
    } catch (error) {
        const statusCode = error?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
            await query(
                `
                UPDATE push_subscriptions
                SET activo = 0
                WHERE subscriptionId = ?
                `,
                [row.subscriptionId]
            );
        }

        await registrarPushLog({
            usuarioId: row.usuarioId,
            titulo: payload.title,
            mensaje: payload.body,
            url: payload.url || null,
            enviado: 0,
            error: error.message || 'Error al enviar push',
        });

        return {
            success: false,
            subscriptionId: row.subscriptionId,
            message: error.message,
            statusCode,
        };
    }
}

async function enviarPushAUsuario(usuarioId, { titulo, mensaje, url = '/' }) {
    validarConfiguracionPush();

    const rows = await query(
        `
        SELECT *
        FROM push_subscriptions
        WHERE usuarioId = ?
          AND activo = 1
        ORDER BY subscriptionId DESC
        `,
        [usuarioId]
    );

    if (rows.length === 0) {
        await registrarPushLog({
            usuarioId,
            titulo,
            mensaje,
            url,
            enviado: 0,
            error: 'El usuario no tiene suscripciones push activas',
        });

        return {
            success: false,
            message: 'El usuario no tiene suscripciones push activas',
            enviados: 0,
            fallidos: 0,
        };
    }

    const payload = {
        title: titulo,
        body: mensaje,
        url,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        timestamp: Date.now(),
    };

    const resultados = await Promise.all(rows.map((row) => enviarPushASuscripcion(row, payload)));

    const enviados = resultados.filter((r) => r.success).length;
    const fallidos = resultados.filter((r) => !r.success).length;

    return {
        success: enviados > 0,
        message: enviados > 0 ? 'Notificación enviada' : 'No se pudo enviar la notificación',
        enviados,
        fallidos,
        resultados,
    };
}

async function enviarPushARol(rolId, { titulo, mensaje, url = '/' }) {
    validarConfiguracionPush();

    const rows = await query(
        `
        SELECT ps.*
        FROM push_subscriptions ps
        INNER JOIN usuarios u ON ps.usuarioId = u.usuarioId
        WHERE u.rolId = ?
          AND ps.activo = 1
        ORDER BY ps.subscriptionId DESC
        `,
        [rolId]
    );

    const payload = {
        title: titulo,
        body: mensaje,
        url,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        timestamp: Date.now(),
    };

    const resultados = await Promise.all(rows.map((row) => enviarPushASuscripcion(row, payload)));

    const enviados = resultados.filter((r) => r.success).length;
    const fallidos = resultados.filter((r) => !r.success).length;

    return {
        success: enviados > 0,
        message: enviados > 0 ? 'Notificaciones enviadas' : 'No se enviaron notificaciones',
        totalSuscripciones: rows.length,
        enviados,
        fallidos,
        resultados,
    };
}

async function getPushLogs(usuarioId = null, limit = 50) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

    if (usuarioId) {
        return query(
            `
            SELECT *
            FROM push_logs
            WHERE usuarioId = ?
            ORDER BY pushLogId DESC
            LIMIT ?
            `,
            [usuarioId, safeLimit]
        );
    }

    return query(
        `
        SELECT pl.*, u.nombre, u.apPaterno, u.usuario
        FROM push_logs pl
        LEFT JOIN usuarios u ON pl.usuarioId = u.usuarioId
        ORDER BY pl.pushLogId DESC
        LIMIT ?
        `,
        [safeLimit]
    );
}

module.exports = {
    VAPID_PUBLIC_KEY,
    guardarSuscripcionPush,
    enviarPushAUsuario,
    enviarPushARol,
    getPushLogs,
};
