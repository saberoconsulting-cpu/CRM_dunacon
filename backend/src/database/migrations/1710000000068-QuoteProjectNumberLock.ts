import { MigrationInterface, QueryRunner } from 'typeorm';

/** project_id is BIGINT. PostgreSQL has no advisory lock(integer, bigint). */
export class QuoteProjectNumberLock1710000000068 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION assign_quote_project_number() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended('crm:quote-project-number:' || NEW.project_id::text, 0));
        IF NEW.project_number IS NULL THEN
          SELECT COALESCE(MAX(project_number), 0) + 1 INTO NEW.project_number
          FROM quotes WHERE project_id = NEW.project_id;
        END IF;
        RETURN NEW;
      END;
    $$`);
  }

  async down(): Promise<void> {
    // This function-only fix is compatible with the previous application.
    // Retain it on rollback rather than restoring a non-existent SQL overload.
  }
}
