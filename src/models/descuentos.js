// src/models/descuentos.js
const connection = require('../config/connection');

const query = (sql, values = []) =>
    new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });

function fechaLocalYYYYMMDD(fecha = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(fecha);
}

function ultimoDiaMes(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function fechaQuincena(year, monthIndex, diaObjetivo) {
    const ultimo = ultimoDiaMes(year, monthIndex);
    const dia = diaObjetivo === 30 ? Math.min(30, ultimo) : 15;

    return new Date(year, monthIndex, dia, 12, 0, 0);
}

function siguienteFechaQuincena(fechaBase = new Date()) {
    const base = new Date(fechaBase);
    base.setHours(0, 0, 0, 0);

    const year = base.getFullYear();
    const month = base.getMonth();

    const dia15 = fechaQuincena(year, month, 15);
    const dia30 = fechaQuincena(year, month, 30);

    if (base < dia15) return fechaLocalYYYYMMDD(dia15);
    if (base < dia30) return fechaLocalYYYYMMDD(dia30);

    return fechaLocalYYYYMMDD(fechaQuincena(year, month + 1, 15));
}

function siguienteQuincenaDespuesDe(fechaYYYYMMDD) {
    const fecha = new Date(`${fechaYYYYMMDD}T12:00:00`);
    fecha.setDate(fecha.getDate() + 1);
    return siguienteFechaQuincena(fecha);
}

function redondear2(valor) {
    return Math.round(Number(valor || 0) * 100) / 100;
}

async function crearDescuentoPrestamo(usuarioId, data = {}) {
    const concepto = String(data.concepto || '').trim().toUpperCase();
    const tipo = data.tipo || 'prestamo';
    const montoTotal = redondear2(data.monto_total ?? data.monto);
    const periodicidadOriginal = data.periodicidad || 'quincena';
    const periodicidad = periodicidadOriginal === 'unica' ? 'quincena' : periodicidadOriginal;
    const totalPagos = periodicidadOriginal === 'unica'
        ? 1
        : Number(data.total_pagos || data.plazo_quincenas || 1);
    const fechaInicio = fechaLocalYYYYMMDD(new Date());
    const fechaProximoPago =
        data.fecha_proximo_pago ||
        data.fecha_inicio ||
        siguienteFechaQuincena(new Date());
    const observaciones = data.observaciones || null;

    if (!usuarioId) {
        return { success: false, message: 'Falta usuarioId' };
    }

    if (!concepto) {
        return { success: false, message: 'El concepto es requerido' };
    }

    if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
        return { success: false, message: 'El monto total debe ser mayor a 0' };
    }

    if (!Number.isInteger(totalPagos) || totalPagos <= 0) {
        return { success: false, message: 'El número de pagos debe ser mayor a 0' };
    }

    if (!['descuento', 'deduccion', 'prestamo'].includes(tipo)) {
        return { success: false, message: 'Tipo inválido' };
    }

    if (periodicidad !== 'quincena') {
        return { success: false, message: 'Por ahora los préstamos se manejan por quincena' };
    }

    const montoPorPago = redondear2(montoTotal / totalPagos);

    const result = await query(
        `
        INSERT INTO descuentos (
            usuarioId,
            concepto,
            monto,
            monto_total,
            monto_por_pago,
            tipo,
            periodicidad,
            total_pagos,
            pagos_realizados,
            fecha_inicio,
            fecha_proximo_pago,
            activo,
            estado,
            observaciones
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 'activo', ?)
        `,
        [
            usuarioId,
            concepto,
            montoPorPago,
            montoTotal,
            montoPorPago,
            tipo,
            periodicidad,
            totalPagos,
            fechaInicio,
            fechaProximoPago,
            observaciones,
        ]
    );

    return {
        success: true,
        message: 'Deducción/préstamo registrado correctamente',
        descuentoId: result.insertId,
        data: {
            descuentoId: result.insertId,
            monto_total: montoTotal,
            monto_por_pago: montoPorPago,
            total_pagos: totalPagos,
            fecha_inicio: fechaInicio,
        },
    };
}

async function getDescuentosByUsuario(usuarioId, incluirInactivos = false) {
    const descuentos = await query(
        `
        SELECT
            d.*,
            COALESCE(d.monto_total, d.monto) AS monto_total_calc,
            COALESCE(d.monto_por_pago, d.monto) AS monto_por_pago_calc,
            COALESCE(d.total_pagos, 1) AS total_pagos_calc,
            COALESCE(d.pagos_realizados, 0) AS pagos_realizados_calc,
            GREATEST(
                COALESCE(d.monto_total, d.monto) -
                COALESCE((
                    SELECT SUM(dp.monto)
                    FROM descuento_pagos dp
                    WHERE dp.descuentoId = d.descuentoId
                ), 0),
                0
            ) AS saldo_pendiente
        FROM descuentos d
        WHERE d.usuarioId = ?
          ${incluirInactivos ? '' : "AND d.activo = 1 AND d.estado = 'activo'"}
        ORDER BY d.activo DESC, d.createdAt DESC, d.descuentoId DESC
        `,
        [usuarioId]
    );

    if (descuentos.length === 0) return [];

    const ids = descuentos.map((d) => d.descuentoId);
    const pagos = await query(
        `
        SELECT *
        FROM descuento_pagos
        WHERE descuentoId IN (?)
        ORDER BY descuentoId, numero_pago
        `,
        [ids]
    );

    const pagosPorDescuento = new Map();

    for (const pago of pagos) {
        if (!pagosPorDescuento.has(pago.descuentoId)) {
            pagosPorDescuento.set(pago.descuentoId, []);
        }

        pagosPorDescuento.get(pago.descuentoId).push(pago);
    }

    return descuentos.map((d) => ({
        ...d,
        monto_total: Number(d.monto_total_calc || 0),
        monto_por_pago: Number(d.monto_por_pago_calc || 0),
        total_pagos: Number(d.total_pagos_calc || 1),
        pagos_realizados: Number(d.pagos_realizados_calc || 0),
        saldo_pendiente: Number(d.saldo_pendiente || 0),
        pagos: pagosPorDescuento.get(d.descuentoId) || [],
    }));
}

async function procesarPagosDeducciones(fechaProceso = fechaLocalYYYYMMDD(new Date())) {
    const activos = await query(
        `
        SELECT *
        FROM descuentos
        WHERE activo = 1
          AND estado = 'activo'
          AND periodicidad = 'quincena'
          AND fecha_proximo_pago IS NOT NULL
          AND fecha_proximo_pago <= ?
        ORDER BY fecha_proximo_pago, descuentoId
        `,
        [fechaProceso]
    );

    let pagosGenerados = 0;

    for (const d of activos) {
        let fechaProgramada = fechaLocalYYYYMMDD(d.fecha_proximo_pago);
        let pagosRealizados = Number(d.pagos_realizados || 0);
        const totalPagos = Number(d.total_pagos || 1);
        const montoTotal = redondear2(d.monto_total || d.monto);
        const montoPorPago = redondear2(d.monto_por_pago || d.monto);
        let acumulado = 0;

        const pagosPrevios = await query(
            `
            SELECT COALESCE(SUM(monto), 0) AS total_pagado
            FROM descuento_pagos
            WHERE descuentoId = ?
            `,
            [d.descuentoId]
        );

        acumulado = redondear2(pagosPrevios[0]?.total_pagado || 0);

        while (
            fechaProgramada <= fechaProceso &&
            pagosRealizados < totalPagos &&
            acumulado < montoTotal
        ) {
            const numeroPago = pagosRealizados + 1;
            const saldoAntesPago = redondear2(montoTotal - acumulado);
            const montoPago = numeroPago >= totalPagos
                ? saldoAntesPago
                : Math.min(montoPorPago, saldoAntesPago);

            await query(
                `
                INSERT IGNORE INTO descuento_pagos (
                    descuentoId,
                    usuarioId,
                    numero_pago,
                    monto,
                    fecha_programada,
                    fecha_aplicada,
                    tipo_pago
                )
                VALUES (?, ?, ?, ?, ?, ?, 'automatico')
                `,
                [
                    d.descuentoId,
                    d.usuarioId,
                    numeroPago,
                    montoPago,
                    fechaProgramada,
                    fechaProceso,
                ]
            );

            pagosGenerados += 1;
            pagosRealizados += 1;
            acumulado = redondear2(acumulado + montoPago);

            fechaProgramada = siguienteQuincenaDespuesDe(fechaProgramada);
        }

        const liquidado = pagosRealizados >= totalPagos || acumulado >= montoTotal;

        await query(
            `
            UPDATE descuentos
            SET
                pagos_realizados = ?,
                fecha_ultimo_pago = ?,
                fecha_proximo_pago = ?,
                activo = ?,
                estado = ?,
                liquidadoAt = CASE WHEN ? = 1 THEN NOW() ELSE liquidadoAt END
            WHERE descuentoId = ?
            `,
            [
                pagosRealizados,
                fechaProceso,
                liquidado ? null : fechaProgramada,
                liquidado ? 0 : 1,
                liquidado ? 'liquidado' : 'activo',
                liquidado ? 1 : 0,
                d.descuentoId,
            ]
        );
    }

    return {
        success: true,
        message: 'Pagos de deducciones procesados',
        pagosGenerados,
        fechaProceso,
    };
}

async function liquidarDescuento(descuentoId, observaciones = 'Liquidado anticipadamente') {
    const rows = await query(
        `
        SELECT *
        FROM descuentos
        WHERE descuentoId = ?
        LIMIT 1
        `,
        [descuentoId]
    );

    if (rows.length === 0) {
        return { success: false, message: 'Deducción no encontrada' };
    }

    const d = rows[0];

    if (!d.activo || d.estado !== 'activo') {
        return { success: true, message: 'La deducción ya estaba inactiva' };
    }

    const pagosPrevios = await query(
        `
        SELECT COALESCE(SUM(monto), 0) AS total_pagado, COUNT(*) AS total_pagos
        FROM descuento_pagos
        WHERE descuentoId = ?
        `,
        [descuentoId]
    );

    const totalPagado = redondear2(pagosPrevios[0]?.total_pagado || 0);
    const pagosRealizados = Number(d.pagos_realizados || pagosPrevios[0]?.total_pagos || 0);
    const montoTotal = redondear2(d.monto_total || d.monto);
    const saldoPendiente = redondear2(montoTotal - totalPagado);

    if (saldoPendiente > 0) {
        await query(
            `
            INSERT IGNORE INTO descuento_pagos (
                descuentoId,
                usuarioId,
                numero_pago,
                monto,
                fecha_programada,
                fecha_aplicada,
                tipo_pago,
                observaciones
            )
            VALUES (?, ?, ?, ?, CURDATE(), CURDATE(), 'liquidacion_anticipada', ?)
            `,
            [
                descuentoId,
                d.usuarioId,
                pagosRealizados + 1,
                saldoPendiente,
                observaciones,
            ]
        );
    }

    await query(
        `
        UPDATE descuentos
        SET
            activo = 0,
            estado = 'liquidado_anticipado',
            pagos_realizados = COALESCE(total_pagos, pagos_realizados),
            fecha_ultimo_pago = CURDATE(),
            fecha_proximo_pago = NULL,
            observaciones = ?,
            liquidadoAt = NOW()
        WHERE descuentoId = ?
        `,
        [observaciones, descuentoId]
    );

    return {
        success: true,
        message: 'Deducción liquidada correctamente',
        saldoLiquidado: Math.max(saldoPendiente, 0),
    };
}

async function cancelarDescuento(descuentoId, observaciones = 'Cancelado por RH') {
    const result = await query(
        `
        UPDATE descuentos
        SET
            activo = 0,
            estado = 'cancelado',
            fecha_proximo_pago = NULL,
            observaciones = ?,
            liquidadoAt = NOW()
        WHERE descuentoId = ?
        `,
        [observaciones, descuentoId]
    );

    return {
        success: result.affectedRows > 0,
        message: result.affectedRows > 0 ? 'Deducción cancelada' : 'Deducción no encontrada',
    };
}

module.exports = {
    crearDescuentoPrestamo,
    getDescuentosByUsuario,
    procesarPagosDeducciones,
    liquidarDescuento,
    cancelarDescuento,
    siguienteFechaQuincena,
};
