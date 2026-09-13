// modules/finances/finances.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialTransactionEntity } from '../../shared/infrastructure/entities/financial-transaction.entity';
import { ExpenseEntity } from '../../shared/infrastructure/entities/expense.entity';
import { AuditLogEntity } from '../../shared/infrastructure/entities/audit-log.entity';
import { WebsocketModule } from '../../shared/infrastructure/websocket/websocket.module';
import { ConstructionBudgetModule } from '../construction-budget/construction-budget.module';
import { FinancesController } from './interface/finances.controller';
import { FinancesService } from './application/finances.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FinancialTransactionEntity, ExpenseEntity, AuditLogEntity]),
    WebsocketModule,
    ConstructionBudgetModule,
  ],
  controllers: [FinancesController],
  providers: [FinancesService],
})
export class FinancesModule {}
