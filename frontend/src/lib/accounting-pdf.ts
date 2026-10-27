'use client';

import { api } from './api';

export type PdfTable = { title: string; headers: string[]; rows: string[][]; totals?: string[]; weights?: number[] };
export type AccountingPdfReport = {
  title: string; projectId: number; period: string; summaryPeriod: string;
  registerOnly?: boolean;
  branding?: { projectName: string; date: string; logos: string[] };
  cards: string[][]; register: PdfTable; summaries: PdfTable[];
  cardColors?: string[];
  chart: { title: string; labels: string[]; series: { name: string; values: number[] }[] };
};

const text = (value: unknown) => String(value ?? '').replace(/[−–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e\u00a0-\u00ff]/g, ' ');
const money = (value: number) => value.toLocaleString('es-PE', { maximumFractionDigits: 2 });

export async function createAccountingPdf(report: AccountingPdfReport) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logos = await Promise.all((report.branding?.logos || []).map(data => pdf.embedPng(data)));
  const blue = rgb(.08, .23, .43), ink = rgb(.13, .2, .29), muted = rgb(.39, .45, .53);
  const line = rgb(.83, .87, .92), pale = rgb(.95, .97, .99);
  const colors = [rgb(.09, .47, .95), rgb(.93, .61, .25)];
  const width = 841.89, height = 595.28, margin = 28, usable = width - margin * 2;
  pdf.setTitle(`${report.title} - Proyecto ${report.projectId}`);
  pdf.setAuthor('CRM Inmobiliario');
  let page = pdf.addPage([width, height]);
  let y = height - margin;
  const write = (value: unknown, x: number, top: number, size = 9, strong = false, color = ink) => page.drawText(text(value), { x, y: top - size, size, font: strong ? bold : regular, color });
  const wrap = (value: unknown, max: number, size: number, strong = false) => {
    const font = strong ? bold : regular;
    const lines: string[] = []; let current = '';
    for (const char of text(value)) {
      if (current && font.widthOfTextAtSize(current + char, size) > max) { lines.push(current.trimEnd()); current = ''; }
      current += char;
    }
    lines.push(current.trim()); return lines;
  };
  const header = (subtitle: string) => {
    page.drawRectangle({ x: 0, y: height - 7, width, height: 7, color: blue });
    if (report.branding) {
      logos.forEach((logo, index) => {
        const dimensions = logo.scale(Math.min(100 / logo.width, 40 / logo.height));
        page.drawImage(logo, { x: width - margin - logos.length * 112 + index * 112 + (100 - dimensions.width) / 2, y: y - 42, ...dimensions });
      });
      const titleX = margin;
      write(report.title, titleX, y - 2, 19, true, blue);
      wrap(report.branding.projectName, usable - logos.length * 112 - 20, 10, true).slice(0, 2).forEach((value, index) => write(value, titleX, y - 28 - index * 12, 10, true));
      y -= 62;
      write(`Fecha: ${report.branding.date}`, margin, y, 9, false, muted); y -= 18;
      wrap(subtitle, usable, 9).forEach(value => { write(value, margin, y, 9, false, muted); y -= 12; });
      y -= 12;
      return;
    }
    write(report.title, margin, y, 19, true, blue); y -= 27;
    write(`Proyecto ${report.projectId} | ${subtitle}`, margin, y, 9, false, muted); y -= 20;
  };
  const nextPage = (subtitle: string) => { page = pdf.addPage([width, height]); y = height - margin; header(subtitle); };
  header(report.period);
  const cardGap = 7, cardWidth = (usable - cardGap * (report.cards.length - 1)) / report.cards.length;
  const cardLabels = report.cards.map(([label]) => wrap(label, cardWidth - 12, 8, true).slice(0, 2));
  const cardDescriptions = report.cards.map(([, , description]) => wrap(description, cardWidth - 12, 7).slice(0, 3));
  const labelHeight = Math.max(1, ...cardLabels.map(lines => lines.length)) * 9;
  const descriptionHeight = Math.max(1, ...cardDescriptions.map(lines => lines.length)) * 8;
  const valueTop = 8 + labelHeight + 4;
  const descriptionTop = valueTop + 18;
  const cardHeight = descriptionTop + descriptionHeight + 6;
  report.cards.forEach(([, value], index) => {
    const hex = report.cardColors?.[index];
    const tone = hex ? rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255) : blue;
    const x = margin + index * (cardWidth + cardGap);
    page.drawRectangle({ x, y: y - cardHeight, width: cardWidth, height: cardHeight, color: pale, borderColor: line, borderWidth: .6 });
    page.drawRectangle({ x, y: y - 3, width: cardWidth, height: 3, color: tone });
    cardLabels[index].forEach((s, i) => write(s, x + 6, y - 8 - i * 9, 8, true, muted));
    const valueSize = Math.min(13, (cardWidth - 12) / Math.max(1, bold.widthOfTextAtSize(text(value), 1)));
    write(value, x + 6 + (cardWidth - 12 - bold.widthOfTextAtSize(text(value), valueSize)) / 2, y - valueTop, valueSize, true, tone);
    cardDescriptions[index].forEach((s, i) => write(s, x + 6, y - descriptionTop - i * 8, 7, false, muted));
  });
  if (report.cards.length) y -= cardHeight + 19;

  const drawTable = (table: PdfTable, x: number, tableWidth: number, start: number, allowPages: boolean) => {
    let top = start;
    const size = table.headers.length > 12 ? 6.5 : 8;
    const leading = size + 3;
    const weights = table.headers.map((_, i) => table.weights?.[i] || 1);
    const weight = weights.reduce((n, w) => n + w, 0);
    const widths = weights.map(w => tableWidth * w / weight);
    const documentColumn = report.registerOnly ? table.headers.findIndex(value => /^Tipo (?:de )?doc/i.test(value)) : -1;
    if (documentColumn >= 0 && /^Tipo (?:de )?documento$/i.test(table.headers[documentColumn]) && widths[documentColumn] < 108) {
      const remaining = tableWidth - widths[documentColumn];
      widths.forEach((value, index) => { widths[index] = index === documentColumn ? 108 : value * (tableWidth - 108) / remaining; });
    }
    const headerLines = (value: string, index: number) => {
      const lines: string[] = [];
      for (const paragraph of String(value).split('\n')) {
        let current = '';
        for (const word of text(paragraph).split(/\s+/)) {
          const candidate = current ? `${current} ${word}` : word;
          if (current && bold.widthOfTextAtSize(candidate, size) > widths[index] - 8) {
            lines.push(current);
            current = word;
          } else current = candidate;
        }
        lines.push(current);
      }
      return lines;
    };
    const cellLines = (value: string, index: number, strong: boolean) => index === documentColumn ? [text(value)] : wrap(value, widths[index] - 8, size, strong);
    const drawRow = (values: string[][], offset: number, count: number, heading: boolean, total: boolean) => {
      const rowHeight = count * leading + 8;
      let left = x;
      values.forEach((lines, index) => {
        page.drawRectangle({ x: left, y: top - rowHeight, width: widths[index], height: rowHeight, color: report.registerOnly ? total ? rgb(18 / 255, 46 / 255, 105 / 255) : heading ? rgb(82 / 255, 114 / 255, 143 / 255) : table.headers[index].startsWith('Saldo') ? rgb(237 / 255, 244 / 255, 252 / 255) : rgb(1, 1, 1) : heading || total ? blue : rgb(1, 1, 1), borderColor: line, borderWidth: .4 });
        lines.slice(offset, offset + count).forEach((s, i) => {
          const cellSize = heading || index === documentColumn ? Math.min(size, (widths[index] - 8) / Math.max(1, (heading || total ? bold : regular).widthOfTextAtSize(text(s), 1))) : size;
          write(s, report.registerOnly && !heading && /^(Abono|Gasto|Saldo)/.test(table.headers[index]) ? left + widths[index] - 4 - (total ? bold : regular).widthOfTextAtSize(text(s), cellSize) : left + 4, top - 4 - i * leading, cellSize, heading || total, heading || total ? rgb(1, 1, 1) : ink);
        });
        left += widths[index];
      });
      top -= rowHeight;
    };
    const heading = () => {
      write(table.title, x, top, 11, true, blue); top -= 19;
      const cells = table.headers.map((v, i) => headerLines(v, i));
      drawRow(cells, 0, Math.max(...cells.map(v => v.length)), true, false);
    };
    heading();
    const rows = table.rows.length ? table.rows : [table.headers.map((_, i) => i === 0 ? 'Sin registros' : '')];
    [...rows, ...(table.totals ? [table.totals] : [])].forEach((row, index) => {
      const total = !!table.totals && index === rows.length;
      const cells = table.headers.map((_, i) => cellLines(row[i] || '', i, total));
      const lineCount = Math.max(...cells.map(v => v.length));
      let offset = 0;
      while (offset < lineCount) {
        let available = Math.floor((top - margin - 23) / leading);
        if (allowPages && (available < 1 || (offset === 0 && lineCount <= 5 && lineCount > available))) {
          nextPage(report.period); top = y; heading(); available = Math.floor((top - margin - 23) / leading);
        }
        const count = allowPages ? Math.min(lineCount - offset, Math.max(1, available)) : lineCount;
        drawRow(cells, offset, count, false, total); offset += count;
      }
    });
    return top;
  };
  if (!report.registerOnly) {
  write(report.summaryPeriod, margin, y, 10, true, muted); y -= 20;
  const summaryTop = y;
  const leftWidth = usable * .43;
  const primary = report.summaries[0];
  if (primary) drawTable(primary, margin, leftWidth, summaryTop, false);
  const chartX = margin + leftWidth + 23, chartWidth = usable - leftWidth - 23;
  write(report.chart.title, chartX, summaryTop, 11, true, blue);
  const plotX = chartX + 48, plotY = summaryTop - 226, plotWidth = chartWidth - 55, plotHeight = 180;
  const allValues = report.chart.series.flatMap(s => s.values);
  const min = Math.min(0, ...allValues), max = Math.max(1, ...allValues), range = max - min;
  const zero = plotY + (-min / range) * plotHeight;
  for (let tick = 0; tick <= 4; tick++) {
    const py = plotY + tick * plotHeight / 4;
    page.drawLine({ start: { x: plotX, y: py }, end: { x: plotX + plotWidth, y: py }, thickness: .5, color: line });
    write(money(min + range * tick / 4), chartX, py + 4, 7, false, muted);
  }
  const step = plotWidth / Math.max(1, report.chart.labels.length);
  const barWidth = step * .7 / Math.max(1, report.chart.series.length);
  report.chart.labels.forEach((label, index) => {
    report.chart.series.forEach((series, j) => {
      const value = series.values[index] || 0, barHeight = Math.abs(value) / range * plotHeight;
      page.drawRectangle({ x: plotX + step * index + step * .15 + j * barWidth, y: value < 0 ? zero - barHeight : zero, width: barWidth - 1, height: barHeight, color: colors[j % colors.length] });
    });
    write(label.slice(0, 3), plotX + step * index + 2, plotY - 8, 7, false, muted);
  });
  report.chart.series.forEach((series, index) => {
    const x = chartX + index * (chartWidth / 2);
    page.drawRectangle({ x, y: plotY - 44, width: 8, height: 8, color: colors[index % colors.length] });
    write(`${series.name}: ${money(series.values.reduce((n, v) => n + v, 0))}`, x + 12, plotY - 35, 8, false, muted);
  });
  report.summaries.slice(1).forEach(summary => { nextPage(report.summaryPeriod); drawTable(summary, margin, usable * .6, y, true); });
  nextPage(report.period);
  }
  drawTable(report.register, margin, usable, y, true);
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawLine({ start: { x: margin, y: 24 }, end: { x: width - margin, y: 24 }, thickness: .5, color: line });
    p.drawText(text(`Contabilidad | ${report.title}`), { x: margin, y: 13, size: 7, font: regular, color: muted });
    p.drawText(`${index + 1} / ${pages.length}`, { x: width - margin - 35, y: 13, size: 7, font: regular, color: muted });
  });
  return pdf.save();
}

export async function downloadAccountingPdf(report: AccountingPdfReport) {
  if (report.registerOnly) {
    const project = await api.get<{ name: string; logoImageUrl?: string }>(`/projects/${report.projectId}`);
    const logos = await Promise.all(['/logo/dunacon.png', ...(project.logoImageUrl ? [project.logoImageUrl] : [])].map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo cargar un logo del reporte.');
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No se pudo preparar el logo.');
        context.drawImage(bitmap, 0, 0);
        return canvas.toDataURL('image/png');
      } finally { bitmap.close(); }
    }));
    report = { ...report, branding: { projectName: project.name, date: new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()), logos } };
  }
  const bytes = await createAccountingPdf(report);
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `${report.title.toLowerCase().replace(/\s+/g, '-')}-proyecto-${report.projectId}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
