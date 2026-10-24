import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { assertAccountingAccess } from './accounting-access';
import { applyCashClassification, loadCashClassifications, validateClassifications } from './cash-classification';
import { readCashExcel } from './cash-excel';

export const CASH_COLUMNS = { date: 'Fecha', paidTo: 'Pagado a', description: 'Descripción', documentType: 'Tipo Documento', documentNumber: 'Nro. Documento', responsible: 'Responsable', deposit: 'Abono S/', expense: 'Gasto S/', category: 'Categoría', classification: 'Clasificación' };
export const CASH_DOCUMENT_TYPES = ['Transf. Bancaria', 'Recibo / boleta / ticket', 'Factura', 'Taxis - Planilla Mov', 'Sin Comprobante'];
function documentKey(value: string) {
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['transferenciabancaria', 'transferenciabanco', 'transfbancaria', 'trasnfbancaria'].includes(key) ? 'transfbancaria' : key;
}
export function validateCash(input: any) {
  if (!input || typeof input !== 'object') throw new BadRequestException('Movimiento inválido.');
  const row: Record<string, any> = {};
  for (const key of ['paidTo', 'description', 'documentType', 'documentNumber', 'responsible', 'category', 'classification']) {
    row[key] = String(input[key] ?? '').trim();
    if (row[key].length > (key === 'description' ? 1000 : 255)) throw new BadRequestException(`${CASH_COLUMNS[key]}: texto demasiado largo.`);
  }
  if (!row.paidTo || !row.description || !row.documentType || !row.responsible) throw new BadRequestException('Completa pagado a, descripción, tipo de documento y responsable.');
  const documentType = CASH_DOCUMENT_TYPES.find(type => documentKey(type) === documentKey(row.documentType));
  if (!documentType) throw new BadRequestException(`Tipo Documento: usa ${CASH_DOCUMENT_TYPES.join(', ')}.`);
  row.documentType = documentType;
  const raw = input.date;
  let value = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '').trim();
  if (typeof raw === 'number') { const d = XLSX.SSF.parse_date_code(raw); value = d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : ''; }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) value = value.split('/').reverse().map(part => part.padStart(2, '0')).join('-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) throw new BadRequestException('Ingresa una fecha válida entre 2000 y 2100.');
  row.date = value;
  for (const key of ['deposit', 'expense']) {
    row[key] = input[key] == null || input[key] === '' ? 0 : Number(input[key]);
    if (!Number.isFinite(row[key]) || row[key] < 0 || row[key] > 999999999999) throw new BadRequestException(`${CASH_COLUMNS[key]}: importe inválido.`);
    row[key] = Math.round(row[key] * 100) / 100;
  }
  if ((row.deposit > 0) === (row.expense > 0)) throw new BadRequestException('Registra un abono o un gasto por movimiento, con importe mayor a cero.');
  return row;
}

@Controller('accounting/cash')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
export class CashController {
  constructor(private readonly db: DataSource) {}
  @Get('classifications')
  async classifications(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    await assertAccountingAccess(this.db, Number(projectId), user);
    return { rows: await loadCashClassifications(this.db, Number(projectId)) };
  }
  @Put('classifications')
  async saveClassifications(@Body() body: any, @CurrentUser() user: any) {
    const projectId = Number(body.projectId); await assertAccountingAccess(this.db, projectId, user);
    const rows = validateClassifications(body.rows);
    await this.db.query('INSERT INTO app_settings(key, value) VALUES($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value', [`finance_classification_${projectId}`, JSON.stringify({ rows })]);
    return { rows };
  }
  @Get()
  async list(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    await assertAccountingAccess(this.db, Number(projectId), user);
    const rows = await this.db.query('SELECT id, data FROM accounting_cash WHERE project_id = $1 ORDER BY sort_order', [Number(projectId)]);
    const balances = await this.db.query('SELECT year, balance FROM accounting_cash_opening WHERE project_id = $1', [Number(projectId)]);
    return { rows: rows.map((r: any) => ({ ...r.data, id: r.id })), openings: Object.fromEntries(balances.map((r: any) => [r.year, Number(r.balance)])) };
  }
  @Put('opening')
  async opening(@Body() body: any, @CurrentUser() user: any) {
    const projectId = Number(body.projectId); await assertAccountingAccess(this.db, projectId, user);
    const year = Number(body.year), balance = Number(body.balance);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || body.balance === '' || body.balance == null || !Number.isFinite(balance) || Math.abs(balance) > 999999999999) throw new BadRequestException('Año o saldo inicial inválido.');
    const rounded = Math.round(balance * 100) / 100;
    await this.db.transaction(async manager => {
      await manager.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      const [{ base_year: baseYear }] = await manager.query(`SELECT MIN(year) AS base_year FROM (
        SELECT LEFT(data->>'date', 4)::integer AS year FROM accounting_cash WHERE project_id = $1
        UNION ALL SELECT year FROM accounting_cash_opening WHERE project_id = $1
        UNION ALL SELECT $2::integer
      ) years`, [projectId, year]);
      if (year !== Number(baseYear)) throw new BadRequestException(`Edita la base del primer año (${baseYear}). Los años siguientes se calculan automáticamente.`);
      await manager.query('INSERT INTO accounting_cash_opening(project_id, year, balance) VALUES($1, $2, $3) ON CONFLICT(project_id, year) DO UPDATE SET balance = EXCLUDED.balance', [projectId, year, rounded]);
      await manager.query('DELETE FROM accounting_cash_opening WHERE project_id = $1 AND year > $2', [projectId, year]);
    });
    return { year, balance: rounded };
  }
  @Get('template')
  template(@Res() res: Response) {
    const sheet = XLSX.utils.aoa_to_sheet([Object.values(CASH_COLUMNS)]);
    sheet['!cols'] = Object.keys(CASH_COLUMNS).map(() => ({ wch: 24 }));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Caja Chica');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-caja-chica.xlsx"');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  }
  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async preview(@UploadedFile() file: Express.Multer.File, @Query('projectId') projectId: string, @CurrentUser() user: any) {
    await assertAccountingAccess(this.db, Number(projectId), user);
    const categories = await loadCashClassifications(this.db, Number(projectId));
    if (!file || !/\.xlsx?$/i.test(file.originalname)) throw new BadRequestException('Selecciona un archivo .xlsx o .xls.');
    try {
      return readCashExcel(file.buffer).map(({ input, rowNumber }) => {
        try { return applyCashClassification(validateCash(input), input, categories); }
        catch (e) { throw new BadRequestException(`Fila ${rowNumber}: ${e.message}`); }
      });
    } catch (e) { if (e instanceof BadRequestException) throw e; throw new BadRequestException('No se pudo leer el archivo Excel.'); }
  }
  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    const projectId = Number(body.projectId); await assertAccountingAccess(this.db, projectId, user);
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 2000) throw new BadRequestException('Envía entre 1 y 2000 movimientos.');
    const categories = await loadCashClassifications(this.db, projectId);
    const rows = body.rows.map((row: any) => applyCashClassification(validateCash(row), row, categories));
    return this.db.transaction(async manager => {
      const saved: Record<string, any>[] = [];
      for (const row of rows) {
        const id = randomUUID();
        await manager.query('INSERT INTO accounting_cash(id, project_id, data) VALUES($1, $2, $3::jsonb)', [id, projectId, JSON.stringify(row)]);
        saved.push({ ...row, id });
      }
      return saved;
    });
  }
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    await assertAccountingAccess(this.db, Number(body.projectId), user);
    const categories = await loadCashClassifications(this.db, Number(body.projectId));
    const row = applyCashClassification(validateCash(body.row), body.row, categories);
    const [[saved]] = await this.db.query('UPDATE accounting_cash SET data = data || $1::jsonb WHERE id::text = $2 AND project_id = $3 RETURNING id, data', [JSON.stringify(row), id, Number(body.projectId)]);
    if (!saved) throw new NotFoundException('Movimiento no encontrado.');
    return { ...saved.data, id: saved.id };
  }
  @Delete(':id')
  async remove(@Param('id') id: string, @Query('projectId') projectId: string, @CurrentUser() user: any) {
    await assertAccountingAccess(this.db, Number(projectId), user);
    const [rows] = await this.db.query('DELETE FROM accounting_cash WHERE id::text = $1 AND project_id = $2 RETURNING id', [id, Number(projectId)]);
    if (!rows.length) throw new NotFoundException('Movimiento no encontrado.');
    return { id };
  }
}
