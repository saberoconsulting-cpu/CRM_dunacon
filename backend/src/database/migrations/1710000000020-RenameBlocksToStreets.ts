import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameBlocksToStreets1710000000020 implements MigrationInterface {
  name = 'RenameBlocksToStreets1710000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.streets') IS NULL AND to_regclass('public.blocks') IS NOT NULL THEN
          ALTER TABLE "blocks" RENAME TO "streets";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'block_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'street_id'
        ) THEN
          ALTER TABLE "lots" RENAME COLUMN "block_id" TO "street_id";
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
          WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'street_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'block_id'
        ) THEN
          ALTER TABLE "lots" RENAME COLUMN "street_id" TO "block_id";
        END IF;

        IF to_regclass('public.blocks') IS NULL AND to_regclass('public.streets') IS NOT NULL THEN
          ALTER TABLE "streets" RENAME TO "blocks";
        END IF;
      END $$;
    `);
  }
}
