import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotPlanVoucher1710000000017 implements MigrationInterface {
  name = 'LotPlanVoucher1710000000017';

  private async has(q: QueryRunner, table: string, col: string) {
    const r = await q.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [table, col],
    );
    return !!(r && r.length > 0);
  }

  async up(q: QueryRunner): Promise<void> {
    if (!(await this.has(q, 'lots', 'plan_voucher_url'))) {
      await q.query(`ALTER TABLE "lots" ADD COLUMN "plan_voucher_url" varchar(500)`);
    }
  }

  async down(): Promise<void> {
    return;
  }
}
