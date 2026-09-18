import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankAccounts1710000000027 implements MigrationInterface {
  name = 'BankAccounts1710000000027';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bank_accounts'`);
    if (exists && exists.length > 0) return;
    await q.query(`
      CREATE TABLE "bank_accounts" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "account_key" varchar(120) NOT NULL,
        "name" varchar(120) NOT NULL,
        "bank" varchar(30),
        "account_number" varchar(80),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_bank_accounts_project_key" UNIQUE ("project_id", "account_key")
      )
    `);
    await q.query(`
      INSERT INTO "bank_accounts" ("project_id", "account_key", "name", "bank")
      SELECT DISTINCT "project_id", 'GENERAL', 'Cuenta principal', 'BCP'
      FROM "bank_account_movements"
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS "bank_accounts"');
  }
}