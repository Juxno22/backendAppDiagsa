// src/models/exportarBD.js
const ExcelJS = require('exceljs');
const connection = require('../config/connection');

const query = (sql, values = []) => new Promise((resolve, reject) => {
    connection.query(sql, values, (err, results) => err ? reject(err) : resolve(results));
});

const SECCIONES_VALIDAS = [
    'general',
    'empleados',
    'vehiculos',
    'hijos',
    'vacaciones',
    'evaluaciones',
    'permisos',
    'logs',
    'bajas',
    'vacantes',
    'cumpleanos',
    'descuentos',
    'uniformes',
    'quejas_sugerencias',
    'documentos_empleado',
    'documentos_rh',
];

function normalizarFiltros(filtros = {}) {
    const sucursalId = filtros.sucursalId && String(filtros.sucursalId) !== 'todos'
        ? Number(filtros.sucursalId)
        : null;

    const departamentoId = filtros.departamentoId && String(filtros.departamentoId) !== 'todos'
        ? Number(filtros.departamentoId)
        : null;

    const usuarioId = filtros.usuarioId && String(filtros.usuarioId) !== 'todos'
        ? Number(filtros.usuarioId)
        : null;

    return {
        sucursalId: Number.isFinite(sucursalId) ? sucursalId : null,
        departamentoId: Number.isFinite(departamentoId) ? departamentoId : null,
        usuarioId: Number.isFinite(usuarioId) ? usuarioId : null,
    };
}

function filtrosUsuarioSQL(alias = 'u', filtros = {}) {
    const f = normalizarFiltros(filtros);
    const where = [];
    const values = [];

    if (f.usuarioId) {
        where.push(`${alias}.usuarioId = ?`);
        values.push(f.usuarioId);
    }

    if (f.sucursalId) {
        where.push(`${alias}.sucursalId = ?`);
        values.push(f.sucursalId);
    }

    if (f.departamentoId) {
        where.push(`${alias}.departamentoId = ?`);
        values.push(f.departamentoId);
    }

    return {
        where: where.length ? ` AND ${where.join(' AND ')}` : '',
        values,
    };
}

function filtrosQuejasSugerenciasSQL(filtros = {}) {
    const f = normalizarFiltros(filtros);
    const where = [];
    const values = [];

    if (f.usuarioId) {
        where.push('qs.usuarioId = ?');
        values.push(f.usuarioId);
    }

    if (f.sucursalId) {
        where.push('(qs.sucursalId = ? OR u.sucursalId = ?)');
        values.push(f.sucursalId, f.sucursalId);
    }

    if (f.departamentoId) {
        where.push('(qs.departamentoId = ? OR u.departamentoId = ?)');
        values.push(f.departamentoId, f.departamentoId);
    }

    return {
        where: where.length ? ` AND ${where.join(' AND ')}` : '',
        values,
    };
}

function crearWorkbook() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DIAGSA';
    wb.created = new Date();
    return wb;
}

const fillRed = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
const fillGray = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };
const fillBlue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };

const borderThin = {
    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};

function styleHeader(row, fill = fillRed) {
    row.eachCell(cell => {
        cell.font = {
            name: 'Arial',
            size: 10,
            bold: true,
            color: { argb: 'FFFFFFFF' },
        };
        cell.fill = fill;
        cell.border = borderThin;
        cell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true,
        };
    });
    row.height = 24;
}

function styleRow(row) {
    row.eachCell(cell => {
        cell.font = { name: 'Arial', size: 9, color: { argb: 'FF1F2937' } };
        cell.border = borderThin;
        cell.alignment = {
            horizontal: 'left',
            vertical: 'middle',
            wrapText: true,
        };
    });
    row.height = 20;
}

function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-MX', { timeZone: 'UTC' });
}

function fmtDateTime(d) {
    if (!d) return '';
    return new Date(d).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
}

function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento) return '';
    const nacimiento = new Date(fechaNacimiento);
    if (Number.isNaN(nacimiento.getTime())) return '';

    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();

    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
        edad--;
    }

    return edad;
}

function autoFilter(ws, headersLength) {
    if (ws.rowCount > 1) {
        ws.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: headersLength },
        };
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function addHeader(ws, headers, fill = fillRed) {
    const row = ws.addRow(headers);
    styleHeader(row, fill);
    autoFilter(ws, headers.length);
}

function addStyledRow(ws, values) {
    const row = ws.addRow(values);
    styleRow(row);
    return row;
}

function nombreCompleto(e) {
    return `${e.nombre || e.nombre_empleado || ''} ${e.apPaterno || ''} ${e.apMaterno || ''}`.trim();
}

async function registrarLog(usuarioId, usuario, ip) {
    let usuarioFinal = usuario;

    if (!usuarioFinal && usuarioId) {
        const results = await query(
            'SELECT usuario FROM usuarios WHERE usuarioId = ?',
            [usuarioId]
        );
        usuarioFinal = results[0]?.usuario || 'desconocido';
    }

    await query(
        'INSERT INTO export_logs (usuarioId, usuario, ip) VALUES (?, ?, ?)',
        [usuarioId || null, usuarioFinal || 'desconocido', ip || null]
    );
}

async function getExportLogs() {
    return await query(`
        SELECT
            l.logId,
            l.usuarioId,
            l.usuario,
            l.fecha,
            l.ip,
            u.nombre,
            u.apPaterno
        FROM export_logs l
        LEFT JOIN usuarios u ON l.usuarioId = u.usuarioId
        ORDER BY l.fecha DESC
        LIMIT 200
    `);
}

// ─────────────────────────────────────────────────────────────
// HOJAS DE EXPORTACIÓN
// ─────────────────────────────────────────────────────────────

async function agregarHojaEmpleados(wb, filtros = {}) {
    const ws = wb.addWorksheet('Empleados');

    ws.columns = Array.from({ length: 69 }, () => ({ width: 18 }));
    ws.getColumn(2).width = 28;
    ws.getColumn(8).width = 26;
    ws.getColumn(18).width = 22;
    ws.getColumn(19).width = 22;
    ws.getColumn(43).width = 34;
    ws.getColumn(44).width = 34;
    ws.getColumn(52).width = 40;
    ws.getColumn(53).width = 40;

    const headers = [
        'ID', 'Empleado', 'Nombre', 'Ap. Paterno', 'Ap. Materno', 'Usuario',
        'Sucursal ID', 'Sucursal', 'Departamento ID', 'Departamento', 'Puesto ID', 'Puesto', 'Rol ID', 'Rol', 'Tipo ID',
        'Fecha Contratación', 'Jefe Inmediato',
        'Sueldo', 'Sueldo Bruto', 'Fondo Ahorro', 'Sueldo Neto', 'Compensación', 'Sueldo Final',
        'Género', 'Estado Civil', 'Celular', 'Fecha Nacimiento', 'Edad', 'RFC', 'CURP', 'NSS', 'Es Padre/Madre',
        'Fecha Contrato Indef. 3M',
        'Razón Social', 'Banco', 'Cuenta', 'CLABE', 'CP Fiscal', 'Código Postal',
        'INFONAVIT', 'FONACOT',
        'PDF RFC', 'PDF Psicométrico',
        'Emergencia Nombre', 'Emergencia Teléfono', 'Emergencia Parentesco',
        'Domicilio Calle', 'Colonia', 'Localidad', 'CP Domicilio', 'Num Ext', 'Num Int', 'Municipio', 'Estado', 'Lat', 'Lng',
        'T. Playera', 'T. Pantalón', 'T. Calzado', 'T. Faja', 'T. Guantes',
        'Inducción Completada', 'Fecha Inducción', 'Foto',
    ];

    addHeader(ws, headers, fillRed);

    const f = filtrosUsuarioSQL('u', filtros);

    const empleados = await query(`
        SELECT
            u.usuarioId, u.nombre, u.apPaterno, u.apMaterno, u.usuario,
            u.sucursalId, s.nombre_sucursal,
            u.departamentoId, COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            u.departamento,
            u.puestoId, p.nombre_puesto,
            u.rolId, r.nombre_rol,
            u.tipoId,
            u.fechaContratacion, u.jefe_inmediato,
            u.sueldo, u.sueldo_bruto, u.fondo_ahorro, u.sueldo_neto, u.sueldo_compensacion, u.sueldo_final,
            u.genero, u.estado_civil, u.celular, u.fecha_nacimiento,
            u.RFC, u.curp, u.numero_seguro_social, u.es_padre_madre,
            u.fecha_contrato_indeterminado_3m,
            u.razon_social, u.nombre_banco, u.numero_cuenta, u.clabe_interbancaria,
            u.codigo_postal_fiscal, u.codigo_postal,
            u.infonavit, u.fonacot,
            u.pdf_rfc, u.pdf_psicometrico,
            u.emergencia_nombre, u.emergencia_telefono, u.emergencia_parentesco,
            u.domicilio_calle, u.domicilio_colonia, u.domicilio_localidad,
            u.domicilio_cp, u.domicilio_num_ext, u.domicilio_num_int,
            u.domicilio_municipio, u.domicilio_estado, u.domicilio_lat, u.domicilio_lng,
            u.talla_playera, u.talla_pantalon, u.talla_calzado,
            u.talla_faja, u.talla_guantes,
            u.induccion_completada, u.fecha_induccion, u.foto
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN roles r ON u.rolId = r.rolId
        WHERE 1 = 1
        ${f.where}
        ORDER BY s.nombre_sucursal, COALESCE(d.nombre, u.departamento), u.apPaterno, u.nombre
    `, f.values);

    for (const e of empleados) {
        addStyledRow(ws, [
            e.usuarioId,
            nombreCompleto(e),
            e.nombre, e.apPaterno, e.apMaterno, e.usuario,
            e.sucursalId, e.nombre_sucursal,
            e.departamentoId, e.nombre_departamento,
            e.puestoId, e.nombre_puesto,
            e.rolId, e.nombre_rol, e.tipoId,
            fmtDate(e.fechaContratacion), e.jefe_inmediato,
            e.sueldo ? Number(e.sueldo) : '',
            e.sueldo_bruto ? Number(e.sueldo_bruto) : '',
            e.fondo_ahorro ? Number(e.fondo_ahorro) : '',
            e.sueldo_neto ? Number(e.sueldo_neto) : '',
            e.sueldo_compensacion ? Number(e.sueldo_compensacion) : '',
            e.sueldo_final ? Number(e.sueldo_final) : '',
            e.genero, e.estado_civil, e.celular, fmtDate(e.fecha_nacimiento), calcularEdad(e.fecha_nacimiento),
            e.RFC, e.curp, e.numero_seguro_social, e.es_padre_madre,
            fmtDate(e.fecha_contrato_indeterminado_3m),
            e.razon_social, e.nombre_banco, e.numero_cuenta, e.clabe_interbancaria,
            e.codigo_postal_fiscal, e.codigo_postal,
            e.infonavit, e.fonacot,
            e.pdf_rfc, e.pdf_psicometrico,
            e.emergencia_nombre, e.emergencia_telefono, e.emergencia_parentesco,
            e.domicilio_calle, e.domicilio_colonia, e.domicilio_localidad,
            e.domicilio_cp, e.domicilio_num_ext, e.domicilio_num_int,
            e.domicilio_municipio, e.domicilio_estado, e.domicilio_lat, e.domicilio_lng,
            e.talla_playera, e.talla_pantalon, e.talla_calzado,
            e.talla_faja, e.talla_guantes,
            e.induccion_completada ? 'Sí' : 'No', fmtDateTime(e.fecha_induccion), e.foto,
        ]);
    }
}

async function agregarHojaVehiculos(wb, filtros = {}) {
    const ws = wb.addWorksheet('Vehículos');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 20 }, { width: 18 },
        { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
        { width: 12 }, { width: 16 }, { width: 18 }, { width: 26 },
    ];

    addHeader(ws, [
        'ID Empleado', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Vehículo ID', 'Tiene Vehículo', 'Tipo', 'Marca', 'Modelo', 'Año', 'Color', 'Placas', 'No. Serie',
    ]);

    const f = filtrosUsuarioSQL('u', filtros);

    const vehiculos = await query(`
        SELECT
            v.*,
            u.nombre, u.apPaterno, u.apMaterno,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            s.nombre_sucursal,
            p.nombre_puesto
        FROM vehiculos v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY s.nombre_sucursal, nombre_departamento, u.apPaterno, u.nombre
    `, f.values);

    for (const v of vehiculos) {
        addStyledRow(ws, [
            v.usuarioId,
            nombreCompleto(v),
            v.nombre_sucursal,
            v.nombre_departamento,
            v.nombre_puesto,
            v.vehiculoId,
            v.tiene_vehiculo ? 'Sí' : 'No',
            v.tipo, v.marca, v.modelo, v.anio, v.color, v.placas, v.num_serie,
        ]);
    }
}

async function agregarHojaHijos(wb, filtros = {}) {
    const ws = wb.addWorksheet('Hijos');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 24 }, { width: 18 }, { width: 14 }, { width: 14 },
    ];

    addHeader(ws, [
        'ID Empleado', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Nombre Hijo', 'Fecha Nacimiento', 'Edad', 'Género',
    ]);

    const f = filtrosUsuarioSQL('u', filtros);

    const hijos = await query(`
        SELECT
            h.hijoId,
            h.nombre AS nombre_hijo,
            h.fecha_nacimiento,
            h.genero,
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto
        FROM hijos h
        LEFT JOIN usuarios u ON h.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY s.nombre_sucursal, nombre_departamento, u.apPaterno, u.nombre, h.nombre
    `, f.values);

    for (const h of hijos) {
        addStyledRow(ws, [
            h.usuarioId,
            nombreCompleto(h),
            h.nombre_sucursal,
            h.nombre_departamento,
            h.nombre_puesto,
            h.nombre_hijo,
            fmtDate(h.fecha_nacimiento),
            calcularEdad(h.fecha_nacimiento),
            h.genero,
        ]);
    }
}

async function agregarHojaVacaciones(wb, filtros = {}) {
    const ws = wb.addWorksheet('Vacaciones');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 16 }, { width: 16 }, { width: 8 }, { width: 18 }, { width: 18 }, { width: 18 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Fecha Inicio', 'Fecha Fin', 'Días', 'Estado Final', 'Resp. Jefe', 'Resp. RH',
    ]);

    const f = filtrosUsuarioSQL('u', filtros);

    const vacaciones = await query(`
        SELECT
            v.vacacionesId,
            u.nombre, u.apPaterno, u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto,
            v.fecha_inicio_vacaciones,
            v.fecha_fin_vacaciones,
            v.dias_solicitados,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH
        FROM vacaciones v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY v.fecha_inicio_vacaciones DESC
    `, f.values);

    for (const v of vacaciones) {
        addStyledRow(ws, [
            v.vacacionesId,
            nombreCompleto(v),
            v.nombre_sucursal,
            v.nombre_departamento,
            v.nombre_puesto,
            fmtDate(v.fecha_inicio_vacaciones),
            fmtDate(v.fecha_fin_vacaciones),
            v.dias_solicitados,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH,
        ]);
    }
}

async function agregarHojaEvaluaciones(wb, filtros = {}) {
    const ws = wb.addWorksheet('Evaluaciones');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 18 }, { width: 24 }, { width: 12 }, { width: 16 },
        { width: 34 }, { width: 34 }, { width: 34 }, { width: 34 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Fecha Evaluación', 'Periodo', 'Promedio', 'Recontratación',
        'Comentario Empleado', 'Comentario Jefe', 'Comentario Siguiente Evaluación', 'Comentario Final',
    ]);

    const f = filtrosUsuarioSQL('u', filtros);

    const evaluaciones = await query(`
        SELECT
            e.evaluacionesId,
            u.nombre, u.apPaterno, u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto,
            e.fecha_evaluacion,
            pe.periodo,
            e.promedio_final,
            e.recontratacion,
            e.comentario_empleado,
            e.comentario_jefe_inmediato,
            e.comentario_siguiente_evaluacion,
            e.comentario_final
        FROM evaluaciones e
        LEFT JOIN usuarios u ON e.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN periodoevaluaciones pe ON e.periodo_evaluacionesId = pe.periodo_evaluacionesId
        WHERE 1 = 1
        ${f.where}
        ORDER BY e.fecha_evaluacion DESC
    `, f.values);

    for (const e of evaluaciones) {
        addStyledRow(ws, [
            e.evaluacionesId,
            nombreCompleto(e),
            e.nombre_sucursal,
            e.nombre_departamento,
            e.nombre_puesto,
            fmtDate(e.fecha_evaluacion),
            e.periodo,
            e.promedio_final,
            e.recontratacion,
            e.comentario_empleado,
            e.comentario_jefe_inmediato,
            e.comentario_siguiente_evaluacion,
            e.comentario_final,
        ]);
    }
}

async function agregarHojaPermisos(wb, filtros = {}) {
    const ws = wb.addWorksheet('Permisos');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 },
        { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 },
        { width: 18 }, { width: 18 }, { width: 18 }, { width: 40 }, { width: 20 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Fecha Elaboración', 'Fecha Permiso', 'Tipo', 'Días', 'Horas',
        'Goce Sueldo', 'Estado', 'Hora Inicio', 'Hora Fin',
        'Fecha Inicio', 'Fecha Fin', 'Repone Días', 'Mes Repone',
        'Motivo / Observaciones', 'Fecha Registro',
    ]);

    const f = filtrosUsuarioSQL('u', filtros);

    const permisos = await query(`
        SELECT
            pe.*,
            u.nombre, u.apPaterno, u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto
        FROM permisos pe
        LEFT JOIN usuarios u ON pe.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY pe.fecha_permiso DESC
    `, f.values);

    for (const p of permisos) {
        addStyledRow(ws, [
            p.permisoId,
            nombreCompleto(p),
            p.nombre_sucursal,
            p.nombre_departamento,
            p.nombre_puesto,
            fmtDate(p.fecha_elaboracion),
            fmtDate(p.fecha_permiso),
            p.tipo === 'dia' ? 'Por día' : 'Por horas',
            p.num_dias || '',
            p.num_horas || '',
            p.goce_sueldo,
            p.estado,
            p.hora_inicio || '',
            p.hora_fin || '',
            fmtDate(p.fecha_inicio),
            fmtDate(p.fecha_fin),
            p.repone_dias || '',
            p.repone_mes || '',
            p.motivo || p.observaciones || '',
            fmtDateTime(p.createdAt),
        ]);
    }
}

async function agregarHojaLogs(wb) {
    const ws = wb.addWorksheet('Historial Exportaciones');
    ws.columns = [
        { width: 8 }, { width: 18 }, { width: 28 }, { width: 24 }, { width: 18 },
    ];

    addHeader(ws, ['ID', 'Usuario', 'Nombre', 'Fecha y Hora', 'IP'], fillGray);

    const logs = await query(`
        SELECT
            l.logId,
            l.usuario,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            l.fecha,
            l.ip
        FROM export_logs l
        LEFT JOIN usuarios u ON l.usuarioId = u.usuarioId
        ORDER BY l.fecha DESC
    `);

    for (const l of logs) {
        addStyledRow(ws, [
            l.logId,
            l.usuario,
            nombreCompleto(l),
            fmtDateTime(l.fecha),
            l.ip,
        ]);
    }
}

async function agregarHojaBajas(wb, filtros = {}) {
    const ws = wb.addWorksheet('Bajas');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 22 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 24 },
        { width: 16 }, { width: 16 }, { width: 40 }, { width: 40 }, { width: 20 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Usuario', 'Sucursal', 'Departamento',
        'Puesto', 'Fecha Contratación', 'Sueldo', 'Fecha Baja',
        'Motivo Baja', 'Tiempo Laboral', 'Finiquito', 'Detalle', 'Observaciones', 'Fecha Registro',
    ], fillGray);

    const f = filtrosUsuarioSQL('u', filtros);

    const bajas = await query(`
        SELECT
            b.*,
            s.nombre_sucursal,
            COALESCE(d.nombre, b.departamento) AS nombre_departamento
        FROM bajas b
        LEFT JOIN usuarios u ON b.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY b.fecha_baja DESC, b.createdAt DESC
    `, f.values);

    for (const b of bajas) {
        addStyledRow(ws, [
            b.bajaId,
            nombreCompleto(b),
            b.usuario,
            b.nombre_sucursal,
            b.nombre_departamento || b.departamento,
            b.puesto,
            fmtDate(b.fecha_contratacion),
            b.sueldo ? Number(b.sueldo) : '',
            fmtDate(b.fecha_baja),
            b.motivo_baja,
            b.tiempo_laboral,
            b.finiquito ? Number(b.finiquito) : '',
            b.motivo_detalle,
            b.observaciones,
            fmtDateTime(b.createdAt),
        ]);
    }
}

async function agregarHojaVacantes(wb, filtros = {}) {
    const ws = wb.addWorksheet('Solicitudes Vacantes');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 22 },
        { width: 26 }, { width: 10 }, { width: 18 }, { width: 16 }, { width: 18 },
        { width: 40 }, { width: 40 }, { width: 34 }, { width: 18 }, { width: 20 },
    ];

    addHeader(ws, [
        'ID', 'Solicitante', 'Sucursal', 'Departamento Solicitante', 'Departamento Vacante',
        'Puesto Solicitado', 'Plazas', 'Prioridad', 'Estado', 'Fecha Requerida',
        'Motivo', 'Descripción', 'Requisitos', 'Notas RH', 'Fecha Registro',
    ], fillGray);

    const f = filtrosUsuarioSQL('u', filtros);

    const vacantes = await query(`
        SELECT
            v.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento
        FROM vacantes v
        LEFT JOIN usuarios u ON v.solicitanteId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY v.createdAt DESC
    `, f.values);

    for (const v of vacantes) {
        addStyledRow(ws, [
            v.vacanteId,
            nombreCompleto(v),
            v.nombre_sucursal,
            v.nombre_departamento,
            v.departamento,
            v.puesto,
            v.num_plazas,
            v.prioridad,
            v.estado,
            fmtDate(v.fecha_requerida),
            v.motivo,
            v.descripcion,
            v.requisitos,
            v.notas_rh,
            fmtDateTime(v.createdAt),
        ]);
    }
}

async function agregarHojaCumpleanos(wb, filtros = {}) {
    const ws = wb.addWorksheet('Cumpleaños');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 18 }, { width: 14 }, { width: 14 }, { width: 22 },
    ];

    addHeader(ws, [
        'ID Empleado', 'Empleado', 'Usuario', 'Sucursal', 'Departamento',
        'Fecha Nacimiento', 'Edad', 'Mes/Día', 'Puesto',
    ], fillBlue);

    const f = filtrosUsuarioSQL('u', filtros);

    const cumpleanos = await query(`
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            u.fecha_nacimiento,
            p.nombre_puesto
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE u.fecha_nacimiento IS NOT NULL
        ${f.where}
        ORDER BY MONTH(u.fecha_nacimiento), DAY(u.fecha_nacimiento), u.apPaterno
    `, f.values);

    for (const c of cumpleanos) {
        const fecha = c.fecha_nacimiento ? new Date(c.fecha_nacimiento) : null;
        const mesDia = fecha
            ? `${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${String(fecha.getUTCDate()).padStart(2, '0')}`
            : '';

        addStyledRow(ws, [
            c.usuarioId,
            nombreCompleto(c),
            c.usuario,
            c.nombre_sucursal,
            c.nombre_departamento,
            fmtDate(c.fecha_nacimiento),
            calcularEdad(c.fecha_nacimiento),
            mesDia,
            c.nombre_puesto,
        ]);
    }
}

async function agregarHojaDescuentos(wb, filtros = {}) {
    const ws = wb.addWorksheet('Descuentos');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 22 },
        { width: 24 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 },
        { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 14 },
        { width: 20 }, { width: 18 }, { width: 30 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Concepto', 'Monto', 'Monto Total', 'Monto Por Pago', 'Pagos',
        'Pagos Realizados', 'Fecha Inicio', 'Próximo Pago', 'Último Pago',
        'Tipo', 'Periodicidad', 'Estado', 'Observaciones',
    ], fillBlue);

    const f = filtrosUsuarioSQL('u', filtros);

    const descuentos = await query(`
        SELECT
            de.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto
        FROM descuentos de
        LEFT JOIN usuarios u ON de.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY de.createdAt DESC
    `, f.values);

    for (const d of descuentos) {
        addStyledRow(ws, [
            d.descuentoId,
            nombreCompleto(d),
            d.nombre_sucursal,
            d.nombre_departamento,
            d.nombre_puesto,
            d.concepto,
            d.monto ? Number(d.monto) : '',
            d.monto_total ? Number(d.monto_total) : '',
            d.monto_por_pago ? Number(d.monto_por_pago) : '',
            d.total_pagos || '',
            d.pagos_realizados || 0,
            fmtDate(d.fecha_inicio),
            fmtDate(d.fecha_proximo_pago),
            fmtDate(d.fecha_ultimo_pago),
            d.tipo,
            d.periodicidad,
            d.estado,
            d.observaciones,
        ]);
    }
}


async function agregarHojaUniformes(wb, filtros = {}) {
    const ws = wb.addWorksheet('Uniformes');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 22 },
        { width: 12 }, { width: 20 }, { width: 18 }, { width: 12 }, { width: 16 },
        { width: 34 }, { width: 18 }, { width: 18 },
    ];

    addHeader(ws, [
        'ID Empleado', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Uniforme ID', 'Tipo', 'Color / Modelo', 'Talla', 'Cantidad',
        'Observaciones', 'Fecha Entrega', 'Fecha Registro',
    ], fillBlue);

    const f = filtrosUsuarioSQL('u', filtros);

    const uniformes = await query(`
        SELECT
            ue.uniformeId,
            ue.usuarioId,
            ue.tipo,
            ue.descripcion,
            ue.talla,
            ue.cantidad,
            ue.fecha_entrega,
            ue.observaciones,
            ue.createdAt,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto
        FROM usuario_uniformes ue
        LEFT JOIN usuarios u ON ue.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE COALESCE(ue.activo, 1) = 1
        ${f.where}
        ORDER BY s.nombre_sucursal, nombre_departamento, u.apPaterno, u.nombre, ue.fecha_entrega DESC, ue.uniformeId DESC
    `, f.values);

    for (const u of uniformes) {
        addStyledRow(ws, [
            u.usuarioId,
            nombreCompleto(u),
            u.nombre_sucursal,
            u.nombre_departamento,
            u.nombre_puesto,
            u.uniformeId,
            u.tipo,
            u.descripcion,
            u.talla,
            u.cantidad ? Number(u.cantidad) : '',
            u.observaciones,
            fmtDate(u.fecha_entrega),
            fmtDateTime(u.createdAt),
        ]);
    }
}

async function agregarHojaQuejasSugerencias(wb, filtros = {}) {
    const ws = wb.addWorksheet('Quejas y Sugerencias');
    ws.columns = [
        { width: 8 }, { width: 18 }, { width: 28 }, { width: 18 }, { width: 18 },
        { width: 20 }, { width: 22 }, { width: 22 }, { width: 16 }, { width: 14 },
        { width: 50 }, { width: 70 }, { width: 30 }, { width: 70 }, { width: 18 },
        { width: 24 }, { width: 24 },
    ];

    addHeader(ws, [
        'ID', 'Folio', 'Nombre', 'Sucursal', 'Departamento',
        'Área', 'Área Otro', 'Categoría', 'Estado', 'Prioridad',
        'Descripción', 'Foto URL', 'Public ID', 'Respuesta RH', 'Atendido Por',
        'Fecha Registro', 'Fecha Actualización',
    ], fillBlue);

    const f = filtrosQuejasSugerenciasSQL(filtros);

    const registros = await query(`
        SELECT
            qs.quejaSugerenciaId,
            qs.folio,
            qs.anonimo,
            qs.nombre,
            qs.usuarioId,
            qs.area,
            qs.area_otro,
            qs.categoria,
            qs.categoria_otro,
            qs.descripcion,
            qs.foto_url,
            qs.foto_public_id,
            qs.estado,
            qs.prioridad,
            qs.respuesta_rh,
            qs.createdAt,
            qs.updatedAt,
            qs.atendidoAt,
            COALESCE(s.nombre_sucursal, qs.sucursal_texto) AS nombre_sucursal,
            COALESCE(d.nombre, qs.departamento_texto) AS nombre_departamento,
            u.nombre AS nombre_empleado,
            u.apPaterno,
            u.apMaterno,
            atendio.usuario AS atendido_por_usuario
        FROM quejas_sugerencias qs
        LEFT JOIN usuarios u ON qs.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON qs.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON qs.departamentoId = d.departamentoId
        LEFT JOIN usuarios atendio ON qs.atendidoPor = atendio.usuarioId
        WHERE 1 = 1
        ${f.where}
        ORDER BY qs.createdAt DESC
    `, f.values);

    for (const q of registros) {
        const nombre = q.anonimo ? 'ANÓNIMO' : (q.nombre || nombreCompleto(q));

        addStyledRow(ws, [
            q.quejaSugerenciaId,
            q.folio,
            nombre,
            q.nombre_sucursal,
            q.nombre_departamento,
            q.area,
            q.area_otro,
            q.categoria_otro || q.categoria,
            q.estado,
            q.prioridad,
            q.descripcion,
            q.foto_url,
            q.foto_public_id,
            q.respuesta_rh,
            q.atendido_por_usuario,
            fmtDateTime(q.createdAt),
            fmtDateTime(q.updatedAt),
        ]);
    }
}

async function agregarHojaDocumentosEmpleado(wb, filtros = {}) {
    const ws = wb.addWorksheet('Documentos Empleado');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 18 }, { width: 34 }, { width: 70 }, { width: 20 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Puesto',
        'Tipo', 'Nombre Documento', 'URL', 'Fecha Registro',
    ], fillBlue);

    const f = filtrosUsuarioSQL('u', filtros);

    const docs = await query(`
        SELECT
            doc.*,
            u.nombre AS nombre_empleado,
            u.apPaterno,
            u.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS nombre_departamento,
            p.nombre_puesto
        FROM documentos_empleado doc
        LEFT JOIN usuarios u ON doc.usuarioId = u.usuarioId
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY doc.createdAt DESC
    `, f.values);

    for (const d of docs) {
        addStyledRow(ws, [
            d.documentoId,
            `${d.nombre_empleado || ''} ${d.apPaterno || ''} ${d.apMaterno || ''}`.trim(),
            d.nombre_sucursal,
            d.nombre_departamento,
            d.nombre_puesto,
            d.tipo,
            d.nombre,
            d.url,
            fmtDateTime(d.createdAt),
        ]);
    }
}

async function agregarHojaDocumentosRH(wb, filtros = {}) {
    const f = filtrosUsuarioSQL('e', filtros);

    const wsActas = wb.addWorksheet('Actas RH');
    wsActas.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 12 },
        { width: 16 }, { width: 40 }, { width: 40 }, { width: 40 }, { width: 40 }, { width: 24 }, { width: 20 },
    ];

    addHeader(wsActas, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Fecha', 'Hora', 'Fracción Art. 47',
        'Falta', 'Declaración', 'Sanción', 'Observaciones', 'Registrado Por', 'Fecha Registro',
    ], fillBlue);

    const actas = await query(`
        SELECT
            a.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, e.departamento) AS nombre_departamento,
            r.usuario AS registrado_por_usuario
        FROM actas_administrativas a
        LEFT JOIN usuarios e ON a.usuarioId = e.usuarioId
        LEFT JOIN sucursales s ON e.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON e.departamentoId = d.departamentoId
        LEFT JOIN usuarios r ON a.registrado_por = r.usuarioId
        WHERE 1 = 1
        ${f.where}
        ORDER BY a.fecha DESC, a.createdAt DESC
    `, f.values);

    for (const a of actas) {
        addStyledRow(wsActas, [
            a.actaId,
            nombreCompleto(a),
            a.nombre_sucursal,
            a.nombre_departamento,
            fmtDate(a.fecha),
            a.hora,
            a.fraccion_art47,
            a.falta,
            a.declaracion,
            a.sancion,
            a.observaciones,
            a.registrado_por_usuario,
            fmtDateTime(a.createdAt),
        ]);
    }

    const wsCartas = wb.addWorksheet('Cartas Compromiso');
    wsCartas.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 16 },
        { width: 30 }, { width: 50 }, { width: 24 }, { width: 20 },
    ];

    addHeader(wsCartas, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Fecha', 'Asunto', 'Descripción',
        'Registrado Por', 'Fecha Registro',
    ], fillBlue);

    const cartas = await query(`
        SELECT
            c.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, e.departamento) AS nombre_departamento,
            r.usuario AS registrado_por_usuario
        FROM cartas_compromiso c
        LEFT JOIN usuarios e ON c.usuarioId = e.usuarioId
        LEFT JOIN sucursales s ON e.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON e.departamentoId = d.departamentoId
        LEFT JOIN usuarios r ON c.registrado_por = r.usuarioId
        WHERE 1 = 1
        ${f.where}
        ORDER BY c.fecha DESC, c.createdAt DESC
    `, f.values);

    for (const c of cartas) {
        addStyledRow(wsCartas, [
            c.cartaId,
            nombreCompleto(c),
            c.nombre_sucursal,
            c.nombre_departamento,
            fmtDate(c.fecha),
            c.asunto,
            c.descripcion,
            c.registrado_por_usuario,
            fmtDateTime(c.createdAt),
        ]);
    }

    const wsResponsivas = wb.addWorksheet('Responsivas EPP');
    wsResponsivas.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 16 },
        { width: 22 }, { width: 40 }, { width: 24 }, { width: 20 },
    ];

    addHeader(wsResponsivas, [
        'ID', 'Empleado', 'Sucursal', 'Departamento', 'Fecha', 'Lugar', 'Observaciones',
        'Registrado Por', 'Fecha Registro',
    ], fillBlue);

    const responsivas = await query(`
        SELECT
            resp.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, e.departamento) AS nombre_departamento,
            u.usuario AS registrado_por_usuario
        FROM responsivas_epp resp
        LEFT JOIN usuarios e ON resp.usuarioId = e.usuarioId
        LEFT JOIN sucursales s ON e.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON e.departamentoId = d.departamentoId
        LEFT JOIN usuarios u ON resp.registrado_por = u.usuarioId
        WHERE 1 = 1
        ${f.where}
        ORDER BY resp.fecha DESC, resp.createdAt DESC
    `, f.values);

    for (const r of responsivas) {
        addStyledRow(wsResponsivas, [
            r.responsivaId,
            nombreCompleto(r),
            r.nombre_sucursal,
            r.nombre_departamento,
            fmtDate(r.fecha),
            r.lugar,
            r.observaciones,
            r.registrado_por_usuario,
            fmtDateTime(r.createdAt),
        ]);
    }

    const wsItems = wb.addWorksheet('Items EPP');
    wsItems.columns = [
        { width: 8 }, { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 },
        { width: 12 }, { width: 38 }, { width: 26 }, { width: 18 },
    ];

    addHeader(wsItems, [
        'Item ID', 'Responsiva ID', 'Empleado', 'Sucursal', 'Departamento',
        'Cantidad', 'Descripción', 'Marca / Modelo', 'Estado',
    ], fillBlue);

    const items = await query(`
        SELECT
            i.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno,
            s.nombre_sucursal,
            COALESCE(d.nombre, e.departamento) AS nombre_departamento
        FROM responsivas_epp_items i
        LEFT JOIN responsivas_epp resp ON i.responsivaId = resp.responsivaId
        LEFT JOIN usuarios e ON resp.usuarioId = e.usuarioId
        LEFT JOIN sucursales s ON e.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON e.departamentoId = d.departamentoId
        WHERE 1 = 1
        ${f.where}
        ORDER BY i.responsivaId DESC, i.itemId
    `, f.values);

    for (const i of items) {
        addStyledRow(wsItems, [
            i.itemId,
            i.responsivaId,
            nombreCompleto(i),
            i.nombre_sucursal,
            i.nombre_departamento,
            i.cantidad,
            i.descripcion,
            i.marca_modelo,
            i.estado,
        ]);
    }
}

// ─────────────────────────────────────────────────────────────
// EXPORTACIÓN GENERAL / POR SECCIÓN / POR EMPLEADO
// ─────────────────────────────────────────────────────────────

async function generarExcelBD(seccion = 'general', filtros = {}) {
    const wb = crearWorkbook();
    const normalizada = String(seccion || 'general').toLowerCase();
    const filtrosNormalizados = normalizarFiltros(filtros);

    if (!SECCIONES_VALIDAS.includes(normalizada)) {
        throw new Error(`Sección inválida: ${seccion}`);
    }

    const agregarTodas = async () => {
        await agregarHojaEmpleados(wb, filtrosNormalizados);
        await agregarHojaVehiculos(wb, filtrosNormalizados);
        await agregarHojaHijos(wb, filtrosNormalizados);
        await agregarHojaVacaciones(wb, filtrosNormalizados);
        await agregarHojaEvaluaciones(wb, filtrosNormalizados);
        await agregarHojaPermisos(wb, filtrosNormalizados);
        await agregarHojaBajas(wb, filtrosNormalizados);
        await agregarHojaVacantes(wb, filtrosNormalizados);
        await agregarHojaCumpleanos(wb, filtrosNormalizados);
        await agregarHojaDescuentos(wb, filtrosNormalizados);
        await agregarHojaUniformes(wb, filtrosNormalizados);
        await agregarHojaQuejasSugerencias(wb, filtrosNormalizados);
        await agregarHojaDocumentosEmpleado(wb, filtrosNormalizados);
        await agregarHojaDocumentosRH(wb, filtrosNormalizados);
        await agregarHojaLogs(wb);
    };

    if (normalizada === 'general') await agregarTodas();
    if (normalizada === 'empleados') await agregarHojaEmpleados(wb, filtrosNormalizados);
    if (normalizada === 'vehiculos') await agregarHojaVehiculos(wb, filtrosNormalizados);
    if (normalizada === 'hijos') await agregarHojaHijos(wb, filtrosNormalizados);
    if (normalizada === 'vacaciones') await agregarHojaVacaciones(wb, filtrosNormalizados);
    if (normalizada === 'evaluaciones') await agregarHojaEvaluaciones(wb, filtrosNormalizados);
    if (normalizada === 'permisos') await agregarHojaPermisos(wb, filtrosNormalizados);
    if (normalizada === 'logs') await agregarHojaLogs(wb);
    if (normalizada === 'bajas') await agregarHojaBajas(wb, filtrosNormalizados);
    if (normalizada === 'vacantes') await agregarHojaVacantes(wb, filtrosNormalizados);
    if (normalizada === 'cumpleanos') await agregarHojaCumpleanos(wb, filtrosNormalizados);
    if (normalizada === 'descuentos') await agregarHojaDescuentos(wb, filtrosNormalizados);
    if (normalizada === 'uniformes') await agregarHojaUniformes(wb, filtrosNormalizados);
    if (normalizada === 'quejas_sugerencias') await agregarHojaQuejasSugerencias(wb, filtrosNormalizados);
    if (normalizada === 'documentos_empleado') await agregarHojaDocumentosEmpleado(wb, filtrosNormalizados);
    if (normalizada === 'documentos_rh') await agregarHojaDocumentosRH(wb, filtrosNormalizados);

    return await wb.xlsx.writeBuffer();
}

async function generarExcelEmpleadoCompleto(usuarioId) {
    const wb = crearWorkbook();
    const filtros = normalizarFiltros({ usuarioId });

    const existe = await query(
        'SELECT usuarioId FROM usuarios WHERE usuarioId = ? LIMIT 1',
        [filtros.usuarioId]
    );

    if (existe.length === 0) {
        throw new Error('Empleado no encontrado');
    }

    await agregarHojaEmpleados(wb, filtros);
    await agregarHojaVehiculos(wb, filtros);
    await agregarHojaHijos(wb, filtros);
    await agregarHojaVacaciones(wb, filtros);
    await agregarHojaEvaluaciones(wb, filtros);
    await agregarHojaPermisos(wb, filtros);
    await agregarHojaBajas(wb, filtros);
    await agregarHojaVacantes(wb, filtros);
    await agregarHojaCumpleanos(wb, filtros);
    await agregarHojaDescuentos(wb, filtros);
    await agregarHojaUniformes(wb, filtros);
    await agregarHojaDocumentosEmpleado(wb, filtros);
    await agregarHojaDocumentosRH(wb, filtros);

    return await wb.xlsx.writeBuffer();
}

// ─────────────────────────────────────────────────────────────
// EXPORTACIÓN PARA CONTRATO POR EMPLEADO
// ─────────────────────────────────────────────────────────────

async function generarExcelContrato(usuarioId) {
    const wb = crearWorkbook();

    const rows = await query(`
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            s.nombre_sucursal,
            COALESCE(d.nombre, u.departamento) AS departamento,
            p.nombre_puesto AS puesto,
            r.nombre_rol,
            u.genero,
            u.fecha_nacimiento,
            u.estado_civil,
            u.celular,
            u.domicilio_calle,
            u.domicilio_colonia,
            u.domicilio_localidad,
            u.domicilio_cp,
            u.domicilio_num_ext,
            u.domicilio_num_int,
            u.domicilio_municipio,
            u.domicilio_estado,
            u.RFC,
            u.curp,
            u.numero_seguro_social,
            u.nombre_banco,
            u.numero_cuenta,
            u.clabe_interbancaria,
            u.razon_social,
            u.sueldo,
            u.sueldo_bruto,
            u.fondo_ahorro,
            u.sueldo_neto,
            u.sueldo_compensacion,
            u.sueldo_final,
            u.fechaContratacion,
            DATE_ADD(u.fechaContratacion, INTERVAL 1 MONTH) AS fecha_primer_mes_evaluacion,
            u.emergencia_nombre,
            u.emergencia_telefono,
            u.emergencia_parentesco
        FROM usuarios u
        LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
        LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN roles r ON u.rolId = r.rolId
        WHERE u.usuarioId = ?
        LIMIT 1
    `, [usuarioId]);

    if (rows.length === 0) {
        throw new Error('Empleado no encontrado');
    }

    const e = rows[0];

    const direccion = [
        e.domicilio_calle,
        e.domicilio_num_ext ? `No. ${e.domicilio_num_ext}` : '',
        e.domicilio_num_int ? `Int. ${e.domicilio_num_int}` : '',
        e.domicilio_colonia,
        e.domicilio_localidad,
        e.domicilio_municipio,
        e.domicilio_estado,
    ].filter(Boolean).join(', ');

    const ws = wb.addWorksheet('Datos Contrato');
    ws.columns = [{ width: 34 }, { width: 70 }];

    const titulo = ws.addRow(['DIAGSA — Datos para contrato']);
    titulo.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titulo.fill = fillRed;
    titulo.alignment = { horizontal: 'center' };
    ws.mergeCells('A1:B1');

    const subtitulo = ws.addRow([
        'Empleado',
        `${e.nombre || ''} ${e.apPaterno || ''} ${e.apMaterno || ''}`.trim(),
    ]);
    styleRow(subtitulo);

    ws.addRow([]);

    const datos = [
        ['Nombre', e.nombre || ''],
        ['Apellido paterno', e.apPaterno || ''],
        ['Apellido materno', e.apMaterno || ''],
        ['Usuario', e.usuario || ''],
        ['Sucursal', e.nombre_sucursal || ''],
        ['Departamento', e.departamento || ''],
        ['Puesto', e.puesto || ''],
        ['Rol', e.nombre_rol || ''],
        ['Género', e.genero || ''],
        ['Edad', calcularEdad(e.fecha_nacimiento)],
        ['Fecha nacimiento', fmtDate(e.fecha_nacimiento)],
        ['Estado civil', e.estado_civil || ''],
        ['Celular', e.celular || ''],
        ['Dirección', direccion],
        ['Código postal', e.domicilio_cp || ''],
        ['Estado', e.domicilio_estado || ''],
        ['RFC', e.RFC || ''],
        ['CURP', e.curp || ''],
        ['NSS', e.numero_seguro_social || ''],
        ['Razón social', e.razon_social || ''],
        ['Banco', e.nombre_banco || ''],
        ['Cuenta', e.numero_cuenta || ''],
        ['CLABE', e.clabe_interbancaria || ''],
        ['Sueldo', e.sueldo || ''],
        ['Sueldo bruto', e.sueldo_bruto || ''],
        ['Fondo ahorro', e.fondo_ahorro || ''],
        ['Sueldo neto', e.sueldo_neto || ''],
        ['Compensación', e.sueldo_compensacion || ''],
        ['Sueldo final', e.sueldo_final || ''],
        ['Fecha de ingreso', fmtDate(e.fechaContratacion)],
        ['Fecha 1er mes de evaluación', fmtDate(e.fecha_primer_mes_evaluacion)],
        ['Contacto de emergencia', e.emergencia_nombre || ''],
        ['Teléfono emergencia', e.emergencia_telefono || ''],
        ['Parentesco contacto emergencia', e.emergencia_parentesco || ''],
    ];

    const fillLightGray = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };

    for (const [campo, valor] of datos) {
        const row = ws.addRow([campo, valor]);
        styleRow(row);
        row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF222222' } };
        row.getCell(1).fill = fillLightGray;
        row.getCell(2).font = { name: 'Arial', size: 10, color: { argb: 'FF222222' } };
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    }

    return await wb.xlsx.writeBuffer();
}

module.exports = {
    generarExcelBD,
    generarExcelContrato,
    generarExcelEmpleadoCompleto,
    registrarLog,
    getExportLogs,
    SECCIONES_VALIDAS,
};
