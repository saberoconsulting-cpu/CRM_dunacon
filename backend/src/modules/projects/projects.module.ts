// modules/projects/projects.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from '../../shared/infrastructure/entities/project.entity';
import { LotEntity } from '../../shared/infrastructure/entities/lot.entity';
import { BlockEntity } from '../../shared/infrastructure/entities/block.entity';
import { PlanEntity } from '../../shared/infrastructure/entities/plan.entity';
import { AuditLogEntity } from '../../shared/infrastructure/entities/audit-log.entity';
import { ProjectDocumentEntity } from '../../shared/infrastructure/entities/project-document.entity';
import { ProjectsController } from './interface/projects.controller';
import { ProjectsService } from './application/projects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, LotEntity, BlockEntity, PlanEntity, AuditLogEntity, ProjectDocumentEntity]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}