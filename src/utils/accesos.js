// src/utils/accesos.js
const connection = require('../config/connection');

const ROL_RHADMIN = 7;
const ROL_RH = 1;
const ROL_SUPERVISOR = 2;
const ROL_GERENTE = 3;
const ROL_COLABORADOR = 4;

const query = (sql, values = []) =>
    new Promise((resolve, reject) => {
        connection.query(sql, values, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });

async function getAccesosUsuario(usuarioId) {
    return await query(`
        SELECT
            accesoId,
            usuarioId,
            sucursalId,
            departamentoId,
            tipo_acceso
        FROM usuario_accesos
        WHERE usuarioId = ?
          AND activo = 1
    `, [usuarioId]);
}

async function construirFiltroAccesoUsuarios(req) {
    const {
        usuarioId,
        rolId,
        sucursalId,
        departamentoId,
    } = req.user;

    // RHadmin ve todo
    if (rolId === ROL_RHADMIN) {
        return {
            where: '',
            params: [],
        };
    }

    // RH y Supervisor usan usuario_accesos
    if ([ROL_RH, ROL_SUPERVISOR].includes(rolId)) {
        const accesos = await getAccesosUsuario(usuarioId);

        if (accesos.length === 0) {
            return {
                where: 'WHERE 1 = 0',
                params: [],
            };
        }

        const condiciones = [];
        const params = [];

        for (const acceso of accesos) {
            if (acceso.tipo_acceso === 'sucursal') {
                condiciones.push('(u.sucursalId = ?)');
                params.push(acceso.sucursalId);
            }

            if (acceso.tipo_acceso === 'departamento') {
                condiciones.push('(u.sucursalId = ? AND u.departamentoId = ?)');
                params.push(acceso.sucursalId, acceso.departamentoId);
            }
        }

        return {
            where: `WHERE (${condiciones.join(' OR ')})`,
            params,
        };
    }

    // Gerente: solo su sucursal + departamento
    if (rolId === ROL_GERENTE) {
        return {
            where: 'WHERE u.sucursalId = ? AND u.departamentoId = ?',
            params: [sucursalId, departamentoId],
        };
    }

    // Colaborador: solo él mismo
    return {
        where: 'WHERE u.usuarioId = ?',
        params: [usuarioId],
    };
}

module.exports = {
    getAccesosUsuario,
    construirFiltroAccesoUsuarios,
};