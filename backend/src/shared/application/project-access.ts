import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserProjectEntity } from '../infrastructure/entities/user-project.entity';

// Keep the existing project-list policy: managers see all projects; agents
// must be assigned. Never use the browser's project header as authorization.
export async function assertProjectAccess(
  memberships: Pick<Repository<UserProjectEntity>, 'exist'>,
  projectId: number,
  user: { id: number; role: string },
): Promise<void> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new BadRequestException('Proyecto inválido.');
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new ForbiddenException('Sin acceso al proyecto.');
  if (user.role === 'superadmin' || user.role === 'admin') return;
  if (user.role !== 'agent' || !await memberships.exist({ where: { projectId, userId: user.id } })) {
    throw new ForbiddenException('No tienes acceso a este proyecto');
  }
}
