import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionBudgetItemEntity } from '../../shared/infrastructure/entities/construction-budget-item.entity';
import { ConstructionBudgetService } from './application/construction-budget.service';
import { ConstructionBudgetController } from './interface/construction-budget.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConstructionBudgetItemEntity])],
  controllers: [ConstructionBudgetController],
  providers: [ConstructionBudgetService],
  exports: [ConstructionBudgetService],
})
export class ConstructionBudgetModule {}
