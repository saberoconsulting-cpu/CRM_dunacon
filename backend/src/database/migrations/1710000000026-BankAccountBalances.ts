import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankAccountBalances1710000000026 implements MigrationInterface {
  name = 'BankAccountBalances1710000000026';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name='bank_account_balances'
    `);
    if (exists && exists.length > 0) return;

    await q.query(`
      CREATE TABLE "bank_account_balances" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "account_key" varchar(120) NOT NULL DEFAULT 'GENERAL',
        "currency" varchar(3) NOT NULL DEFAULT 'PEN',
        "opening_balance" numeric(14,2) NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_bank_account_balance_scope" UNIQUE ("project_id", "account_key", "currency")
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS "bank_account_balances"');
  }
}