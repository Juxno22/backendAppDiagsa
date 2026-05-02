// src/models/generarExcelVacaciones.js
const ExcelJS = require('exceljs');
const path    = require('path');
const fs      = require('fs');

async function generarExcelVacaciones(vacacion) {
    const {
        nombre, apPaterno, apMaterno,
        departamento, usuarioId,
        fechaContratacion,
        dias_vacaciones_lft, dias_usados, dias_restantes,
        fecha_inicio_vacaciones, fecha_fin_vacaciones,
        dias_solicitados, anios_servicio,
    } = vacacion;

    const nombreCompleto = `${nombre || ''} ${apPaterno || ''} ${apMaterno || ''}`.trim();
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX') : '';
    const fechaCont   = fmtDate(fechaContratacion);
    const fechaInicio = fmtDate(fecha_inicio_vacaciones);
    const fechaFin    = fmtDate(fecha_fin_vacaciones);

    const diaIni  = fecha_inicio_vacaciones ? new Date(fecha_inicio_vacaciones).getDate() : '';
    const mesIni  = fecha_inicio_vacaciones ? new Date(fecha_inicio_vacaciones).toLocaleString('es-MX', { month: 'long' }) : '';
    const anioIni = fecha_inicio_vacaciones ? new Date(fecha_inicio_vacaciones).getFullYear() : '';
    const diaFin  = fecha_fin_vacaciones    ? new Date(fecha_fin_vacaciones).getDate() : '';
    const mesFin  = fecha_fin_vacaciones    ? new Date(fecha_fin_vacaciones).toLocaleString('es-MX', { month: 'long' }) : '';
    const anioFin = fecha_fin_vacaciones    ? new Date(fecha_fin_vacaciones).getFullYear() : '';

    // Fecha regreso = día siguiente al fin
    const fechaRegreso = fecha_fin_vacaciones
        ? (() => { const d = new Date(fecha_fin_vacaciones); d.setDate(d.getDate() + 1); return d.toLocaleDateString('es-MX'); })()
        : '';

    const hoy = new Date();
    const fechaDoc = `${hoy.getDate()} de ${hoy.toLocaleString('es-MX', { month: 'long' })} de ${hoy.getFullYear()}`;

    // ── Estilos helpers ─────────────────────────────────────────
    const borderThin = {
        top:    { style: 'thin' },
        left:   { style: 'thin' },
        bottom: { style: 'thin' },
        right:  { style: 'thin' },
    };
    const fillGray   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } };
    const fillYellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    const fillWhite  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    const fontBold   = (size = 10) => ({ name: 'Arial', size, bold: true });
    const fontNormal = (size = 10) => ({ name: 'Arial', size });

    const alignCenter = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const alignLeft   = { horizontal: 'left',   vertical: 'middle', wrapText: true };

    // ── Workbook ────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DIAGSA';
    const ws = wb.addWorksheet('Vacaciones', {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
    });

    // Ancho de columnas (A-L = 12 columnas)
    ws.columns = [
        { width: 4  }, // A
        { width: 4  }, // B
        { width: 12 }, // C
        { width: 12 }, // D
        { width: 8  }, // E
        { width: 12 }, // F
        { width: 4  }, // G
        { width: 12 }, // H
        { width: 4  }, // I
        { width: 12 }, // J
        { width: 8  }, // K
        { width: 12 }, // L
    ];

    // ── Helper para aplicar borde a rango ──────────────────────
    function borderRange(startRow, startCol, endRow, endCol) {
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const cell = ws.getCell(r, c);
                cell.border = borderThin;
            }
        }
    }

    function styleCell(cell, opts = {}) {
        if (opts.fill)      cell.fill      = opts.fill;
        if (opts.font)      cell.font      = opts.font;
        if (opts.alignment) cell.alignment = opts.alignment;
        if (opts.border !== false) cell.border = borderThin;
    }

    // ── FILA 1-3: Logo + Encabezado ─────────────────────────────
    // Logo en A1:B3
    const logoPath = path.join(__dirname, '../services/diagsa.png');
    if (fs.existsSync(logoPath)) {
        const logoId = wb.addImage({ buffer: fs.readFileSync(logoPath), extension: 'png' });
        ws.addImage(logoId, { tl: { col: 0, row: 0 }, br: { col: 2, row: 3 } });
    }
    ws.mergeCells('A1:B3');
    borderRange(1, 1, 3, 2);

    // Título empresa C1:L2
    ws.mergeCells('C1:L1');
    const titEmpresa = ws.getCell('C1');
    titEmpresa.value     = 'DISTRIBUCIONES AUTOPARTES GARCIA JIMENEZ SA DE CV';
    titEmpresa.font      = fontBold(12);
    titEmpresa.alignment = alignCenter;
    titEmpresa.border    = borderThin;

    ws.mergeCells('C2:L2');
    const titSol = ws.getCell('C2');
    titSol.value     = 'SOLICITUD Y AUTORIZACION DE';
    titSol.font      = fontBold(11);
    titSol.alignment = alignCenter;
    titSol.border    = borderThin;

    ws.mergeCells('C3:L3');
    const titVac = ws.getCell('C3');
    titVac.value     = 'VACACIONES';
    titVac.font      = fontBold(13);
    titVac.alignment = alignCenter;
    titVac.border    = borderThin;

    // ── FILA 4: Texto introductorio ────────────────────────────
    ws.mergeCells('A4:L4');
    const intro = ws.getCell('A4');
    intro.value     = 'POR EL PRESENTE EXPRESO MI CONFORMIDAD DE SOLICITAR Y GOZAR MIS VACACIONES DE ACUERDO A LO QUE ESTABLECE EL ARTICULO 76 DE LA LEY FEDERAL DEL TRABAJO, CONSIDERANDO LOS SIGUIENTES DATOS:';
    intro.font      = fontNormal(9);
    intro.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    intro.border    = borderThin;
    ws.getRow(4).height = 30;

    // ── FILA 5: Empresa + Departamento ─────────────────────────
    ws.mergeCells('A5:B5');
    styleCell(ws.getCell('A5'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('A5').value = 'Nombre de la Empresa:';

    ws.mergeCells('C5:G5');
    styleCell(ws.getCell('C5'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('C5').value = 'DISTRIBUCIONES AUTOPARTES GARCIA JIMENEZ';

    ws.mergeCells('H5:I5');
    styleCell(ws.getCell('H5'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('H5').value = 'Área y/o Departamento:';

    ws.mergeCells('J5:L5');
    styleCell(ws.getCell('J5'), { fill: fillYellow, font: fontBold(10), alignment: alignCenter });
    ws.getCell('J5').value = (departamento || 'CEDIS').toUpperCase();

    // ── FILA 6: No Empleado + Nombre ────────────────────────────
    ws.mergeCells('A6:B6');
    styleCell(ws.getCell('A6'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('A6').value = 'No de Empleado:';

    ws.mergeCells('C6:E6');
    styleCell(ws.getCell('C6'), { font: fontNormal(10), alignment: alignLeft });
    ws.getCell('C6').value = String(usuarioId || '');

    ws.mergeCells('F6:H6');
    styleCell(ws.getCell('F6'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('F6').value = 'Nombre del Empleado:';

    ws.mergeCells('I6:L6');
    styleCell(ws.getCell('I6'), { font: fontNormal(10), alignment: alignLeft });
    ws.getCell('I6').value = nombreCompleto;

    // ── FILA 7: Fecha Ingreso + Años servicio ───────────────────
    ws.mergeCells('A7:B7');
    styleCell(ws.getCell('A7'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('A7').value = 'Fecha de Ingreso:';

    ws.mergeCells('C7:E7');
    styleCell(ws.getCell('C7'), { font: fontNormal(10), alignment: alignLeft });
    ws.getCell('C7').value = fechaCont;

    ws.mergeCells('F7:H7');
    styleCell(ws.getCell('F7'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('F7').value = 'Años de Servicio:';

    ws.mergeCells('I7:K7');
    styleCell(ws.getCell('I7'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('I7').value = String(anios_servicio ?? '');

    styleCell(ws.getCell('L7'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('L7').value = 'AÑOS';

    // ── FILA 8: Días corresponden / disfrutar / pendientes ──────
    styleCell(ws.getCell('A8'), { fill: fillGray, font: fontBold(9), alignment: alignLeft, border: borderThin });
    ws.getCell('A8').value = '';

    ws.mergeCells('B8:C8');
    styleCell(ws.getCell('B8'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('B8').value = 'Días que corresponden:';

    styleCell(ws.getCell('D8'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('D8').value = String(dias_vacaciones_lft || '');

    ws.mergeCells('E8:F8');
    styleCell(ws.getCell('E8'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('E8').value = 'Días a disfrutar:';

    ws.mergeCells('G8:H8');
    styleCell(ws.getCell('G8'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('G8').value = String(dias_solicitados || '');

    ws.mergeCells('I8:J8');
    styleCell(ws.getCell('I8'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('I8').value = 'Días Pendientes:';

    ws.mergeCells('K8:L8');
    styleCell(ws.getCell('K8'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('K8').value = String(dias_restantes || '');

    // ── FILA 9: Período a disfrutar ─────────────────────────────
    ws.mergeCells('A9:B9');
    styleCell(ws.getCell('A9'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('A9').value = 'Período a Disfrutar:';

    ws.mergeCells('C9:D9');
    styleCell(ws.getCell('C9'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('C9').value = 'del Año de';

    ws.mergeCells('E9:G9');
    styleCell(ws.getCell('E9'), { fill: fillYellow, font: fontBold(10), alignment: alignCenter });
    ws.getCell('E9').value = String(anioIni);

    ws.mergeCells('H9:I9');
    styleCell(ws.getCell('H9'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('H9').value = 'al Año';

    ws.mergeCells('J9:L9');
    styleCell(ws.getCell('J9'), { fill: fillYellow, font: fontBold(10), alignment: alignCenter });
    ws.getCell('J9').value = String(anioFin);

    // ── FILA 10: Header días inicio ─────────────────────────────
    ws.mergeCells('A10:L10');
    styleCell(ws.getCell('A10'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('A10').value = 'Días que Inician sus Vacaciones';

    // ── FILA 11: del X de MES del AÑO ──────────────────────────
    ws.mergeCells('A11:B11');
    styleCell(ws.getCell('A11'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('A11').value = '';

    styleCell(ws.getCell('C11'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('C11').value = 'del';

    ws.mergeCells('D11:F11');
    styleCell(ws.getCell('D11'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('D11').value = String(diaIni);

    styleCell(ws.getCell('G11'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('G11').value = 'de';

    ws.mergeCells('H11:J11');
    styleCell(ws.getCell('H11'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('H11').value = mesIni;

    styleCell(ws.getCell('K11'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('K11').value = 'del';

    styleCell(ws.getCell('L11'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('L11').value = String(anioIni);

    // ── FILA 12: al Y de MES del AÑO ───────────────────────────
    ws.mergeCells('A12:B12');
    styleCell(ws.getCell('A12'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('A12').value = '';

    styleCell(ws.getCell('C12'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('C12').value = 'al';

    ws.mergeCells('D12:F12');
    styleCell(ws.getCell('D12'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('D12').value = String(diaFin);

    styleCell(ws.getCell('G12'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('G12').value = 'de';

    ws.mergeCells('H12:J12');
    styleCell(ws.getCell('H12'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('H12').value = mesFin;

    styleCell(ws.getCell('K12'), { fill: fillGray, font: fontBold(9), alignment: alignCenter });
    ws.getCell('K12').value = 'del';

    styleCell(ws.getCell('L12'), { font: fontNormal(10), alignment: alignCenter });
    ws.getCell('L12').value = String(anioFin);

    // ── FILA 13: Fecha regreso ───────────────────────────────────
    ws.mergeCells('A13:E13');
    styleCell(ws.getCell('A13'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('A13').value = 'FECHA EN QUE DEBERÁ DE PRESENTARSE A TRABAJAR:';

    ws.mergeCells('F13:L13');
    styleCell(ws.getCell('F13'), { font: fontNormal(10), alignment: alignLeft });
    ws.getCell('F13').value = fechaRegreso;

    // ── FILA 14-15: Observaciones ───────────────────────────────
    ws.mergeCells('A14:C14');
    styleCell(ws.getCell('A14'), { fill: fillGray, font: fontBold(9), alignment: alignLeft });
    ws.getCell('A14').value = 'OBSERVACIONES:';

    ws.mergeCells('D14:L14');
    styleCell(ws.getCell('D14'), { font: fontNormal(10), alignment: alignLeft });
    ws.getCell('D14').value = '';

    ws.mergeCells('A15:L15');
    styleCell(ws.getCell('A15'), { font: fontNormal(10), alignment: alignLeft });
    ws.getCell('A15').value = '';
    ws.getRow(15).height = 30;

    // ── FILA 16: Espacio ────────────────────────────────────────
    ws.mergeCells('A16:L16');
    ws.getCell('A16').value = '';
    ws.getRow(16).height = 15;

    // ── FILA 17: Ciudad y fecha ─────────────────────────────────
    ws.mergeCells('A17:L17');
    const ciudadCell = ws.getCell('A17');
    ciudadCell.value     = `TEHUACAN, PUEBLA   A   ${fechaDoc}   DE`;
    ciudadCell.font      = fontBold(10);
    ciudadCell.alignment = alignCenter;
    ws.getRow(17).height = 20;

    // ── FILA 18: Espacio firmas ─────────────────────────────────
    ws.mergeCells('A18:D18');
    ws.getCell('A18').value = '';
    ws.mergeCells('E18:H18');
    ws.getCell('E18').value = '';
    ws.mergeCells('I18:L18');
    ws.getCell('I18').value = '';
    borderRange(18, 1, 18, 12);
    ws.getRow(18).height = 50;

    // ── FILA 19: Espacio firmas 2 ───────────────────────────────
    ws.mergeCells('A19:D19');
    ws.getCell('A19').value = '';
    ws.mergeCells('E19:H19');
    ws.getCell('E19').value = '';
    ws.mergeCells('I19:L19');
    ws.getCell('I19').value = '';
    borderRange(19, 1, 19, 12);
    ws.getRow(19).height = 30;

    // ── FILA 20: Labels firmas ──────────────────────────────────
    ws.mergeCells('A20:D20');
    const f1 = ws.getCell('A20');
    f1.value     = 'Firma de Conformidad\ndel Empleado';
    f1.font      = fontBold(9);
    f1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    f1.fill      = fillGray;
    f1.border    = borderThin;

    ws.mergeCells('E20:H20');
    const f2 = ws.getCell('E20');
    f2.value     = 'Nombre y Firma de Autorización del\nGerente del Área y/o Director';
    f2.font      = fontBold(9);
    f2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    f2.fill      = fillGray;
    f2.border    = borderThin;

    ws.mergeCells('I20:L20');
    const f3 = ws.getCell('I20');
    f3.value     = 'Nombre y Firma Recursos Humanos';
    f3.font      = fontBold(9);
    f3.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    f3.fill      = fillGray;
    f3.border    = borderThin;

    ws.getRow(20).height = 30;

    // Alturas de filas
    ws.getRow(1).height = 20;
    ws.getRow(2).height = 18;
    ws.getRow(3).height = 22;
    ws.getRow(5).height = 22;
    [6,7,8,9,10,11,12,13,14].forEach(r => { ws.getRow(r).height = 18; });

    return await wb.xlsx.writeBuffer();
}

module.exports = { generarExcelVacaciones };