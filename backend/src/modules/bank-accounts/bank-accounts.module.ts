import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccountMovementEntity } from '../../shared/infrastructure/entities/bank-account-movement.entity';
import { BankCategoryMappingEntity } from '../../shared/infrastructure/entities/bank-category-mapping.entity';
import { BankAccountsService } from './application/bank-accounts.service';
import { BankAccountsController } from './interface/bank-accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccountMovementEntity, BankCategoryMappingEntity])],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
