import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeLotStatuses1710000000046 implements MigrationInterface {
  name = 'NormalizeLotStatuses1710000000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "lots" SET "status" = 'reservado' WHERE "status" = 'adelanto'`);
    await queryRunner.query(`UPDATE "lots" SET "status" = 'vendido' WHERE "status" IN ('primera_cuota', 'alquilado')`);
    await queryRunner.query(`ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "CHK_lots_status_options"`);
    await queryRunner.query(`
      ALTER TABLE "lots"
      ADD CONSTRAINT "CHK_lots_status_options"
      CHECK ("status" IN ('disponible','reservado','vendido','promocion','segunda_etapa'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "CHK_lots_status_options"`);
    await queryRunner.query(`
      ALTER TABLE "lots"
      ADD CONSTRAINT "CHK_lots_status_options"
      CHECK ("status" IN ('disponible','reservado','adelanto','primera_cuota','vendido','alquilado','promocion','segunda_etapa'))
    `);
  }
}
