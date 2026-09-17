// database/migrations/1710000000025-BankAccountMovements.ts
// Estado de Cuenta Bancario (EC BCP) por proyecto. Tabla acumulativa: cada
// importacion de Excel agrega movimientos sin borrar los anteriores.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankAccountMovements1710000000025 implements MigrationInterface {
  name = 'BankAccountMovements1710000000025';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name='bank_account_movements'
    `);
    if (exists && exists.length > 0) return;

    await q.query(`
      CREATE TABLE "bank_account_movements" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "account_key" varchar(120) NOT NULL DEFAULT 'GENERAL',
        "item_number" int,
        "movement_date" date,
        "month_label" varchar(40),
        "description" varchar(500),
        "counterparty" varchar(255),
        "deposit_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "charge_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "book_balance" numeric(14,2),
        "opening_balance" numeric(14,2),
        "movement_type" varchar(40),
        "eerr_classification" varchar(120),
        "invoice_number" varchar(120),
        "observation" varchar(500),
        "currency" varchar(3) NOT NULL DEFAULT 'PEN',
        "source" varchar(10) NOT NULL DEFAULT 'excel',
        "import_batch" varchar(80),
        "source_file" varchar(255),
        "source_key" varchar(64),
        "source_row" int,
        "created_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_bank_movements_project" ON "bank_account_movements" ("project_id")`);
    await q.query(`CREATE INDEX "idx_bank_movements_date" ON "bank_account_movements" ("project_id","movement_date")`);
    await q.query(`CREATE INDEX "idx_bank_movements_batch" ON "bank_account_movements" ("import_batch")`);
    await q.query(`CREATE INDEX "idx_bank_movements_currency" ON "bank_account_movements" ("project_id","currency")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "bank_account_movements"`);
  }
}
