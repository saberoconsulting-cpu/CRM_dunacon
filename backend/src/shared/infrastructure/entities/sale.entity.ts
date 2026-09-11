// shared/infrastructure/entities/sale.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sales')
export class SaleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'lot_id' })
  lotId: number;

  @Column({ name: 'client_id', nullable: true })
  clientId: number;

  @Column({ name: 'agent_id', nullable: true })
  agentId: number;

  @Column({ name: 'sale_price', type: 'numeric', precision: 14, scale: 2 })
  salePrice: string;

  @Column({ name: 'sale_date', type: 'date', default: () => 'CURRENT_DATE' })
  saleDate: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  commission: string;

  // Neto que se financia al cliente (cuando se aplica comisión inmobiliaria)
  @Column({ name: 'financing_base', type: 'numeric', precision: 14, scale: 2, default: 0 })
  financingBase: string;

  @Column({ type: 'text', nullable: true })
  conditions: string;

  @Column({ length: 20, default: 'cerrada' })
  status: string;

  // --- Ampliado (migración 1710000000002) ---
  @Column({ name: 'approval_status', length: 20, default: 'pendiente' })
  approvalStatus: string;

  @Column({ name: 'total_cuotas', type: 'int', default: 0 })
  totalCuotas: number;

  @Column({ name: 'valor_cuota', type: 'numeric', precision: 14, scale: 2, default: 0 })
  valorCuota: string;

  @Column({ name: 'plan_status', length: 20, default: 'pendiente' })
  planStatus: string;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: number;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date;

  // --- Ampliado (migración 1710000000011) ---
  @Column({ name: 'interest_type', length: 20, default: 'sin_intereses' })
  interestType: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  tea: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}