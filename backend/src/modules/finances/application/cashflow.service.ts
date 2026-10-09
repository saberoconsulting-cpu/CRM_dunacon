// modules/finances/application/cashflow.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashflowModelEntity } from '../../../shared/infrastructure/entities/cashflow-model.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { BankAccountMovementEntity } from '../../../shared/infrastructure/entities/bank-account-movement.entity';
import { SaveCashflowModelDto, CashflowMode } from './dto/cashflow.dto';

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

  /**
   * Devuelve el modelo guardado de un proyecto en el modo indicado.
   * Si aun no existe devuelve null: el frontend decide como sembrarlo
   * (manual en estatico, data real del sistema en dinamico).
   */
  async getModel(projectId: number, mode?: string) {
    if (!projectId) return null;
    const normalizedMode = this.normalizeMode(mode);
    const model = await this.cashflowRepo.findOne({
      where: { projectId, mode: normalizedMode },
    });
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
      assumptions: dto.assumptions ?? null,
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
