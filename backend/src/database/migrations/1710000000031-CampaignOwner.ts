import { MigrationInterface, QueryRunner } from 'typeorm';

export class CampaignOwner1710000000031 implements MigrationInterface {
  name = 'CampaignOwner1710000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasColumn('campaigns', 'created_by');
    if (!exists) {
      await queryRunner.query(`ALTER TABLE "campaigns" ADD COLUMN "created_by" integer`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasColumn('campaigns', 'created_by');
    if (exists) {
      await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "created_by"`);
    }
  }
}
