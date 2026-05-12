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
    'documentos_empleado',
    'documentos_rh',
];

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

function crearWorkbook() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DIAGSA';
    wb.created = new Date();
    return wb;
}

const fillRed = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
const fillGray = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } };
const fillBlue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };

const borderThin = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
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
    row.height = 22;
}

function styleRow(row) {
    row.eachCell(cell => {
        cell.font = { name: 'Arial', size: 9 };
        cell.border = borderThin;
        cell.alignment = {
            horizontal: 'left',
            vertical: 'middle',
            wrapText: true,
        };
    });
    row.height = 18;
}

function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-MX', { timeZone: 'UTC' });
}

function fmtDateTime(d) {
    if (!d) return '';
    return new Date(d).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
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

// ─────────────────────────────────────────────────────────────
// HOJAS DE EXPORTACIÓN
// ─────────────────────────────────────────────────────────────

async function agregarHojaEmpleados(wb) {
    const ws = wb.addWorksheet('Empleados');

    ws.columns = [
        { width: 8 }, { width: 20 }, { width: 20 }, { width: 20 },
        { width: 18 }, { width: 22 }, { width: 24 }, { width: 18 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
        { width: 14 }, { width: 18 }, { width: 18 }, { width: 20 },
        { width: 16 }, { width: 18 }, { width: 18 }, { width: 20 },
        { width: 16 }, { width: 18 }, { width: 20 }, { width: 22 },
        { width: 16 }, { width: 18 }, { width: 18 }, { width: 16 },
        { width: 28 }, { width: 24 }, { width: 24 }, { width: 12 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];

    const headers = [
        'ID', 'Nombre', 'Ap. Paterno', 'Ap. Materno', 'Usuario',
        'Departamento', 'Puesto', 'Rol',
        'Fecha Contratación', 'Sueldo', 'Sueldo Bruto', 'Fondo Ahorro', 'Sueldo Neto',
        'Género', 'Estado Civil', 'Celular', 'Fecha Nacimiento',
        'RFC', 'CURP', 'NSS', 'Es Padre/Madre',
        'Fecha Contrato Indef.', 'Jefe Inmediato',
        'Razón Social', 'Banco', 'Cuenta', 'CLABE', 'CP Fiscal',
        'Contacto Emergencia', 'Tel. Emergencia', 'Parentesco',
        'CP Domicilio', 'Estado Domicilio', 'T. Playera', 'T. Pantalón',
        'T. Calzado', 'T. Faja', 'T. Guantes',
    ];

    addHeader(ws, headers, fillRed);

    const empleados = await query(`
        SELECT
            u.usuarioId, u.nombre, u.apPaterno, u.apMaterno, u.usuario,
            u.departamento, p.nombre_puesto, r.nombre_rol,
            u.fechaContratacion, u.sueldo, u.sueldo_bruto, u.fondo_ahorro, u.sueldo_neto,
            u.genero, u.estado_civil, u.celular, u.fecha_nacimiento,
            u.RFC, u.curp, u.numero_seguro_social, u.es_padre_madre,
            u.fecha_contrato_indeterminado_3m, u.jefe_inmediato,
            u.razon_social, u.nombre_banco, u.numero_cuenta, u.clabe_interbancaria,
            u.codigo_postal_fiscal,
            u.emergencia_nombre, u.emergencia_telefono, u.emergencia_parentesco,
            u.domicilio_cp, u.domicilio_estado,
            u.talla_playera, u.talla_pantalon, u.talla_calzado,
            u.talla_faja, u.talla_guantes
        FROM usuarios u
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        LEFT JOIN roles  r ON u.rolId    = r.rolId
        ORDER BY u.apPaterno, u.nombre
    `);

    for (const e of empleados) {
        addStyledRow(ws, [
            e.usuarioId, e.nombre, e.apPaterno, e.apMaterno, e.usuario,
            e.departamento, e.nombre_puesto, e.nombre_rol,
            fmtDate(e.fechaContratacion),
            e.sueldo ? Number(e.sueldo) : '',
            e.sueldo_bruto ? Number(e.sueldo_bruto) : '',
            e.fondo_ahorro ? Number(e.fondo_ahorro) : '',
            e.sueldo_neto ? Number(e.sueldo_neto) : '',
            e.genero, e.estado_civil, e.celular, fmtDate(e.fecha_nacimiento),
            e.RFC, e.curp, e.numero_seguro_social, e.es_padre_madre,
            fmtDate(e.fecha_contrato_indeterminado_3m), e.jefe_inmediato,
            e.razon_social, e.nombre_banco, e.numero_cuenta, e.clabe_interbancaria,
            e.codigo_postal_fiscal,
            e.emergencia_nombre, e.emergencia_telefono, e.emergencia_parentesco,
            e.domicilio_cp, e.domicilio_estado,
            e.talla_playera, e.talla_pantalon, e.talla_calzado,
            e.talla_faja, e.talla_guantes,
        ]);
    }
}

async function agregarHojaVehiculos(wb) {
    const ws = wb.addWorksheet('Vehículos');
    ws.columns = [
        { width: 8 }, { width: 26 }, { width: 18 }, { width: 14 },
        { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 },
        { width: 16 }, { width: 16 }, { width: 24 },
    ];

    addHeader(ws, [
        'ID Empleado', 'Empleado', 'Departamento', 'Tiene Vehículo',
        'Tipo', 'Marca', 'Modelo', 'Año', 'Color', 'Placas', 'No. Serie',
    ]);

    const vehiculos = await query(`
        SELECT
            v.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.departamento
        FROM vehiculos v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        ORDER BY u.apPaterno, u.nombre
    `);

    for (const v of vehiculos) {
        addStyledRow(ws, [
            v.usuarioId,
            `${v.nombre || ''} ${v.apPaterno || ''} ${v.apMaterno || ''}`.trim(),
            v.departamento,
            v.tiene_vehiculo ? 'Sí' : 'No',
            v.tipo, v.marca, v.modelo, v.anio, v.color, v.placas, v.num_serie,
        ]);
    }
}

async function agregarHojaHijos(wb) {
    const ws = wb.addWorksheet('Hijos');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 24 }, { width: 18 }, { width: 14 },
    ];

    addHeader(ws, [
        'ID Empleado', 'Empleado', 'Nombre Hijo', 'Fecha Nacimiento', 'Género',
    ]);

    const hijos = await query(`
        SELECT
            h.hijoId,
            h.nombre AS nombre_hijo,
            h.fecha_nacimiento,
            h.genero,
            u.usuarioId,
            u.nombre AS nombre_empleado,
            u.apPaterno,
            u.apMaterno
        FROM hijos h
        LEFT JOIN usuarios u ON h.usuarioId = u.usuarioId
        ORDER BY u.apPaterno, u.nombre, h.nombre
    `);

    for (const h of hijos) {
        addStyledRow(ws, [
            h.usuarioId,
            `${h.nombre_empleado || ''} ${h.apPaterno || ''} ${h.apMaterno || ''}`.trim(),
            h.nombre_hijo,
            fmtDate(h.fecha_nacimiento),
            h.genero,
        ]);
    }
}

async function agregarHojaVacaciones(wb) {
    const ws = wb.addWorksheet('Vacaciones');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 16 }, { width: 16 },
        { width: 8 }, { width: 16 }, { width: 16 }, { width: 16 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Fecha Inicio', 'Fecha Fin', 'Días',
        'Estado Final', 'Resp. Jefe', 'Resp. RH',
    ]);

    const vacaciones = await query(`
        SELECT
            v.vacacionesId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            v.fecha_inicio_vacaciones,
            v.fecha_fin_vacaciones,
            v.dias_solicitados,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH
        FROM vacaciones v
        LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
        ORDER BY v.fecha_inicio_vacaciones DESC
    `);

    for (const v of vacaciones) {
        addStyledRow(ws, [
            v.vacacionesId,
            `${v.nombre || ''} ${v.apPaterno || ''} ${v.apMaterno || ''}`.trim(),
            fmtDate(v.fecha_inicio_vacaciones),
            fmtDate(v.fecha_fin_vacaciones),
            v.dias_solicitados,
            v.estado_final,
            v.respuesta_jefe_inmediato,
            v.respuesta_RH,
        ]);
    }
}

async function agregarHojaEvaluaciones(wb) {
    const ws = wb.addWorksheet('Evaluaciones');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 24 },
        { width: 12 }, { width: 16 }, { width: 34 }, { width: 34 },
        { width: 34 }, { width: 34 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Fecha Evaluación', 'Periodo',
        'Promedio', 'Recontratación',
        'Comentario Empleado', 'Comentario Jefe',
        'Comentario Siguiente Evaluación', 'Comentario Final',
    ]);

    const evaluaciones = await query(`
        SELECT
            e.evaluacionesId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
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
        LEFT JOIN periodoevaluaciones pe ON e.periodo_evaluacionesId = pe.periodo_evaluacionesId
        ORDER BY e.fecha_evaluacion DESC
    `);

    for (const e of evaluaciones) {
        addStyledRow(ws, [
            e.evaluacionesId,
            `${e.nombre || ''} ${e.apPaterno || ''} ${e.apMaterno || ''}`.trim(),
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

async function agregarHojaPermisos(wb) {
    const ws = wb.addWorksheet('Permisos');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
        { width: 16 }, { width: 16 }, { width: 18 }, { width: 40 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Fecha Elaboración', 'Fecha Permiso',
        'Tipo', 'Días', 'Horas', 'Goce Sueldo',
        'Estado', 'Hora Inicio', 'Hora Fin', 'Motivo',
    ]);

    const permisos = await query(`
        SELECT
            p.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno
        FROM permisos p
        LEFT JOIN usuarios u ON p.usuarioId = u.usuarioId
        ORDER BY p.fecha_permiso DESC
    `);

    for (const p of permisos) {
        addStyledRow(ws, [
            p.permisoId,
            `${p.nombre || ''} ${p.apPaterno || ''} ${p.apMaterno || ''}`.trim(),
            fmtDate(p.fecha_elaboracion),
            fmtDate(p.fecha_permiso),
            p.tipo === 'dia' ? 'Por día' : 'Por horas',
            p.num_dias || '',
            p.num_horas || '',
            p.goce_sueldo,
            p.estado,
            p.hora_inicio || '',
            p.hora_fin || '',
            p.motivo,
        ]);
    }
}

async function agregarHojaLogs(wb) {
    const ws = wb.addWorksheet('Historial Exportaciones');
    ws.columns = [
        { width: 8 }, { width: 18 }, { width: 28 }, { width: 24 }, { width: 18 },
    ];

    addHeader(ws, [
        'ID', 'Usuario', 'Nombre', 'Fecha y Hora', 'IP',
    ], fillGray);

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
            `${l.nombre || ''} ${l.apPaterno || ''} ${l.apMaterno || ''}`.trim(),
            fmtDateTime(l.fecha),
            l.ip,
        ]);
    }
}

async function agregarHojaBajas(wb) {
    const ws = wb.addWorksheet('Bajas');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 22 },
        { width: 18 }, { width: 14 }, { width: 14 }, { width: 24 },
        { width: 16 }, { width: 16 }, { width: 40 }, { width: 40 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Usuario', 'Departamento',
        'Puesto', 'Fecha Contratación', 'Fecha Baja',
        'Motivo Baja', 'Tiempo Laboral', 'Finiquito',
        'Detalle', 'Observaciones',
    ], fillGray);

    const bajas = await query(`
        SELECT *
        FROM bajas
        ORDER BY fecha_baja DESC, createdAt DESC
    `);

    for (const b of bajas) {
        addStyledRow(ws, [
            b.bajaId,
            `${b.nombre || ''} ${b.apPaterno || ''} ${b.apMaterno || ''}`.trim(),
            b.usuario,
            b.departamento,
            b.puesto,
            fmtDate(b.fecha_contratacion),
            fmtDate(b.fecha_baja),
            b.motivo_baja,
            b.tiempo_laboral,
            b.finiquito ? Number(b.finiquito) : '',
            b.motivo_detalle,
            b.observaciones,
        ]);
    }
}

async function agregarHojaVacantes(wb) {
    const ws = wb.addWorksheet('Solicitudes Vacantes');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 22 }, { width: 26 },
        { width: 10 }, { width: 18 }, { width: 16 }, { width: 18 },
        { width: 40 }, { width: 40 }, { width: 34 }, { width: 18 },
    ];

    addHeader(ws, [
        'ID', 'Solicitante', 'Departamento', 'Puesto Solicitado',
        'Plazas', 'Prioridad', 'Estado', 'Fecha Requerida',
        'Motivo', 'Descripción', 'Requisitos', 'Notas RH',
    ], fillGray);

    const vacantes = await query(`
        SELECT
            v.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno
        FROM vacantes v
        LEFT JOIN usuarios u ON v.solicitanteId = u.usuarioId
        ORDER BY v.createdAt DESC
    `);

    for (const v of vacantes) {
        addStyledRow(ws, [
            v.vacanteId,
            `${v.nombre || ''} ${v.apPaterno || ''} ${v.apMaterno || ''}`.trim(),
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
        ]);
    }
}

async function agregarHojaCumpleanos(wb) {
    const ws = wb.addWorksheet('Cumpleaños');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 18 },
        { width: 14 }, { width: 14 }, { width: 22 },
    ];

    addHeader(ws, [
        'ID Empleado', 'Empleado', 'Usuario', 'Departamento',
        'Fecha Nacimiento', 'Edad', 'Puesto',
    ], fillBlue);

    const cumpleanos = await query(`
        SELECT
            u.usuarioId,
            u.nombre,
            u.apPaterno,
            u.apMaterno,
            u.usuario,
            u.departamento,
            u.fecha_nacimiento,
            p.nombre_puesto
        FROM usuarios u
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
        WHERE u.fecha_nacimiento IS NOT NULL
        ORDER BY MONTH(u.fecha_nacimiento), DAY(u.fecha_nacimiento), u.apPaterno
    `);

    for (const c of cumpleanos) {
        addStyledRow(ws, [
            c.usuarioId,
            `${c.nombre || ''} ${c.apPaterno || ''} ${c.apMaterno || ''}`.trim(),
            c.usuario,
            c.departamento,
            fmtDate(c.fecha_nacimiento),
            calcularEdad(c.fecha_nacimiento),
            c.nombre_puesto,
        ]);
    }
}

async function agregarHojaDescuentos(wb) {
    const ws = wb.addWorksheet('Descuentos');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 24 }, { width: 14 },
        { width: 16 }, { width: 16 }, { width: 12 }, { width: 20 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Concepto', 'Monto',
        'Tipo', 'Periodicidad', 'Activo', 'Fecha Registro',
    ], fillBlue);

    const descuentos = await query(`
        SELECT
            d.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno
        FROM descuentos d
        LEFT JOIN usuarios u ON d.usuarioId = u.usuarioId
        ORDER BY d.createdAt DESC
    `);

    for (const d of descuentos) {
        addStyledRow(ws, [
            d.descuentoId,
            `${d.nombre || ''} ${d.apPaterno || ''} ${d.apMaterno || ''}`.trim(),
            d.concepto,
            d.monto ? Number(d.monto) : '',
            d.tipo,
            d.periodicidad,
            d.activo ? 'Sí' : 'No',
            fmtDateTime(d.createdAt),
        ]);
    }
}

async function agregarHojaDocumentosEmpleado(wb) {
    const ws = wb.addWorksheet('Documentos Empleado');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 34 },
        { width: 60 }, { width: 20 },
    ];

    addHeader(ws, [
        'ID', 'Empleado', 'Tipo', 'Nombre Documento', 'URL', 'Fecha Registro',
    ], fillBlue);

    const docs = await query(`
        SELECT
            d.*,
            u.nombre,
            u.apPaterno,
            u.apMaterno
        FROM documentos_empleado d
        LEFT JOIN usuarios u ON d.usuarioId = u.usuarioId
        ORDER BY d.createdAt DESC
    `);

    for (const d of docs) {
        addStyledRow(ws, [
            d.documentoId,
            `${d.nombre || ''} ${d.apPaterno || ''} ${d.apMaterno || ''}`.trim(),
            d.tipo,
            d.nombre,
            d.url,
            fmtDateTime(d.createdAt),
        ]);
    }
}

async function agregarHojaDocumentosRH(wb) {
    const wsActas = wb.addWorksheet('Actas RH');
    wsActas.columns = [
        { width: 8 }, { width: 28 }, { width: 16 }, { width: 12 },
        { width: 16 }, { width: 40 }, { width: 40 }, { width: 40 },
        { width: 40 }, { width: 24 }, { width: 20 },
    ];

    addHeader(wsActas, [
        'ID', 'Empleado', 'Fecha', 'Hora', 'Fracción Art. 47',
        'Falta', 'Declaración', 'Sanción', 'Observaciones',
        'Registrado Por', 'Fecha Registro',
    ], fillBlue);

    const actas = await query(`
        SELECT
            a.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno,
            r.usuario AS registrado_por_usuario
        FROM actas_administrativas a
        LEFT JOIN usuarios e ON a.usuarioId = e.usuarioId
        LEFT JOIN usuarios r ON a.registrado_por = r.usuarioId
        ORDER BY a.fecha DESC, a.createdAt DESC
    `);

    for (const a of actas) {
        addStyledRow(wsActas, [
            a.actaId,
            `${a.nombre || ''} ${a.apPaterno || ''} ${a.apMaterno || ''}`.trim(),
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
        { width: 8 }, { width: 28 }, { width: 16 }, { width: 30 },
        { width: 50 }, { width: 24 }, { width: 20 },
    ];

    addHeader(wsCartas, [
        'ID', 'Empleado', 'Fecha', 'Asunto', 'Descripción',
        'Registrado Por', 'Fecha Registro',
    ], fillBlue);

    const cartas = await query(`
        SELECT
            c.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno,
            r.usuario AS registrado_por_usuario
        FROM cartas_compromiso c
        LEFT JOIN usuarios e ON c.usuarioId = e.usuarioId
        LEFT JOIN usuarios r ON c.registrado_por = r.usuarioId
        ORDER BY c.fecha DESC, c.createdAt DESC
    `);

    for (const c of cartas) {
        addStyledRow(wsCartas, [
            c.cartaId,
            `${c.nombre || ''} ${c.apPaterno || ''} ${c.apMaterno || ''}`.trim(),
            fmtDate(c.fecha),
            c.asunto,
            c.descripcion,
            c.registrado_por_usuario,
            fmtDateTime(c.createdAt),
        ]);
    }

    const wsResponsivas = wb.addWorksheet('Responsivas EPP');
    wsResponsivas.columns = [
        { width: 8 }, { width: 28 }, { width: 16 }, { width: 22 },
        { width: 40 }, { width: 24 }, { width: 20 },
    ];

    addHeader(wsResponsivas, [
        'ID', 'Empleado', 'Fecha', 'Lugar', 'Observaciones',
        'Registrado Por', 'Fecha Registro',
    ], fillBlue);

    const responsivas = await query(`
        SELECT
            r.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno,
            u.usuario AS registrado_por_usuario
        FROM responsivas_epp r
        LEFT JOIN usuarios e ON r.usuarioId = e.usuarioId
        LEFT JOIN usuarios u ON r.registrado_por = u.usuarioId
        ORDER BY r.fecha DESC, r.createdAt DESC
    `);

    for (const r of responsivas) {
        addStyledRow(wsResponsivas, [
            r.responsivaId,
            `${r.nombre || ''} ${r.apPaterno || ''} ${r.apMaterno || ''}`.trim(),
            fmtDate(r.fecha),
            r.lugar,
            r.observaciones,
            r.registrado_por_usuario,
            fmtDateTime(r.createdAt),
        ]);
    }

    const wsItems = wb.addWorksheet('Items EPP');
    wsItems.columns = [
        { width: 8 }, { width: 8 }, { width: 28 }, { width: 12 },
        { width: 38 }, { width: 26 }, { width: 18 },
    ];

    addHeader(wsItems, [
        'Item ID', 'Responsiva ID', 'Empleado', 'Cantidad',
        'Descripción', 'Marca / Modelo', 'Estado',
    ], fillBlue);

    const items = await query(`
        SELECT
            i.*,
            e.nombre,
            e.apPaterno,
            e.apMaterno
        FROM responsivas_epp_items i
        LEFT JOIN responsivas_epp r ON i.responsivaId = r.responsivaId
        LEFT JOIN usuarios e ON r.usuarioId = e.usuarioId
        ORDER BY i.responsivaId DESC, i.itemId
    `);

    for (const i of items) {
        addStyledRow(wsItems, [
            i.itemId,
            i.responsivaId,
            `${i.nombre || ''} ${i.apPaterno || ''} ${i.apMaterno || ''}`.trim(),
            i.cantidad,
            i.descripcion,
            i.marca_modelo,
            i.estado,
        ]);
    }
}

// ─────────────────────────────────────────────────────────────
// EXPORTACIÓN GENERAL / POR SECCIÓN
// ─────────────────────────────────────────────────────────────

async function generarExcelBD(seccion = 'general') {
    const wb = crearWorkbook();
    const normalizada = String(seccion || 'general').toLowerCase();

    if (!SECCIONES_VALIDAS.includes(normalizada)) {
        throw new Error(`Sección inválida: ${seccion}`);
    }

    const agregarTodas = async () => {
        await agregarHojaEmpleados(wb);
        await agregarHojaVehiculos(wb);
        await agregarHojaHijos(wb);
        await agregarHojaVacaciones(wb);
        await agregarHojaEvaluaciones(wb);
        await agregarHojaPermisos(wb);
        await agregarHojaLogs(wb);
        await agregarHojaBajas(wb);
        await agregarHojaVacantes(wb);
        await agregarHojaCumpleanos(wb);
        await agregarHojaDescuentos(wb);
        await agregarHojaDocumentosEmpleado(wb);
        await agregarHojaDocumentosRH(wb);
    };

    if (normalizada === 'general') await agregarTodas();
    if (normalizada === 'empleados') await agregarHojaEmpleados(wb);
    if (normalizada === 'vehiculos') await agregarHojaVehiculos(wb);
    if (normalizada === 'hijos') await agregarHojaHijos(wb);
    if (normalizada === 'vacaciones') await agregarHojaVacaciones(wb);
    if (normalizada === 'evaluaciones') await agregarHojaEvaluaciones(wb);
    if (normalizada === 'permisos') await agregarHojaPermisos(wb);
    if (normalizada === 'logs') await agregarHojaLogs(wb);
    if (normalizada === 'bajas') await agregarHojaBajas(wb);
    if (normalizada === 'vacantes') await agregarHojaVacantes(wb);
    if (normalizada === 'cumpleanos') await agregarHojaCumpleanos(wb);
    if (normalizada === 'descuentos') await agregarHojaDescuentos(wb);
    if (normalizada === 'documentos_empleado') await agregarHojaDocumentosEmpleado(wb);
    if (normalizada === 'documentos_rh') await agregarHojaDocumentosRH(wb);

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
            p.nombre_puesto AS puesto,
            u.genero,
            u.fecha_nacimiento,
            u.estado_civil,
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
            '' AS correo,
            u.fechaContratacion,
            DATE_ADD(u.fechaContratacion, INTERVAL 1 MONTH) AS fecha_primer_mes_evaluacion,
            u.emergencia_nombre,
            u.emergencia_parentesco
        FROM usuarios u
        LEFT JOIN puesto p ON u.puestoId = p.puestoId
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
    ws.columns = [
        { width: 34 },
        { width: 60 },
    ];

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
        ['Puesto', e.puesto || ''],
        ['Género', e.genero || ''],
        ['Edad', calcularEdad(e.fecha_nacimiento)],
        ['Estado civil', e.estado_civil || ''],
        ['Dirección', direccion],
        ['Código postal', e.domicilio_cp || ''],
        ['Estado', e.domicilio_estado || ''],
        ['RFC', e.RFC || ''],
        ['CURP', e.curp || ''],
        ['Correo', e.correo || ''],
        ['Fecha de ingreso', fmtDate(e.fechaContratacion)],
        ['Fecha 1er mes de evaluación', fmtDate(e.fecha_primer_mes_evaluacion)],
        ['Contacto de emergencia', e.emergencia_nombre || ''],
        ['Parentesco contacto emergencia', e.emergencia_parentesco || ''],
    ];

    for (const [campo, valor] of datos) {
        const row = ws.addRow([campo, valor]);
        row.getCell(1).font = { name: 'Arial', size: 10, bold: true };
        row.getCell(1).fill = fillGray;
        row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        styleRow(row);
    }

    return await wb.xlsx.writeBuffer();
}

module.exports = {
    generarExcelBD,
    generarExcelContrato,
    registrarLog,
    getExportLogs,
    SECCIONES_VALIDAS,
};
