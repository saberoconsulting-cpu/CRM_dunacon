// modules/campaigns/application/campaigns.service.ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignEntity } from '../../../shared/infrastructure/entities/campaign.entity';
import { ClientEntity } from '../../../shared/infrastructure/entities/client.entity';
import { SaleEntity } from '../../../shared/infrastructure/entities/sale.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  async audit(userId: number, action: string, entity?: string, entityId?: number) {
    await this.auditRepo.save({ userId, action, entity, entityId });
  }

  async create(dto: Partial<CampaignEntity>, actorId: number) {
    const campaign = this.campaignRepo.create({
      ...dto,
      budget: dto.budget != null ? String(dto.budget) : '0',
      realExpense: dto.realExpense != null ? String(dto.realExpense) : '0',
      createdBy: actorId,
    });
    const saved = await this.campaignRepo.save(campaign);
    await this.audit(actorId, 'CREAR_CAMPAÑA', 'campaigns', saved.id);
    return saved;
  }

  async list(projectId?: number, paging?: { page?: number; limit?: number }, actorId?: number) {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (actorId) where.createdBy = actorId;
    const page = Math.max(1, paging?.page ?? 1);
    const limit = Math.min(200, Math.max(1, paging?.limit ?? 20));
    const usePaging = !!(paging?.page || paging?.limit);
    const [campaigns, total] = usePaging
      ? await this.campaignRepo.findAndCount({ where, order: { createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit })
      : [await this.campaignRepo.find({ where, order: { createdAt: 'DESC' } }), 0] as [CampaignEntity[], number];

    const items = await Promise.all(
      campaigns.map(async (c) => {
        const leadWhere: any = { campaignId: c.id };
        if (actorId) leadWhere.agentId = actorId;
        const leads = await this.clientRepo.count({ where: leadWhere });
        const sales = await this.saleRepo
          .createQueryBuilder('s')
          .innerJoin(ClientEntity, 'c', 'c.id = s.client_id')
          .where('c.campaign_id = :cid', { cid: c.id })
          .andWhere(actorId ? 's.agent_id = :actorId' : '1=1', { actorId })
          .select('COALESCE(SUM(s.sale_price),0)', 'total')
          .getRawOne();
        const attributedIncome = Number(sales?.total) || 0;
        const costPerLead = leads > 0 ? Number(c.realExpense || 0) / leads : 0;
        return { ...c, metrics: { leads, costPerLead, attributedIncome } };
      }),
    );

    if (!usePaging) return items;
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
  async update(id: number, dto: Partial<CampaignEntity>, actorId: number, ownerId?: number) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (ownerId && Number(campaign.createdBy) !== Number(ownerId)) throw new ForbiddenException('No tienes acceso a esta campana');
    Object.assign(campaign, dto);
    if (dto.budget != null) campaign.budget = String(dto.budget);
    if (dto.realExpense != null) campaign.realExpense = String(dto.realExpense);
    const saved = await this.campaignRepo.save(campaign);
    await this.audit(actorId, 'EDITAR_CAMPAÑA', 'campaigns', id);
    return saved;
  }
}
