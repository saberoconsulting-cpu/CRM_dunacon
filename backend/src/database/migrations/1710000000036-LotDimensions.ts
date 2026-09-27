import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotDimensions1710000000036 implements MigrationInterface {
  name = 'LotDimensions1710000000036';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lots' AND column_name='dimensions'`,
    );
    if (!exists?.length) {
      await q.query(`ALTER TABLE "lots" ADD COLUMN "dimensions" varchar(80)`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    const exists = await q.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lots' AND column_name='dimensions'`,
    );
    if (exists?.length) {
      await q.query(`ALTER TABLE "lots" DROP COLUMN "dimensions"`);
    }
  }
}
