import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankCategoryCashflowRow1710000000043 implements MigrationInterface {
  name = 'BankCategoryCashflowRow1710000000043';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "bank_category_mappings"
      ADD COLUMN IF NOT EXISTS "cashflow_row_id" varchar(120)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "bank_category_mappings"
      DROP COLUMN IF EXISTS "cashflow_row_id"
    `);
  }
}
