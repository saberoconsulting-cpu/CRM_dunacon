import { BadRequestException } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { v2 as cloudinary } from 'cloudinary';
import { normalizeContractText, ContractBranding } from './contract-presentation';

export const CONTRACT_FIELDS = [
  'venta_id', 'fecha_venta', 'proyecto_nombre', 'proyecto_ubicacion',
  'cliente_nombre', 'cliente_documento', 'cliente_domicilio', 'ciudad_firma',
  'lote_codigo', 'lote_direccion', 'lote_area_m2', 'lote_dimensiones',
  'precio_venta', 'cuota_inicial', 'saldo_financiar', 'numero_cuotas',
  'valor_cuota', 'condiciones', 'agente_nombre',
] as const;

export function inspectContractTemplate(buffer: Buffer) {
  try {
    if (buffer.length > 10 * 1024 * 1024) throw new Error('Archivo demasiado grande');
    const zip = new PizZip(buffer);
    const entries = Object.values(zip.files);
    const expandedSize = entries.reduce((sum, entry: any) => sum + Number(entry._data?.uncompressedSize || 0), 0);
    if (entries.length > 2000 || expandedSize > 30 * 1024 * 1024) throw new Error('Documento demasiado grande');
    if (!zip.file('word/document.xml')) throw new Error('No es un documento Word');
    for (const name of Object.keys(zip.files).filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name))) {
      const xml = zip.file(name)!.asText().replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, paragraph => {
        const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => match[1]).join('')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        const cleaned = normalizeContractText(text);
        if (cleaned === text.trim()) return paragraph;
        const escaped = cleaned.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const properties = paragraph.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] || '';
        return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
      });
      zip.file(name, xml);
    }
    const fields = new Set<string>();
    const document = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
      parser: (tag: string) => {
        const key = tag.trim();
        fields.add(key);
        return { get: (scope: Record<string, string>) => scope[key] };
      },
      nullGetter: (part: { value: string }) => {
        throw new BadRequestException(`Falta un dato obligatorio para el contrato: ${part.value}`);
      },
    });
    return { document, text: document.getFullText(), fields: [...fields], availableFields: CONTRACT_FIELDS };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('La plantilla debe ser un Word .docx válido. Revisa que sus campos usen llaves completas, por ejemplo {cliente_nombre}.');
  }
}

export function renderContract(buffer: Buffer, data: Record<string, string>, branding?: ContractBranding) {
  const { document, fields } = inspectContractTemplate(buffer);
  if (!fields.length) throw new BadRequestException('La plantilla no tiene campos para completar. Agrega al Word campos como {cliente_nombre}, {lote_codigo} y {precio_venta}.');
  const unknown = fields.filter(field => !(CONTRACT_FIELDS as readonly string[]).includes(field));
  if (unknown.length) throw new BadRequestException(`Campos de plantilla no disponibles: ${unknown.join(', ')}`);
  const missing = fields.filter(field => !data[field]?.trim());
  if (missing.length) throw new BadRequestException(`Completa los datos de la venta antes de generar el contrato: ${missing.join(', ')}`);
  document.render(data);
  if (branding?.companyLogo || branding?.projectLogo) addWordBranding(document.getZip(), branding);
  return document.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function addWordBranding(zip: PizZip, branding: ContractBranding) {
  const image = (id: string, bytes: Buffer | undefined, align: string) => {
    if (!bytes) return '<w:p/>';
    const pixelWidth = bytes.readUInt32BE(16), pixelHeight = bytes.readUInt32BE(20);
    const scale = Math.min(1524000 / pixelWidth, 508000 / pixelHeight);
    const cx = Math.round(pixelWidth * scale), cy = Math.round(pixelHeight * scale);
    zip.file(`word/media/contract-${id}.png`, bytes);
    return `<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id === 'company' ? 1001 : 1002}" name="Logo ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };
  const header = `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${image('company', branding.companyLogo, 'left')}</w:tc><w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${image('project', branding.projectLogo, 'right')}</w:tc></w:tr></w:tbl></w:hdr>`;
  zip.file('word/headerContract.xml', header);
  zip.file('word/_rels/headerContract.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${['company', 'project'].filter(key => branding[key === 'company' ? 'companyLogo' : 'projectLogo']).map(key => `<Relationship Id="${key}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/contract-${key}.png"/>`).join('')}</Relationships>`);
  const rels = zip.file('word/_rels/document.xml.rels')?.asText() || '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdContractHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="headerContract.xml"/></Relationships>'));
  let xml = zip.file('word/document.xml')!.asText();
  if (!/xmlns:r=/.test(xml)) xml = xml.replace('<w:document ', '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  if (!/<w:sectPr\b/.test(xml)) xml = xml.replace('</w:body>', '<w:sectPr/></w:body>');
  xml = xml.replace(/<w:sectPr\s*\/>/g, '<w:sectPr></w:sectPr>').replace(/<w:headerReference\b[^>]*w:type="default"[^>]*\/>/g, '');
  xml = xml.replace(/<w:sectPr([^>]*)>/g, '<w:sectPr$1><w:headerReference w:type="default" r:id="rIdContractHeader"/>');
  zip.file('word/document.xml', xml);
  let types = zip.file('[Content_Types].xml')!.asText();
  if (!/Extension="png"/.test(types)) types = types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  types = types.replace('</Types>', '<Override PartName="/word/headerContract.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
  zip.file('[Content_Types].xml', types);
}

export async function downloadContractTemplate(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
    throw new BadRequestException('La plantilla no tiene una ubicación válida. Vuelve a subirla.');
  }
  let response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  // Some Cloudinary accounts block public PDF delivery. Download the existing
  // asset through the authenticated API without exposing signed URLs to clients.
  if (response.status === 401 || response.status === 403) {
    const match = parsed.pathname.match(/^\/([^/]+)\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/);
    const config = cloudinary.config();
    if (match && config.cloud_name === match[1] && config.api_secret) {
      const format = match[3].match(/\.([a-z0-9]+)$/i)?.[1];
      if (format) {
        const id = match[2] === 'raw' ? match[3] : match[3].slice(0, -(format.length + 1));
        const privateUrl = cloudinary.utils.private_download_url(id, format, { resource_type: match[2], type: 'upload', expires_at: Math.floor(Date.now() / 1000) + 60 });
        response = await fetch(privateUrl, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      }
    }
  }
  if (!response.ok) throw new BadRequestException('No se pudo leer la plantilla guardada. Vuelve a subir el PDF o Word.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as any) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new BadRequestException('La plantilla supera el límite de 10 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
