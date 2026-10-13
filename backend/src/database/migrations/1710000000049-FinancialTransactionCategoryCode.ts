import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinancialTransactionCategoryCode1710000000049 implements MigrationInterface {
  name = 'FinancialTransactionCategoryCode1710000000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "financial_transactions"
      ADD COLUMN IF NOT EXISTS "category_code" varchar(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "financial_transactions"
      DROP COLUMN IF EXISTS "category_code"
    `);
  }
}
