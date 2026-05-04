// src/models/generarWordPermiso.js
const fs   = require('fs');
const path = require('path');
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, AlignmentType, BorderStyle, WidthType, VerticalAlign,
    UnderlineType, ShadingType,
} = require('docx');

const bSingle = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const bNone   = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' };
const bordAll  = { top: bSingle, bottom: bSingle, left: bSingle, right: bSingle };
const bordNone = { top: bNone,   bottom: bNone,   left: bNone,   right: bNone   };
const bordBot  = { top: bNone,   bottom: bSingle, left: bNone,   right: bNone   };

const TW = 9360; // tabla ancho total DXA

function txt(text, opts = {}) {
    return new TextRun({ text: String(text || ''), font: 'Arial', size: 18, ...opts });
}

function ul(text, opts = {}) {
    return new TextRun({ text: String(text || ''), font: 'Arial', size: 18, underline: { type: UnderlineType.SINGLE }, ...opts });
}

function cell(children, width, opts = {}) {
    return new TableCell({
        width:         { size: width, type: WidthType.DXA },
        borders:       opts.borders || bordAll,
        verticalAlign: opts.va || VerticalAlign.CENTER,
        margins:       { top: 60, bottom: 60, left: 100, right: 100 },
        shading:       opts.shading,
        columnSpan:    opts.columnSpan,
        children: Array.isArray(children) ? children : [
            new Paragraph({
                alignment: opts.align || AlignmentType.LEFT,
                children: Array.isArray(children) ? children : [children],
            })
        ],
    });
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fmtFecha(d) {
    if (!d) return '_______________';
    const f = new Date(d);
    return `${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`;
}

function fmtHora(t) {
    if (!t) return '____';
    return String(t).substring(0, 5);
}

async function generarWordPermiso(permiso) {
    const {
        nombre, apPaterno, apMaterno, departamento,
        fecha_elaboracion, fecha_permiso, tipo,
        num_dias, fecha_inicio, fecha_fin, observaciones,
        num_horas, hora_inicio, hora_fin, dia_permiso,
        repone_hora_inicio, repone_hora_fin, repone_dias, repone_mes,
        entrada_corrido, salida_corrido, dias_corrido, mes_corrido,
        motivo, goce_sueldo,
    } = permiso;

    const nombreCompleto = `${nombre || ''} ${apPaterno || ''} ${apMaterno || ''}`.trim();

    const logoPath   = path.join(__dirname, '../services/diagsa.png');
    const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

    const children = [];

    // ── Encabezado ─────────────────────────────────────────────
    const COL_LOGO = 1400;
    const COL_TIT  = TW - COL_LOGO;

    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [COL_LOGO, COL_TIT],
        rows: [
            new TableRow({ children: [
                new TableCell({
                    width: { size: COL_LOGO, type: WidthType.DXA },
                    borders: bordAll, rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: logoBuffer
                            ? [new ImageRun({ data: logoBuffer, type: 'png', transformation: { width: 90, height: 45 } })]
                            : [txt('DIAGSA', { bold: true, size: 24 })]
                    })]
                }),
                new TableCell({
                    width: { size: COL_TIT, type: WidthType.DXA },
                    borders: bordAll, verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('DIAGSA AUTOMOTRIZ, S.A. DE C.V.', { bold: true, size: 22 })] })]
                }),
            ]}),
            new TableRow({ children: [
                new TableCell({
                    width: { size: COL_TIT, type: WidthType.DXA },
                    borders: bordAll, verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('SOLICITUD DE PERMISO', { bold: true, size: 20 })] })]
                }),
            ]}),
        ]
    }));

    // ── Fechas elaboración / requerida ─────────────────────────
    const C1 = Math.floor(TW / 2); const C2 = TW - C1;
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [C1, C2],
        rows: [new TableRow({ children: [
            cell([
                new Paragraph({ children: [
                    txt('FECHA DE ELABORACION ', { bold: true, size: 16 }),
                    ul(fmtFecha(fecha_elaboracion), { size: 16 }),
                    txt('.', { size: 16 }),
                ] })
            ], C1, { borders: bordAll }),
            cell([
                new Paragraph({ children: [
                    txt('FECHA EN QUE SE REQUIERE EL PERMISO ', { bold: true, size: 16 }),
                    ul(fmtFecha(fecha_permiso), { size: 16 }),
                    txt('.', { size: 16 }),
                ] })
            ], C2, { borders: bordAll }),
        ]})]
    }));

    // ── Nombre del trabajador ───────────────────────────────────
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [TW],
        rows: [new TableRow({ children: [
            cell([
                new Paragraph({ children: [
                    txt('NOMBRE DEL TRABAJADOR: ', { bold: true, size: 16 }),
                    ul(nombreCompleto, { size: 16 }),
                ] })
            ], TW, { borders: bordAll })
        ]})]
    }));

    // ── Departamento / Área ─────────────────────────────────────
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [C1, C2],
        rows: [new TableRow({ children: [
            cell([
                new Paragraph({ children: [
                    txt('DEPARTAMENTO: ', { bold: true, size: 16 }),
                    ul(departamento || '', { size: 16 }),
                    txt('.', { size: 16 }),
                ] })
            ], C1, { borders: bordAll }),
            cell([
                new Paragraph({ children: [
                    txt('ÁREA: ', { bold: true, size: 16 }),
                    ul(departamento || '', { size: 16 }),
                    txt('.', { size: 16 }),
                ] })
            ], C2, { borders: bordAll }),
        ]})]
    }));

    // ── Dos columnas: Por día | Por horas ──────────────────────
    const CDIV = Math.floor(TW / 2);

    // Contenido columna POR DÍA
    const colDia = [
        new Paragraph({ children: [txt('Llenar este espacio si el permiso es por día:', { bold: true, size: 16 })] }),
        new Paragraph({ children: [
            txt('Número de días: ', { bold: true, size: 16 }),
            ul(tipo === 'dia' ? String(num_dias || '') : '', { size: 16 }),
            txt('.', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('Del día ', { size: 16 }),
            ul(tipo === 'dia' && fecha_inicio ? String(new Date(fecha_inicio).getDate()) : '__', { size: 16 }),
            txt(' del mes de ', { size: 16 }),
            ul(tipo === 'dia' && fecha_inicio ? MESES[new Date(fecha_inicio).getMonth()] : '________', { size: 16 }),
            txt(' al día ', { size: 16 }),
            ul(tipo === 'dia' && fecha_fin ? String(new Date(fecha_fin).getDate()) : '__', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('del mes de ', { size: 16 }),
            ul(tipo === 'dia' && fecha_fin ? MESES[new Date(fecha_fin).getMonth()] : '________', { size: 16 }),
            txt(' del ', { size: 16 }),
            ul(tipo === 'dia' && fecha_fin ? String(new Date(fecha_fin).getFullYear()) : '____', { size: 16 }),
            txt('.', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('Observaciones: ', { bold: true, size: 16 }),
            ul(tipo === 'dia' ? (observaciones || '') : '', { size: 16 }),
        ]}),
        new Paragraph({ children: [ul('', { size: 16 })] }),
        new Paragraph({ children: [ul('', { size: 16 })] }),
    ];

    // Contenido columna POR HORAS
    const colHoras = [
        new Paragraph({ children: [txt('Llenar este espacio si el formato es por horas:', { bold: true, size: 16 })] }),
        new Paragraph({ children: [
            txt('Número de horas: ', { bold: true, size: 16 }),
            ul(tipo === 'horas' ? String(num_horas || '') : '', { size: 16 }),
            txt('.', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('De las ', { size: 16 }),
            ul(tipo === 'horas' ? fmtHora(hora_inicio) : '____', { size: 16 }),
            txt(' hrs. a las ', { size: 16 }),
            ul(tipo === 'horas' ? fmtHora(hora_fin) : '____', { size: 16 }),
            txt(' hrs. del día ', { size: 16 }),
            ul(tipo === 'horas' && dia_permiso ? String(new Date(dia_permiso).getDate()) : '____', { size: 16 }),
            txt('.', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('del mes de ', { size: 16 }),
            ul(tipo === 'horas' && dia_permiso ? MESES[new Date(dia_permiso).getMonth()] : '________', { size: 16 }),
            txt(' del 2026. Repone tiempo', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('de las ', { size: 16 }),
            ul(tipo === 'horas' ? fmtHora(repone_hora_inicio) : '____', { size: 16 }),
            txt(' hrs. a las ', { size: 16 }),
            ul(tipo === 'horas' ? fmtHora(repone_hora_fin) : '____', { size: 16 }),
            txt(' hrs. del/los', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('día/s ', { size: 16 }),
            ul(tipo === 'horas' ? (repone_dias || '____') : '____', { size: 16 }),
            txt(' del mes ', { size: 16 }),
            ul(tipo === 'horas' ? (repone_mes || '________') : '________', { size: 16 }),
            txt(' del 2026.', { size: 16 }),
        ]}),
        new Paragraph({ children: [txt('En caso de Realizar horario corrido:', { size: 16 })] }),
        new Paragraph({ children: [
            txt('Entrada a las ', { size: 16 }),
            ul(tipo === 'horas' ? fmtHora(entrada_corrido) : '____', { size: 16 }),
            txt(' hrs. Salida a las ', { size: 16 }),
            ul(tipo === 'horas' ? fmtHora(salida_corrido) : '____', { size: 16 }),
            txt(' hrs.', { size: 16 }),
        ]}),
        new Paragraph({ children: [
            txt('del/los día/s ', { size: 16 }),
            ul(tipo === 'horas' ? (dias_corrido || '____') : '____', { size: 16 }),
            txt(' del mes de ', { size: 16 }),
            ul(tipo === 'horas' ? (mes_corrido || '________') : '________', { size: 16 }),
            txt(' del 2026.', { size: 16 }),
        ]}),
    ];

    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [CDIV, CDIV],
        rows: [new TableRow({ children: [
            new TableCell({
                width: { size: CDIV, type: WidthType.DXA },
                borders: bordAll,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: colDia,
            }),
            new TableCell({
                width: { size: CDIV, type: WidthType.DXA },
                borders: bordAll,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: colHoras,
            }),
        ]})]
    }));

    // ── Motivo ─────────────────────────────────────────────────
    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [TW],
        rows: [
            new TableRow({ children: [
                cell([
                    new Paragraph({ children: [
                        txt('Motivo: ', { bold: true, size: 16 }),
                        ul(motivo || '', { size: 16 }),
                    ]})
                ], TW, { borders: bordAll })
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [ul('', { size: 16 })] })], TW, { borders: bordAll })
            ]}),
            new TableRow({ children: [
                cell([new Paragraph({ children: [ul('', { size: 16 })] })], TW, { borders: bordAll })
            ]}),
        ]
    }));

    children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [] }));

    // ── Goce de sueldo ─────────────────────────────────────────
    const S = Math.floor(TW / 3);
    const filaMarcas = ['sin_goce', 'con_goce', 'repone_tiempo'].map(g => {
        const marcado = goce_sueldo === g ? '✓' : '';
        return new TableCell({
            width: { size: S, type: WidthType.DXA },
            borders: bordAll,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(marcado, { bold: true, size: 24 })] })]
        });
    });

    const filaLabels = [
        { label: 'Sin Goce de Sueldo:' },
        { label: 'Con Goce de Sueldo:' },
        { label: 'Repone Tiempo:' },
    ].map(({ label }) => new TableCell({
        width: { size: S, type: WidthType.DXA },
        borders: bordAll,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(label, { bold: true, size: 16 })] })]
    }));

    const filaSolicita = [
        { label: 'Solicita' },
        { label: 'Autoriza' },
        { label: 'Vo. Bo.' },
    ].map(({ label }) => new TableCell({
        width: { size: S, type: WidthType.DXA },
        borders: bordAll,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(label, { size: 16 })] })]
    }));

    const filaFirmas = [
        'Firma del Trabajador',
        'Nombre y Firma Jefe Inmediato',
        'Nombre y Firma RRHH',
    ].map(label => new TableCell({
        width: { size: S, type: WidthType.DXA },
        borders: bordAll,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(label, { bold: true, size: 16 })] })]
    }));

    children.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [S, S, S],
        rows: [
            new TableRow({ children: filaLabels }),
            new TableRow({ height: { value: 400, rule: 'atLeast' }, children: filaSolicita }),
            new TableRow({ height: { value: 800, rule: 'atLeast' }, children: filaMarcas }),
            new TableRow({ children: filaFirmas }),
        ]
    }));

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

module.exports = { generarWordPermiso };