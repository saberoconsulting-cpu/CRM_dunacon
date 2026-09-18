import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankAccountNumber1710000000028 implements MigrationInterface {
  name = 'BankAccountNumber1710000000028';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "bank_accounts"
      ADD COLUMN IF NOT EXISTS "account_number" varchar(80)
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "account_number"`);
  }
}