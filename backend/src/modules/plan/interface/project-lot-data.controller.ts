import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProjectLotDataService } from '../application/project-lot-data.service';
import { ProjectLotDataDto } from '../application/dto/project-lot-data.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plan/lot-data')
export class ProjectLotDataController {
  constructor(private readonly service: ProjectLotDataService) {}
  @Get(':projectId')
  list(@Param('projectId', ParseIntPipe) projectId: number) { return this.service.list(projectId); }

  @Post(':projectId')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  save(@Param('projectId', ParseIntPipe) projectId: number, @Body() dto: ProjectLotDataDto, @CurrentUser('id') actor: number) { return this.service.save(projectId, dto, actor); }

  @Post('update/:projectId/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  update(@Param('projectId', ParseIntPipe) projectId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: ProjectLotDataDto, @CurrentUser('id') actor: number) { return this.service.save(projectId, dto, actor, id); }

  @Post('delete/:projectId/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  remove(@Param('projectId', ParseIntPipe) projectId: number, @Param('id', ParseIntPipe) id: number, @CurrentUser('id') actor: number) { return this.service.remove(projectId, id, actor); }

  @Post('import/:projectId')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  importExcel(@Param('projectId', ParseIntPipe) projectId: number, @UploadedFile() file: Express.Multer.File, @CurrentUser('id') actor: number) {
    if (!file?.buffer) throw new BadRequestException('Selecciona un archivo Excel.');
    return this.service.importExcel(projectId, file.buffer, actor);
  }
}
