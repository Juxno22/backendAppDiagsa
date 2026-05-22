// src/config/connection.js
const mysql = require('mysql2');
require('dotenv').config();

const RETRYABLE_DB_ERRORS = new Set([
  'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST',
  'ETIMEDOUT',
  'EPIPE',
  'ECONNREFUSED',
]);

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  port: toNumber(process.env.DB_PORT, 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: toNumber(process.env.DB_CONNECTION_LIMIT, 10),
  queueLimit: toNumber(process.env.DB_QUEUE_LIMIT, 0),

  maxIdle: toNumber(process.env.DB_MAX_IDLE, toNumber(process.env.DB_CONNECTION_LIMIT, 10)),
  idleTimeout: toNumber(process.env.DB_IDLE_TIMEOUT, 60000),

  charset: 'utf8mb4',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: toNumber(process.env.DB_CONNECT_TIMEOUT, 10000),
});

/*
  Tus modelos usan connection.query(...).
  Si Railway/MySQL corta una conexión ociosa, la primera consulta puede caer con ECONNRESET.
  El pool normalmente descarta esa conexión, pero esa consulta ya falló.
  Este wrapper reintenta UNA vez solo errores de conexión.
*/
const originalQuery = connection.query.bind(connection);

connection.query = function patchedQuery(sql, values, callback) {
  let cb = callback;
  let params = values;

  if (typeof values === 'function') {
    cb = values;
    params = undefined;
  }

  if (typeof cb !== 'function') {
    return originalQuery(sql, params);
  }

  return originalQuery(sql, params, (err, results, fields) => {
    const retryable =
      err &&
      (
        RETRYABLE_DB_ERRORS.has(err.code) ||
        err.fatal === true ||
        /closed state|connection lost|reset/i.test(String(err.message || ''))
      );

    if (!retryable) {
      cb(err, results, fields);
      return;
    }

    console.error('[MySQL] Error de conexión. Reintentando consulta una vez:', {
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      fatal: err.fatal,
      message: err.message,
    });

    originalQuery(sql, params, (retryErr, retryResults, retryFields) => {
      if (retryErr) {
        console.error('[MySQL] Reintento fallido:', {
          code: retryErr.code,
          errno: retryErr.errno,
          syscall: retryErr.syscall,
          fatal: retryErr.fatal,
          message: retryErr.message,
        });
      }

      cb(retryErr, retryResults, retryFields);
    });
  });
};

connection.on('connection', (conn) => {
  console.log(`Nueva conexión MySQL creada: ${conn.threadId}`);

  conn.query('SET SESSION wait_timeout = 28800');
  conn.query('SET SESSION interactive_timeout = 28800');

  conn.on('error', (err) => {
    console.error(`[MySQL] Error en conexión ${conn.threadId}:`, {
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      fatal: err.fatal,
      message: err.message,
    });
  });
});

connection.on('error', (err) => {
  console.error('Error en pool MySQL:', {
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    fatal: err.fatal,
    message: err.message,
  });
});

module.exports = connection;
