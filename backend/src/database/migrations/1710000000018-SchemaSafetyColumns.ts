import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchemaSafetyColumns1710000000018 implements MigrationInterface {
  name = 'SchemaSafetyColumns1710000000018';

  private async hasColumn(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await q.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      `,
      [table, column],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async up(q: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(q, 'lots', 'plan_voucher_url'))) {
      await q.query(`ALTER TABLE "lots" ADD COLUMN "plan_voucher_url" varchar(500)`);
    }

    if (!(await this.hasColumn(q, 'user_projects', 'allowed_modules'))) {
      await q.query(`ALTER TABLE "user_projects" ADD COLUMN "allowed_modules" jsonb`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "lots" DROP COLUMN IF EXISTS "plan_voucher_url"`);
    await q.query(`ALTER TABLE "user_projects" DROP COLUMN IF EXISTS "allowed_modules"`);
  }
}
