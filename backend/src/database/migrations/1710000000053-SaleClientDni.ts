import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleClientDni1710000000053 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE clients ADD COLUMN dni varchar(8)');
    await queryRunner.query('ALTER TABLE sales ADD COLUMN client_dni varchar(8)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE sales DROP COLUMN client_dni');
    await queryRunner.query('ALTER TABLE clients DROP COLUMN dni');
  }
}
