import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixInstallmentDatesFromSaleDate1710000000047 implements MigrationInterface {
  name = 'FixInstallmentDatesFromSaleDate1710000000047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "sale_installments" AS si
      SET "due_date" = (
        SELECT 
          TO_CHAR(
            DATE_TRUNC('month', s.sale_date::date) + (si.installment_no || ' month')::interval,
            'YYYY-MM-DD'
          )::date
        FROM "sales" s
        WHERE s.id = si.sale_id
      )
      WHERE EXISTS (
        SELECT 1 FROM "sales" s 
        WHERE s.id = si.sale_id 
        AND s.sale_date IS NOT NULL
        AND s.total_cuotas > 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "sale_installments" AS si
      SET "due_date" = (
        SELECT 
          TO_CHAR(
            DATE_TRUNC('month', s.approved_at::date) + (si.installment_no || ' month')::interval,
            'YYYY-MM-DD'
          )::date
        FROM "sales" s
        WHERE s.id = si.sale_id
      )
      WHERE EXISTS (
        SELECT 1 FROM "sales" s 
        WHERE s.id = si.sale_id 
        AND s.approved_at IS NOT NULL
      )
    `);
  }
}
