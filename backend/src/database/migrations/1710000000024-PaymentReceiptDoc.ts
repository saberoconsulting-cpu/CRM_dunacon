// database/migrations/1710000000024-PaymentReceiptDoc.ts
// Imagen de la boleta/comprobante que el agente o gerente adjunta al registrar
// un pago, para que el admin la revise al aprobar.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentReceiptDoc1710000000024 implements MigrationInterface {
  name = 'PaymentReceiptDoc1710000000024';

  async up(q: QueryRunner): Promise<void> {
    const rows = await q.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'payments'
        AND column_name = 'receipt_document_url'
    `);
    if (rows && rows.length > 0) return;

    await q.query(`ALTER TABLE "payments" ADD COLUMN "receipt_document_url" varchar(500)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "receipt_document_url"`);
  }
}
