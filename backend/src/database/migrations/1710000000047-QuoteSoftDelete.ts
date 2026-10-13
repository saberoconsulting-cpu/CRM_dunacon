import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteSoftDelete1710000000047 implements MigrationInterface {
  name = 'QuoteSoftDelete1710000000047';

  async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('quotes', 'deleted_at'))) {
      await q.query(`ALTER TABLE "quotes" ADD COLUMN "deleted_at" timestamptz`);
    }
    if (!(await q.hasColumn('quotes', 'deleted_by'))) {
      await q.query(`ALTER TABLE "quotes" ADD COLUMN "deleted_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL`);
    }
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_quotes_deleted_at" ON "quotes"("deleted_at")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_quotes_deleted_at"`);
    if (await q.hasColumn('quotes', 'deleted_by')) {
      await q.query(`ALTER TABLE "quotes" DROP COLUMN "deleted_by"`);
    }
    if (await q.hasColumn('quotes', 'deleted_at')) {
      await q.query(`ALTER TABLE "quotes" DROP COLUMN "deleted_at"`);
    }
  }
}
