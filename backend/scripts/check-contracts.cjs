const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, project: 'tsconfig.json' });
const PizZip = require('pizzip');
const { inspectContractTemplate, renderContract } = require('../src/shared/application/contract-template.ts');

function word(text) {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}
const template = word('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Contrato: {cliente_</w:t></w:r><w:r><w:t>nombre} compra {lote_codigo} por {precio_venta}.</w:t></w:r></w:p>');
const original = Buffer.from(template);
const info = inspectContractTemplate(template);
assert.deepEqual(info.fields.sort(), ['cliente_nombre', 'lote_codigo', 'precio_venta'].sort());
const rendered = renderContract(template, { cliente_nombre: 'Ana & José', lote_codigo: 'A-12', precio_venta: 'US$ 15,000.00' });
const result = inspectContractTemplate(rendered);
assert.match(result.text, /Ana & José compra A-12 por US\$ 15,000.00/);
assert.match(new PizZip(rendered).file('word/document.xml').asText(), /<w:b\/>/);
assert.deepEqual(template, original);
assert.throws(() => renderContract(template, { cliente_nombre: 'Ana' }), /Completa los datos/);
assert.throws(() => renderContract(word('<w:p><w:r><w:t>{cliente_dni}</w:t></w:r></w:p>'), {}), /Campos de plantilla no disponibles/);
assert.throws(() => renderContract(word('<w:p><w:r><w:t>Contrato sin campos</w:t></w:r></w:p>'), {}), /no tiene campos/);
assert.throws(() => inspectContractTemplate(Buffer.from('not a Word file')), /Word .docx/);
assert.throws(() => inspectContractTemplate(word('<w:p><w:r><w:t>{cliente_nombre</w:t></w:r></w:p>')), /Word .docx/);
console.log('Contratos Word: campos divididos entre estilos, formato, valores especiales, datos faltantes y archivos inválidos verificados.');

async function checkSaleContract() {
  await checkPdfContracts();
  const { SalesService } = require('../src/modules/sales/application/sales.service.ts');
  const { ProjectDocumentEntity } = require('../src/shared/infrastructure/entities/project-document.entity.ts');
  const { ProjectEntity } = require('../src/shared/infrastructure/entities/project.entity.ts');
  let requestedSale, requestedTemplate;
  const service = new SalesService(
    { findOne: async query => { requestedSale = query.where; return query.where.agentId === 99 ? null : { id: 8, projectId: 5, lotId: 2, clientId: 3, agentId: 7, saleDate: '2026-10-17', salePrice: '15000', financingBase: '0.00', cuotaInicial: '3000', totalCuotas: 12, valorCuota: '1000' }; } },
    { findOne: async () => ({ code: 'A-12', areaM2: '120' }) },
    { findOne: async () => ({ name: 'Agente' }) },
    { findOne: async () => ({ fullName: 'Ana & José' }) },
    {}, {}, {},
    { getRepository: entity => {
      if (entity === ProjectDocumentEntity) return { findOne: async query => { requestedTemplate = query; return { url: 'https://res.cloudinary.com/test/template.docx' }; } };
      assert.equal(entity, ProjectEntity);
      return { findOne: async () => ({ name: 'Proyecto' }) };
    } },
  );
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, body: (async function* () { yield template; })() });
  try {
    const result = await service.contract(8, 7);
    assert.deepEqual(requestedSale, { id: 8, agentId: 7 });
    assert.deepEqual(requestedTemplate.where, { projectId: 5, kind: 'contrato_venta' });
    assert.deepEqual(requestedTemplate.order, { createdAt: 'DESC', id: 'DESC' });
    assert.equal(result.fileName, 'Contrato-V8.docx');
    assert.match(inspectContractTemplate(result.buffer).text, /Ana & José compra A-12/);
    await assert.rejects(service.contract(8, 99), /Venta no encontrada/);
    const contactTemplate = word('<w:p><w:r><w:t>{cliente_nombre}: {cliente_documento}, {cliente_domicilio}. Precio {precio_venta}.</w:t></w:r></w:p>');
    global.fetch = async () => ({ ok: true, body: (async function* () { yield contactTemplate; })() });
    assert.deepEqual((await service.contractRequirements(8, 7)).missingFields.sort(), ['cliente_documento', 'cliente_domicilio'].sort());
    const completed = await service.contract(8, 7, { cliente_documento: '00000000', cliente_domicilio: 'Domicilio de prueba', cliente_nombre: 'No debe reemplazar el nombre', precio_venta: '1' });
    const completedText = inspectContractTemplate(completed.buffer).text;
    assert.match(completedText, /Ana & José: 00000000, Domicilio de prueba/);
    assert.match(completedText, /15,000/);
    assert.doesNotMatch(completedText, /No debe reemplazar/);
    assert.ok(new PizZip(completed.buffer).file('word/media/contract-company.png'));
    await assert.rejects(service.contract(8, 7, { campo_inexistente: 'valor' }), /no válidos/);
    const { downloadContractTemplate } = require('../src/shared/application/contract-template.ts');
    await assert.rejects(downloadContractTemplate('http://localhost/private'), /ubicación válida/);
    console.log('Ventas: plantilla del proyecto, última versión, descarga Word y acceso del agente verificados.');
  } finally { global.fetch = originalFetch; }
}
async function checkPdfContracts() {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const { inspectPdfContractTemplate, renderPdfContract } = require('../src/shared/application/pdf-contract-template.ts');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('CONTRATO {PROYECTO_NOMBRE}', { x: 48, y: 750, font, size: 12 });
  page.drawText('Comprador: {cliente_nombre}. Lote: {lote_codigo}.', { x: 48, y: 700, font, size: 10 });
  const source = Buffer.from(await pdf.save());
  const info = await inspectPdfContractTemplate(source);
  assert.deepEqual(info.fields.sort(), ['proyecto_nombre', 'cliente_nombre', 'lote_codigo'].sort());
  const result = await renderPdfContract(source, { proyecto_nombre: 'ALTADUNA', cliente_nombre: 'Ana & José', lote_codigo: 'A-12' });
  const rendered = await inspectPdfContractTemplate(result);
  assert.match(rendered.text, /Ana & José/);
  assert.equal(rendered.fields.length, 0);
  await assert.rejects(renderPdfContract(source, {}), /Completa los datos/);
  const formPdf = await PDFDocument.create();
  const formPage = formPdf.addPage();
  formPdf.getForm().createTextField('cliente_nombre').addToPage(formPage, { x: 48, y: 650, width: 200, height: 24 });
  const filled = await renderPdfContract(Buffer.from(await formPdf.save()), { cliente_nombre: 'Ana' });
  assert.equal((await PDFDocument.load(filled)).getForm().getFields().length, 0);
  assert.match((await inspectPdfContractTemplate(filled)).text, /Ana/);
  const { normalizeContractText } = require('../src/shared/application/contract-presentation.ts');
  const buyer = normalizeContractText('COMPRADOR: {cliente_nombre}, identificado con teléfono {cliente_telefono} y correo electrónico {cliente_correo}, con domicilio en {lote_direccion}.');
  assert.match(buyer, /\{cliente_documento\}/);
  assert.match(buyer, /\{cliente_domicilio\}/);
  assert.doesNotMatch(buyer, /telefono|correo|lote_direccion/);
  assert.equal(normalizeContractText('Documento de simulación y plantilla estándar para pruebas del sistema. No utilizar para formalizar operaciones reales sin revisión legal previa.'), '');
  console.log('PDF: lectura, campos en mayúsculas, generación, datos faltantes y formularios verificados.');
}
checkSaleContract().catch(error => { console.error(error); process.exitCode = 1; });
