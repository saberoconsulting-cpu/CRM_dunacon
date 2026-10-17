import { BadRequestException } from '@nestjs/common';
import { PDFDocument, PDFTextField, StandardFonts, rgb } from 'pdf-lib';
import { CONTRACT_FIELDS } from './contract-template';
import { normalizeContractText, ContractBranding } from './contract-presentation';

// Keep native import: TypeScript's CommonJS transform cannot require PDF.js ESM.
const importPdfJs = new Function('return import("pdfjs-dist/legacy/build/pdf.mjs")') as () => Promise<any>;

export async function inspectPdfContractTemplate(buffer: Buffer) {
  let task: any;
  try {
    const pdfjs = await importPdfJs();
    task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new BadRequestException('La plantilla supera las 100 páginas.');
    const paragraphs: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      let line = '';
      let paragraph = '';
      let previousY: number | null = null;
      let previousHeight = 12;
      for (const item of items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform[5];
        if (previousY != null && Math.abs(y - previousY) > previousHeight * 1.6) {
          if (paragraph || line) paragraphs.push(`${paragraph} ${line}`.trim());
          paragraph = ''; line = '';
        }
        line += item.str;
        if (item.hasEOL) { paragraph += `${line} `; line = ''; }
        previousY = y;
        previousHeight = Math.max(8, Math.abs(item.height || item.transform[3] || 12));
      }
      if (paragraph || line) paragraphs.push(`${paragraph} ${line}`.trim());
    }
    const formDoc = await PDFDocument.load(buffer);
    const formFields = formDoc.getForm().getFields().map(field => field.getName()).filter(name => !/^\{?cliente_(telefono|correo)\}?$/i.test(name));
    const cleanedParagraphs = paragraphs.map(normalizeContractText).filter(Boolean);
    const text = cleanedParagraphs.join('\n\n');
    const tags = [...text.matchAll(/\{\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*\}/g)].map(match => match[1].toLowerCase());
    const fields = [...new Set([...tags, ...formFields.map(field => field.replace(/^\{|\}$/g, '').trim().toLowerCase())])];
    return { text, paragraphs: cleanedParagraphs, fields, formFields, availableFields: CONTRACT_FIELDS, format: 'pdf' as const };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('No se pudo leer el PDF. Sube un PDF válido y sin contraseña.');
  } finally { await task?.destroy(); }
}

export async function renderPdfContract(buffer: Buffer, data: Record<string, string>, branding?: ContractBranding) {
  const info = await inspectPdfContractTemplate(buffer);
  if (!info.fields.length) throw new BadRequestException('Este PDF no contiene campos para completar. Agrega campos como {cliente_nombre} y {lote_codigo}, o campos de formulario con esos nombres. Si es un escaneo, necesita una capa de texto.');
  const unknown = info.fields.filter(field => !(CONTRACT_FIELDS as readonly string[]).includes(field));
  if (unknown.length) throw new BadRequestException(`Campos de plantilla no disponibles: ${unknown.join(', ')}`);
  const missing = info.fields.filter(field => !data[field]?.trim());
  if (missing.length) throw new BadRequestException(`Completa los datos de la venta antes de generar el contrato: ${missing.join(', ')}`);

  // Fillable PDFs retain their original page artwork and layout.
  if (info.formFields.length && !/\{\s*[a-zA-Z_][a-zA-Z_0-9]*\s*\}/.test(info.text)) {
    const pdf = await PDFDocument.load(buffer);
    const form = pdf.getForm();
    for (const field of form.getFields()) {
      if (/^\{?cliente_(telefono|correo)\}?$/i.test(field.getName())) { form.removeField(field); continue; }
      if (!(field instanceof PDFTextField)) throw new BadRequestException(`El campo ${field.getName()} debe ser un campo de texto.`);
      field.setText(data[field.getName().replace(/^\{|\}$/g, '').trim().toLowerCase()]);
    }
    form.flatten();
    return Buffer.from(await pdf.save());
  }

  // A text PDF has no flowing paragraphs. Rebuild its text with pagination so
  // long customer names and prices never overlap clauses or leave hidden tags.
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const labelFont = await pdf.embedFont(StandardFonts.Helvetica);
  const companyLogo = branding?.companyLogo ? await pdf.embedPng(branding.companyLogo) : null;
  const projectLogo = branding?.projectLogo ? await pdf.embedPng(branding.projectLogo) : null;
  const blue = rgb(0.07, 0.18, 0.36);
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.4, 0.44, 0.49);
  const margin = 48;
  const width = 595.28 - margin * 2;
  let page: ReturnType<typeof pdf.addPage>;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    for (const [image, right] of [[companyLogo, false], [projectLogo, true]] as const) {
      if (!image) continue;
      const scale = Math.min(142 / image.width, 43 / image.height);
      const w = image.width * scale, h = image.height * scale;
      page.drawImage(image, { x: right ? 595.28 - margin - w : margin, y: 781 + (43 - h) / 2, width: w, height: h });
    }
    page.drawLine({ start: { x: margin, y: 771 }, end: { x: 595.28 - margin, y: 771 }, color: blue, thickness: 1 });
    y = 750;
  };
  newPage();
  const title = 'CONTRATO DE COMPRAVENTA DE LOTE';
  page!.drawText(title, { x: (595.28 - bold.widthOfTextAtSize(title, 15)) / 2, y, font: bold, size: 15, color: blue });
  y -= 22;
  const subtitle = `${data.proyecto_nombre || ''}  |  Lote ${data.lote_codigo || ''}  |  Contrato V${data.venta_id || ''}`;
  const subtitleSize = Math.min(9, width / Math.max(1, labelFont.widthOfTextAtSize(subtitle, 1)));
  page!.drawText(subtitle, { x: (595.28 - labelFont.widthOfTextAtSize(subtitle, subtitleSize)) / 2, y, font: labelFont, size: subtitleSize, color: muted });
  y -= 29;
  const writeParagraph = (text: string, heading = false) => {
    const font = heading ? bold : regular;
    const size = heading ? 10.5 : 11;
    const lineHeight = 15;
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      try {
        if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; }
        else line = next;
      } catch { throw new BadRequestException('El PDF contiene caracteres que requieren una fuente personalizada. Usa una plantilla Word para conservarlos.'); }
    }
    if (line) lines.push(line);
    if (heading && y < 110) newPage();
    lines.forEach((line, index) => {
      if (y < 64) newPage();
      const words = line.split(' ');
      if (!heading && index < lines.length - 1 && words.length > 1) {
        const textWidth = words.reduce((sum, word) => sum + font.widthOfTextAtSize(word, size), 0);
        const gap = (width - textWidth) / (words.length - 1);
        let x = margin;
        for (const word of words) { page!.drawText(word, { x, y, font, size, color: ink }); x += font.widthOfTextAtSize(word, size) + gap; }
      } else page!.drawText(line, { x: margin, y, font, size, color: heading ? blue : ink });
      y -= lineHeight;
    });
    y -= heading ? 4 : 9;
  };
  for (const source of info.paragraphs) {
    if (/^CONTRATO (?:BASE )?DE COMPRAVENTA DE LOTE$/i.test(source) || /^DUNACON SAC\s*\{proyecto_nombre\}$/i.test(source)) continue;
    if (/^EL (?:VENDEDOR|COMPRADOR)\b/.test(source)) continue;
    const text = source.replace(/\{\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*\}/g, (_, key) => data[key.toLowerCase()]);
    const section = text.match(/^((?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[ÉE]PTIMA|OCTAVA|NOVENA|D[ÉE]CIMA)\.\s+[A-ZÁÉÍÓÚÑ .-]+?)\s+(?=VENDEDOR:|[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/);
    let body = text;
    if (section) { writeParagraph(section[1], true); body = text.slice(section[0].length); }
    for (const paragraph of body.split(/\s+(?=COMPRADOR:|Asesor \/ Agente)/)) {
      if (paragraph.trim()) writeParagraph(paragraph);
    }
  }
  if (y < 160) newPage();
  y -= 48;
  const vendor = info.text.match(/VENDEDOR:\s*([^,]+)/)?.[1]?.trim() || 'EL VENDEDOR';
  const vendorId = info.text.match(/R\.?U\.?C\.?\s*(?:N\.[º°]\s*)?(\d{11})/i)?.[1];
  for (const [index, name, detail] of [[0, vendor, vendorId ? `RUC ${vendorId}` : ''], [1, data.cliente_nombre || 'EL COMPRADOR', data.cliente_documento ? `Documento: ${data.cliente_documento}` : '']] as const) {
    const x = margin + index * (width / 2 + 15);
    const columnWidth = width / 2 - 15;
    page!.drawLine({ start: { x, y }, end: { x: x + columnWidth, y }, color: muted, thickness: 0.7 });
    const role = index === 0 ? 'EL VENDEDOR' : 'EL COMPRADOR';
    page!.drawText(role, { x: x + (columnWidth - bold.widthOfTextAtSize(role, 9)) / 2, y: y - 17, font: bold, size: 9, color: blue });
    const size = Math.min(9, columnWidth / Math.max(1, regular.widthOfTextAtSize(name, 1)));
    page!.drawText(name, { x: x + (columnWidth - regular.widthOfTextAtSize(name, size)) / 2, y: y - 32, font: regular, size, color: ink });
    if (detail) page!.drawText(detail, { x: x + (columnWidth - regular.widthOfTextAtSize(detail, 8)) / 2, y: y - 45, font: regular, size: 8, color: muted });
  }
  pdf.getPages().forEach((sheet, index, pages) => {
    sheet.drawLine({ start: { x: margin, y: 45 }, end: { x: 595.28 - margin, y: 45 }, color: rgb(0.85, 0.87, 0.9), thickness: 0.5 });
    sheet.drawText(`Contrato V${data.venta_id || ''}`, { x: margin, y: 31, font: labelFont, size: 8, color: muted });
    const number = `${index + 1} / ${pages.length}`;
    sheet.drawText(number, { x: 595.28 - margin - labelFont.widthOfTextAtSize(number, 8), y: 31, font: labelFont, size: 8, color: muted });
  });
  return Buffer.from(await pdf.save());
}
