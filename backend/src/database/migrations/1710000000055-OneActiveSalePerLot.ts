import { MigrationInterface, QueryRunner } from 'typeorm';

export class OneActiveSalePerLot1710000000055 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_sales_one_active_per_lot" ON sales (lot_id)
      WHERE approval_status <> 'rechazada' AND status <> 'rechazada'`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_sales_one_active_per_lot"');
  }
}
