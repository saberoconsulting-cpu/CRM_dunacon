import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectLotCatalog1710000000035 implements MigrationInterface {
  name = 'ProjectLotCatalog1710000000035';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "project_lot_catalog" (
        "id" SERIAL PRIMARY KEY,
        "project_id" integer NOT NULL,
        "code" varchar(50) NOT NULL,
        "address" varchar(255),
        "type" varchar(80),
        "area_m2" numeric(12,2) NOT NULL DEFAULT 0,
        "dimensions" varchar(80),
        "price_m2" numeric(14,2) NOT NULL DEFAULT 0,
        "sale_price" numeric(14,2) NOT NULL DEFAULT 0,
        "discount" numeric(14,2) NOT NULL DEFAULT 0,
        "final_price" numeric(14,2) NOT NULL DEFAULT 0,
        "status" varchar(50) NOT NULL DEFAULT 'Disponible',
        "client" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_project_lot_catalog_project_code" UNIQUE ("project_id", "code"),
        CONSTRAINT "fk_project_lot_catalog_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "project_lot_catalog"`);
  }
}
