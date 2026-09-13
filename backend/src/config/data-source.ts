// config/data-source.ts
// DataSource de TypeORM usado por la CLI de migraciones
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { UserEntity } from '../shared/infrastructure/entities/user.entity';
import { ProjectEntity } from '../shared/infrastructure/entities/project.entity';
import { UserProjectEntity } from '../shared/infrastructure/entities/user-project.entity';
import { PlanEntity } from '../shared/infrastructure/entities/plan.entity';
import { BlockEntity } from '../shared/infrastructure/entities/block.entity';
import { LotEntity } from '../shared/infrastructure/entities/lot.entity';
import { LotStatusHistoryEntity } from '../shared/infrastructure/entities/lot-status-history.entity';
import { ClientEntity } from '../shared/infrastructure/entities/client.entity';
import { ClientContactEntity } from '../shared/infrastructure/entities/client-contact.entity';
import { CampaignEntity } from '../shared/infrastructure/entities/campaign.entity';
import { SaleEntity } from '../shared/infrastructure/entities/sale.entity';
import { PaymentEntity } from '../shared/infrastructure/entities/payment.entity';
import { FinancialTransactionEntity } from '../shared/infrastructure/entities/financial-transaction.entity';
import { ExpenseEntity } from '../shared/infrastructure/entities/expense.entity';
import { AuditLogEntity } from '../shared/infrastructure/entities/audit-log.entity';
import { SaleInstallmentEntity } from '../shared/infrastructure/entities/sale-installment.entity';
import { ProjectDocumentEntity } from '../shared/infrastructure/entities/project-document.entity';
import { QuoteEntity } from '../shared/infrastructure/entities/quote.entity';
import { ConstructionBudgetItemEntity } from '../shared/infrastructure/entities/construction-budget-item.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'crm_inmobiliario',
  entities: [
    UserEntity,
    ProjectEntity,
    UserProjectEntity,
    PlanEntity,
    BlockEntity,
    LotEntity,
    LotStatusHistoryEntity,
    ClientEntity,
    ClientContactEntity,
    CampaignEntity,
    SaleEntity,
    PaymentEntity,
    FinancialTransactionEntity,
    ExpenseEntity,
    AuditLogEntity,
    SaleInstallmentEntity,
    ProjectDocumentEntity,
    QuoteEntity,
    ConstructionBudgetItemEntity,
  ],
  migrations:
    process.env.NODE_ENV === 'production'
      ? ['dist/database/migrations/*.js']
      : ['src/database/migrations/*.ts'],
  ...(process.env.DB_SSL === 'true'
    ? {
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : {}),
  synchronize: false,
});
