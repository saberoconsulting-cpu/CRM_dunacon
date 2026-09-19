import { MigrationInterface, QueryRunner } from 'typeorm';

// Modelo de flujo de caja por proyecto y por modo (estatico | dinamico).
// Un unico registro por (project_id, mode) para mantener ambos flujos vivos.
export class CashflowModels1710000000029 implements MigrationInterface {
  name = 'CashflowModels1710000000029';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "cashflow_models" (
        "id" serial PRIMARY KEY,
        "project_id" integer NOT NULL,
        "mode" varchar(12) NOT NULL DEFAULT 'estatico',
        "assumptions" jsonb,
        "rows" jsonb NOT NULL DEFAULT '[]',
        "created_by" integer,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_cashflow_models_project_mode"
      ON "cashflow_models" ("project_id", "mode")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "cashflow_models"`);
  }
}
