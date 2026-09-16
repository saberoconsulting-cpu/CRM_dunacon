import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotStatusOptions1710000000016 implements MigrationInterface {
  name = 'LotStatusOptions1710000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        SELECT con.conname INTO constraint_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = con.connamespace
        WHERE rel.relname = 'lots'
          AND nsp.nspname = current_schema()
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%status%disponible%reservado%';

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "lots" DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "lots"
      ADD CONSTRAINT "CHK_lots_status_options"
      CHECK ("status" IN ('disponible','reservado','adelanto','primera_cuota','vendido','alquilado','promocion','segunda_etapa'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "CHK_lots_status_options"`);
    await queryRunner.query(`
      UPDATE "lots" SET "status" = 'disponible'
      WHERE "status" IN ('alquilado','promocion','segunda_etapa')
    `);
    await queryRunner.query(`
      ALTER TABLE "lots"
      ADD CONSTRAINT "CHK_lots_status_options"
      CHECK ("status" IN ('disponible','reservado','adelanto','primera_cuota','vendido'))
    `);
  }
}
