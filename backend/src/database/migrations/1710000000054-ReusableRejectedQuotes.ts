import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReusableRejectedQuotes1710000000054 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE sales ADD COLUMN quote_id integer');
    await queryRunner.query('ALTER TABLE quotes ADD COLUMN reusable_until timestamptz');
    await queryRunner.query(`UPDATE sales s SET quote_id = q.id FROM quotes q
      WHERE q.id::text = substring(s.conditions FROM '(?i)Cotizacion Q([0-9]+)')
      AND q.lot_id = s.lot_id AND q.project_id = s.project_id`);
    await queryRunner.query(`UPDATE quotes q SET status = 'enviada', reusable_until = NOW() + INTERVAL '7 days'
      WHERE q.deleted_at IS NULL AND q.status = 'convertida'
      AND EXISTS (SELECT 1 FROM sales s WHERE s.quote_id = q.id AND s.approval_status = 'rechazada')
      AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.quote_id = q.id AND s.approval_status <> 'rechazada')`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE quotes DROP COLUMN reusable_until');
    await queryRunner.query('ALTER TABLE sales DROP COLUMN quote_id');
  }
}
