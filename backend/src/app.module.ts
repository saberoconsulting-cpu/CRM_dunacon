// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { UserEntity } from './shared/infrastructure/entities/user.entity';
import { ProjectEntity } from './shared/infrastructure/entities/project.entity';
import { PlanEntity } from './shared/infrastructure/entities/plan.entity';
import { BlockEntity } from './shared/infrastructure/entities/block.entity';
import { LotEntity } from './shared/infrastructure/entities/lot.entity';
import { UserProjectEntity } from './shared/infrastructure/entities/user-project.entity';
import { ClientEntity } from './shared/infrastructure/entities/client.entity';
import { ClientContactEntity } from './shared/infrastructure/entities/client-contact.entity';
import { CampaignEntity } from './shared/infrastructure/entities/campaign.entity';
import { SaleEntity } from './shared/infrastructure/entities/sale.entity';
import { PaymentEntity } from './shared/infrastructure/entities/payment.entity';
import { FinancialTransactionEntity } from './shared/infrastructure/entities/financial-transaction.entity';
import { ExpenseEntity } from './shared/infrastructure/entities/expense.entity';
import { LotStatusHistoryEntity } from './shared/infrastructure/entities/lot-status-history.entity';
import { AuditLogEntity } from './shared/infrastructure/entities/audit-log.entity';
import { SaleInstallmentEntity } from './shared/infrastructure/entities/sale-installment.entity';
import { AppSettingEntity } from './shared/infrastructure/entities/app-setting.entity';
import { ProjectDocumentEntity } from './shared/infrastructure/entities/project-document.entity';
import { QuoteEntity } from './shared/infrastructure/entities/quote.entity';
import { ConstructionBudgetItemEntity } from './shared/infrastructure/entities/construction-budget-item.entity';
import { BankAccountMovementEntity } from './shared/infrastructure/entities/bank-account-movement.entity';
import { BankAccountBalanceEntity } from './shared/infrastructure/entities/bank-account-balance.entity';
import { BankAccountEntity } from './shared/infrastructure/entities/bank-account.entity';
import { BankCategoryMappingEntity } from './shared/infrastructure/entities/bank-category-mapping.entity';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PlanModule } from './modules/plan/plan.module';
import { LotsModule } from './modules/lots/lots.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { SalesModule } from './modules/sales/sales.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { FinancesModule } from './modules/finances/finances.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { ConstructionBudgetModule } from './modules/construction-budget/construction-budget.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite general por IP (protege toda la API); endpoints sensibles como
    // login usan @Throttle() con un límite más estricto encima de este.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      errorMessage: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'crm_inmobiliario',
      ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
      extra: {
        max: Number(process.env.DB_POOL_MAX || 10),
      },
      entities: [
        UserEntity, ProjectEntity, PlanEntity, BlockEntity, LotEntity,
        UserProjectEntity, ClientEntity, ClientContactEntity, CampaignEntity,
        SaleEntity, PaymentEntity, FinancialTransactionEntity, ExpenseEntity,
        LotStatusHistoryEntity, AuditLogEntity,
        SaleInstallmentEntity,
        AppSettingEntity,
        ProjectDocumentEntity,
        QuoteEntity,
        ConstructionBudgetItemEntity,
        BankAccountMovementEntity,
        BankAccountBalanceEntity,
        BankAccountEntity,
        BankCategoryMappingEntity,
      ],
      synchronize: false,
      logging: false,
    }),
    AuthModule,
    UsersModule,
    ProjectsModule,
    PlanModule,
    LotsModule,
    ClientsModule,
    CampaignsModule,
    SalesModule,
    PaymentsModule,
    FinancesModule,
    SettingsModule,
    DashboardsModule,
    QuotesModule,
    ConstructionBudgetModule,
    BankAccountsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
