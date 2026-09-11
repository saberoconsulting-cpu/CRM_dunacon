// database/migrations/1710000000011-SaleInterest.ts
// El tipo de interés (sin_intereses/tea) y la TEA se guardaban solo como texto
// libre dentro de "conditions" — no se podían leer de vuelta de forma confiable
// para mostrarlos en la tabla de ventas (ej. "Cuotas Sin Intereses"). Se guardan
// como columnas propias.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleInterest1710000000011 implements MigrationInterface {
  name = 'SaleInterest1710000000011';
  private async has(q: QueryRunner, table: string, col: string) {
    const r = await q.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [table, col],
    );
    return !!(r && r.length > 0);
  }
  async up(q: QueryRunner): Promise<void> {
    if (!(await this.has(q, 'sales', 'interest_type'))) {
      await q.query(`ALTER TABLE "sales" ADD COLUMN "interest_type" varchar(20) NOT NULL DEFAULT 'sin_intereses'`);
    }
    if (!(await this.has(q, 'sales', 'tea'))) {
      await q.query(`ALTER TABLE "sales" ADD COLUMN "tea" numeric(6,2) NOT NULL DEFAULT 0`);
    }
  }
  async down(): Promise<void> {
    return;
  }
}
