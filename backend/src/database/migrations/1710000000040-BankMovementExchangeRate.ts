import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankMovementExchangeRate1710000000040 implements MigrationInterface {
  name = 'BankMovementExchangeRate1710000000040';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='bank_account_movements'
        AND column_name='exchange_rate'
    `);
    if (exists && exists.length > 0) return;
    await q.query(`ALTER TABLE "bank_account_movements" ADD "exchange_rate" numeric(10,4)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "bank_account_movements" DROP COLUMN IF EXISTS "exchange_rate"`);
  }
}
