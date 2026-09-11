// modules/lots/application/lots.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../../../shared/infrastructure/entities/lot-status-history.entity';
import { PaymentEntity } from '../../../shared/infrastructure/entities/payment.entity';
import { ClientEntity } from '../../../shared/infrastructure/entities/client.entity';
import { UserEntity } from '../../../shared/infrastructure/entities/user.entity';
import { BlockEntity } from '../../../shared/infrastructure/entities/block.entity';

@Injectable()
export class LotsService {
  constructor(
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(LotStatusHistoryEntity)
    private readonly historyRepo: Repository<LotStatusHistoryEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(BlockEntity)
    private readonly blockRepo: Repository<BlockEntity>,
  ) {}

  // Listado global con filtros
  async list(filters: {
    projectId?: number;
    blockId?: number;
    status?: string;
    agentId?: number;
    search?: string;
    minArea?: number;
    maxArea?: number;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 20));
    const qb = this.lotRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect(UserEntity, 'u', 'u.id = l.agent_id')
      .leftJoinAndSelect(ClientEntity, 'c', 'c.id = l.client_id')
      .leftJoinAndSelect(BlockEntity, 'b', 'b.id = l.block_id')
      .select([
        'l.id', 'l.projectId', 'l.planId', 'l.blockId', 'l.code',
        'l.areaM2', 'l.price', 'l.status', 'l.clientId', 'l.agentId',
      ])
      // Postgres pliega a minúsculas cualquier alias sin comillas (AS agentName
      // vuelve "agentname"), por eso todos estos van entre comillas dobles.
      .addSelect([
        'u.name AS "agentName"', 'c.full_name AS "clientName"', 'l.selling_stage AS "sellingStage"',
        'l.type AS "type"', 'l.sale_price AS "salePrice"', 'l.final_price AS "finalPrice"',
        'b.name AS "blockName"', 'b.address AS "blockAddress"',
      ]);

    if (filters.projectId) qb.andWhere('l.project_id = :projectId', { projectId: filters.projectId });
    if (filters.blockId) qb.andWhere('l.block_id = :blockId', { blockId: filters.blockId });
    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });
    if (filters.agentId) qb.andWhere('l.agent_id = :agentId', { agentId: filters.agentId });
    if (filters.search) qb.andWhere('l.code ILIKE :search', { search: `%${filters.search}%` });
    if (filters.minArea) qb.andWhere('l.area_m2 >= :minArea', { minArea: filters.minArea });
    if (filters.maxArea) qb.andWhere('l.area_m2 <= :maxArea', { maxArea: filters.maxArea });
    if (filters.minPrice) qb.andWhere('l.price >= :minPrice', { minPrice: filters.minPrice });
    if (filters.maxPrice) qb.andWhere('l.price <= :maxPrice', { maxPrice: filters.maxPrice });

    qb.orderBy('l.code', 'ASC');
    const total = await qb.clone().getCount();
    qb.skip((page - 1) * limit).take(limit);
    // Mapear a objetos planos (evita el doble mapeo de TypeORM)
    const raw = await qb.getRawMany();
    const items = raw.map((r) => ({
      id: Number(r.l_id),
      projectId: Number(r.l_project_id),
      planId: Number(r.l_plan_id),
      blockId: r.l_block_id ? Number(r.l_block_id) : null,
      code: r.l_code,
      areaM2: Number(r.l_area_m2),
      price: Number(r.l_price),
      status: r.l_status,
      sellingStage: r.sellingStage || undefined,
      clientId: r.l_client_id ? Number(r.l_client_id) : null,
      agentId: r.l_agent_id ? Number(r.l_agent_id) : null,
      agentName: r.agentName || null,
      clientName: r.clientName || null,
      type: r.type || null,
      salePrice: r.salePrice != null ? Number(r.salePrice) : null,
      finalPrice: r.finalPrice != null ? Number(r.finalPrice) : null,
      blockName: r.blockName || null,
      blockAddress: r.blockAddress || null,
    }));
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  // Ficha completa del lote
  async getOne(id: number) {
    const lot = await this.lotRepo.findOne({ where: { id } });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    const [history, payments] = await Promise.all([
      this.historyRepo.find({ where: { lotId: id }, order: { createdAt: 'DESC' } }),
      this.paymentRepo.find({ where: { lotId: id }, order: { createdAt: 'DESC' } }),
    ]);
    let client: ClientEntity | null = null;
    let agent: { id: number; name: string; email: string; phone: string | null } | null = null;
    let block: BlockEntity | null = null;
    if (lot.clientId) client = await this.clientRepo.findOne({ where: { id: lot.clientId } });
    if (lot.agentId) {
      const a = await this.userRepo.findOne({ where: { id: lot.agentId } });
      if (a) agent = { id: a.id, name: a.name, email: a.email, phone: a.phone };
    }
    if (lot.blockId) block = await this.blockRepo.findOne({ where: { id: lot.blockId } });
    const totalPaid = payments
      .filter((p) => p.status === 'pagado')
      .reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(lot.price) - totalPaid;
    return { lot, history, payments, client, agent, block, totalPaid, balance };
  }
}