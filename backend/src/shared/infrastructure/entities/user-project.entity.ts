// shared/infrastructure/entities/user-project.entity.ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_projects')
export class UserProjectEntity {
  @PrimaryColumn({ name: 'user_id' })
  userId: number;

  @PrimaryColumn({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'allowed_modules', type: 'jsonb', nullable: true })
  allowedModules: string[] | null;
}
