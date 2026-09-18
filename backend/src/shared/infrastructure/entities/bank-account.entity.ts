import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bank_accounts')
@Index('uq_bank_accounts_project_key', ['projectId', 'accountKey'], { unique: true })
export class BankAccountEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'account_key', type: 'varchar', length: 120 })
  accountKey: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  bank: string | null;

  @Column({ name: 'account_number', type: 'varchar', length: 80, nullable: true })
  accountNumber: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
