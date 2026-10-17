// shared/infrastructure/entities/client.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clients')
export class ClientEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name', length: 200 })
  fullName: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  dni: string | null;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({ length: 50, default: 'web' })
  source: string;

  @Column({ name: 'campaign_id', nullable: true })
  campaignId: number;

  @Column({ name: 'project_interest_id', nullable: true })
  projectInterestId: number;

  @Column({ name: 'agent_id', nullable: true })
  agentId: number;

  @Column({ name: 'pipeline_status', length: 20, default: 'nuevo' })
  pipelineStatus: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
