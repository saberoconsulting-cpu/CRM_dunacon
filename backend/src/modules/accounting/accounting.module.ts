import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { Response } from 'express';
import { JwtAuthGuard } from '../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/application/guards/roles.guard';
import { Roles } from '../../shared/application/decorators/roles.decorator';
import { CurrentUser } from '../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../shared/domain/enums';
import { AccountingAttachmentsController } from './attachments.controller';
import { CashController } from './cash.controller';
import { assertAccountingAccess } from './accounting-access';
import { loadAccountingParameters, prepareInvoiceAmounts, validateAccountingParameters } from './accounting-parameters';
import { invoiceTemplateHeaders, readInvoiceExcel } from './invoice-excel';

export const INVOICE_COLUMNS = {
  documentType: 'Tipo doc.', issuedAt: 'Fecha emisión', dueAt: 'Fecha venc.', number: 'N.º comprob.',
  ruc: 'N.º RUC', supplier: 'Proveedor', currency: 'Moneda', base: 'Base imponible', igv: 'IGV',
  deduction: 'Detracción S/', deductionNumber: 'N.º detracción', deductionDate: 'Fecha detracción',
  exchangeRate: 'T. cambio', validated: 'Validada', creditReference: 'Ref. comprob. (NC)',
};

type InvoiceKind = 'purchase' | 'sale';
function invoiceKind(value?: string): InvoiceKind {
  if (value == null || value === 'purchase') return 'purchase';
  if (value === 'sale') return 'sale';
  throw new BadRequestException('Registro de facturas inválido.');
}
export function invoiceColumns(kind: InvoiceKind) {
  if (kind === 'purchase') return INVOICE_COLUMNS;
  return { ...INVOICE_COLUMNS, supplier: 'Cliente' };
}

export function validateInvoice(input: any, kind: InvoiceKind = 'purchase') {
  if (!input || typeof input !== 'object') throw new BadRequestException('Comprobante inválido.');
  const row: Record<string, any> = {};
  for (const key of ['documentType', 'number', 'ruc', 'supplier', 'deductionNumber', 'creditReference']) {
    row[key] = String(input[key] ?? '').trim();
    if (row[key].length > 255) throw new BadRequestException(`${INVOICE_COLUMNS[key]}: máximo 255 caracteres.`);
  }
  if (!['Factura', 'Boleta', 'Nota de crédito', 'Nota de débito', 'Recibo por honorarios'].includes(row.documentType)) throw new BadRequestException('Tipo de documento inválido.');
  if (!row.number || !row.supplier || !/^\d{11}$/.test(row.ruc)) throw new BadRequestException(`Completa comprobante, ${kind === 'sale' ? 'cliente' : 'proveedor'} y RUC de 11 dígitos.`);
  row.number = row.number.toUpperCase();
  for (const key of ['issuedAt', 'dueAt', 'deductionDate']) {
    const raw = input[key];
    let value = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '').trim();
    if (typeof raw === 'number') { const d = XLSX.SSF.parse_date_code(raw); value = d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : ''; }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) value = value.split('/').reverse().join('-');
    if ((!value && key === 'issuedAt') || (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value))) throw new BadRequestException(`${INVOICE_COLUMNS[key]}: usa una fecha válida.`);
    row[key] = value;
  }
  if (row.dueAt && row.dueAt < row.issuedAt) throw new BadRequestException('El vencimiento no puede ser anterior a la emisión.');
  row.currency = String(input.currency ?? '').toUpperCase();
  if (!['PEN', 'USD'].includes(row.currency)) throw new BadRequestException('Moneda: usa PEN o USD.');
  if (row.currency === 'USD' && (input.exchangeRate == null || input.exchangeRate === '')) throw new BadRequestException('Ingresa el tipo de cambio del día para la factura en dólares.');
  for (const key of ['base', 'igv', 'deduction', 'exchangeRate']) {
    const raw = input[key];
    row[key] = raw === '' || raw == null ? (key === 'exchangeRate' ? 1 : 0) : Number(raw);
    if (!Number.isFinite(row[key]) || row[key] < 0 || (key === 'exchangeRate' && row[key] <= 0)) throw new BadRequestException(`${INVOICE_COLUMNS[key]}: importe inválido.`);
  }
  if ((kind === 'purchase' || input.validated != null) && ![true, false, 'SI', 'SÍ', 'NO'].includes(input.validated)) throw new BadRequestException('Validada: usa SÍ o NO.');
  row.validated = [true, 'SI', 'SÍ'].includes(input.validated);
  return row;
}

@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
export class AccountingController {
  constructor(private readonly db: DataSource) {}
  private async access(projectId: number, user: any) {
    return assertAccountingAccess(this.db, projectId, user);
  }
  @Get('parameters')
  async parameters(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    await this.access(Number(projectId), user);
    return loadAccountingParameters(this.db, Number(projectId));
  }
  @Put('parameters')
  async saveParameters(@Body() body: any, @CurrentUser() user: any) {
    const projectId = Number(body.projectId); await this.access(projectId, user);
    const parameters = validateAccountingParameters(body.parameters);
    await this.db.query('INSERT INTO app_settings(key, value) VALUES($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value', [`accounting_parameters_${projectId}`, JSON.stringify(parameters)]);
    return parameters;
  }
  @Get()
  async list(@Query('projectId') id: string, @CurrentUser() user: any) {
    await this.access(Number(id), user);
    const rows = await this.db.query('SELECT id, kind, data FROM accounting_invoices WHERE project_id = $1 ORDER BY created_at, id', [Number(id)]);
    return rows.map((r: any) => ({ ...r.data, id: r.id, kind: r.kind }));
  }
  @Get('template')
  template(@Res() res: Response, @Query('kind') value?: string) {
    const kind = invoiceKind(value);
    const headers = invoiceTemplateHeaders(kind);
    const sheet = XLSX.utils.aoa_to_sheet([headers]);
    sheet['!cols'] = headers.map(() => ({ wch: 22 }));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, kind === 'sale' ? 'Facturas Venta' : 'Facturas Compra');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-facturas-${kind === 'sale' ? 'venta' : 'compra'}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  }
  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async preview(@UploadedFile() file: Express.Multer.File, @Query('projectId') id: string, @CurrentUser() user: any, @Query('kind') value?: string) {
    await this.access(Number(id), user);
    const kind = invoiceKind(value);
    if (!file || !/\.xlsx?$/i.test(file.originalname)) throw new BadRequestException('Selecciona un archivo .xlsx o .xls.');
    const parameters = await loadAccountingParameters(this.db, Number(id));
    try {
      return readInvoiceExcel(file.buffer, kind).map(({ input, rowNumber }) => {
        try { return validateInvoice(prepareInvoiceAmounts(input, parameters), kind); }
        catch (e) { throw new BadRequestException(`Fila ${rowNumber}: ${e.message}`); }
      });
    } catch (e) { if (e instanceof BadRequestException) throw e; throw new BadRequestException('No se pudo leer el archivo Excel.'); }
  }
  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    const projectId = Number(body.projectId); await this.access(projectId, user);
    const kind = invoiceKind(body.kind);
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 2000) throw new BadRequestException('Envía entre 1 y 2000 facturas.');
    const parameters = await loadAccountingParameters(this.db, projectId);
    const rows = body.rows.map((row: any) => validateInvoice(prepareInvoiceAmounts(row, parameters), kind));
    try {
      return await this.db.transaction(async manager => {
        const saved: Record<string, any>[] = [];
        for (const row of rows) {
          const id = randomUUID();
          await manager.query('INSERT INTO accounting_invoices (id, project_id, kind, data) VALUES ($1, $2, $3, $4::jsonb)', [id, projectId, kind, JSON.stringify(row)]);
          saved.push({ ...row, id, kind });
        }
        return saved;
      });
    } catch (e) { if (e.code === '23505') throw new BadRequestException('Existe un comprobante con el mismo RUC, número y tipo. No se guardó ningún registro de este envío.'); throw e; }
  }
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    await this.access(Number(body.projectId), user);
    const [existing] = await this.db.query('SELECT kind FROM accounting_invoices WHERE id::text = $1 AND project_id = $2', [id, Number(body.projectId)]);
    if (!existing) throw new NotFoundException('Factura no encontrada.');
    const parameters = await loadAccountingParameters(this.db, Number(body.projectId));
    const row = validateInvoice(prepareInvoiceAmounts(body.row, parameters), existing.kind);
    try {
      const [[saved]] = await this.db.query('UPDATE accounting_invoices SET data = data || $1::jsonb WHERE id::text = $2 AND project_id = $3 RETURNING id, kind, data', [JSON.stringify(row), id, Number(body.projectId)]);
      if (!saved) throw new NotFoundException('Factura no encontrada.');
      return { ...saved.data, id: saved.id, kind: saved.kind };
    } catch (e) { if (e.code === '23505') throw new BadRequestException('Ya existe un comprobante con ese RUC, número y tipo.'); throw e; }
  }
  @Delete(':id')
  async remove(@Param('id') id: string, @Query('projectId') projectId: string, @CurrentUser() user: any) {
    await this.access(Number(projectId), user);
    const rows = await this.db.query('DELETE FROM accounting_invoices WHERE id::text = $1 AND project_id = $2 RETURNING id', [id, Number(projectId)]);
    // TypeORM returns [rows, affected] for DELETE with PostgreSQL.
    if (!rows[0]?.length) throw new NotFoundException('Factura no encontrada.');
    return { id };
  }
}

@Module({ controllers: [AccountingController, CashController, AccountingAttachmentsController] })
export class AccountingModule {}
