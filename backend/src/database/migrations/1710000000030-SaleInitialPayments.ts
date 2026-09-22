import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleInitialPayments1710000000030 implements MigrationInterface {
  name = 'SaleInitialPayments1710000000030';

  private async has(q: QueryRunner, table: string, col: string) {
    const r = await q.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [table, col],
    );
    return !!(r && r.length > 0);
  }

  async up(q: QueryRunner): Promise<void> {
    if (!(await this.has(q, 'sales', 'cuota_inicial'))) {
      await q.query(`ALTER TABLE "sales" ADD COLUMN "cuota_inicial" numeric(14,2) NOT NULL DEFAULT 0`);
    }
    if (!(await this.has(q, 'sales', 'reserva_amount'))) {
      await q.query(`ALTER TABLE "sales" ADD COLUMN "reserva_amount" numeric(14,2) NOT NULL DEFAULT 0`);
    }
    await q.query(`
      UPDATE "sales"
      SET "cuota_inicial" = GREATEST(0, "sale_price" - COALESCE("valor_cuota", 0) * COALESCE("total_cuotas", 0))
      WHERE "cuota_inicial" = 0
        AND COALESCE("total_cuotas", 0) > 0
        AND COALESCE("valor_cuota", 0) > 0
    `);
  }

  async down(): Promise<void> {
    return;
  }
}
