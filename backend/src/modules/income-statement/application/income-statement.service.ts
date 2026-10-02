import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncomeStatementItemEntity } from '../../../shared/infrastructure/entities/income-statement-item.entity';
import {
  CreateIncomeStatementItemDto,
  INCOME_STATEMENT_LINES,
  IncomeStatementLine,
  UpdateIncomeStatementItemDto,
} from './dto/income-statement.dto';

export const INCOME_STATEMENT_LINE_LABELS: Record<IncomeStatementLine, string> = {
  ingreso: 'Ingreso por venta de lotes',
  costo: 'Costo de venta de lotes',
  ventas_admin: 'Gastos de ventas y administrativos',
  financiero: 'Gastos financieros',
  impuestos: 'Impuesto a la renta referencial',
  igv: 'IGV referencial incluido en ingresos',
  ajuste: 'Utilidad ajustada referencial',
};

/** Orden contable de las lineas dentro del cuadro. */
const LINE_ORDER: IncomeStatementLine[] = ['ingreso', 'costo', 'ventas_admin', 'financiero', 'impuestos', 'igv', 'ajuste'];

@Injectable()
export class IncomeStatementService {
  constructor(
    @InjectRepository(IncomeStatementItemEntity)
    private readonly statementRepo: Repository<IncomeStatementItemEntity>,
  ) {}

  async list(projectId: number) {
    if (!projectId) throw new BadRequestException('Proyecto requerido');
    const items = await this.statementRepo.find({
      where: { projectId, isActive: true },
      order: { line: 'ASC', sortOrder: 'ASC', id: 'ASC' },
    });
    return { items, summary: this.buildSummary(items) };
  }

  async create(dto: CreateIncomeStatementItemDto, actorId?: number) {
    await this.validateParent(dto.projectId, dto.parentId || null);
    const item = this.statementRepo.create({
      projectId: dto.projectId,
      parentId: dto.parentId || null,
      line: dto.line,
      code: dto.code,
      name: dto.name,
      description: dto.description || null,
      amount: String(dto.amount || 0),
      currency: dto.currency || 'PEN',
      sortOrder: dto.sortOrder || 0,
      createdBy: actorId || null,
    });
    return this.statementRepo.save(item);
  }

  async update(id: number, dto: UpdateIncomeStatementItemDto) {
    const item = await this.statementRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Partida de estado de resultados no encontrada');
    if (dto.parentId !== undefined) await this.validateParent(item.projectId, dto.parentId, id);

    Object.assign(item, {
      ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      ...(dto.line ? { line: dto.line } : {}),
      ...(dto.code ? { code: dto.code } : {}),
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.amount !== undefined ? { amount: String(dto.amount) } : {}),
      ...(dto.currency ? { currency: dto.currency } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    return this.statementRepo.save(item);
  }

  async remove(id: number) {
    const item = await this.statementRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Partida de estado de resultados no encontrada');
    item.isActive = false;
    return this.statementRepo.save(item);
  }

  /**
   * Totales por linea. Cuando una partida tiene subpartidas, su monto propio se
   * ignora y se usa la suma de los hijos (mismo criterio que presupuesto de obra).
   */
  buildSummary(items: IncomeStatementItemEntity[]) {
    const totals: Record<string, number> = {
      ingreso: 0,
      costo: 0,
      ventas_admin: 0,
      financiero: 0,
      impuestos: 0,
      igv: 0,
      ajuste: 0,
    };
    for (const item of items) {
      if (!(INCOME_STATEMENT_LINES as readonly string[]).includes(item.line)) continue;
      if (items.some((child) => Number(child.parentId || 0) === Number(item.id))) continue;
      totals[item.line] += Number(item.amount || 0);
    }
    const utilidadBruta = totals.ingreso - totals.costo;
    const utilidadOperativa = utilidadBruta - totals.ventas_admin;
    const utilidadAntesImpuesto = utilidadOperativa - totals.financiero;
    return {
      lines: totals,
      lineOrder: LINE_ORDER,
      labels: INCOME_STATEMENT_LINE_LABELS,
      computed: {
        costo_venta: totals.costo,
        utilidad_bruta: utilidadBruta,
        utilidad_operativa: utilidadOperativa,
        utilidad_antes_impuesto: utilidadAntesImpuesto,
        utilidad_neta: utilidadAntesImpuesto - totals.impuestos,
        utilidad_ajustada: utilidadAntesImpuesto - totals.impuestos - totals.igv + totals.ajuste,
      },
    };
  }

  private async validateParent(projectId: number, parentId?: number | null, currentId?: number) {
    if (!parentId) return;
    if (currentId && Number(parentId) === Number(currentId)) {
      throw new BadRequestException('Una partida no puede depender de si misma');
    }
    const parent = await this.statementRepo.findOne({ where: { id: parentId, projectId, isActive: true } });
    if (!parent) throw new BadRequestException('La partida padre no pertenece al proyecto');
  }
}
