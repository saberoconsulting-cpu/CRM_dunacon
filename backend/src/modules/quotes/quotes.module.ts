// modules/quotes/quotes.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteEntity } from '../../shared/infrastructure/entities/quote.entity';
import { LotEntity } from '../../shared/infrastructure/entities/lot.entity';
import { BlockEntity } from '../../shared/infrastructure/entities/block.entity';
import { ProjectEntity } from '../../shared/infrastructure/entities/project.entity';
import { QuotesController } from './interface/quotes.controller';
import { QuotesService } from './application/quotes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuoteEntity, LotEntity, BlockEntity, ProjectEntity]),
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
