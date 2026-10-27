import { MigrationInterface, QueryRunner } from 'typeorm';
import { installmentDueDate } from '../../shared/domain/installment-dates';

export class QuoteScheduleDates1710000000069 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Keep the original dates so this repair can be reverted exactly.
    await q.query(`CREATE TABLE quote_schedule_dates_backup_69 AS
      SELECT i.id, i.sale_id, i.due_date
      FROM sale_installments i JOIN sales s ON s.id = i.sale_id
      JOIN quotes qt ON qt.id = s.quote_id
      WHERE s.first_installment_date IS NULL`);
    const sales = await q.query(`SELECT s.id, qt.created_at FROM sales s
      JOIN quotes qt ON qt.id = s.quote_id
      WHERE s.first_installment_date IS NULL`);
    for (const sale of sales) {
      const anchor = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(sale.created_at));
      const rows = await q.query('SELECT id, installment_no FROM sale_installments WHERE sale_id = $1', [sale.id]);
      for (const row of rows) {
        await q.query('UPDATE sale_installments SET due_date = $1 WHERE id = $2', [installmentDueDate(anchor, row.installment_no), row.id]);
      }
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE sale_installments i SET due_date = b.due_date
      FROM quote_schedule_dates_backup_69 b WHERE i.id = b.id`);
    await q.query('DROP TABLE quote_schedule_dates_backup_69');
  }
}
