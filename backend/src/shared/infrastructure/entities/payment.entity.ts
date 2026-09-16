// shared/infrastructure/entities/payment.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payments')
export class PaymentEntity {
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

  @Column({ length: 30 })
  type: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'payment_method', length: 30, default: 'otro' })
  paymentMethod: string;

  @Column({ length: 100, nullable: true })
  reference: string;

  @Column({ name: 'voucher_url', length: 500, nullable: true })
  voucherUrl: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date;

  @Column({ length: 20, default: 'pendiente' })
  status: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  // Registro informativo en US$ (no reemplaza el monto en soles).
  @Column({ name: 'exchange_rate', type: 'numeric', precision: 10, scale: 4, nullable: true })
  exchangeRate: string | null;

  @Column({ name: 'amount_usd', type: 'numeric', precision: 14, scale: 2, nullable: true })
  amountUsd: string | null;

  // Datos bancarios requeridos para aprobar el pago.
  @Column({ name: 'bank_operation_number', type: 'varchar', length: 100, nullable: true })
  bankOperationNumber: string | null;

  @Column({ name: 'receipt_number', type: 'varchar', length: 100, nullable: true })
  receiptNumber: string | null;

  @Column({ name: 'receipt_value', type: 'numeric', precision: 14, scale: 2, nullable: true })
  receiptValue: string | null;

  @Column({ name: 'approval_document_url', type: 'varchar', length: 500, nullable: true })
  approvalDocumentUrl: string | null;

  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}