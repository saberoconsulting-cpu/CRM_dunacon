import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncomeStatementItems1710000000037 implements MigrationInterface {
  name = 'IncomeStatementItems1710000000037';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='income_statement_items'`,
    );
    if (exists?.length) return;

    await q.query(`
      CREATE TABLE "income_statement_items" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "parent_id" BIGINT REFERENCES "income_statement_items"("id") ON DELETE CASCADE,
        "line" varchar(40) NOT NULL CHECK ("line" IN (
          'ingreso',
          'costo',
          'ventas_admin',
          'financiero',
          'impuestos',
          'igv',
          'ajuste'
        )),
        "code" varchar(80) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "amount" numeric(14,2) NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'PEN',
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_income_statement_project" ON "income_statement_items" ("project_id")`);
    await q.query(`CREATE INDEX "idx_income_statement_parent" ON "income_statement_items" ("parent_id")`);
    await q.query(`CREATE INDEX "idx_income_statement_line" ON "income_statement_items" ("project_id","line")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "income_statement_items"`);
  }
}
