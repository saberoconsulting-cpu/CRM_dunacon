// shared/infrastructure/entities/cashflow-model.entity.ts
// Modelo de flujo de caja por proyecto. Un registro por modo:
//  - 'estatico' : el usuario llena todo manualmente (datos y supuestos propios).
//  - 'dinamico' : la data viene del sistema en vivo y solo se guardan los ajustes.
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cashflow_models')
export class CashflowModelEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 12, default: 'estatico' })
  mode: string;

  @Column({ type: 'jsonb', nullable: true })
  assumptions: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  rows: Array<{ id: string; label: string; values: number[] }>;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
