// shared/infrastructure/entities/block.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// NOTA IMPORTANTE (esquema real vs. este repo):
// La base de datos compartida (Supabase) fue migrada por la migración
// "RenameBlocksToStreets1710000000020", que renombró la tabla "blocks" -> "streets"
// y la columna "lots.block_id" -> "lots.street_id". Esa migración NO existe en este
// repositorio, por lo que el mapeo se hace aquí vía @Entity('streets') para no tocar
// el esquema (ni la BD compartida) ni el contrato de la API (que sigue usando "block").
@Entity('streets')
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