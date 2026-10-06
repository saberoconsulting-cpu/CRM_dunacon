import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega la columna ESTADO a las partidas y subpartidas del Presupuesto de Obra.
 * Valores permitidos: sin_inicio, en_ejecucion, terminada.
 * Es idempotente para poder reejecutarse sin romper instalaciones existentes.
 */
export class BudgetItemStatus1710000000042 implements MigrationInterface {
  name = 'BudgetItemStatus1710000000042';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='construction_budget_items'
        AND column_name='status'
    `);
    if (exists && exists.length > 0) return;

    await q.query(`
      ALTER TABLE "construction_budget_items"
      ADD COLUMN "status" varchar(20) NOT NULL DEFAULT 'sin_inicio'
    `);

    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'construction_budget_items'
            AND c.conname = 'construction_budget_items_status_check'
        ) THEN
          ALTER TABLE "construction_budget_items"
          ADD CONSTRAINT "construction_budget_items_status_check"
          CHECK ("status" IN ('sin_inicio', 'en_ejecucion', 'terminada'));
        END IF;
      END $$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "construction_budget_items" DROP CONSTRAINT IF EXISTS "construction_budget_items_status_check"`);
    await q.query(`ALTER TABLE "construction_budget_items" DROP COLUMN IF EXISTS "status"`);
  }
}
