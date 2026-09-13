import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { ConstructionBudgetItemEntity } from '../../../shared/infrastructure/entities/construction-budget-item.entity';
import {
  CONSTRUCTION_BUDGET_CATEGORIES,
  ConstructionBudgetCategory,
  CreateConstructionBudgetItemDto,
  UpdateConstructionBudgetItemDto,
} from './dto/construction-budget.dto';

export const BUDGET_CATEGORY_LABELS: Record<ConstructionBudgetCategory, string> = {
  costo_terreno: 'Costo de terreno',
  costo_directo: 'Costos directos',
  costo_indirecto: 'Costos indirectos',
  gastos_ventas_admin: 'Gastos de ventas y administrativos',
  gastos_financieros_impuestos: 'Gastos financieros e impuestos',
};

const BASE_BUDGET_TEMPLATE: Array<{ category: ConstructionBudgetCategory; code: string; name: string; sortOrder: number }> = [
  { category: 'costo_terreno', code: 'A.01', name: 'Adquisicion de terreno bruto / fundo matriz', sortOrder: 10 },
  { category: 'costo_terreno', code: 'A.02', name: 'Gastos legales y notariales de compra del terreno', sortOrder: 20 },
  { category: 'costo_directo', code: 'B.01', name: 'Movimiento de tierras', sortOrder: 110 },
  { category: 'costo_directo', code: 'B.02', name: 'Obras de saneamiento', sortOrder: 120 },
  { category: 'costo_directo', code: 'B.03', name: 'Pavimentacion y vias', sortOrder: 130 },
  { category: 'costo_directo', code: 'B.04', name: 'Redes electricas y alumbrado publico', sortOrder: 140 },
  { category: 'costo_directo', code: 'B.05', name: 'Obras complementarias', sortOrder: 150 },
  { category: 'costo_indirecto', code: 'C.01', name: 'Licencias, permisos, tasaciones e impactos ambientales', sortOrder: 210 },
  { category: 'costo_indirecto', code: 'C.02', name: 'Ingenieria y supervision', sortOrder: 220 },
  { category: 'costo_indirecto', code: 'C.03', name: 'Gastos generales de campo', sortOrder: 230 },
  { category: 'gastos_ventas_admin', code: 'D.01', name: 'Comisiones de ventas por lote', sortOrder: 310 },
  { category: 'gastos_ventas_admin', code: 'D.02', name: 'Publicidad y marketing digital/tradicional', sortOrder: 320 },
  { category: 'gastos_ventas_admin', code: 'D.03', name: 'Gastos administrativos', sortOrder: 330 },
  { category: 'gastos_financieros_impuestos', code: 'E.01', name: 'Intereses de prestamos o financiamiento de obra', sortOrder: 410 },
  { category: 'gastos_financieros_impuestos', code: 'E.02', name: 'Impuesto a la renta e IGV aplicable', sortOrder: 420 },
];

type BudgetImportRow = {
  rowNumber: number;
  category: ConstructionBudgetCategory | '';
  code: string;
  parentCode: string | null;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  sortOrder: number;
  errors: string[];
};

@Injectable()
export class ConstructionBudgetService {
  constructor(
    @InjectRepository(ConstructionBudgetItemEntity)
    private readonly budgetRepo: Repository<ConstructionBudgetItemEntity>,
  ) {}

  async list(projectId: number) {
    const items = await this.budgetRepo.find({
      where: { projectId, isActive: true },
      order: { category: 'ASC', sortOrder: 'ASC', id: 'ASC' },
    });
    return { items, summary: this.buildSummary(items) };
  }

  async seed(projectId: number, actorId?: number) {
    const existing = await this.budgetRepo.count({ where: { projectId, isActive: true } });
    if (existing > 0) return this.list(projectId);

    await this.budgetRepo.save(BASE_BUDGET_TEMPLATE.map((item) => this.budgetRepo.create({
      ...item,
      projectId,
      parentId: null,
      amount: '0',
      currency: 'PEN',
      createdBy: actorId || null,
    })));
    return this.list(projectId);
  }

  async create(dto: CreateConstructionBudgetItemDto, actorId?: number) {
    await this.validateParent(dto.projectId, dto.parentId || null);
    const item = this.budgetRepo.create({
      projectId: dto.projectId,
      parentId: dto.parentId || null,
      category: dto.category,
      code: dto.code,
      name: dto.name,
      description: dto.description || null,
      amount: String(dto.amount || 0),
      currency: dto.currency || 'PEN',
      sortOrder: dto.sortOrder || 0,
      createdBy: actorId || null,
    });
    return this.budgetRepo.save(item);
  }

  async update(id: number, dto: UpdateConstructionBudgetItemDto) {
    const item = await this.budgetRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Partida de presupuesto no encontrada');
    if (dto.parentId !== undefined) await this.validateParent(item.projectId, dto.parentId, id);

    Object.assign(item, {
      ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      ...(dto.category ? { category: dto.category } : {}),
      ...(dto.code ? { code: dto.code } : {}),
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.amount !== undefined ? { amount: String(dto.amount) } : {}),
      ...(dto.currency ? { currency: dto.currency } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    return this.budgetRepo.save(item);
  }

  async remove(id: number) {
    const item = await this.budgetRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Partida de presupuesto no encontrada');
    item.isActive = false;
    return this.budgetRepo.save(item);
  }

  previewExcel(file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Adjunta un archivo Excel');
    if (!/\.(xlsx|xls)$/i.test(file.originalname || '')) {
      throw new BadRequestException('Solo se aceptan archivos Excel .xlsx o .xls');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new BadRequestException('El Excel no contiene hojas');

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
      defval: '',
      raw: false,
    });
    const rows = rawRows.map((row, index) => this.normalizeImportRow(row, index + 2));
    const usableRows = rows.filter((row) => row.code || row.name || row.amount);
    const errors = usableRows.flatMap((row) => row.errors.map((message) => ({ rowNumber: row.rowNumber, message })));

    return {
      sheet: firstSheet,
      totalRows: usableRows.length,
      validRows: usableRows.filter((row) => row.errors.length === 0).length,
      errors,
      rows: usableRows,
      expectedColumns: ['categoria', 'codigo', 'padre', 'nombre', 'descripcion', 'monto', 'moneda', 'orden'],
    };
  }

  async importRows(projectId: number, rows: BudgetImportRow[], actorId?: number) {
    if (!projectId) throw new BadRequestException('Proyecto requerido');
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('No hay filas para importar');

    const normalized = rows.map((row) => this.normalizeImportPayload(row));
    const duplicateCodes = this.findDuplicates(normalized.map((row) => row.code));
    const normalizedCodes = new Set(normalized.map((row) => budgetCodeKey(row.code)).filter(Boolean));
    for (const row of normalized) {
      if (duplicateCodes.has(budgetCodeKey(row.code))) row.errors.push(`Codigo duplicado en el Excel: ${row.code}`);
      if (row.parentCode && !normalizedCodes.has(budgetCodeKey(row.parentCode))) {
        const existingParent = await this.budgetRepo.findOne({ where: { projectId, code: row.parentCode, isActive: true } });
        if (!existingParent) row.errors.push(`No existe la partida padre ${row.parentCode}`);
      }
    }

    const errors = normalized.flatMap((row) => row.errors.map((message) => ({ rowNumber: row.rowNumber, message })));
    if (errors.length) throw new BadRequestException({ message: 'Corrige el Excel antes de importar', errors });

    const existingItems = await this.budgetRepo.find({ where: { projectId, isActive: true } });
    const byCode = new Map(existingItems.map((item) => [budgetCodeKey(item.code), item]));
    const importedByCode = new Map<string, ConstructionBudgetItemEntity>();
    const pending = [...normalized].sort((a, b) => codeDepth(a.code) - codeDepth(b.code) || a.sortOrder - b.sortOrder);
    let created = 0;
    let updated = 0;

    for (const row of pending) {
      const key = budgetCodeKey(row.code);
      let item = byCode.get(key);
      const parentKey = budgetCodeKey(row.parentCode);
      const parent = parentKey ? importedByCode.get(parentKey) || byCode.get(parentKey) : null;

      if (!item) {
        item = this.budgetRepo.create({ projectId, createdBy: actorId || null });
        created += 1;
      } else {
        updated += 1;
      }

      Object.assign(item, {
        projectId,
        parentId: parent?.id || null,
        category: row.category,
        code: row.code,
        name: row.name,
        description: row.description,
        amount: String(row.amount || 0),
        currency: row.currency || 'PEN',
        sortOrder: row.sortOrder || 0,
        isActive: true,
      });

      const saved = await this.budgetRepo.save(item);
      byCode.set(key, saved);
      importedByCode.set(key, saved);
    }

    const result = await this.list(projectId);
    return { ...result, imported: normalized.length, created, updated };
  }

  async totalsByProject(projectId?: number) {
    const qb = this.budgetRepo.createQueryBuilder('b')
      .select('b.category', 'category')
      .addSelect('COALESCE(SUM(b.amount),0)', 'total')
      .where('b.is_active = true')
      .groupBy('b.category');
    if (projectId) qb.andWhere('b.project_id = :projectId', { projectId });
    const rows = await qb.getRawMany();
    const totals = this.emptyTotals();
    for (const row of rows) totals[row.category as ConstructionBudgetCategory] = Number(row.total || 0);
    return totals;
  }

  buildSummary(items: ConstructionBudgetItemEntity[]) {
    const totals = this.emptyTotals();
    for (const item of items) {
      if ((CONSTRUCTION_BUDGET_CATEGORIES as readonly string[]).includes(item.category)) {
        totals[item.category as ConstructionBudgetCategory] += Number(item.amount || 0);
      }
    }
    const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
    return { categories: totals, grandTotal };
  }

  private emptyTotals(): Record<ConstructionBudgetCategory, number> {
    return {
      costo_terreno: 0,
      costo_directo: 0,
      costo_indirecto: 0,
      gastos_ventas_admin: 0,
      gastos_financieros_impuestos: 0,
    };
  }

  private async validateParent(projectId: number, parentId?: number | null, currentId?: number) {
    if (!parentId) return;
    if (currentId && parentId === currentId) throw new BadRequestException('Una partida no puede depender de si misma');
    const parent = await this.budgetRepo.findOne({ where: { id: parentId, projectId, isActive: true } });
    if (!parent) throw new BadRequestException('La partida padre no pertenece al proyecto');
  }

  private normalizeImportRow(row: Record<string, unknown>, rowNumber: number): BudgetImportRow {
    const code = cleanCell(readColumn(row, ['codigo', 'código', 'code', 'item']));
    const parentCode = cleanCell(readColumn(row, ['padre', 'codigo padre', 'código padre', 'parent', 'parent code'])) || inferParentCode(code);
    const name = cleanCell(readColumn(row, ['nombre', 'partida', 'subpartida', 'concepto', 'descripcion partida']));
    const description = cleanCell(readColumn(row, ['descripcion', 'descripción', 'detalle', 'observacion', 'observación'])) || null;
    const amount = parseAmount(readColumn(row, ['monto', 'importe', 'total', 'presupuesto', 'proyectado', 'costo']));
    const currency = (cleanCell(readColumn(row, ['moneda', 'currency'])) || 'PEN').toUpperCase().slice(0, 3);
    const sortOrder = Number(parseAmount(readColumn(row, ['orden', 'sort', 'sort_order'])) || Math.max(0, rowNumber - 2) * 10 + 10);
    const category = normalizeCategory(cleanCell(readColumn(row, ['categoria', 'categoría', 'rubro', 'grupo'])), code);
    const errors: string[] = [];

    if (!category) errors.push('Categoria no reconocida. Usa A-E o una categoria valida.');
    if (!code) errors.push('Codigo requerido');
    if (code.length > 80) errors.push('Codigo maximo 80 caracteres');
    if (!name) errors.push('Nombre/partida requerido');
    if (name.length > 255) errors.push('Nombre maximo 255 caracteres');
    if (!Number.isFinite(amount) || amount < 0) errors.push('Monto invalido');
    if (!currency || currency.length !== 3) errors.push('Moneda invalida');

    return { rowNumber, category, code, parentCode, name, description, amount, currency, sortOrder, errors };
  }

  private normalizeImportPayload(row: BudgetImportRow): BudgetImportRow {
    return this.normalizeImportRow({
      categoria: row.category,
      codigo: row.code,
      padre: row.parentCode || '',
      nombre: row.name,
      descripcion: row.description || '',
      monto: row.amount,
      moneda: row.currency,
      orden: row.sortOrder,
    }, row.rowNumber || 0);
  }

  private findDuplicates(values: string[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values.map((item) => budgetCodeKey(item)).filter(Boolean)) {
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    return duplicates;
  }
}

const CATEGORY_ALIASES: Record<string, ConstructionBudgetCategory> = {
  a: 'costo_terreno',
  terreno: 'costo_terreno',
  costo_terreno: 'costo_terreno',
  'costo de terreno': 'costo_terreno',
  b: 'costo_directo',
  directo: 'costo_directo',
  costo_directo: 'costo_directo',
  'costos directos': 'costo_directo',
  c: 'costo_indirecto',
  indirecto: 'costo_indirecto',
  costo_indirecto: 'costo_indirecto',
  'costos indirectos': 'costo_indirecto',
  d: 'gastos_ventas_admin',
  ventas: 'gastos_ventas_admin',
  administracion: 'gastos_ventas_admin',
  administracion_ventas: 'gastos_ventas_admin',
  gastos_ventas_admin: 'gastos_ventas_admin',
  'ventas y administracion': 'gastos_ventas_admin',
  e: 'gastos_financieros_impuestos',
  financieros: 'gastos_financieros_impuestos',
  impuestos: 'gastos_financieros_impuestos',
  gastos_financieros_impuestos: 'gastos_financieros_impuestos',
};

function readColumn(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const normalizedName = normalizeHeader(name);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedName);
    if (match) return match[1];
  }
  return '';
}

function normalizeHeader(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanCell(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function budgetCodeKey(value: unknown) {
  return cleanCell(value).toUpperCase();
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') return value;
  const cleaned = cleanCell(value)
    .replace(/S\/|US\$|\$/gi, '')
    .replace(/\s/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(',', '.');
  return Number(normalized);
}

function normalizeCategory(value: string, code: string): ConstructionBudgetCategory | '' {
  const key = normalizeHeader(value).replace(/\s+/g, '_');
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  const firstLetter = String(code || '').trim().charAt(0).toLowerCase();
  return CATEGORY_ALIASES[firstLetter] || '';
}

function inferParentCode(code: string) {
  const parts = cleanCell(code).split('.');
  if (parts.length <= 2) return null;
  return parts.slice(0, -1).join('.');
}

function codeDepth(code: string) {
  return cleanCell(code).split('.').filter(Boolean).length;
}
