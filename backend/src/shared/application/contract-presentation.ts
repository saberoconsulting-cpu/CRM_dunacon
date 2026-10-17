/** Presentation cleanup requested for the uploaded base contract; clauses remain intact. */
export function normalizeContractText(source: string): string {
  return source
    .replace(/\[\s*LOGO\s+(?:EMPRESA|PROYECTO)\s*\]/gi, '')
    .replace(/Plantilla oficial para automatizaci[oó]n del sistema/gi, '')
    .replace(/CONTRATO BASE DE COMPRAVENTA DE LOTE/g, 'CONTRATO DE COMPRAVENTA DE LOTE')
    .replace(/identificad([oa]) con tel[eé]fono\s*\{cliente_telefono\}\s*y correo electr[oó]nico\s*\{cliente_correo\}/gi,
      'identificad$1 con documento de identidad N.º {cliente_documento}')
    .replace(/(COMPRADOR:\s*\{cliente_nombre\}[^.]*?con domicilio en\s*)\{lote_direccion\}/gi, '$1{cliente_domicilio}')
    .replace(/con domicilio en\s*\{lote_direccion\}/gi, 'con domicilio en {cliente_domicilio}')
    .replace(/\[\s*Ciudad\s*\]/gi, '{ciudad_firma}')
    .replace(/(?:tel[eé]fono|correo(?: electr[oó]nico)?)\s*:?\s*\{cliente_(?:telefono|correo)\}\s*[,;]?/gi, '')
    .replace(/\{cliente_(?:telefono|correo)\}/gi, '')
    .replace(/Documento de simulaci[oó]n y plantilla est[aá]ndar para pruebas del sistema\.\s*No utilizar para formalizar operaciones reales sin revisi[oó]n legal previa\./gi, '')
    .replace(/Contrato Base de Compraventa de Lote\s*-\s*DUNACON SAC\s*P[aá]gina\s*\d+\s*de\s*\d+/gi, '')
    .replace(/[ \t]+/g, ' ').trim();
}

export type ContractBranding = { companyLogo?: Buffer; projectLogo?: Buffer };
