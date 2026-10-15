import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinancialOperationNumber1710000000052 implements MigrationInterface {
  name = 'FinancialOperationNumber1710000000052';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE financial_transactions
      ADD COLUMN operation_number varchar(40) GENERATED ALWAYS AS (
        CASE
          WHEN payment_id IS NOT NULL THEN 'P' || payment_id::text
          WHEN type = 'ingreso' THEN 'I' || id::text
          ELSE 'E' || id::text
        END
      ) STORED
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE financial_transactions DROP COLUMN operation_number');
  }
}
