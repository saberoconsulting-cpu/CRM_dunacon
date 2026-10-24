import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/application/guards/roles.guard';
import { Roles } from '../../shared/application/decorators/roles.decorator';
import { CurrentUser } from '../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../shared/domain/enums';
import { uploadToCloudinary } from '../../shared/infrastructure/upload/cloudinary.util';
import { assertAccountingAccess } from './accounting-access';

@Controller('accounting/attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
export class AccountingAttachmentsController {
  constructor(private readonly db: DataSource) {}
  private async record(type: string, id: string, projectId: string, user: any) {
    await assertAccountingAccess(this.db, Number(projectId), user);
    const table = type === 'cash' ? 'accounting_cash' : type === 'invoice' ? 'accounting_invoices' : null;
    if (!table) throw new BadRequestException('Registro inválido.');
    const [row] = await this.db.query(`SELECT data FROM ${table} WHERE id::text = $1 AND project_id = $2`, [id, Number(projectId)]);
    if (!row) throw new NotFoundException('Registro no encontrado.');
    return { table, row };
  }
  @Get(':type/:id')
  async list(@Param('type') type: string, @Param('id') id: string, @Query('projectId') projectId: string, @CurrentUser() user: any) {
    const { row } = await this.record(type, id, projectId, user);
    return row.data.attachments || [];
  }
  @Post(':type/:id')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@Param('type') type: string, @Param('id') id: string, @Query('projectId') projectId: string, @CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    const { table } = await this.record(type, id, projectId, user);
    if (!file || !/\.(pdf|png|jpe?g|webp|heic|docx?|xlsx?)$/i.test(file.originalname)) throw new BadRequestException('Selecciona una foto, PDF, Word o Excel (máximo 10 MB).');
    const uploaded = await uploadToCloudinary(file.buffer, 'documents');
    const attachment = { name: file.originalname, url: uploaded.secure_url, publicId: uploaded.public_id };
    const [rows] = await this.db.query(`UPDATE ${table} SET data = jsonb_set(data, '{attachments}', COALESCE(data->'attachments', '[]'::jsonb) || $1::jsonb) WHERE id::text = $2 AND project_id = $3 RETURNING id`, [JSON.stringify([attachment]), id, Number(projectId)]);
    if (!rows.length) throw new NotFoundException('Registro no encontrado.');
    return attachment;
  }
}
