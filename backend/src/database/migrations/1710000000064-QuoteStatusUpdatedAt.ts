import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteStatusUpdatedAt1710000000064 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE quotes ADD COLUMN status_updated_at timestamptz NULL');
    await q.query("UPDATE quotes SET status_updated_at = NOW() WHERE status = 'actualizada' AND deleted_at IS NULL");
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE quotes DROP COLUMN status_updated_at');
  }
}
