// database/migrations/1710000000013-ProjectLogo.ts
// Agrega logo independiente para mostrar marca de proyecto en el menu.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectLogo1710000000013 implements MigrationInterface {
  name = 'ProjectLogo1710000000013';

  async up(q: QueryRunner): Promise<void> {
    const has = await q.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='projects'
        AND column_name='logo_image_url'
    `);
    if (has && has.length > 0) return;
    await q.query(`ALTER TABLE "projects" ADD COLUMN "logo_image_url" varchar(500)`);
  }

  async down(q: QueryRunner): Promise<void> {
    const has = await q.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='projects'
        AND column_name='logo_image_url'
    `);
    if (!has || has.length === 0) return;
    await q.query(`ALTER TABLE "projects" DROP COLUMN "logo_image_url"`);
  }
}
