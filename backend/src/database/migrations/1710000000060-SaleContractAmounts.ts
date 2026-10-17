import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleContractAmounts1710000000060 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE sales ADD COLUMN bono_total_usd numeric(14,2), ADD COLUMN lot_price_usd numeric(14,2)');
    await runner.query('UPDATE sales s SET bono_total_usd = q.bono_total_usd, lot_price_usd = q.lot_price_usd FROM quotes q WHERE q.id = s.quote_id');
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE sales DROP COLUMN bono_total_usd, DROP COLUMN lot_price_usd');
  }
}
