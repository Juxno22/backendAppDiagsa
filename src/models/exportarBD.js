// src/models/exportarBD.js
const ExcelJS = require('exceljs');
const connection = require('../config/connection');

const query = (sql, values = []) => new Promise((resolve, reject) => {
    connection.query(sql, values, (err, results) => err ? reject(err) : resolve(results));
});

async function registrarLog(usuarioId, usuario, ip) {
    await query(
        'INSERT INTO export_logs (usuarioId, usuario, ip) VALUES (?, ?, ?)',
        [usuarioId, usuario, ip || null]
    );
}

async function getExportLogs() {
    return await query(`
        SELECT l.logId, l.usuarioId, l.usuario, l.fecha, l.ip,
               u.nombre, u.apPaterno
        FROM export_logs l
        LEFT JOIN usuarios u ON l.usuarioId = u.usuarioId
        ORDER BY l.fecha DESC
        LIMIT 200
    `);
}

async function generarExcelBD() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DIAGSA';

    const fontBold   = (size = 10) => ({ name: 'Arial', size, bold: true });
    const fontNormal = (size = 10) => ({ name: 'Arial', size });
    const fillGray   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } };
    const fillRed    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
    const borderThin = {
        top:    { style: 'thin' }, left:   { style: 'thin' },
        bottom: { style: 'thin' }, right:  { style: 'thin' },
    };

    function styleHeader(row, fill) {
        row.eachCell(cell => {
            cell.font      = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill      = fill;
            cell.border    = borderThin;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        row.height = 20;
    }

    function styleRow(row) {
        row.eachCell(cell => {
            cell.font      = fontNormal(9);
            cell.border    = borderThin;
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        });
        row.height = 16;
    }

    function fmtDate(d) {
        if (!d) return '';
        return new Date(d).toLocaleDateString('es-MX', { timeZone: 'UTC' });
    }

    // ── HOJA 1: Empleados ───────────────────────────────────────
    const wsEmp = wb.addWorksheet('Empleados');
    wsEmp.columns = [
        { width: 8  }, { width: 20 }, { width: 20 }, { width: 20 },
        { width: 16 }, { width: 20 }, { width: 20 }, { width: 16 },
        { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 },
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 },
        { width: 20 }, { width: 14 }, { width: 16 }, { width: 20 },
        { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    ];

    const hdrEmp = wsEmp.addRow([
        'ID', 'Nombre', 'Ap. Paterno', 'Ap. Materno', 'Usuario',
        'Departamento', 'Puesto', 'Rol', 'Fecha Contratación', 'Sueldo',
        'Género', 'Estado Civil', 'Celular', 'Fecha Nacimiento',
        'RFC', 'CURP', 'NSS', 'Es Padre/Madre',
        'Fecha Contrato Indef.', 'Jefe Inmediato',
        'T. Playera', 'T. Pantalón', 'T. Calzado', 'T. Faja', 'T. Guantes',
    ]);
    styleHeader(hdrEmp, fillRed);

    const empleados = await query(`
        SELECT u.usuarioId, u.nombre, u.apPaterno, u.apMaterno, u.usuario,
               u.departamento, p.nombre_puesto, r.nombre_rol,
               u.fechaContratacion, u.sueldo,
               u.genero, u.estado_civil, u.celular, u.fecha_nacimiento,
               u.RFC, u.curp, u.numero_seguro_social, u.es_padre_madre,
               u.fecha_contrato_indeterminado_3m, u.jefe_inmediato,
               u.talla_playera, u.talla_pantalon, u.talla_calzado,
               u.talla_faja, u.talla_guantes
        FROM usuarios u
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN roles  r ON u.rolId    = r.rolId
        ORDER BY u.apPaterno, u.nombre
    `);

    for (const e of empleados) {
        const row = wsEmp.addRow([
            e.usuarioId, e.nombre, e.apPaterno, e.apMaterno, e.usuario,
            e.departamento, e.nombre_puesto, e.nombre_rol,
            fmtDate(e.fechaContratacion), e.sueldo ? Number(e.sueldo) : '',
            e.genero, e.estado_civil, e.celular, fmtDate(e.fecha_nacimiento),
            e.RFC, e.curp, e.numero_seguro_social, e.es_padre_madre,
            fmtDate(e.fecha_contrato_indeterminado_3m), e.jefe_inmediato,
            e.talla_playera, e.talla_pantalon, e.talla_calzado,
            e.talla_faja, e.talla_guantes,
        ]);
        styleRow(row);
    }

    // ── HOJA 2: Vehículos ───────────────────────────────────────
    const wsVeh = wb.addWorksheet('Vehículos');
    wsVeh.columns = [
        { width: 8 }, { width: 20 }, { width: 20 }, { width: 12 },
        { width: 14 }, { width: 14 }, { width: 10 }, { width: 12 },
        { width: 16 }, { width: 20 },
    ];

    const hdrVeh = wsVeh.addRow([
        'ID Empleado', 'Nombre', 'Ap. Paterno', 'Tiene Vehículo',
        'Tipo', 'Marca', 'Modelo', 'Año', 'Placas', 'No. Serie',
    ]);
    styleHeader(hdrVeh, fillRed);

    const vehiculos = await query(`
        SELECT v.*, u.nombre, u.apPaterno
        FROM vehiculos v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        ORDER BY u.apPaterno
    `);
    for (const v of vehiculos) {
        const row = wsVeh.addRow([
            v.usuarioId, v.nombre, v.apPaterno,
            v.tiene_vehiculo ? 'Sí' : 'No',
            v.tipo, v.marca, v.modelo, v.anio, v.placas, v.num_serie,
        ]);
        styleRow(row);
    }

    // ── HOJA 3: Hijos ───────────────────────────────────────────
    const wsHijos = wb.addWorksheet('Hijos');
    wsHijos.columns = [
        { width: 8 }, { width: 20 }, { width: 20 }, { width: 24 }, { width: 18 },
    ];
    const hdrHijos = wsHijos.addRow([
        'ID Empleado', 'Nombre Empleado', 'Ap. Paterno', 'Nombre Hijo', 'Fecha Nacimiento',
    ]);
    styleHeader(hdrHijos, fillRed);

    const hijos = await query(`
        SELECT h.*, u.nombre, u.apPaterno
        FROM hijos h
        LEFT JOIN usuarios u ON h.usuarioId = u.usuarioId
        ORDER BY u.apPaterno
    `);
    for (const h of hijos) {
        const row = wsHijos.addRow([
            h.usuarioId, h.nombre, h.apPaterno, h.nombre, fmtDate(h.fecha_nacimiento),
        ]);
        styleRow(row);
    }

    // ── HOJA 4: Vacaciones ──────────────────────────────────────
    const wsVac = wb.addWorksheet('Vacaciones');
    wsVac.columns = [
        { width: 8 }, { width: 20 }, { width: 20 }, { width: 16 },
        { width: 16 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];
    const hdrVac = wsVac.addRow([
        'ID', 'Nombre', 'Ap. Paterno', 'Fecha Inicio', 'Fecha Fin',
        'Días', 'Estado Final', 'Resp. Jefe', 'Resp. RH',
    ]);
    styleHeader(hdrVac, fillRed);

    const vacaciones = await query(`
        SELECT v.vacacionesId, u.nombre, u.apPaterno,
               v.fecha_inicio_vacaciones, v.fecha_fin_vacaciones,
               v.dias_solicitados, v.estado_final,
               v.respuesta_jefe_inmediato, v.respuesta_RH
        FROM vacaciones v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        ORDER BY v.fecha_inicio_vacaciones DESC
    `);
    for (const v of vacaciones) {
        const row = wsVac.addRow([
            v.vacacionesId, v.nombre, v.apPaterno,
            fmtDate(v.fecha_inicio_vacaciones), fmtDate(v.fecha_fin_vacaciones),
            v.dias_solicitados, v.estado_final,
            v.respuesta_jefe_inmediato, v.respuesta_RH,
        ]);
        styleRow(row);
    }

    // ── HOJA 5: Evaluaciones ────────────────────────────────────
    const wsEval = wb.addWorksheet('Evaluaciones');
    wsEval.columns = [
        { width: 8 }, { width: 20 }, { width: 20 }, { width: 16 },
        { width: 20 }, { width: 10 }, { width: 14 }, { width: 30 },
    ];
    const hdrEval = wsEval.addRow([
        'ID', 'Nombre', 'Ap. Paterno', 'Fecha Evaluación',
        'Periodo', 'Promedio', 'Recontratación', 'Comentario Final',
    ]);
    styleHeader(hdrEval, fillRed);

    const evaluaciones = await query(`
        SELECT e.evaluacionesId, u.nombre, u.apPaterno,
               e.fecha_evaluacion, pe.periodo,
               e.promedio_final, e.recontratacion, e.comentario_final
        FROM evaluaciones e
        LEFT JOIN usuarios u            ON e.usuarioId              = u.usuarioId
        LEFT JOIN periodoevaluaciones pe ON e.periodo_evaluacionesId = pe.periodo_evaluacionesId
        ORDER BY e.fecha_evaluacion DESC
    `);
    for (const e of evaluaciones) {
        const row = wsEval.addRow([
            e.evaluacionesId, e.nombre, e.apPaterno,
            fmtDate(e.fecha_evaluacion), e.periodo,
            e.promedio_final, e.recontratacion, e.comentario_final,
        ]);
        styleRow(row);
    }

    // ── HOJA 6: Permisos ────────────────────────────────────────
    const wsPerm = wb.addWorksheet('Permisos');
    wsPerm.columns = [
        { width: 8 }, { width: 20 }, { width: 20 }, { width: 10 },
        { width: 16 }, { width: 8 }, { width: 18 }, { width: 14 }, { width: 30 },
    ];
    const hdrPerm = wsPerm.addRow([
        'ID', 'Nombre', 'Ap. Paterno', 'Tipo',
        'Fecha Permiso', 'Días/Hrs', 'Goce Sueldo', 'Estado', 'Motivo',
    ]);
    styleHeader(hdrPerm, fillRed);

    const permisos = await query(`
        SELECT p.permisoId, u.nombre, u.apPaterno,
               p.tipo, p.fecha_permiso,
               COALESCE(p.num_dias, p.num_horas) AS cantidad,
               p.goce_sueldo, p.estado, p.motivo
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        ORDER BY p.fecha_permiso DESC
    `);
    for (const p of permisos) {
        const row = wsPerm.addRow([
            p.permisoId, p.nombre, p.apPaterno,
            p.tipo === 'dia' ? 'Por día' : 'Por horas',
            fmtDate(p.fecha_permiso), p.cantidad,
            p.goce_sueldo, p.estado, p.motivo,
        ]);
        styleRow(row);
    }

    // ── HOJA 7: Logs de exportación ─────────────────────────────
    const wsLogs = wb.addWorksheet('Historial Exportaciones');
    wsLogs.columns = [
        { width: 8 }, { width: 20 }, { width: 20 }, { width: 24 }, { width: 18 },
    ];
    const hdrLogs = wsLogs.addRow([
        'ID', 'Usuario', 'Nombre', 'Fecha y Hora', 'IP',
    ]);
    styleHeader(hdrLogs, fillGray);

    const logs = await query(`
        SELECT l.logId, l.usuario, u.nombre, u.apPaterno, l.fecha, l.ip
        FROM export_logs l
        LEFT JOIN usuarios u ON l.usuarioId = u.usuarioId
        ORDER BY l.fecha DESC
    `);
    for (const l of logs) {
        const row = wsLogs.addRow([
            l.logId, l.usuario,
            l.nombre ? `${l.nombre} ${l.apPaterno}` : '',
            l.fecha ? new Date(l.fecha).toLocaleString('es-MX') : '',
            l.ip,
        ]);
        styleRow(row);
    }

    return await wb.xlsx.writeBuffer();
}

module.exports = { generarExcelBD, registrarLog, getExportLogs };