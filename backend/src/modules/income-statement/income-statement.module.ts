import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncomeStatementItemEntity } from '../../shared/infrastructure/entities/income-statement-item.entity';
import { IncomeStatementService } from './application/income-statement.service';
import { IncomeStatementController } from './interface/income-statement.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IncomeStatementItemEntity])],
  controllers: [IncomeStatementController],
  providers: [IncomeStatementService],
  exports: [IncomeStatementService],
})
export class IncomeStatementModule {}
