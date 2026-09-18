import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('bank_account_balances')
@Index('uq_bank_account_balance_scope', ['projectId', 'accountKey', 'currency'], { unique: true })
export class BankAccountBalanceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'account_key', type: 'varchar', length: 120, default: 'GENERAL' })
  accountKey: string;

  @Column({ type: 'varchar', length: 3, default: 'PEN' })
  currency: string;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 14, scale: 2, default: 0 })
  openingBalance: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
