// database/migrations/1710000000007-Lotizacion.ts
// Campos para la vista "Lotización" pedida por el cliente: dirección de la
// manzana, y tipo/precio venta/precio final por lote (informativos, no
// reemplazan el "price" de lista que ya usan ventas/finanzas).
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Lotizacion1710000000007 implements MigrationInterface {
  name = 'Lotizacion1710000000007';
  private async has(q: QueryRunner, table: string, col: string) {
    const r = await q.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [table, col],
    );
    return !!(r && r.length > 0);
  }
  async up(q: QueryRunner): Promise<void> {
    if (!(await this.has(q, 'blocks', 'address'))) await q.query(`ALTER TABLE "blocks" ADD COLUMN "address" varchar(255)`);
    if (!(await this.has(q, 'lots', 'type'))) await q.query(`ALTER TABLE "lots" ADD COLUMN "type" varchar(80)`);
    if (!(await this.has(q, 'lots', 'sale_price'))) await q.query(`ALTER TABLE "lots" ADD COLUMN "sale_price" numeric(14,2)`);
    if (!(await this.has(q, 'lots', 'final_price'))) await q.query(`ALTER TABLE "lots" ADD COLUMN "final_price" numeric(14,2)`);
    if (!(await this.has(q, 'lots', 'plan_voucher_url'))) await q.query(`ALTER TABLE "lots" ADD COLUMN "plan_voucher_url" varchar(500)`);
  }
  async down(): Promise<void> {
    return;
  }
}
