const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, project: 'tsconfig.json' });
const { SalesService } = require('../src/modules/sales/application/sales.service.ts');
const { buildGraceSchedule } = require('../src/shared/domain/finance.util.ts');
const sale = { id: 8, projectId: 5, lotId: 26, clientId: 3, quoteId: 2, saleDate: '2026-10-17', salePrice: '53000', lotPriceUsd: '60000', bonoTotalUsd: '7000', cuotaInicial: '14000', financingBase: '53000', totalCuotas: 60, interestType: 'tea', tea: '10', conditions: 'Cuotas sin interes: 12' };
const accounts = [
  { id: 'SECONDARY', accountKey: 'SECONDARY', company: 'Dunacon', ruc: '20608624393', bank: 'BCP', currency: 'PEN', accountNumber: '0012345678901', cci: '00200100012345678901' },
  { id: 'GENERAL', accountKey: 'GENERAL', company: 'Dunacon', ruc: '20608624393', bank: 'BCP', currency: 'USD', accountNumber: '0012345678902', cci: '00200100012345678902' },
];
const masters = [
 { id: 2, accountKey: 'SECONDARY', name: 'Cuenta secundaria', bank: 'BCP', currency: 'PEN', isActive: true },
 { id: 1, accountKey: 'GENERAL', name: 'Cuenta principal', bank: 'BCP', currency: 'USD', isActive: true },
];
let dimensionsQuery;
const ds = { getRepository: entity => ({ find: async query => { assert.equal(entity.name, 'BankAccountEntity'); assert.equal(query.where.projectId, 5); return masters; }, findOne: async query => {
  switch (entity.name) {
    case 'ProjectDocumentEntity': return { url: 'https://res.cloudinary.com/test/template.docx', originalName: 'contrato.docx' };
    case 'ProjectEntity': return { name: 'Altaduna', location: 'Ica', lotDeliveryDate: '2026-12-31', condominiumDeliveryDate: '2028-12-31' };
    case 'ProjectLotDataEntity': dimensionsQuery = query; return { address: 'Lote 26 - Los Robles 07', areaM2: '300', perimeter: '80 m', front: '10 m', leftSide: '30 m', rightSide: '30 m', back: '10 m' };
    case 'QuoteEntity': return { lotPriceUsd: '99999', bonoTotalUsd: '999', clientName: 'Otro nombre' };
    case 'AppSettingEntity': assert.equal(query.where.key, 'finance_financial_data_5'); return { value: JSON.stringify({ accounts }) };
    default: throw Error(entity.name);
  }
} }) };
const service = new SalesService({ findOne: async () => sale }, { findOne: async () => ({ code: '26' }) }, {}, { findOne: async () => ({ fullName: 'Carlos Jose Felipa Castro', dni: '10002000' }) }, {}, {}, {}, ds);
const originalFetch = global.fetch;
global.fetch = async () => ({ ok: true, body: (async function* () { yield Buffer.from('placeholder'); })() });
(async () => {
  const result = await service.prepareContract(8);
  const data = result.contractData;
  assert.deepEqual(dimensionsQuery.where, { projectId: 5, code: '26' });
  assert.equal(data.cliente_nombre, 'Carlos Jose Felipa Castro');
  assert.equal(data.cliente_documento, '10002000');
  assert.equal(data.lote_area_m2, '300.00');
  assert.equal(data.lote_perimetro, '80 m');
  assert.equal(data.lote_lado_izquierdo, '30 m');
  assert.equal(data.fecha_entrega_lote, '31/12/2026');
  assert.equal(data.fecha_entrega_condominio, '31/12/2028');
  assert.equal(data.precio_venta, 'US$ 60,000.00');
  assert.equal(data.bono_total, 'US$ 7,000.00');
  assert.equal(data.precio_venta_final, 'US$ 53,000.00');
  assert.equal(data.saldo_financiar, 'US$ 39,000.00');
  assert.equal(data.cuenta_corriente, accounts[1].accountNumber);
  assert.equal(data.cci, accounts[1].cci);
  assert.equal(data.moneda, 'D\u00f3lares');
  assert.match(data.cuotas_sin_intereses, /12 Cuotas/);
  assert.match(data.cuotas_con_intereses, /48 Cuotas/);
  assert.equal(data.fecha_generacion, new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()));

  const noSelection = await service.prepareContract(8);
  assert.equal(noSelection.contractData.cuenta_corriente, accounts[1].accountNumber);
  assert.equal(noSelection.accounts.length, 2);
  sale.conditions = 'Forma de pago: Contado';
  const cash = await service.prepareContract(8, undefined, {}, 'usd');
  assert.equal(cash.contractData.forma_pago, 'contado');
  assert.equal(cash.contractData.saldo_financiar, 'US$ 0.00');
  accounts[1].company = 'Empresa actualizada';
  accounts[1].ruc = '20123456789';
  accounts[1].bank = 'Banco actualizado';
  accounts[1].currency = 'PEN';
  accounts[1].accountNumber = '0099-8877-66554';
  accounts[1].cci = '0099-8877-6655-4433-2211';
  const current = await service.prepareContract(8, undefined, {}, 'usd');
  assert.equal(current.contractData.empresa_nombre, 'Empresa actualizada');
  assert.equal(current.contractData.empresa_ruc, '20123456789');
  assert.equal(current.contractData.banco, 'Banco actualizado');
  assert.equal(current.contractData.moneda, 'Soles');
  assert.equal(current.contractData.cuenta_corriente, '0099-8877-66554');
  assert.equal(current.contractData.cci, '0099-8877-6655-4433-2211');
  masters.splice(1, 1);
  const noPrincipal = await service.prepareContract(8);
  assert.equal(noPrincipal.contractData.cuenta_corriente, '');
  console.log('Datos financieros: cada generacion lee los valores actuales y rechaza cuentas eliminadas.');
  console.log('Contrato: dimensiones por proyecto y lote, datos de venta, importes historicos, entregas, cuenta elegida y fecha Peru verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
