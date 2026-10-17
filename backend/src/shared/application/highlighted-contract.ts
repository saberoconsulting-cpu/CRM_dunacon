import { BadRequestException } from '@nestjs/common';

const decode = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Replace only text spans; keep the original runs, paragraph properties and drawings. */
function replaceText(paragraph: string, start: number, end: number, replacement: string) {
  let offset = 0;
  let inserted = false;
  return paragraph.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (xml, open, encoded, close) => {
    const text = decode(encoded);
    const from = offset;
    offset += text.length;
    if (offset <= start || from >= end) return xml;
    const left = text.slice(0, Math.max(0, start - from));
    const right = text.slice(Math.max(0, end - from));
    const value = left + (inserted ? '' : replacement) + right;
    inserted = true;
    return open + escape(value) + close;
  });
}

export function prepareHighlightedContract(xml: string): string {
  if (xml.includes('crm-highlighted-contract-v1')) return xml;
  const plainText = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => decode(match[1])).join('');
  if (!plainText.includes('DATOS GENERALES PARA EL CONTRATO PREPARATORIO') || /\{cliente_nombre\}/.test(plainText)) return xml;
  const fields = new Set<string>();
  const replacements: Array<[RegExp, string]> = [
    [/^Direcci[o\u00f3]n\s*:/i, '{lote_direccion}'],
    [/^[A\u00c1]rea\s*:/i, '{lote_area_m2} m2'],
    [/^Per[i\u00ed]metro\s*:/i, '{lote_perimetro}'],
    [/^Frente\s*:/i, '{lote_frente}'],
    [/^Lado Izquierdo\s*:/i, '{lote_lado_izquierdo}'],
    [/^Lado Derecho\s*:/i, '{lote_lado_derecho}'],
    [/^Fondo\s*:/i, '{lote_fondo}'],
    [/^Precio de venta\s*:/i, '{precio_venta}'],
    [/^Bonos de Descuento\s*:/i, '{bono_total}'],
    [/^Precio de venta Final\s*:/i, '{precio_venta_final}'],
    [/^Cuota Inicial\s*:/i, '{cuota_inicial}'],
    [/^Saldo a Financiar\s*:/i, '{saldo_financiar}'],
    [/^Plazo de Financiamiento\s*:/i, '{plazo_financiamiento} Meses'],
    [/^Tasa Efectiva Anual\s*:/i, '{tasa_efectiva_anual} %'],
    [/^Cuotas sin intereses\s*:/i, '{cuotas_sin_intereses}'],
    [/^Cuotas con intereses\s*:/i, '{cuotas_con_intereses}'],
    [/^Entrega del Lote\s*:/i, '{fecha_entrega_lote}.'],
    [/^Entrega del Condominio\s*:/i, '{fecha_entrega_condominio}.'],
    [/^Empresa\s*:/i, '{empresa_nombre}'],
    [/^RUC\s*:/i, '{empresa_ruc}'],
    [/^Banco\s*:/i, '{banco}'],
    [/^Moneda\s*:/i, '{moneda}'],
    [/^Nro\. de Cuenta Corriente\s*:/i, '{cuenta_corriente}'],
    [/^C[o\u00f3]digo de Cuenta Interbancario \(CCI\)\s*:/i, '{cci}'],
  ];
  const converted = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, paragraph => {
    const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => decode(match[1])).join('');
    const trimmed = text.trim();
    const rule = replacements.find(([pattern]) => pattern.test(trimmed));
    const apply = (start: number, end: number, replacement: string) => {
      for (const match of replacement.matchAll(/\{([^}]+)\}/g)) fields.add(match[1]);
      return replaceText(paragraph, start, end, replacement);
    };
    if (rule) {
      const colon = text.indexOf(':') + 1;
      const start = colon + (text.slice(colon).match(/^\s*/)?.[0].length || 0);
      return apply(start, text.trimEnd().length, rule[1]);
    }
    if (trimmed.startsWith('El Promitente Comprador:')) {
      const name = /Sr\.\s*(.+?)(?=,\s*identificado)/i.exec(text);
      const dni = /N[.\s\u00b0\u00ba]*\s*(\d{8})/.exec(text);
      if (!name || !dni) throw new BadRequestException('No se reconocen los campos del comprador en el Word.');
      // Replace right to left so earlier text offsets remain valid.
      paragraph = apply(dni.index + dni[0].indexOf(dni[1]), dni.index + dni[0].indexOf(dni[1]) + dni[1].length, '{cliente_documento}');
      return apply(name.index + name[0].indexOf(name[1]), name.index + name[0].indexOf(name[1]) + name[1].length, '{cliente_nombre}');
    }
    if (text.includes('[Nombre del Cliente]')) return apply(text.indexOf('[Nombre del Cliente]'), text.indexOf('[Nombre del Cliente]') + '[Nombre del Cliente]'.length, '{cliente_nombre}');
    if (/D\.N\.I\./.test(text) && /\[.*\]/.test(text)) {
      const match = /\[.*?\]/.exec(text)!;
      return apply(match.index, match.index + match[0].length, '{cliente_documento}');
    }
    if (trimmed.startsWith('Para mayor constancia')) {
      const match = /\d{1,2} de .+? de \d{4}(?:\s+fecha de generar el sistema)?/.exec(text);
      if (!match) throw new BadRequestException('No se reconoce la fecha de generacion del Word.');
      return apply(match.index, match.index + match[0].length, '{fecha_generacion}');
    }
    return paragraph;
  });
  const required = ['cliente_nombre', 'cliente_documento', ...replacements.map(([, value]) => /\{([^}]+)\}/.exec(value)![1]), 'fecha_generacion'];
  const missing = required.filter(field => !fields.has(field));
  if (missing.length) throw new BadRequestException(`No se pudieron preparar estos campos del Word: ${missing.join(', ')}`);
  return converted.replace(/(<w:document\b[^>]*>)/, '$1<!-- crm-highlighted-contract-v1 -->');
}

/** Cash purchases keep the sale amounts and omit the financing-only paragraphs. */
export function adaptContractPayment(xml: string, paymentMethod?: string): string {
  if (paymentMethod !== 'contado') return xml;
  const financingFields = new Set(['cuota_inicial', 'saldo_financiar', 'numero_cuotas', 'valor_cuota', 'plazo_financiamiento', 'tasa_efectiva_anual', 'cuotas_sin_intereses', 'cuotas_con_intereses']);
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, paragraph => {
    const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => decode(match[1])).join('');
    const tags = [...text.matchAll(/\{([^}]+)\}/g)].map(match => match[1].trim());
    if (tags.length && tags.every(tag => financingFields.has(tag))) return '';
    const heading = 'Condiciones de Venta y Financiamiento';
    if (text.trim() === heading) {
      const start = text.indexOf(heading);
      return replaceText(paragraph, start, start + heading.length, 'Condiciones de venta y pago al contado');
    }
    return paragraph;
  });
}
