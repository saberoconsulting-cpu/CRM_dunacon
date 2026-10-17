import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectLotData1710000000056 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE project_lot_data (
      id SERIAL PRIMARY KEY, project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      code varchar(50) NOT NULL, address varchar(255) NOT NULL DEFAULT '', type varchar(80) NOT NULL DEFAULT '',
      area_m2 numeric(14,2) NOT NULL DEFAULT 0 CHECK (area_m2 >= 0), perimeter varchar(80) NOT NULL DEFAULT '',
      dimensions varchar(255) NOT NULL DEFAULT '', front varchar(80) NOT NULL DEFAULT '',
      left_side varchar(80) NOT NULL DEFAULT '', right_side varchar(80) NOT NULL DEFAULT '', back varchar(80) NOT NULL DEFAULT '',
      status varchar(80) NOT NULL DEFAULT '', owner varchar(255) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_project_lot_data_code UNIQUE(project_id, code)
    )`);
  }
  async down(runner: QueryRunner): Promise<void> { await runner.query('DROP TABLE project_lot_data'); }
}
