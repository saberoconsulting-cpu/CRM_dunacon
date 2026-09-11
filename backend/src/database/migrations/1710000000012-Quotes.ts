// database/migrations/1710000000012-Quotes.ts
// Tabla "quotes" para el módulo Cotizaciones Lotes: calculadora de
// financiamiento en US$ que genera Cotización + Financiamiento imprimibles.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Quotes1710000000012 implements MigrationInterface {
  name = 'Quotes1710000000012';
  async up(q: QueryRunner): Promise<void> {
    const has = await q.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='quotes'`,
    );
    if (has && has.length > 0) return;
    await q.query(`
      CREATE TABLE "quotes" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "lot_id" BIGINT NOT NULL REFERENCES "lots"("id") ON DELETE CASCADE,
        "client_name" varchar(200) NOT NULL,
        "client_email" varchar(255),
        "client_phone" varchar(50),
        "price_per_m2_usd" numeric(12,2) NOT NULL DEFAULT 0,
        "lot_price_usd" numeric(14,2) NOT NULL DEFAULT 0,
        "bono_descuento_usd" numeric(14,2) NOT NULL DEFAULT 0,
        "bono_especial_usd" numeric(14,2) NOT NULL DEFAULT 0,
        "final_price_usd" numeric(14,2) NOT NULL DEFAULT 0,
        "payment_method" varchar(20) NOT NULL DEFAULT 'contado'
          CHECK ("payment_method" IN ('contado','credito')),
        "cuota_inicial_usd" numeric(14,2) NOT NULL DEFAULT 0,
        "total_cuotas" int NOT NULL DEFAULT 0,
        "interest_type" varchar(20) NOT NULL DEFAULT 'sin_intereses',
        "tea" numeric(6,2) NOT NULL DEFAULT 0,
        "valor_cuota_usd" numeric(14,2) NOT NULL DEFAULT 0,
        "exchange_rate" numeric(8,4) NOT NULL DEFAULT 3.75,
        "created_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_quotes_project" ON "quotes"("project_id")`);
    await q.query(`CREATE INDEX "idx_quotes_lot" ON "quotes"("lot_id")`);
  }
  async down(): Promise<void> {
    return;
  }
}
