// shared/infrastructure/entities/bank-account-movement.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('bank_account_movements')
@Index('idx_bank_movements_project', ['projectId'])
@Index('idx_bank_movements_date', ['projectId', 'movementDate'])
@Index('idx_bank_movements_batch', ['importBatch'])
@Index('idx_bank_movements_currency', ['projectId', 'currency'])
export class BankAccountMovementEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'account_key', type: 'varchar', length: 120, default: 'GENERAL' })
  accountKey: string;

  @Column({ name: 'item_number', type: 'int', nullable: true })
  itemNumber: number | null;

  @Column({ name: 'movement_date', type: 'date', nullable: true })
  movementDate: string | null;

  @Column({ name: 'month_label', type: 'varchar', length: 40, nullable: true })
  monthLabel: string | null;

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ name: 'counterparty', type: 'varchar', length: 255, nullable: true })
  counterparty: string | null;

  @Column({ name: 'deposit_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  depositAmount: string;

  @Column({ name: 'charge_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  chargeAmount: string;

  @Column({ name: 'book_balance', type: 'numeric', precision: 14, scale: 2, nullable: true })
  bookBalance: string | null;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 14, scale: 2, nullable: true })
  openingBalance: string | null;

  @Column({ name: 'movement_type', type: 'varchar', length: 40, nullable: true })
  movementType: string | null;

  @Column({ name: 'eerr_classification', type: 'varchar', length: 120, nullable: true })
  eerrClassification: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', length: 120, nullable: true })
  invoiceNumber: string | null;

  @Column({ name: 'observation', type: 'varchar', length: 500, nullable: true })
  observation: string | null;

  @Column({ type: 'varchar', length: 3, default: 'PEN' })
  currency: string;

  @Column({ type: 'varchar', length: 10, default: 'excel' })
  source: string;

  @Column({ name: 'import_batch', type: 'varchar', length: 80, nullable: true })
  importBatch: string | null;

  @Column({ name: 'source_file', type: 'varchar', length: 255, nullable: true })
  sourceFile: string | null;

  // Huella del movimiento para no duplicar al reimportar el mismo Excel.
  @Column({ name: 'source_key', type: 'varchar', length: 64, nullable: true })
  sourceKey: string | null;

  @Column({ name: 'source_row', type: 'int', nullable: true })
  sourceRow: number | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
