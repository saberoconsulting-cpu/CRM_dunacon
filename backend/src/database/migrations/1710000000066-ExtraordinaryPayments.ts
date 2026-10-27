import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtraordinaryPayments1710000000066 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE payments
      ADD COLUMN is_extraordinary boolean NOT NULL DEFAULT false,
      ADD COLUMN installment_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD CONSTRAINT payments_allocations_array CHECK (jsonb_typeof(installment_allocations) = 'array')`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE payments DROP CONSTRAINT payments_allocations_array, DROP COLUMN installment_allocations, DROP COLUMN is_extraordinary');
  }
}
