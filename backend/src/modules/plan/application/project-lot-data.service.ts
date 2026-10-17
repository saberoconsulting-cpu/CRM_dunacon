import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ProjectLotDataEntity } from '../../../shared/infrastructure/entities/project-lot-data.entity';
import { ProjectEntity } from '../../../shared/infrastructure/entities/project.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { ProjectLotDataDto } from './dto/project-lot-data.dto';
import { lotDataCode, parseLotDataExcel } from './lot-data-excel';

@Injectable()
export class ProjectLotDataService {
  constructor(
    @InjectRepository(ProjectLotDataEntity) private readonly repo: Repository<ProjectLotDataEntity>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async list(projectId: number) {
    const rows = await this.repo.find({ where: { projectId } });
    const commercial = await this.commercialData(this.repo.manager, projectId);
    return rows.map(row => ({ ...row, areaM2: Number(row.areaM2), ...this.resolveCommercial(commercial.get(row.code)) }))
      .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
  }

  private async commercialData(manager: EntityManager, projectId: number) {
    const rows = await manager.query(`SELECT UPPER(TRIM(l.code)) AS code, l.status AS "lotStatus",
      l.selling_stage AS "sellingStage", s.id AS "saleId", s.approval_status AS "approvalStatus", c.full_name AS owner
      FROM lots l LEFT JOIN sales s ON s.id = (
        SELECT MAX(v.id) FROM sales v WHERE v.lot_id = l.id AND v.project_id = l.project_id
        AND v.approval_status <> 'rechazada' AND v.status <> 'rechazada'
      ) LEFT JOIN clients c ON c.id = s.client_id WHERE l.project_id = $1 ORDER BY l.id DESC`, [projectId]);
    const result = new Map<string, any>();
    for (const row of rows) if (!result.has(row.code)) result.set(row.code, row);
    return result;
  }

  private resolveCommercial(source?: any) {
    const rawStatus = source?.saleId
      ? source.approvalStatus === 'aprobada' ? 'vendido' : 'reservado'
      : source?.lotStatus || 'disponible';
    const labels: Record<string, string> = { vendido: 'Vendido', reservado: 'Separado', separado: 'Separado', adelanto: 'Separado',
      disponible: 'Disponible', promocion: 'En promoción', segunda_etapa: '2da. etapa', primera_cuota: 'Vendido', alquilado: 'Vendido' };
    const status = labels[rawStatus] || rawStatus;
    return { status, owner: source?.saleId ? source.owner || '' : '', sold: status === 'Vendido' };
  }

  private async lockProject(manager: EntityManager, projectId: number) {
    await manager.query('SELECT pg_advisory_xact_lock(624157, $1::integer)', [projectId]);
    if (!await manager.getRepository(ProjectEntity).findOne({ where: { id: projectId } })) throw new NotFoundException('Proyecto no encontrado');
  }

  async save(projectId: number, dto: ProjectLotDataDto, actorId: number, id?: number) {
    const code = lotDataCode(dto.code);
    if (!code) throw new BadRequestException('Indica el numero de lote.');
    return this.ds.transaction(async manager => {
      await this.lockProject(manager, projectId);
      const repo = manager.getRepository(ProjectLotDataEntity);
      const old = id ? await repo.findOne({ where: { id, projectId } }) : null;
      if (id && !old) throw new NotFoundException('Datos del lote no encontrados en este proyecto');
      const duplicate = await repo.findOne({ where: { projectId, code } });
      if (duplicate && duplicate.id !== id) throw new BadRequestException('Este numero de lote ya existe. Edita el registro existente.');
      const commercial = await this.commercialData(manager, projectId);
      const previous = old ? this.resolveCommercial(commercial.get(old.code)) : null;
      if (previous?.sold && old!.code !== code) throw new BadRequestException('No se puede cambiar el numero de un lote vendido.');
      const live = this.resolveCommercial(commercial.get(code));
      // Sales remain the source of truth even if a request supplies an old Excel state or owner.
      const row = repo.create({ ...old, ...dto, code, projectId, areaM2: String(dto.areaM2), status: live.status, owner: '' });
      const saved = await repo.save(row);
      await manager.getRepository(AuditLogEntity).save({ userId: actorId, action: id ? 'EDITAR_DATOS_LOTE' : 'CREAR_DATOS_LOTE', entity: 'project_lot_data', entityId: saved.id });
      return { ...saved, areaM2: Number(saved.areaM2), ...live };
    });
  }

  async remove(projectId: number, id: number, actorId: number) {
    return this.ds.transaction(async manager => {
      await this.lockProject(manager, projectId);
      const result = await manager.getRepository(ProjectLotDataEntity).delete({ projectId, id });
      if (!result.affected) throw new NotFoundException('Datos del lote no encontrados en este proyecto');
      await manager.getRepository(AuditLogEntity).save({ userId: actorId, action: 'ELIMINAR_DATOS_LOTE', entity: 'project_lot_data', entityId: id });
      return { ok: true };
    });
  }

  async importExcel(projectId: number, buffer: Buffer, actorId: number) {
    const parsed = parseLotDataExcel(buffer);
    return this.ds.transaction(async manager => {
      await this.lockProject(manager, projectId);
      const repo = manager.getRepository(ProjectLotDataEntity);
      const existing = new Set((await repo.find({ where: { projectId }, select: ['code'] })).map(row => row.code));
      const commercial = await this.commercialData(manager, projectId);
      // One transaction: a later Excel replaces matching records and preserves absent lots.
      for (let index = 0; index < parsed.length; index += 200) {
        await repo.upsert(parsed.slice(index, index + 200).map(row => ({ ...row, projectId, areaM2: String(row.areaM2),
          status: this.resolveCommercial(commercial.get(row.code)).status, owner: '' })), ['projectId', 'code']);
      }
      await manager.getRepository(AuditLogEntity).save({ userId: actorId, action: 'IMPORTAR_DATOS_LOTES', entity: 'projects', entityId: projectId });
      return { created: parsed.filter(row => !existing.has(row.code)).length, updated: parsed.filter(row => existing.has(row.code)).length, total: await repo.count({ where: { projectId } }) };
    });
  }
}
