'use client';

import { api } from './api';
import type { AccountingPdfReport, PdfTable } from './accounting-pdf';

type Branding = { name: string; logos: { base64: string; width: number; height: number }[] };
const tones = ['16A36A', '2563EB', 'DC2626', 'CA8A04', 'DC2626', '16A36A', '2563EB'];

export async function createAccountingExcel(report: AccountingPdfReport, branding: Branding) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Dunacon';
  const sheet = workbook.addWorksheet('Contabilidad', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .25, right: .25, top: .3, bottom: .3, header: .1, footer: .1 } },
  });
  const columns = Math.max(14, report.register.headers.length);
  sheet.columns = Array.from({ length: columns }, (_, index) => ({ width: index === 6 ? 25 : 16 }));
  const fill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${hex}` } });
  const merged = (row: number, from: number, to: number, value: string, color = '183454', size = 11, background?: string) => {
    if (to > from) sheet.mergeCells(row, from, row, to);
    const cell = sheet.getCell(row, from); cell.value = value;
    cell.font = { name: 'Calibri', size, bold: true, color: { argb: `FF${color}` } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (background) for (let column = from; column <= to; column++) sheet.getCell(row, column).fill = fill(background);
  };
  sheet.getRow(1).height = 38; sheet.getRow(2).height = 30;
  branding.logos.forEach((logo, index) => {
    const imageId = workbook.addImage({ base64: logo.base64, extension: 'png' });
    const scale = Math.min(150 / logo.width, 75 / logo.height);
    sheet.addImage(imageId, { tl: { col: index * 2, row: 0 }, ext: { width: logo.width * scale, height: logo.height * scale } });
  });
  merged(1, 5, columns, 'DUNACON · CONTABILIDAD', '153E78', 18);
  merged(2, 5, columns, branding.name, '475569', 13);
  merged(4, 1, columns, report.title, '153E78', 16); sheet.getRow(4).height = 28;
  merged(5, 1, columns, report.period, '64748B', 10); sheet.getRow(5).height = 28;
  let cursor = 7;
  if (report.cards.length) {
    const span = Math.floor(columns / report.cards.length);
    report.cards.forEach(([label, value, description], index) => {
      const start = index * span + 1, end = index === report.cards.length - 1 ? columns : start + span - 1;
      merged(cursor, start, end, label, '64748B', 10, 'F8FAFC');
      merged(cursor + 1, start, end, value, tones[index % tones.length], 16, 'F8FAFC');
      merged(cursor + 2, start, end, description, '64748B', 9, 'F8FAFC');
      for (let column = start; column <= end; column++) sheet.getCell(cursor, column).border = { top: { style: 'medium', color: { argb: `FF${tones[index % tones.length]}` } } };
    });
    sheet.getRow(cursor).height = 30; sheet.getRow(cursor + 1).height = 32; sheet.getRow(cursor + 2).height = 30;
    cursor += 5;
  }
  const table = (data: PdfTable) => {
    merged(cursor++, 1, columns, data.title, '153E78', 13);
    const headerRow = cursor;
    const rows = [data.headers, ...data.rows, ...(data.totals ? [data.totals] : [])];
    rows.forEach((values, index) => {
      const heading = index === 0, total = !!data.totals && index === rows.length - 1;
      const row = sheet.getRow(cursor++); row.height = heading ? 34 : 28;
      values.forEach((value, column) => {
        const cell = row.getCell(column + 1);
        // Keep identifiers (RUC, document numbers) and formatted values as text.
        cell.value = value;
        const usd = heading && /US\$/.test(value), pen = heading && /S\//.test(value);
        const background = total ? '122E69' : heading ? usd ? '3E7E20' : pen ? '8F9EAE' : '52728F' : index % 2 ? 'FFFFFF' : 'F8FAFC';
        cell.fill = fill(background);
        cell.font = { name: 'Calibri', size: 10, bold: heading || total, color: { argb: heading || total ? pen && !total ? 'FF102E4D' : 'FFFFFFFF' : 'FF183454' } };
        cell.alignment = { vertical: 'middle', wrapText: true, horizontal: heading ? 'center' : 'left' };
        cell.border = { top: { style: 'thin', color: { argb: 'FFD5DBE3' } }, bottom: { style: 'thin', color: { argb: 'FFD5DBE3' } } };
      });
    });
    cursor += 2;
    return headerRow;
  };
  const registerHeader = table(report.register);
  sheet.autoFilter = { from: { row: registerHeader, column: 1 }, to: { row: registerHeader + report.register.rows.length, column: report.register.headers.length } };
  merged(cursor++, 1, columns, report.summaryPeriod, '64748B', 11);
  report.summaries.forEach(table);
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(columns).letter}${cursor - 1}`;
  sheet.pageSetup.printTitlesRow = `${registerHeader}:${registerHeader}`;
  sheet.headerFooter.oddFooter = '&LDunacon · Contabilidad&R&P / &N';
  return workbook.xlsx.writeBuffer();
}

async function loadLogo(url: string): Promise<Branding['logos'][number]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo cargar un logo del reporte.');
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar el logo.');
    context.drawImage(bitmap, 0, 0);
    return { base64: canvas.toDataURL('image/png'), width: bitmap.width, height: bitmap.height };
  } finally { bitmap.close(); }
}

export async function downloadAccountingExcel(report: AccountingPdfReport) {
  const project = await api.get<{ name: string; logoImageUrl?: string }>(`/projects/${report.projectId}`);
  const logos = await Promise.all(['/logo/dunacon.png', ...(project.logoImageUrl ? [project.logoImageUrl] : [])].map(loadLogo));
  const bytes = await createAccountingExcel(report, { name: project.name, logos });
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `${report.title.toLowerCase().replace(/\s+/g, '-')}-proyecto-${report.projectId}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
