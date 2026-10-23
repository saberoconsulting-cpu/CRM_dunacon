import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountingInvoiceKind1710000000062 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE accounting_invoices ADD COLUMN kind varchar(10) NOT NULL DEFAULT 'purchase' CHECK (kind IN ('purchase', 'sale'))");
    await q.query('DROP INDEX accounting_invoice_document');
    await q.query(`CREATE UNIQUE INDEX accounting_invoice_document ON accounting_invoices
      (project_id, kind, (data->>'ruc'), (data->>'number'), (data->>'documentType'))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX accounting_invoice_document');
    await q.query(`CREATE UNIQUE INDEX accounting_invoice_document ON accounting_invoices
      (project_id, (data->>'ruc'), (data->>'number'), (data->>'documentType'))`);
    await q.query('ALTER TABLE accounting_invoices DROP COLUMN kind');
  }
}
