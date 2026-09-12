// modules/projects/interface/projects.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProjectsService } from '../application/projects.service';
import { uploadToCloudinary } from '../../../shared/infrastructure/upload/cloudinary.util';
import { CreateProjectDto } from '../application/dto/create-project.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.list();
  }

  @Get('dashboard/:id')
  dashboard(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.dashboard(id);
  }

  @Get(':id/documents')
  listDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.listDocuments(id);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getOne(id);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  create(@Body() dto: CreateProjectDto, @CurrentUser('id') actorId: number) {
    return this.projectsService.create(dto, actorId);
  }

  @Post('update/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProjectDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.projectsService.update(id, dto, actorId);
  }

  @Post('delete/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') actorId: number,
  ) {
    return this.projectsService.deleteProject(id, actorId);
  }

  @Post('status/:id/:status')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status') status: 'active' | 'inactive',
    @CurrentUser('id') actorId: number,
  ) {
    return this.projectsService.setStatus(id, status, actorId);
  }

  @Post('cover/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadCover(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') actorId: number,
  ) {
    const up = await uploadToCloudinary(file.buffer, 'covers');
    return this.projectsService.updateCover(id, up.secure_url, actorId);
  }

  @Post('logo/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') actorId: number,
  ) {
    const up = await uploadToCloudinary(file.buffer, 'project-logos');
    return this.projectsService.updateLogo(id, up.secure_url, actorId);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadDocument(
    @Param('id', ParseIntPipe) id: number,
    @Query('kind') kind: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') actorId: number,
  ) {
    return this.projectsService.uploadDocument(id, kind || 'general', file, actorId);
  }
}
