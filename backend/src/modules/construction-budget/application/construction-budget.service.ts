import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
