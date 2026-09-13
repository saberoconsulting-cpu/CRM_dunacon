import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserProjectModules1710000000015 implements MigrationInterface {
  name = 'UserProjectModules1710000000015';

  async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='user_projects'
        AND column_name='allowed_modules'
    `);
    if (!exists || exists.length === 0) {
      await q.query(`ALTER TABLE "user_projects" ADD COLUMN "allowed_modules" jsonb`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "user_projects" DROP COLUMN IF EXISTS "allowed_modules"`);
  }
}
