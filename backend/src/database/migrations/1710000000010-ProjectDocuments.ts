import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectDocuments1710000000010 implements MigrationInterface {
  name = 'ProjectDocuments1710000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_documents" (
        "id" BIGSERIAL PRIMARY KEY,
        "project_id" BIGINT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "kind" varchar(50) NOT NULL,
        "original_name" varchar(255) NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "mime_type" varchar(120),
        "size" numeric(14,2) NOT NULL DEFAULT 0,
        "url" varchar(500) NOT NULL,
        "public_id" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_project_documents_project" ON "project_documents"("project_id")`);
    await queryRunner.query(`CREATE INDEX "idx_project_documents_kind" ON "project_documents"("kind")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_project_documents_kind"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_project_documents_project"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_documents"`);
  }
}
