import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LotEntity } from '../../infrastructure/entities/lot.entity';
import { PaymentEntity } from '../../infrastructure/entities/payment.entity';
import { SaleEntity } from '../../infrastructure/entities/sale.entity';
import { assertScopedProject, projectScope } from '../project-scope';

@Injectable()
export class ProjectResourceGuard implements CanActivate {
  constructor(private readonly db: DataSource) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const path = req.path.replace(/^\/api/, '').replace(/\/$/, '');
    const isPayment = path.startsWith('/payments');
    const modules = isPayment ? (path === '/payments/caja' ? ['payments', 'finances', 'dashboard'] : ['payments'])
      : ['lots', 'plan', 'sales', 'quotes', 'payments']; // Shared lot lookup used by these forms.
    const scope = await projectScope(this.db, req.user, modules);
    req.projectScope = scope;
    for (const value of [req.query?.projectId, req.body?.projectId, req.headers['x-project-id']]) {
      if (value !== undefined) assertScopedProject(scope, value);
    }
    const positiveId = (value: unknown) => {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Identificador invalido.');
      return id;
    };
    if (req.params?.id !== undefined) {
      const id = positiveId(req.params.id);
      const row = isPayment ? await this.db.getRepository(PaymentEntity).findOneBy({ id })
        : await this.db.getRepository(LotEntity).findOneBy({ id });
      if (!row) throw new NotFoundException('Registro no encontrado.');
      assertScopedProject(scope, row.projectId);
      if (req.user.role === 'agent' && isPayment && req.method !== 'GET'
        && Number(row.agentId ?? (row as PaymentEntity).createdBy) !== req.user.id) {
        throw new ForbiddenException('No puedes modificar un pago de otro asesor.');
      }
    }
    const lotId = req.body?.lotId ?? req.query?.lotId;
    if (isPayment && lotId !== undefined) {
      const lot = await this.db.getRepository(LotEntity).findOneBy({ id: positiveId(lotId) });
      if (!lot) throw new NotFoundException('Lote no encontrado.');
      assertScopedProject(scope, lot.projectId);
      if (req.body?.projectId !== undefined && Number(req.body.projectId) !== Number(lot.projectId)) {
        throw new BadRequestException('El lote no pertenece al proyecto indicado.');
      }
      if (req.user.role === 'agent' && req.method !== 'GET') {
        const sale = await this.db.getRepository(SaleEntity).findOne({ where: { lotId: lot.id }, order: { id: 'DESC' } });
        const owner = sale?.agentId ?? lot.agentId;
        if ((owner != null && Number(owner) !== req.user.id)
          || (req.body.agentId != null && Number(req.body.agentId) !== req.user.id)) {
          throw new ForbiddenException('No puedes registrar pagos para otro asesor.');
        }
      }
    }
    return true;
  }
}
