import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteTotalBonus1710000000059 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE quotes ADD COLUMN bono_total_usd numeric(14,2) NOT NULL DEFAULT 0');
    await runner.query(`UPDATE quotes SET bono_total_usd = COALESCE(bono_descuento_usd, 0) + COALESCE(bono_especial_usd, 0) + CASE WHEN payment_method = 'contado' THEN COALESCE(bono_contado_usd, 0) ELSE 0 END`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE quotes DROP COLUMN bono_total_usd');
  }
}
