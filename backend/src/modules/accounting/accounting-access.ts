import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../shared/domain/enums';

export async function assertAccountingAccess(db: DataSource, projectId: number, user: any) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new BadRequestException('Proyecto inválido.');
  const project = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!project.length) throw new BadRequestException('Proyecto inexistente.');
  if (user.role === UserRole.SUPERADMIN) return;
  const [membership] = await db.query('SELECT allowed_modules FROM user_projects WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
  if (!membership || (Array.isArray(membership.allowed_modules) && !membership.allowed_modules.includes('accounting'))) throw new ForbiddenException('Sin acceso a Contabilidad.');
}
