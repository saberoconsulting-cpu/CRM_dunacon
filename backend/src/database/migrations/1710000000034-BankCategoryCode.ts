import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankCategoryCode1710000000034 implements MigrationInterface {
  name = 'BankCategoryCode1710000000034';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='bank_category_mappings'
        AND column_name='code'
    `);
    if (!exists || exists.length === 0) {
      await q.query(`ALTER TABLE "bank_category_mappings" ADD COLUMN "code" varchar(12)`);
    }
    await q.query(`
      UPDATE "bank_category_mappings"
      SET "code" = upper(left(regexp_replace("movement_type", '[^[:alnum:]]+', '', 'g'), 2))
      WHERE "code" IS NULL OR trim("code") = ''
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "bank_category_mappings" DROP COLUMN IF EXISTS "code"`);
  }
}
