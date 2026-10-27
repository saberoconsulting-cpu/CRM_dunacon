import { ReorderProjectsDto } from '../application/dto/reorder-projects.dto';
// modules/projects/interface/projects.controller.ts
import {
  Body,
  Header,
  StreamableFile,
  Delete,
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
import { CurrentUser, AuthUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projectsService.list(user);
  }

  @Get('dashboard/:id')
  dashboard(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.projectsService.dashboard(id, user);
  }

  @Get('history')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  history() {
    return this.projectsService.history();
  }
  @Get(':id/contract-template/file')
  @Header('Cache-Control', 'no-store')
  async contractTemplateFile(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    const file = await this.projectsService.contractTemplateFile(id, user);
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}` });
  }

  @Get(':id/contract-template')
  contractTemplate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.projectsService.contractTemplate(id, user);
  }

  @Get(':id/documents')
  listDocuments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.projectsService.listDocuments(id, user);
  }

  @Get(':id/photos')
  listPhotos(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.projectsService.listPhotos(id, user);
  }

  @Post(':id/photos')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  addPhoto(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.projectsService.addPhoto(id, file, user);
  }

  @Delete(':id/photos/:photoId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  removePhoto(@Param('id', ParseIntPipe) id: number, @Param('photoId') photoId: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.removePhoto(id, photoId, user);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.projectsService.getOne(id, user);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  create(@Body() dto: CreateProjectDto, @CurrentUser('id') actorId: number) {
    return this.projectsService.create(dto, actorId);
  }

  @Post('reorder')
  @Roles(UserRole.SUPERADMIN)
  reorder(@Body() dto: ReorderProjectsDto, @CurrentUser('id') actorId: number) {
    return this.projectsService.reorder(dto.projectIds, actorId);
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

  @Post('restore/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') actorId: number,
  ) {
    return this.projectsService.restore(id, actorId);
  }

  @Post('purge/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  purge(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') actorId: number,
  ) {
    return this.projectsService.purge(id, actorId);
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
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadDocument(
    @Param('id', ParseIntPipe) id: number,
    @Query('kind') kind: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.uploadDocument(id, kind || 'general', file, user);
  }
}
