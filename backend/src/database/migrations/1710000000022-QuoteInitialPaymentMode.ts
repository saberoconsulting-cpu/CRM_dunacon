import { MigrationInterface, QueryRunner } from 'typeorm';

// La cuota inicial (siempre sin interes) puede pagarse de contado o en partes.
// initial_payment_mode: 'contado' | 'partes'
// initial_parts: cuantas partes iguales (1 cuando es de contado)
export class QuoteInitialPaymentMode1710000000022 implements MigrationInterface {
  name = 'QuoteInitialPaymentMode1710000000022';

  async up(q: QueryRunner): Promise<void> {
    const rows = await q.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotes'
        AND column_name IN ('initial_payment_mode', 'initial_parts')
    `);
    const existing = new Set((rows || []).map((r: any) => r.column_name));

    if (!existing.has('initial_payment_mode')) {
      await q.query(`ALTER TABLE "quotes" ADD COLUMN "initial_payment_mode" varchar(20) NOT NULL DEFAULT 'contado'`);
    }
    if (!existing.has('initial_parts')) {
      await q.query(`ALTER TABLE "quotes" ADD COLUMN "initial_parts" integer NOT NULL DEFAULT 1`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "initial_payment_mode"`);
    await q.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "initial_parts"`);
  }
}
