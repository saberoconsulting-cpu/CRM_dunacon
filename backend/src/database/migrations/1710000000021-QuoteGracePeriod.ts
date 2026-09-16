import { MigrationInterface, QueryRunner } from 'typeorm';

// Meses sin interes de las cuotas, negociados por el vendedor o admin.
export class QuoteGracePeriod1710000000021 implements MigrationInterface {
  name = 'QuoteGracePeriod1710000000021';

  async up(q: QueryRunner): Promise<void> {
    const rows = await q.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotes'
        AND column_name = 'grace_months'
    `);
    const existing = new Set((rows || []).map((r: any) => r.column_name));

    if (!existing.has('grace_months')) {
      await q.query(`ALTER TABLE "quotes" ADD COLUMN "grace_months" integer NOT NULL DEFAULT 0`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "grace_months"`);
  }
}
