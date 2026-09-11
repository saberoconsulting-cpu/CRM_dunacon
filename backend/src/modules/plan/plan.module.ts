// modules/plan/plan.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanEntity } from '../../shared/infrastructure/entities/plan.entity';
import { BlockEntity } from '../../shared/infrastructure/entities/block.entity';
import { LotEntity } from '../../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../../shared/infrastructure/entities/lot-status-history.entity';
import { AuditLogEntity } from '../../shared/infrastructure/entities/audit-log.entity';
import { WebsocketModule } from '../../shared/infrastructure/websocket/websocket.module';
import { PlanController } from './interface/plan.controller';
import { PlanService } from './application/plan.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanEntity,
      BlockEntity,
      LotEntity,
      LotStatusHistoryEntity,
      AuditLogEntity,
    ]),
    WebsocketModule,
  ],
  controllers: [PlanController],
  providers: [PlanService],
})
export class PlanModule {}