import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectOrder1710000000051 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE projects ADD COLUMN sort_order integer NOT NULL DEFAULT 2147483647`);
    await q.query(`WITH ranked AS (SELECT id, row_number() OVER (ORDER BY created_at DESC, id DESC) - 1 AS position FROM projects) UPDATE projects p SET sort_order = ranked.position FROM ranked WHERE ranked.id = p.id`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE projects DROP COLUMN sort_order`);
  }
}
