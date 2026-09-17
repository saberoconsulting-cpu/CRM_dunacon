// database/migrations/1710000000026-BankCategoryMappings.ts
// Tabla maestra de conceptos: homologa el TIPO INGRESO/GASTO operativo con su
// CLASIFICACION EERR contable. Alimenta los desplegables del modulo bancario.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankCategoryMappings1710000000026 implements MigrationInterface {
  name = 'BankCategoryMappings1710000000026';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name='bank_category_mappings'
    `);
    if (exists && exists.length > 0) return;

    await q.query(`
      CREATE TABLE "bank_category_mappings" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "movement_type" varchar(150) NOT NULL,
        "eerr_classification" varchar(150) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_bank_categories_project" ON "bank_category_mappings" ("project_id")`);
    await q.query(`CREATE INDEX "idx_bank_categories_type" ON "bank_category_mappings" ("project_id","movement_type")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "bank_category_mappings"`);
  }
}
