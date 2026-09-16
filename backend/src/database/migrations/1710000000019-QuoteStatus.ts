import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteStatus1710000000019 implements MigrationInterface {
  name = 'QuoteStatus1710000000019';

  async up(q: QueryRunner): Promise<void> {
    const rows = await q.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotes'
        AND column_name = 'status'
    `);
    if (!rows || rows.length === 0) {
      await q.query(`ALTER TABLE "quotes" ADD COLUMN "status" varchar(20) NOT NULL DEFAULT 'enviada'`);
    }

    await q.query(`
      UPDATE "quotes"
      SET "status" = 'enviada'
      WHERE "status" IS NULL OR "status" = ''
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "status"`);
  }
}
