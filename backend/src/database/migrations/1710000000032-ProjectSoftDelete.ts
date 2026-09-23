import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectSoftDelete1710000000032 implements MigrationInterface {
  name = 'ProjectSoftDelete1710000000032';

  public async up(q: QueryRunner): Promise<void> {
    const has = await q.hasColumn('projects', 'deleted_at');
    if (!has) {
      await q.query(`ALTER TABLE "projects" ADD COLUMN "deleted_at" timestamptz`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const has = await q.hasColumn('projects', 'deleted_at');
    if (has) {
      await q.query(`ALTER TABLE "projects" DROP COLUMN "deleted_at"`);
    }
  }
}