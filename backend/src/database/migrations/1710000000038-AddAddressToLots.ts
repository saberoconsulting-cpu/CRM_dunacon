import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressToLots1710000000038 implements MigrationInterface {
  name = 'AddAddressToLots1710000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'address'
        ) THEN
          ALTER TABLE "lots" ADD COLUMN "address" character varying(200);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'address'
        ) THEN
          ALTER TABLE "lots" DROP COLUMN "address";
        END IF;
      END $$;
    `);
  }
}
