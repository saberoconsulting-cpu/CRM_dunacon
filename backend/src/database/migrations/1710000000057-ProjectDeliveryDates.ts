import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectDeliveryDates1710000000057 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE projects ADD COLUMN lot_delivery_date date, ADD COLUMN condominium_delivery_date date');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE projects DROP COLUMN condominium_delivery_date, DROP COLUMN lot_delivery_date');
  }
}
