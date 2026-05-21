// src/models/gerentesSubordinados.js
const connection = require('../config/connection');

const query = (sql, values = []) =>
    new Promise((resolve, reject) => {
        connection.query(sql, values, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });

async function getCatalogoGerentesYColaboradores({ rolGerenteId, rolColaboradorId }) {
    const gerentes = await query(
        `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.foto,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            p.nombre_puesto
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE u.rolId = ?
        ORDER BY s.nombre_sucursal, u.departamento, u.apPaterno, u.nombre
        `,
        [rolGerenteId]
    );

    const colaboradores = await query(
        `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.foto,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            p.nombre_puesto
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE u.rolId = ?
        ORDER BY s.nombre_sucursal, u.departamento, u.apPaterno, u.nombre
        `,
        [rolColaboradorId]
    );

    return { gerentes, colaboradores };
}

async function getSubordinadosByGerente(gerenteId) {
    return await query(
        `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.foto,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            p.nombre_puesto,
            gs.createdAt AS asignadoAt
        FROM gerente_subordinados gs
        INNER JOIN usuarios u ON u.usuarioId = gs.subordinadoId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE gs.gerenteId = ?
        ORDER BY s.nombre_sucursal, u.departamento, u.apPaterno, u.nombre
        `,
        [gerenteId]
    );
}

async function getGerentesBySubordinado(subordinadoId) {
    return await query(
        `
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.foto,
            u.departamento,
            u.departamentoId,
            u.sucursalId,
            s.nombre_sucursal,
            p.nombre_puesto,
            gs.createdAt AS asignadoAt
        FROM gerente_subordinados gs
        INNER JOIN usuarios u ON u.usuarioId = gs.gerenteId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE gs.subordinadoId = ?
        ORDER BY u.apPaterno, u.nombre
        `,
        [subordinadoId]
    );
}

async function asignarSubordinadosAGerente({ gerenteId, subordinadoIds = [] }) {
    if (!gerenteId) {
        return { success: false, message: 'Falta gerenteId' };
    }

    if (!Array.isArray(subordinadoIds) || subordinadoIds.length === 0) {
        return { success: false, message: 'Selecciona al menos un colaborador' };
    }

    const idsLimpios = [...new Set(
        subordinadoIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0 && id !== Number(gerenteId))
    )];

    if (idsLimpios.length === 0) {
        return { success: false, message: 'No hay colaboradores válidos para asignar' };
    }

    let agregados = 0;

    for (const subordinadoId of idsLimpios) {
        const result = await query(
            `
            INSERT IGNORE INTO gerente_subordinados (
                gerenteId,
                subordinadoId,
                createdAt
            )
            VALUES (?, ?, NOW())
            `,
            [gerenteId, subordinadoId]
        );

        agregados += Number(result.affectedRows || 0);
    }

    return {
        success: true,
        message: 'Subordinados asignados correctamente',
        agregados,
        totalSolicitados: idsLimpios.length,
    };
}

async function eliminarSubordinadoDeGerente({ gerenteId, subordinadoId }) {
    const result = await query(
        `
        DELETE FROM gerente_subordinados
        WHERE gerenteId = ?
          AND subordinadoId = ?
        `,
        [gerenteId, subordinadoId]
    );

    return {
        success: true,
        message: 'Subordinado removido correctamente',
        eliminados: result.affectedRows || 0,
    };
}

module.exports = {
    getCatalogoGerentesYColaboradores,
    getSubordinadosByGerente,
    getGerentesBySubordinado,
    asignarSubordinadosAGerente,
    eliminarSubordinadoDeGerente,
};
