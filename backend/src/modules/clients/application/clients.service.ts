// modules/clients/application/clients.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientEntity } from '../../../shared/infrastructure/entities/client.entity';
import { ClientContactEntity } from '../../../shared/infrastructure/entities/client-contact.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { PaymentEntity } from '../../../shared/infrastructure/entities/payment.entity';
import { SaleEntity } from '../../../shared/infrastructure/entities/sale.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { CreateClientDto, AddContactDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(ClientContactEntity)
    private readonly contactRepo: Repository<ClientContactEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  async audit(userId: number, action: string, entity?: string, entityId?: number) {
    await this.auditRepo.save({ userId, action, entity, entityId });
  }

  async create(dto: CreateClientDto, actorId: number) {
    const client = this.clientRepo.create(dto);
    const saved = await this.clientRepo.save(client);
    await this.audit(actorId, 'CREAR_CLIENTE', 'clients', saved.id);
    return saved;
  }

  async list(filters: {
    projectId?: number;
    agentId?: number;
    channel?: string;
    campaignId?: number;
    pipelineStatus?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 20));
    const qb = this.clientRepo.createQueryBuilder('c');
    if (filters.projectId) qb.where('c.project_interest_id = :projectId', { projectId: filters.projectId });
    if (filters.agentId) qb.andWhere('c.agent_id = :agentId', { agentId: filters.agentId });
    if (filters.channel) qb.andWhere('c.source = :channel', { channel: filters.channel });
    if (filters.campaignId) qb.andWhere('c.campaign_id = :campaignId', { campaignId: filters.campaignId });
    if (filters.pipelineStatus) qb.andWhere('c.pipeline_status = :pipelineStatus', { pipelineStatus: filters.pipelineStatus });
    if (filters.search) {
      qb.andWhere('(c.full_name ILIKE :s OR c.phone ILIKE :s OR c.email ILIKE :s)', { s: `%${filters.search}%` });
    }
    qb.orderBy('c.created_at', 'DESC');
    const total = await qb.clone().getCount();
    qb.skip((page - 1) * limit).take(limit);
    const items = await qb.getMany();
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async getOne(id: number) {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    const [contacts, lots, payments, sales] = await Promise.all([
      this.contactRepo.find({ where: { clientId: id }, order: { createdAt: 'DESC' } }),
      this.lotRepo.find({ where: { clientId: id } }),
      this.paymentRepo.find({ where: { clientId: id }, order: { createdAt: 'DESC' } }),
      this.saleRepo.find({ where: { clientId: id }, order: { createdAt: 'DESC' } }),
    ]);
    return { ...client, contacts, lots, payments, sales };
  }

  async update(id: number, dto: CreateClientDto, actorId: number) {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    Object.assign(client, dto);
    const saved = await this.clientRepo.save(client);
    await this.audit(actorId, 'EDITAR_CLIENTE', 'clients', id);
    return saved;
  }

  async setPipeline(id: number, pipelineStatus: string) {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    client.pipelineStatus = pipelineStatus;
    return this.clientRepo.save(client);
  }

  async addContact(id: number, dto: AddContactDto, userId: number) {
    return this.contactRepo.save({ clientId: id, note: dto.note, userId });
  }

  async metricsByChannel(projectId?: number) {
    const qb = this.clientRepo
      .createQueryBuilder('c')
      .select('c.source', 'channel')
      .addSelect('COUNT(*)', 'total')
      .groupBy('c.source');
    if (projectId) qb.where('c.project_interest_id = :projectId', { projectId });
    const rows = await qb.getRawMany();
    return rows.map((r) => ({ channel: r.channel, total: Number(r.total) }));
  }
}