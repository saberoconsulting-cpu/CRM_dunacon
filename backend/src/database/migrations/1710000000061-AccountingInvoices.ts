import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountingInvoices1710000000061 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE accounting_invoices (
      id uuid PRIMARY KEY, project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX accounting_invoice_document ON accounting_invoices
      (project_id, (data->>'ruc'), (data->>'number'), (data->>'documentType'))`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE accounting_invoices'); }
}
