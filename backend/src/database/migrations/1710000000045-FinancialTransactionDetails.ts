import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinancialTransactionDetails1710000000045 implements MigrationInterface {
  name = 'FinancialTransactionDetails1710000000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "lot_label" varchar(80)`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "client_label" varchar(150)`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "payment_method" varchar(60)`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "payment_category" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "classification" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "agent_name" varchar(150)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "agent_name"`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "classification"`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "payment_category"`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "payment_method"`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "client_label"`);
    await queryRunner.query(`ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "lot_label"`);
  }
}
