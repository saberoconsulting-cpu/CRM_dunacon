import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankAccountCurrency1710000000041 implements MigrationInterface {
  name = 'BankAccountCurrency1710000000041';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "bank_accounts"
      ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'USD'
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "currency"`);
  }
}
