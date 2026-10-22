import { BadRequestException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { ProjectEntity } from '../../../shared/infrastructure/entities/project.entity';
import { CashflowModelEntity } from '../../../shared/infrastructure/entities/cashflow-model.entity';
import { BankCategoryMappingEntity } from '../../../shared/infrastructure/entities/bank-category-mapping.entity';
import { IncomeStatementItemEntity } from '../../../shared/infrastructure/entities/income-statement-item.entity';
import { ConstructionBudgetItemEntity } from '../../../shared/infrastructure/entities/construction-budget-item.entity';
import { AppSettingEntity } from '../../../shared/infrastructure/entities/app-setting.entity';
import { parseFinancialStore } from '../../../shared/application/financial-accounts';

export const CASHFLOW_TEMPLATE_STRUCTURE_VERSION = 2;

/** Copy only presentation/structure. Never carry financial data between projects. */
export function blankCashflowTemplate(model: CashflowModelEntity) {
  const assumptions = model.assumptions || {};
  return {
    assumptions: {
      ...(assumptions.years !== undefined ? { years: assumptions.years } : {}),
      // Prevent the frontend's legacy migration from replacing empty cells with seed data.
      seedVersion: 2,
      templateStructureVersion: CASHFLOW_TEMPLATE_STRUCTURE_VERSION,
    },
    rows: (model.rows || []).map((row) => {
      const structural = row as typeof row & { computed?: boolean; parentId?: string; depth?: number };
      return {
        id: row.id,
        label: row.label,
        values: row.values.map(() => 0),
        ...(structural.computed !== undefined ? { computed: structural.computed } : {}),
        ...(structural.parentId !== undefined ? { parentId: structural.parentId } : {}),
        ...(structural.depth !== undefined ? { depth: structural.depth } : {}),
      };
    }),
  };
}

export async function initializeProjectCashflows(manager: EntityManager, projectId: number, actorId: number) {
  const projects = manager.getRepository(ProjectEntity);
  const models = manager.getRepository(CashflowModelEntity);
  const configuredId = process.env.CASHFLOW_TEMPLATE_PROJECT_ID?.trim() || '5';
  const id = Number(configuredId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('CASHFLOW_TEMPLATE_PROJECT_ID debe ser un ID de proyecto valido.');
  // The source is read-only, even if this helper is called with its own ID.
  if (id === projectId) return;
  const source = await projects.findOne({ where: { id, deletedAt: IsNull() } });
  if (!source) throw new BadRequestException('El proyecto plantilla de flujo de caja no existe o fue eliminado.');
  const originals = await models.find({ where: { projectId: source.id }, order: { id: 'DESC' } });
  const staticModel = originals.find((m) => m.mode === 'estatico' && m.rows?.length);
  const dynamicModel = originals.find((m) => m.mode === 'dinamico' && m.rows?.length);
  if (!staticModel && !dynamicModel) throw new BadRequestException('Guarda primero el flujo de caja del proyecto plantilla.');
  const primary = staticModel || dynamicModel!;
  const rowsById = new Map(primary.rows.map((row) => [row.id, row]));
  for (const row of dynamicModel?.rows || []) {
    if (!rowsById.has(row.id)) rowsById.set(row.id, row);
  }
  const template = blankCashflowTemplate({ ...primary, rows: [...rowsById.values()] });
  for (const mode of ['estatico', 'dinamico']) {
    await models.save(models.create({
      projectId, mode, createdBy: actorId, ...template,
    }));
  }
  const categories = manager.getRepository(BankCategoryMappingEntity);
  const sourceCategories = await categories.find({
    where: { projectId: source.id }, order: { sortOrder: 'ASC', id: 'ASC' },
  });
  // New IDs and project ownership; keep links to the copied cashflow row IDs.
  // Do not copy accounts, account numbers, balances or bank movements.
  if (sourceCategories.length) {
    await categories.save(sourceCategories.map((category) => categories.create({
      projectId,
      movementType: category.movementType,
      code: category.code,
      eerrClassification: category.eerrClassification,
      cashflowRowId: category.cashflowRowId,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      createdBy: actorId,
    })));
  }
  await copyIncomeStatementStructure(manager, source.id, projectId, actorId);
  await copyConstructionBudgetStructure(manager, source.id, projectId, actorId);
  const settings = manager.getRepository(AppSettingEntity);
  const sourceDashboard = await settings.findOne({ where: { key: `finance_dashboard_${source.id}` } });
  let dashboard: Record<string, any> = {};
  try {
    dashboard = sourceDashboard?.value ? JSON.parse(sourceDashboard.value) : {};
    if (!dashboard || typeof dashboard !== 'object' || Array.isArray(dashboard)) throw new Error();
  } catch {
    throw new BadRequestException('No se pueden leer los campos de Datos importantes de la plantilla.');
  }
  const copyLabels = (labels: unknown): Record<string, string> => labels && typeof labels === 'object' && !Array.isArray(labels)
    ? Object.fromEntries(Object.entries(labels).filter(([, label]) => typeof label === 'string')) : {};
  await settings.save(settings.create({
    key: `finance_dashboard_${projectId}`,
    value: JSON.stringify({
      boletasEmitidas: '',
      totalAcciones: '',
      factorActualizacion: '',
      accionesAVender: '',
      compromisoTerreno: '',
      dataLabels: copyLabels(dashboard.dataLabels),
      dataRows: Array.isArray(dashboard.dataRows) ? dashboard.dataRows.map((row) => ({
        code: String(row.code || ''), label: String(row.label || ''), value: '',
      })) : [],
      socios: Array.from({ length: 3 }, (_, index) => ({
        name: `Socio ${index + 1}`,
        capital: '',
        adicional: '',
        newPartner: false,
      })),
    }),
  }));
  const sourceFinancial = await settings.findOne({ where: { key: `finance_financial_data_${source.id}` } });
  const financial = parseFinancialStore(sourceFinancial?.value);
  await settings.save(settings.create({
    key: `finance_financial_data_${projectId}`,
    value: JSON.stringify({ version: 2, labels: copyLabels(financial.labels), accounts: [], blankDefaults: true }),
  }));
  const sourceClassification = await settings.findOne({ where: { key: `finance_classification_${source.id}` } });
  if (sourceClassification?.value) {
    let classification: { rows: Array<Record<string, unknown>> };
    try {
      classification = JSON.parse(sourceClassification.value);
      if (!Array.isArray(classification?.rows) || classification.rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error();
    } catch {
      throw new BadRequestException('No se puede leer la clasificacion de Finanzas de la plantilla.');
    }
    const fields = ['key', 'code', 'category', 'paymentCategory', 'movementType', 'eerrClassification', 'cashflowRowId', 'paymentMethod', 'sortOrder', 'custom', 'deleted'];
    await settings.save(settings.create({
      key: `finance_classification_${projectId}`,
      value: JSON.stringify({ rows: classification.rows.map((row) => Object.fromEntries(
        fields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]),
      )) }),
    }));
  }
}

export async function copyConstructionBudgetStructure(manager: EntityManager, sourceId: number, projectId: number, actorId: number) {
  if (sourceId === projectId) return;
  const repo = manager.getRepository(ConstructionBudgetItemEntity);
  const originals = await repo.find({ where: { projectId: sourceId }, order: { sortOrder: 'ASC', id: 'ASC' } });
  const pending = new Map(originals.map((item) => [Number(item.id), item]));
  const copiedIds = new Map<number, number>();
  while (pending.size) {
    let progressed = false;
    for (const [id, item] of pending) {
      const parentId = item.parentId == null ? null : Number(item.parentId);
      if (parentId !== null && !copiedIds.has(parentId)) continue;
      const saved = await repo.save(repo.create({
        projectId,
        parentId: parentId === null ? null : copiedIds.get(parentId)!,
        category: item.category,
        code: item.code,
        name: item.name,
        description: item.description,
        amount: '0',
        currency: item.currency,
        status: 'sin_inicio',
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        createdBy: actorId,
      }));
      copiedIds.set(id, Number(saved.id));
      pending.delete(id);
      progressed = true;
    }
    if (!progressed) throw new BadRequestException('La jerarquia del Presupuesto de Obra de la plantilla contiene padres inexistentes o ciclos.');
  }
}

/** Remap database IDs so children belong to the new project's own parents. */
export async function copyIncomeStatementStructure(manager: EntityManager, sourceId: number, projectId: number, actorId: number) {
  if (sourceId === projectId) return;
  const repo = manager.getRepository(IncomeStatementItemEntity);
  const originals = await repo.find({ where: { projectId: sourceId }, order: { sortOrder: 'ASC', id: 'ASC' } });
  const pending = new Map(originals.map((item) => [Number(item.id), item]));
  const copiedIds = new Map<number, number>();
  while (pending.size) {
    let progressed = false;
    for (const [id, item] of pending) {
      const parentId = item.parentId == null ? null : Number(item.parentId);
      if (parentId !== null && !copiedIds.has(parentId)) continue;
      const saved = await repo.save(repo.create({
        projectId,
        parentId: parentId === null ? null : copiedIds.get(parentId)!,
        line: item.line,
        code: item.code,
        name: item.name,
        description: item.description,
        amount: '0',
        currency: item.currency,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        createdBy: actorId,
      }));
      copiedIds.set(id, Number(saved.id));
      pending.delete(id);
      progressed = true;
    }
    if (!progressed) throw new BadRequestException('La jerarquia del Estado de Resultados de la plantilla contiene padres inexistentes o ciclos.');
  }
}
