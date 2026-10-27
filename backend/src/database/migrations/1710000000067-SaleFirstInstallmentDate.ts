import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleFirstInstallmentDate1710000000067 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE sales ADD COLUMN first_installment_date date NULL');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE sales DROP COLUMN first_installment_date');
  }
}
