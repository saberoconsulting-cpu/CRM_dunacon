import { MigrationInterface, QueryRunner } from 'typeorm';

// Datos de registro en US$ (informativo) y datos de aprobacion bancaria del pago.
export class PaymentApproval1710000000023 implements MigrationInterface {
  name = 'PaymentApproval1710000000023';

  async up(q: QueryRunner): Promise<void> {
    const rows = await q.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'payments'
        AND column_name IN (
          'exchange_rate', 'amount_usd', 'bank_operation_number',
          'receipt_number', 'receipt_value', 'approval_document_url',
          'approved_by', 'approved_at'
        )
    `);
    const existing = new Set((rows || []).map((r: any) => r.column_name));

    if (!existing.has('exchange_rate')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "exchange_rate" numeric(10,4)`);
    }
    if (!existing.has('amount_usd')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "amount_usd" numeric(14,2)`);
    }
    if (!existing.has('bank_operation_number')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "bank_operation_number" varchar(100)`);
    }
    if (!existing.has('receipt_number')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "receipt_number" varchar(100)`);
    }
    if (!existing.has('receipt_value')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "receipt_value" numeric(14,2)`);
    }
    if (!existing.has('approval_document_url')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "approval_document_url" varchar(500)`);
    }
    if (!existing.has('approved_by')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "approved_by" bigint REFERENCES "users"("id") ON DELETE SET NULL`);
    }
    if (!existing.has('approved_at')) {
      await q.query(`ALTER TABLE "payments" ADD COLUMN "approved_at" timestamptz`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "exchange_rate"`);
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "amount_usd"`);
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "bank_operation_number"`);
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "receipt_number"`);
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "receipt_value"`);
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "approval_document_url"`);
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "approved_by"`);
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "approved_at"`);
  }
}
