// modules/plan/plan.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanEntity } from '../../shared/infrastructure/entities/plan.entity';
import { BlockEntity } from '../../shared/infrastructure/entities/block.entity';
import { LotEntity } from '../../shared/infrastructure/entities/lot.entity';
import { ProjectLotCatalogEntity } from '../../shared/infrastructure/entities/project-lot-catalog.entity';
import { SaleEntity } from '../../shared/infrastructure/entities/sale.entity';
import { ClientEntity } from '../../shared/infrastructure/entities/client.entity';
import { LotStatusHistoryEntity } from '../../shared/infrastructure/entities/lot-status-history.entity';
import { AuditLogEntity } from '../../shared/infrastructure/entities/audit-log.entity';
import { WebsocketModule } from '../../shared/infrastructure/websocket/websocket.module';
import { PlanController } from './interface/plan.controller';
import { PlanService } from './application/plan.service';
import { ProjectLotDataEntity } from '../../shared/infrastructure/entities/project-lot-data.entity';
import { ProjectEntity } from '../../shared/infrastructure/entities/project.entity';
import { ProjectLotDataController } from './interface/project-lot-data.controller';
import { ProjectLotDataService } from './application/project-lot-data.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanEntity,
      BlockEntity,
      LotEntity,
      ProjectLotCatalogEntity,
      SaleEntity,
      ClientEntity,
      LotStatusHistoryEntity,
      AuditLogEntity,
      ProjectLotDataEntity,
      ProjectEntity,
    ]),
    WebsocketModule,
  ],
  controllers: [PlanController, ProjectLotDataController],
  providers: [PlanService, ProjectLotDataService],
})
export class PlanModule {}
