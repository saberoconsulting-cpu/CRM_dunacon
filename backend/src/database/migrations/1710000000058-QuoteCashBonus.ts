import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteCashBonus1710000000058 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE quotes ADD COLUMN bono_contado_usd numeric(14,2) NOT NULL DEFAULT 0');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE quotes DROP COLUMN bono_contado_usd');
  }
}
