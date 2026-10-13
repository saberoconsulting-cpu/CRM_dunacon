import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientIdToQuotes1710000000048 implements MigrationInterface {
  name = 'AddClientIdToQuotes1710000000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "client_id" INTEGER`);
    await queryRunner.query(`
      ALTER TABLE "quotes"
      ADD CONSTRAINT "FK_quotes_client_id"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "FK_quotes_client_id"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "client_id"`);
  }
}
