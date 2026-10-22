// modules/finances/application/cashflow.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashflowModelEntity } from '../../../shared/infrastructure/entities/cashflow-model.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { BankAccountMovementEntity } from '../../../shared/infrastructure/entities/bank-account-movement.entity';
import { SaveCashflowModelDto, CashflowMode } from './dto/cashflow.dto';
import { blankCashflowTemplate, CASHFLOW_TEMPLATE_STRUCTURE_VERSION } from '../../projects/application/cashflow-template';

const MODES: CashflowMode[] = ['estatico', 'dinamico'];

@Injectable()
export class CashflowService {
  constructor(
    @InjectRepository(CashflowModelEntity)
    private readonly cashflowRepo: Repository<CashflowModelEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(BankAccountMovementEntity)
    private readonly bankMovementRepo: Repository<BankAccountMovementEntity>,
  ) {}

  private normalizeMode(mode?: string): CashflowMode {
    return MODES.includes(mode as CashflowMode) ? (mode as CashflowMode) : 'estatico';
  }

  /** One-time repair for projects created before template inheritance existed. */
  private async inheritMissingStructure(projectId: number, mode: CashflowMode, model: CashflowModelEntity | null) {
    const sourceId = Number(process.env.CASHFLOW_TEMPLATE_PROJECT_ID?.trim() || '5');
    if (projectId === sourceId || Number(model?.assumptions?.templateStructureVersion || 0) >= CASHFLOW_TEMPLATE_STRUCTURE_VERSION) return model;
    return this.cashflowRepo.manager.transaction(async manager => {
    await manager.query('SELECT pg_advisory_xact_lock(624159, $1::integer)', [projectId]);
    const repo = manager.getRepository(CashflowModelEntity);
    model = await repo.findOne({ where: { projectId, mode } });
    if (Number(model?.assumptions?.templateStructureVersion || 0) >= CASHFLOW_TEMPLATE_STRUCTURE_VERSION) return model;
    const sources = await repo.find({ where: { projectId: sourceId }, order: { id: 'DESC' } });
    const primary = sources.find((item) => item.mode === 'estatico' && item.rows?.length)
      || sources.find((item) => item.mode === 'dinamico' && item.rows?.length);
    if (!primary) return model;
    const structure = new Map(primary.rows.map((row) => [row.id, row]));
    for (const source of sources.filter((item) => item.mode === 'dinamico')) {
      for (const row of source.rows || []) if (!structure.has(row.id)) structure.set(row.id, row);
    }
    const template = blankCashflowTemplate({ ...primary, rows: [...structure.values()] });
    const rows = [...(model?.rows || [])];
    const existingIds = new Set(rows.map((row) => row.id));
    for (const row of template.rows) if (!existingIds.has(row.id)) rows.push(row);
    return repo.save(repo.create({
      ...model,
      projectId,
      mode,
      rows,
      assumptions: { ...template.assumptions, ...model?.assumptions, templateStructureVersion: CASHFLOW_TEMPLATE_STRUCTURE_VERSION },
    }));
    });
  }

  /**
   * Devuelve el modelo guardado de un proyecto en el modo indicado.
   * Si aun no existe devuelve null: el frontend decide como sembrarlo
   * (manual en estatico, data real del sistema en dinamico).
   */
  async getModel(projectId: number, mode?: string) {
    if (!projectId) return null;
    const normalizedMode = this.normalizeMode(mode);
    const existing = await this.cashflowRepo.findOne({
      where: { projectId, mode: normalizedMode },
    });
    const model = await this.inheritMissingStructure(projectId, normalizedMode, existing);
    if (!model) return null;
    if (normalizedMode !== 'dinamico') return model;

    const bankState = await this.bankMovementRepo.createQueryBuilder('m')
      .select('COUNT(*)', 'movementCount')
      .addSelect('MAX(m.updated_at)', 'lastBankMovementAt')
      .where('m.project_id = :projectId', { projectId })
      .getRawOne();
    const lastBankMovementAt = bankState?.lastBankMovementAt ? new Date(bankState.lastBankMovementAt) : null;
    const modelUpdatedAt = model.updatedAt ? new Date(model.updatedAt) : null;
    return {
      ...model,
      bankSync: {
        movementCount: Number(bankState?.movementCount || 0),
        lastBankMovementAt: lastBankMovementAt?.toISOString() || null,
        modelUpdatedAt: modelUpdatedAt?.toISOString() || null,
        stale: Boolean(lastBankMovementAt && modelUpdatedAt && lastBankMovementAt > modelUpdatedAt),
      },
    };
  }

  /** Crea o actualiza el modelo del proyecto para ese modo (upsert). */
  async saveModel(dto: SaveCashflowModelDto, actorId: number) {
    const mode = this.normalizeMode(dto.mode);
    const existing = await this.cashflowRepo.findOne({
      where: { projectId: dto.projectId, mode },
    });
    const payload = {
      projectId: dto.projectId,
      mode,
      assumptions: {
        ...dto.assumptions,
        ...(existing?.assumptions?.templateStructureVersion !== undefined
          ? { templateStructureVersion: existing.assumptions.templateStructureVersion } : {}),
      },
      rows: Array.isArray(dto.rows) ? dto.rows : [],
      createdBy: existing?.createdBy ?? actorId,
    };
    const saved = await this.cashflowRepo.save(
      existing ? { ...existing, ...payload } : this.cashflowRepo.create(payload),
    );
    await this.auditRepo.save({
      userId: actorId,
      action: `GUARDAR_FLUJO_CAJA_${mode.toUpperCase()}`,
      entity: 'cashflow_models',
      entityId: saved.id,
    });
    return saved;
  }

  /** Lista los modos que ya tienen modelo guardado para el proyecto. */
  async listModes(projectId: number) {
    const models = await this.cashflowRepo.find({ where: { projectId } });
    return {
      projectId,
      estatico: Boolean(models.find((item) => item.mode === 'estatico')),
      dinamico: Boolean(models.find((item) => item.mode === 'dinamico')),
    };
  }
}
