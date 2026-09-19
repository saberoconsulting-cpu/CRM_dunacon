// modules/finances/finances.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialTransactionEntity } from '../../shared/infrastructure/entities/financial-transaction.entity';
import { ExpenseEntity } from '../../shared/infrastructure/entities/expense.entity';
import { CashflowModelEntity } from '../../shared/infrastructure/entities/cashflow-model.entity';
import { AuditLogEntity } from '../../shared/infrastructure/entities/audit-log.entity';
import { WebsocketModule } from '../../shared/infrastructure/websocket/websocket.module';
import { ConstructionBudgetModule } from '../construction-budget/construction-budget.module';
import { FinancesController } from './interface/finances.controller';
import { CashflowController } from './interface/cashflow.controller';
import { FinancesService } from './application/finances.service';
import { CashflowService } from './application/cashflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FinancialTransactionEntity, ExpenseEntity, AuditLogEntity, CashflowModelEntity]),
    WebsocketModule,
    ConstructionBudgetModule,
  ],
  controllers: [FinancesController, CashflowController],
  providers: [FinancesService, CashflowService],
})
export class FinancesModule {}
