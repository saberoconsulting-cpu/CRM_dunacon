// shared/infrastructure/entities/block.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('blocks')
export class BlockEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'plan_id' })
  planId: number;

  @Column({ length: 50, default: 'A' })
  name: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  points: Array<{ x: number; y: number }>;

  @Column({ length: 20, default: '#64748b' })
  color: string;

  @Column({ length: 255, nullable: true })
  address?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}