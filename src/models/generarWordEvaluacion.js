// src/models/generarWordEvaluacion.js
const fs   = require('fs');
const path = require('path');
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
    HeadingLevel, PageBreak
} = require('docx');
const borderNone = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borderSingle = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borderLight  = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const bordersAll  = { top: borderSingle, bottom: borderSingle, left: borderSingle, right: borderSingle };
const bordersLight = { top: borderLight, bottom: borderLight, left: borderLight, right: borderLight };
const bordersNone = { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone };
const TABLE_WIDTH  = 9360; // US Letter - 1" margins each side
const COL_LABEL    = 2340; // ~25%
const COL_VALUE    = 7020; // ~75%
const COL_PREGUNTA = 7488; // ~80%
const COL_PUNT     = 1872; // ~20%
function txt(text, opts = {}) {
    return new TextRun({ text: String(text || ''), font: 'Arial', size: 20, ...opts });
}
function cellGris(text, width, bold = false) {
    return new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders: bordersAll,
        shading: { fill: '404040', type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({
            children: [txt(text, { bold, color: 'FFFFFF', size: 18 })]
        })]
    });
}
function cellBlanco(text, width, bold = false, align = AlignmentType.LEFT) {
    return new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders: bordersAll,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({
            alignment: align,
            children: [txt(text, { bold, size: 20 })]
        })]
    });
}
function cellVacio(width, height = 800) {
    return new TableCell({
        width:  { size: width, type: WidthType.DXA },
        borders: bordersAll,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [txt('')] })],
    });
}
function parrafo(text, opts = {}) {
    return new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [txt(text, opts)]
    });
}
async function generarWordEvaluacion(evaluacion) {
    const {
        empleado_nombre, empleado_apPaterno, empleado_apMaterno,
        empleado_usuario, nombre_puesto, departamento, jefe_inmediato,
        fechaContratacion, fecha_evaluacion, periodo_evaluacion,
        promedio_final, recontratacion,
        comentario_empleado, comentario_jefe_inmediato,
        comentario_siguiente_evaluacion, comentario_final,
        secciones = [],
        evaluador_nombre,
    } = evaluacion;
    const nombreCompleto = `${empleado_apPaterno || ''} ${empleado_apMaterno || ''} ${empleado_nombre || ''}`.trim().toUpperCase();
    const fechaEval      = fecha_evaluacion ? new Date(fecha_evaluacion).toLocaleDateString('es-MX') : '—';
    const fechaCont      = fechaContratacion ? new Date(fechaContratacion).toLocaleDateString('es-MX') : '—';
    const children = [];
    // ── Encabezado empresa con logo ───────────────────────────
    const logoPath = path.join(__dirname, '../services/diagsa.png');
    const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;
    const COL_LOGO = 2520;
    const COL_EMP  = 6840;
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [COL_LOGO, COL_EMP],
        rows: [new TableRow({
            children: [
                new TableCell({
                    width: { size: COL_LOGO, type: WidthType.DXA },
                    borders: bordersNone,
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 0, right: 120 },
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: logoBuffer ? [new ImageRun({
                            data: logoBuffer,
                            type: 'png',
                            transformation: { width: 120, height: 60 },
                        })] : [txt('DIAGSA', { bold: true, size: 28 })]
                    })]
                }),
                new TableCell({
                    width: { size: COL_EMP, type: WidthType.DXA },
                    borders: { top: bordersNone.top, bottom: bordersNone.bottom, right: bordersNone.right, left: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 60, bottom: 60, left: 200, right: 0 },
                    children: [
                        new Paragraph({ alignment: AlignmentType.LEFT, children: [txt('DISTRIBUCIONES AUTOPARTES', { bold: true, size: 24 })] }),
                        new Paragraph({ alignment: AlignmentType.LEFT, children: [txt('GARCIA JIMENEZ S.A DE C.V.', { bold: true, size: 24 })] }),
                    ]
                }),
            ]
        })]
    }));
    children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));
    // ── Título ──────────────────────────────────────────────
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 360 },
        children: [txt('Evaluación de Desempeño', { bold: true, size: 32 })]
    }));
    // ── 1. Información del empleado ─────────────────────────
    children.push(parrafo('1.  Información del empleado', { bold: true, size: 22 }));
    const infoRows = [
        ['Nombre:', nombreCompleto],
        ['Departamento:', departamento || '16 CEDIS'],
        ['Puesto:', nombre_puesto || '—'],
        ['Jefe Inmediato:', jefe_inmediato || '—'],
        ['Fecha de contratación:', fechaCont],
        ['Fecha de Evaluación:', fechaEval],
    ];
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [COL_LABEL, COL_VALUE],
        rows: infoRows.map(([label, value]) => new TableRow({
            children: [
                cellBlanco(label,  COL_LABEL, true),
                cellBlanco(value,  COL_VALUE),
            ]
        }))
    }));
    // Periodo de evaluación
    children.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));
    const periodos = ['1er Mes', '2do Mes', '3er Mes'];
    const colPeriodo = Math.floor(TABLE_WIDTH / 4);
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [COL_LABEL, colPeriodo, colPeriodo, colPeriodo],
        rows: [new TableRow({
            children: [
                cellBlanco('Periodo de Evaluación', COL_LABEL, true),
                ...periodos.map(p => new TableCell({
                    width: { size: colPeriodo, type: WidthType.DXA },
                    borders: bordersAll,
                    margins: { top: 60, bottom: 60, left: 120, right: 120 },
                    children: [new Paragraph({
                        children: [
                            txt(`${p}  `, { size: 18 }),
                            txt(periodo_evaluacion === p ? '☑' : '☐', { size: 18 }),
                        ]
                    })]
                }))
            ]
        })]
    }));
    children.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [] }));
    // ── 2. Instrucciones ────────────────────────────────────
    children.push(parrafo('2.  Instrucciones para el evaluador:', { bold: true, size: 22 }));
    children.push(parrafo('Los puntajes para evaluación serán los siguientes:', { size: 18 }));
    const escala = ['Muy insatisfactorio', 'Insatisfactorio', 'Bueno', 'Satisfactorio', 'Muy Satisfactorio'];
    const colEscala = Math.floor(TABLE_WIDTH / 5);
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: Array(5).fill(colEscala),
        rows: [
            new TableRow({
                children: escala.map((e, i) => new TableCell({
                    width: { size: colEscala, type: WidthType.DXA },
                    borders: bordersAll,
                    shading: { fill: '404040', type: ShadingType.CLEAR },
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(e, { bold: true, color: 'FFFFFF', size: 16 })] })]
                }))
            }),
            new TableRow({
                children: [1,2,3,4,5].map(n => new TableCell({
                    width: { size: colEscala, type: WidthType.DXA },
                    borders: bordersAll,
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(String(n), { bold: true, size: 22 })] })]
                }))
            }),
        ]
    }));
    children.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [txt('Califique cada pregunta utilizando los puntajes para evaluación anteriores, de acuerdo al criterio con el trabajo desempeñado por el evaluado.', { size: 18 })] }));
    children.push(new Paragraph({ spacing: { before: 0, after: 240 }, children: [txt('Al finalizar cada sección, sacara el promedio obtenido, esto se realiza sumando el total de todas las preguntas y dividiéndolo por la cantidad total de preguntas.', { size: 18 })] }));
    // ── 3. Secciones ────────────────────────────────────────
    secciones.forEach((seccion, idx) => {
        // Header de sección
        children.push(new Table({
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            columnWidths: [COL_PREGUNTA, COL_PUNT],
            rows: [new TableRow({
                children: [
                    cellGris(`${idx + 1}- ${seccion.nombre}`, COL_PREGUNTA, true),
                    cellGris('Puntuación', COL_PUNT, true),
                ]
            })]
        }));
        // Filas de preguntas
        const preguntasRows = seccion.preguntas.map((p) => {
            const letra = String.fromCharCode(97 + p.orden - 1); // a, b, c...
            const puntText = p.puntuacion ? String(p.puntuacion) : '';
            return new TableRow({
                children: [
                    cellBlanco(`${letra}. ${p.pregunta}`, COL_PREGUNTA),
                    cellBlanco(puntText, COL_PUNT, true, AlignmentType.CENTER),
                ]
            });
        });
        // Fila de promedio
        const promedioSeccion = seccion.preguntas.length > 0
            ? (seccion.preguntas.reduce((a, p) => a + (p.puntuacion || 0), 0) / seccion.preguntas.length).toFixed(2)
            : '—';
        preguntasRows.push(new TableRow({
            children: [
                new TableCell({
                    width: { size: COL_PREGUNTA, type: WidthType.DXA },
                    borders: bordersAll,
                    margins: { top: 60, bottom: 60, left: 120, right: 120 },
                    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt('Promedio:', { bold: true })] })]
                }),
                cellBlanco(promedioSeccion, COL_PUNT, true, AlignmentType.CENTER),
            ]
        }));
        children.push(new Table({
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            columnWidths: [COL_PREGUNTA, COL_PUNT],
            rows: preguntasRows,
        }));
        children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));
    });
    children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));
    // ── Puntuación general ───────────────────────────────────
    children.push(parrafo('Puntuación general de desempeño:', { bold: true, size: 22 }));
    children.push(parrafo('Para generar el promedio de desempeño, sumar el promedio de las secciones y dividir entre el número de secciones.', { size: 18 }));
    children.push(parrafo(`CALIFICACIÓN:  ${promedio_final || '—'}`, { bold: true, size: 20 }));
    children.push(new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }));
    // Tabla escala calificación final
    const escalaFinal = ['Muy insatisfactorio', 'Insatisfactorio', 'Regular', 'Satisfactorio', 'Muy Satisfactorio'];
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: Array(5).fill(colEscala),
        rows: [
            new TableRow({
                children: escalaFinal.map(e => new TableCell({
                    width: { size: colEscala, type: WidthType.DXA },
                    borders: bordersAll,
                    shading: { fill: '404040', type: ShadingType.CLEAR },
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(e, { bold: true, color: 'FFFFFF', size: 16 })] })]
                }))
            }),
            new TableRow({
                children: [1,2,3,4,5].map(n => new TableCell({
                    width: { size: colEscala, type: WidthType.DXA },
                    borders: bordersAll,
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(String(n), { bold: true, size: 22 })] })]
                }))
            }),
        ]
    }));
    children.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [] }));
    // Recontratación
    children.push(new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
            txt('¿De acuerdo al resultado obtenido de la evaluación de desempeño, considera la renovación de contrato?   ', { bold: true, size: 18 }),
            txt(`SI  ${recontratacion === 'Si' ? '☑' : '☐'}`, { size: 18 }),
            txt(`     NO  ${recontratacion === 'No' ? '☑' : '☐'}`, { size: 18 }),
        ]
    }));
    children.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [] }));
    // ── Comentario final ─────────────────────────────────────
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [TABLE_WIDTH],
        rows: [new TableRow({
            children: [new TableCell({
                width: { size: TABLE_WIDTH, type: WidthType.DXA },
                borders: bordersAll,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [
                    new Paragraph({ children: [txt("Comentario final", { bold: true, size: 18 })] }),
                    new Paragraph({ spacing: { before: 80, after: 80 }, children: [txt(comentario_final || "", { size: 18 })] }),
                    new Paragraph({ children: [txt("", { size: 18 })] }),
                    new Paragraph({ children: [txt("", { size: 18 })] }),
                ]
            })]
        })]
    }));
    children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));
    // ── 4. Comentarios ──────────────────────────────────────
    children.push(parrafo('3.  Comentarios', { bold: true, size: 22 }));
    const comentariosData = [
        ['Comentarios del empleado',                       comentario_empleado],
        ['Comentarios y recomendaciones del Jefe Inmediato', comentario_jefe_inmediato],
        ['Metas y objetivos del empleado para la próxima evaluación', comentario_siguiente_evaluacion],
    ];
    comentariosData.forEach(([label, valor]) => {
        children.push(new Table({
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            columnWidths: [TABLE_WIDTH],
            rows: [
                new TableRow({
                    children: [new TableCell({
                        width: { size: TABLE_WIDTH, type: WidthType.DXA },
                        borders: bordersAll,
                        margins: { top: 80, bottom: 80, left: 120, right: 120 },
                        children: [
                            new Paragraph({ children: [txt(label, { bold: true, size: 18 })] }),
                            new Paragraph({ spacing: { before: 80, after: 80 }, children: [txt(valor || '', { size: 18 })] }),
                            new Paragraph({ children: [txt('', { size: 18 })] }),
                            new Paragraph({ children: [txt('', { size: 18 })] }),
                        ]
                    })]
                }),
            ]
        }));
        children.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));
    });
    children.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [] }));
    // ── 5. Firmas ────────────────────────────────────────────
    children.push(parrafo('5.  Firmas', { bold: true, size: 22 }));
    children.push(parrafo('Las firmas de empleados y jefe inmediato dejan constancia del conocimiento de la evaluación.', { size: 18 }));
    children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));
    const COL_ROL   = 2340;
    const COL_FIRMA = 4680;
    const COL_FECHA = 2340;
    // Header firmas
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [COL_ROL, COL_FIRMA, COL_FECHA],
        rows: [
            new TableRow({
                children: [
                    new TableCell({ width: { size: COL_ROL, type: WidthType.DXA }, borders: bordersNone, children: [new Paragraph({ children: [] })] }),
                    new TableCell({
                        width: { size: COL_FIRMA, type: WidthType.DXA },
                        borders: bordersNone,
                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Nombre y Firma', { bold: true, size: 18 })] })]
                    }),
                    new TableCell({
                        width: { size: COL_FECHA, type: WidthType.DXA },
                        borders: bordersNone,
                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Fechas', { bold: true, size: 18 })] })]
                    }),
                ]
            }),
            ...['Colaborador', 'Jefe inmediato', 'Capacitación'].map(rol => new TableRow({
                height: { value: 1200, rule: 'atLeast' },
                children: [
                    new TableCell({
                        width: { size: COL_ROL, type: WidthType.DXA },
                        borders: bordersAll,
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 80, bottom: 80, left: 120, right: 120 },
                        children: [new Paragraph({ children: [txt(rol, { bold: true, size: 18 })] })]
                    }),
                    cellVacio(COL_FIRMA),
                    cellVacio(COL_FECHA),
                ]
            }))
        ]
    }));
    children.push(new Paragraph({ spacing: { before: 360, after: 120 }, children: [] }));
    // Pie de página
    children.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [txt('Distribuciones Autopartes García Jiménez S.A de C.V.', { size: 16, italics: true })]
    }));
    // ── Documento ────────────────────────────────────────────
    const doc = new Document({
        styles: {
            default: {
                document: { run: { font: 'Arial', size: 20 } }
            }
        },
        sections: [{
            properties: {
                page: {
                    size:   { width: 12240, height: 15840 },
                    margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
                }
            },
            children,
        }]
    });
    return await Packer.toBuffer(doc);
}
module.exports = { generarWordEvaluacion };