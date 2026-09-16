// modules/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '../../shared/infrastructure/entities/payment.entity';
import { LotEntity } from '../../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../../shared/infrastructure/entities/lot-status-history.entity';
import { FinancialTransactionEntity } from '../../shared/infrastructure/entities/financial-transaction.entity';
import { ClientEntity } from '../../shared/infrastructure/entities/client.entity';
import { UserEntity } from '../../shared/infrastructure/entities/user.entity';
import { SaleEntity } from '../../shared/infrastructure/entities/sale.entity';
import { SaleInstallmentEntity } from '../../shared/infrastructure/entities/sale-installment.entity';
import { WebsocketModule } from '../../shared/infrastructure/websocket/websocket.module';
import { PaymentsController } from './interface/payments.controller';
import { PaymentsService } from './application/payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      LotEntity,
      LotStatusHistoryEntity,
      FinancialTransactionEntity,
      ClientEntity,
      UserEntity,
      SaleEntity,
      SaleInstallmentEntity,
    ]),
    WebsocketModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
