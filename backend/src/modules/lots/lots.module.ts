// modules/lots/lots.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotEntity } from '../../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../../shared/infrastructure/entities/lot-status-history.entity';
import { PaymentEntity } from '../../shared/infrastructure/entities/payment.entity';
import { ClientEntity } from '../../shared/infrastructure/entities/client.entity';
import { UserEntity } from '../../shared/infrastructure/entities/user.entity';
import { BlockEntity } from '../../shared/infrastructure/entities/block.entity';
import { PlanEntity } from '../../shared/infrastructure/entities/plan.entity';
import { LotsController } from './interface/lots.controller';
import { LotsService } from './application/lots.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LotEntity,
      LotStatusHistoryEntity,
      PaymentEntity,
      ClientEntity,
      UserEntity,
      BlockEntity,
      PlanEntity,
    ]),
  ],
  controllers: [LotsController],
  providers: [LotsService],
  exports: [LotsService],
})
export class LotsModule {}
