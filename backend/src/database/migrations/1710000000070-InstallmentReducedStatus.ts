import { MigrationInterface, QueryRunner } from 'typeorm';

// Extraordinary payments cancel final installments by reducing the term.
export class InstallmentReducedStatus1710000000070 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE sale_installments DROP CONSTRAINT IF EXISTS sale_installments_status_check`);
    await q.query(`ALTER TABLE sale_installments ADD CONSTRAINT sale_installments_status_check
      CHECK (status IN ('pendiente','pagado','vencido','reducida'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Do not silently relabel amortized installments as ordinary payments.
    const rows = await q.query(`SELECT 1 FROM sale_installments WHERE status = 'reducida' LIMIT 1`);
    if (rows.length) throw new Error('No se puede revertir: existen cuotas reducidas por pagos extraordinarios.');
    await q.query(`ALTER TABLE sale_installments DROP CONSTRAINT IF EXISTS sale_installments_status_check`);
    await q.query(`ALTER TABLE sale_installments ADD CONSTRAINT sale_installments_status_check
      CHECK (status IN ('pendiente','pagado','vencido'))`);
  }
}
