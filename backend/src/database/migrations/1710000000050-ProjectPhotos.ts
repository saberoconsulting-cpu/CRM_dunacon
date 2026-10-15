import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectPhotos1710000000050 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE projects ADD COLUMN photos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(photos) = 'array' AND jsonb_array_length(photos) <= 10)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE projects DROP COLUMN photos`);
  }
}
