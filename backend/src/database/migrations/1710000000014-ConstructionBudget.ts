import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConstructionBudget1710000000014 implements MigrationInterface {
  name = 'ConstructionBudget1710000000014';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'expenses'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%expense_class%'
        LOOP
          EXECUTE format('ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'expenses'
            AND c.conname = 'expenses_expense_class_budget_check'
        ) THEN
          ALTER TABLE "expenses"
          ADD CONSTRAINT "expenses_expense_class_budget_check"
          CHECK ("expense_class" IN (
            'inversion',
            'financiamiento',
            'compra_terreno',
            'operacion',
            'costo_indirecto',
            'ventas_admin',
            'impuestos'
          ));
        END IF;
      END $$;
    `);

    const exists = await q.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name='construction_budget_items'
    `);
    if (exists && exists.length > 0) return;

    await q.query(`
      CREATE TABLE "construction_budget_items" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "parent_id" BIGINT REFERENCES "construction_budget_items"("id") ON DELETE CASCADE,
        "category" varchar(40) NOT NULL CHECK ("category" IN (
          'costo_terreno',
          'costo_directo',
          'costo_indirecto',
          'gastos_ventas_admin',
          'gastos_financieros_impuestos'
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
    await q.query(`CREATE INDEX "idx_construction_budget_project" ON "construction_budget_items" ("project_id")`);
    await q.query(`CREATE INDEX "idx_construction_budget_parent" ON "construction_budget_items" ("parent_id")`);
    await q.query(`CREATE INDEX "idx_construction_budget_category" ON "construction_budget_items" ("project_id","category")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "construction_budget_items"`);
  }
}
