// shared/infrastructure/entities/lot.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('lots')
export class LotEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'plan_id' })
  planId: number;

  // La BD compartida renombró "block_id" -> "street_id" (migración
  // "RenameBlocksToStreets1710000000020", no presente en este repo). Se conserva el
  // nombre de propiedad "blockId" para no romper la API ni el frontend.
  @Column({ name: 'street_id', type: 'bigint', nullable: true })
  blockId: number | null;

  @Column({ length: 50 })
  code: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  points: Array<{ x: number; y: number }>;

  @Column({ name: 'area_m2', type: 'numeric', precision: 12, scale: 2, default: 0 })
  areaM2: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  price: string;

  @Column({ length: 20, default: 'disponible' })
  status: string;

  @Column({ name: 'client_id', type: 'bigint', nullable: true })
  clientId!: number | null;

  @Column({ name: 'agent_id', type: 'bigint', nullable: true })
  agentId!: number | null;

  // --- Ampliado: etapa de venta comercial (no altera el CHECK de status) ---
  @Column({ name: 'selling_stage', length: 20, default: 'disponible' })
  sellingStage: string;

  // --- Ampliado: vista "Lotización" del cliente. Informativos, no alimentan
  // el flujo de ventas/comisiones (ese sigue usando "price"). ---
  @Column({ length: 80, nullable: true })
  type?: string;

  @Column({ name: 'sale_price', type: 'numeric', precision: 14, scale: 2, nullable: true })
  salePrice?: string;

  @Column({ name: 'final_price', type: 'numeric', precision: 14, scale: 2, nullable: true })
  finalPrice?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}