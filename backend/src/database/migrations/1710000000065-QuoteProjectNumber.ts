import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteProjectNumber1710000000065 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE quotes ADD COLUMN project_number integer');
    await q.query(`WITH numbered AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY id)::integer AS number FROM quotes
    ) UPDATE quotes q SET project_number = n.number FROM numbered n WHERE n.id = q.id`);
    await q.query('ALTER TABLE quotes ALTER COLUMN project_number SET NOT NULL');
    await q.query('ALTER TABLE quotes ADD CONSTRAINT quotes_project_number_unique UNIQUE (project_id, project_number)');
    await q.query(`CREATE FUNCTION assign_quote_project_number() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(1710000065, NEW.project_id);
        IF NEW.project_number IS NULL THEN
          SELECT COALESCE(MAX(project_number), 0) + 1 INTO NEW.project_number
          FROM quotes WHERE project_id = NEW.project_id;
        END IF;
        RETURN NEW;
      END;
    $$`);
    await q.query(`CREATE TRIGGER quote_project_number_before_insert BEFORE INSERT ON quotes
      FOR EACH ROW EXECUTE FUNCTION assign_quote_project_number()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER quote_project_number_before_insert ON quotes');
    await q.query('DROP FUNCTION assign_quote_project_number()');
    await q.query('ALTER TABLE quotes DROP CONSTRAINT quotes_project_number_unique');
    await q.query('ALTER TABLE quotes DROP COLUMN project_number');
  }
}
