// src/models/generarWordVacaciones.js
const fs   = require('fs');
const path = require('path');
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, AlignmentType, BorderStyle, WidthType, ShadingType,
    VerticalAlign, UnderlineType,
} = require('docx');

const bSingle = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const bNone   = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' };
const bordAll = { top: bSingle, bottom: bSingle, left: bSingle, right: bSingle };
const bordNone= { top: bNone,   bottom: bNone,   left: bNone,   right: bNone   };
const bordBot = { top: bNone, bottom: bSingle, left: bNone, right: bNone };

const TW = 9360; // table width DXA (US Letter 1" margins)

function txt(text, opts = {}) {
    return new TextRun({ text: String(text || ''), font: 'Arial', size: 18, ...opts });
}

function cell(children, width, opts = {}) {
    return new TableCell({
        width:   { size: width, type: WidthType.DXA },
        borders: opts.borders || bordAll,
        shading: opts.shading || undefined,
        verticalAlign: opts.va || VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: Array.isArray(children) ? children : [
            new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: Array.isArray(children) ? children : [children] })
        ],
    });
}

function labelCell(label, width) {
    return cell(
        [new Paragraph({ children: [txt(label, { bold: true, size: 16 })] })],
        width,
        { borders: bordAll }
    );
}

function valueCell(value, width, underline = false) {
    return cell(
        [new Paragraph({ children: [txt(value, { size: 18, underline: underline ? { type: UnderlineType.SINGLE } : undefined })] })],
        width,
        { borders: bordAll }
    );
}

function emptyCell(width, height = false) {
    return new TableCell({
        width:   { size: width, type: WidthType.DXA },
        borders: bordAll,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [txt('')] })],
    });
}

async function generarWordVacaciones(vacacion) {
    const {
        nombre, apPaterno, apMaterno,
        departamento, usuarioId,
        fechaContratacion,
        dias_vacaciones_lft, dias_usados, dias_restantes,
        fecha_inicio_vacaciones, fecha_fin_vacaciones,
        dias_solicitados,
        anios_servicio,
        fecha_regreso,
    } = vacacion;

    const nombreCompleto = `${nombre || ''} ${apPaterno || ''} ${apMaterno || ''}`.trim();
    const fechaCont      = fechaContratacion     ? new Date(fechaContratacion).toLocaleDateString('es-MX')             : '___________';
    const fechaInicio    = fecha_inicio_vacaciones ? new Date(fecha_inicio_vacaciones).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '___________';
    const fechaFin       = fecha_fin_vacaciones    ? new Date(fecha_fin_vacaciones).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })    : '___________';
    const fechaRegreso   = fecha_regreso           ? new Date(fecha_regreso).toLocaleDateString('es-MX')               : '___________';
    const anios          = anios_servicio ?? '___';

    // Separar fechas inicio/fin para las filas del formato
    const diaIni  = fecha_inicio_vacaciones ? new Date(fecha_inicio_vacaciones).getDate()       : '__';
    const mesIni  = fecha_inicio_vacaciones ? new Date(fecha_inicio_vacaciones).toLocaleString('es-MX', { month: 'long' }) : '________';
    const anioIni = fecha_inicio_vacaciones ? new Date(fecha_inicio_vacaciones).getFullYear()   : '____';
    const diaFin  = fecha_fin_vacaciones    ? new Date(fecha_fin_vacaciones).getDate()           : '__';
    const mesFin  = fecha_fin_vacaciones    ? new Date(fecha_fin_vacaciones).toLocaleString('es-MX', { month: 'long' }) : '________';
    const anioFin = fecha_fin_vacaciones    ? new Date(fecha_fin_vacaciones).getFullYear()       : '____';

    // Calcular año del periodo
    const anioInicio = anioIni;
    const anioFinal  = anioFin;

    const children = [];

    // ── Logo + Encabezado ──────────────────────────────────────
    const logoPath   = path.join(__dirname, '../services/diagsa.png');
    const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

    const COL_LOGO = 1800;
    const COL_TIT  = TW - COL_LOGO;

    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [COL_LOGO, COL_TIT],
        rows: [new TableRow({
            children: [
                new TableCell({
                    width: { size: COL_LOGO, type: WidthType.DXA },
                    borders: bordAll,
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: logoBuffer
                            ? [new ImageRun({ data: logoBuffer, type: 'png', transformation: { width: 100, height: 50 } })]
                            : [txt('DIAGSA', { bold: true, size: 28 })]
                    })]
                }),
                new TableCell({
                    width: { size: COL_TIT, type: WidthType.DXA },
                    borders: bordAll,
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [txt('DISTRIBUCIONES AUTOPARTES GARCIA JIMENEZ SA DE CV', { bold: true, size: 20 })]
                    })]
                }),
            ]
        }), new TableRow({
            children: [
                new TableCell({
                    width: { size: COL_TIT, type: WidthType.DXA },
                    borders: bordAll,
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('SOLICITUD Y AUTORIZACION DE', { bold: true, size: 20 })] }),
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('VACACIONES', { bold: true, size: 24 })] }),
                    ]
                }),
            ]
        })]
    }));

    children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [] }));

    // ── Texto introductorio ────────────────────────────────────
    children.push(new Paragraph({
        spacing: { before: 60, after: 100 },
        children: [txt('POR EL PRESENTE EXPRESO MI CONFORMIDAD DE SOLICITAR Y GOZAR MIS VACACIONES DE ACUERDO A LO QUE ESTABLECE EL ARTICULO 76 DE LA LEY FEDERAL DEL TRABAJO, CONSIDERANDO LOS SIGUIENTES DATOS:', { size: 16 })]
    }));

    // ── Empresa + Departamento ─────────────────────────────────
    const C1 = 1500; const C2 = 3000; const C3 = 1500; const C4 = TW - C1 - C2 - C3;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [C1, C2, C3, C4],
        rows: [new TableRow({
            children: [
                labelCell('Nombre de la Empresa:', C1),
                new TableCell({
                    width: { size: C2, type: WidthType.DXA },
                    borders: bordAll,
                    shading: { fill: 'BFBFBF', type: ShadingType.CLEAR },
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({ children: [txt('DISTRIBUCIONES AUTOPARTES GARCIA JIMENEZ', { bold: true, size: 16 })] })]
                }),
                labelCell('Área y/o Departamento:', C3),
                new TableCell({
                    width: { size: C4, type: WidthType.DXA },
                    borders: bordAll,
                    shading: { fill: 'FFFF00', type: ShadingType.CLEAR },
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(departamento || 'CEDIS', { bold: true, size: 18 })] })]
                }),
            ]
        })]
    }));

    // ── No Empleado + Nombre ───────────────────────────────────
    const E1 = 1200; const E2 = 2700; const E3 = 1500; const E4 = TW - E1 - E2 - E3;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [E1, E2, E3, E4],
        rows: [new TableRow({
            children: [
                labelCell('No de Empleado:', E1),
                valueCell(String(usuarioId || ''), E2),
                labelCell('Nombre del Empleado:', E3),
                valueCell(nombreCompleto, E4),
            ]
        })]
    }));

    // ── Fecha Ingreso + Años servicio ──────────────────────────
    const F1 = 1200; const F2 = 2700; const F3 = 1500; const F4 = 800; const F5 = TW - F1 - F2 - F3 - F4;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [F1, F2, F3, F4, F5],
        rows: [new TableRow({
            children: [
                labelCell('Fecha de Ingreso:', F1),
                valueCell(fechaCont, F2),
                labelCell('Años de Servicio:', F3),
                valueCell(String(anios), F4),
                labelCell('AÑOS', F5),
            ]
        })]
    }));

    // ── Días corresponden / disfrutar / pendientes ─────────────
    const D0 = 800; const D1 = 1500; const D2 = 800; const D3 = 1500; const D4 = 1000; const D5 = TW - D0 - D1 - D2 - D3 - D4;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [D0, D1, D2, D3, D4, D5],
        rows: [new TableRow({
            children: [
                new TableCell({ width: { size: D0, type: WidthType.DXA }, borders: bordAll, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [] })] }),
                labelCell('Días que corresponden:', D1),
                valueCell(String(dias_vacaciones_lft || ''), D2),
                labelCell('Días a disfrutar:', D3),
                valueCell(String(dias_solicitados || ''), D4),
                labelCell('Días Pendientes:', D5),
            ]
        }), new TableRow({
            children: [
                labelCell('Período a Disfrutar:', D0 + D1),
                labelCell('del Año de', D2),
                new TableCell({
                    width: { size: D3, type: WidthType.DXA }, borders: bordAll,
                    shading: { fill: 'FFFF00', type: ShadingType.CLEAR },
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(String(anioInicio), { bold: true })] })]
                }),
                labelCell('al Año', D4),
                new TableCell({
                    width: { size: D5, type: WidthType.DXA }, borders: bordAll,
                    shading: { fill: 'FFFF00', type: ShadingType.CLEAR },
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(String(anioFinal), { bold: true })] })]
                }),
            ]
        })]
    }));

    // ── Días que inician vacaciones ────────────────────────────
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [TW],
        rows: [new TableRow({
            children: [new TableCell({
                width: { size: TW, type: WidthType.DXA }, borders: bordAll,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [txt('Días que Inician sus Vacaciones', { bold: true })] })]
            })]
        })]
    }));

    // Fila "del X de MES del AÑO"
    const R1 = 800; const R2 = 800; const R3 = 2000; const R4 = 800; const R5 = TW - R1 - R2 - R3 - R4;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [R1, R2, R3, R4, R5],
        rows: [
            new TableRow({
                children: [
                    emptyCell(R1),
                    labelCell('del', R2),
                    valueCell(String(diaIni), R3),
                    labelCell('de', R4),
                    valueCell(mesIni, R5),
                ]
            }),
            new TableRow({
                children: [
                    emptyCell(R1),
                    labelCell('al', R2),
                    valueCell(String(diaFin), R3),
                    labelCell('de', R4),
                    valueCell(mesFin, R5),
                ]
            }),
        ]
    }));

    // ── Fecha regreso ──────────────────────────────────────────
    const P1 = 2800; const P2 = TW - P1;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [P1, P2],
        rows: [new TableRow({
            children: [
                labelCell('FECHA EN QUE DEBERÁ DE PRESENTARSE A TRABAJAR:', P1),
                valueCell(fechaRegreso, P2),
            ]
        })]
    }));

    // ── Observaciones ──────────────────────────────────────────
    const O1 = 1500; const O2 = TW - O1;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [O1, O2],
        rows: [new TableRow({
            children: [
                labelCell('OBSERVACIONES:', O1),
                emptyCell(O2),
            ]
        }), new TableRow({
            children: [new TableCell({
                width: { size: TW, type: WidthType.DXA },
                borders: bordAll,
                columnSpan: 2,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [txt('')] })]
            })]
        })]
    }));

    children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [] }));

    // ── Ciudad y fecha ─────────────────────────────────────────
    const hoy = new Date();
    const fechaDoc = `${hoy.getDate()} de ${hoy.toLocaleString('es-MX', { month: 'long' })} de ${hoy.getFullYear()}`;

    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        children: [
            txt('TEHUACAN, PUEBLA', { bold: true, size: 18 }),
            txt('  A  ', { size: 18 }),
            txt(fechaDoc, { size: 18 }),
            txt('  DE', { size: 18 }),
        ]
    }));

    children.push(new Paragraph({ spacing: { before: 240, after: 240 }, children: [] }));

    // ── Firmas ─────────────────────────────────────────────────
    const S1 = Math.floor(TW / 3); const S2 = Math.floor(TW / 3); const S3 = TW - S1 - S2;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [S1, S2, S3],
        rows: [
            // Espacio para firma
            new TableRow({
                height: { value: 1200, rule: 'atLeast' },
                children: [
                    new TableCell({ width: { size: S1, type: WidthType.DXA }, borders: bordAll, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [] })] }),
                    new TableCell({ width: { size: S2, type: WidthType.DXA }, borders: bordAll, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [] })] }),
                    new TableCell({ width: { size: S3, type: WidthType.DXA }, borders: bordAll, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [] })] }),
                ]
            }),
            // Labels firmas
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: S1, type: WidthType.DXA }, borders: bordAll,
                        shading: { fill: 'BFBFBF', type: ShadingType.CLEAR },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 60, bottom: 60, left: 100, right: 100 },
                        children: [
                            new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Firma de Conformidad', { bold: true, size: 16 })] }),
                            new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('del Empleado', { bold: true, size: 16 })] }),
                        ]
                    }),
                    new TableCell({
                        width: { size: S2, type: WidthType.DXA }, borders: bordAll,
                        shading: { fill: 'BFBFBF', type: ShadingType.CLEAR },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 60, bottom: 60, left: 100, right: 100 },
                        children: [
                            new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Nombre y Firma de Autorización del', { bold: true, size: 16 })] }),
                            new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Gerente del Área y/o Director', { bold: true, size: 16 })] }),
                        ]
                    }),
                    new TableCell({
                        width: { size: S3, type: WidthType.DXA }, borders: bordAll,
                        shading: { fill: 'BFBFBF', type: ShadingType.CLEAR },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 60, bottom: 60, left: 100, right: 100 },
                        children: [
                            new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Nombre y Firma Recursos Humanos', { bold: true, size: 16 })] }),
                        ]
                    }),
                ]
            }),
        ]
    }));

    // ── Documento ──────────────────────────────────────────────
    const doc = new Document({
        styles: { default: { document: { run: { font: 'Arial', size: 18 } } } },
        sections: [{
            properties: {
                page: {
                    size:   { width: 12240, height: 15840 },
                    margin: { top: 720, right: 720, bottom: 720, left: 720 },
                }
            },
            children,
        }]
    });

    return await Packer.toBuffer(doc);
}

module.exports = { generarWordVacaciones };