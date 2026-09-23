// shared/infrastructure/entities/campaign.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('campaigns')
export class CampaignEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 30, default: 'otro' })
  channel: string;

  @Column({ name: 'project_id', nullable: true })
  projectId: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  budget: string;

  @Column({ name: 'real_expense', type: 'numeric', precision: 14, scale: 2, default: 0 })
  realExpense: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
