import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountingCash1710000000063 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE accounting_cash (
      id uuid PRIMARY KEY, project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      data jsonb NOT NULL, sort_order bigserial NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query('CREATE INDEX accounting_cash_project ON accounting_cash(project_id)');
    await q.query(`CREATE TABLE accounting_cash_opening (
      project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
      balance numeric(16,2) NOT NULL DEFAULT 0, PRIMARY KEY(project_id, year)
    )`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE accounting_cash_opening');
    await q.query('DROP TABLE accounting_cash');
  }
}
