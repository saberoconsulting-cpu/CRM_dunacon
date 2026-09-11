// database/migrations/1710000000001-Seed.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Seed1710000000001 implements MigrationInterface {
  name = 'Seed1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Contraseña para todos los usuarios demo: Admin150 (ojo: 1710000000007 re-nombra
    // el correo de "maria@crm.com" a "Rene@crm.com" y re-aplíca Admin150 en BD existentes)
    const hash = '$2a$10$wnrxglfDMmO4a82olb4qgOW7ffPjw/IGyVoW7sIiW8y.HPUYKssu6';

    // ---- USUARIOS ----
    await queryRunner.query(
      `INSERT INTO "users" ("email","password_hash","name","phone","role","status","commission_rate","monthly_goal_lots","monthly_goal_amount")
       VALUES ('admin@crm.com',$1,'Super Admin','999111222','superadmin','active',0,0,0)`,
      [hash],
    );
    await queryRunner.query(
      `INSERT INTO "users" ("email","password_hash","name","phone","role","status","commission_rate","monthly_goal_lots")
       VALUES ('gerente@crm.com',$1,'Gerente del Proyecto','999333444','admin','active',0,0)`,
      [hash],
    );
    await queryRunner.query(
      `INSERT INTO "users" ("email","password_hash","name","phone","role","status","commission_rate","monthly_goal_lots","monthly_goal_amount")
       VALUES ('maria@crm.com',$1,'María Fernández','999555666','agent','active',3.5,3,120000)`,
      [hash],
    );
    await queryRunner.query(
      `INSERT INTO "users" ("email","password_hash","name","phone","role","status","commission_rate","monthly_goal_lots","monthly_goal_amount")
       VALUES ('carlos@crm.com',$1,'Carlos Mendoza','999777888','agent','active',3.0,2,90000)`,
      [hash],
    );

    // ---- PROYECTO DEMO ----
    const project = await queryRunner.query(
      `INSERT INTO "projects" ("name","description","location","latitude","longitude","status","reference_price")
       VALUES ('Residencial Los Olivos','Condominio de lotes residenciales con áreas verdes y seguridad perimetral.','Ate, Lima, Perú',-12.0143,-76.9347,'active',95000)
       RETURNING "id"`,
    );
    const pid = Number(project[0].id);

    await queryRunner.query(
      `INSERT INTO "user_projects" ("user_id","project_id") SELECT "id",$1 FROM "users" WHERE "role" IN ('admin','agent')`,
      [pid],
    );

    // ---- CAMPAÑAS ----
    await queryRunner.query(
      `INSERT INTO "campaigns" ("name","channel","project_id","budget","real_expense","status")
       VALUES ('Campaña Facebook Q3','facebook',$1,3000,1850,'active'),
              ('Campaña TikTok Lanzamiento','tiktok',$1,2500,1200,'active'),
              ('Anuncios Instagram','instagram',$1,1500,900,'active')`,
      [pid],
    );

    // ---- PLANO ----
    const plan = await queryRunner.query(
      `INSERT INTO "plan" ("project_id","image_width","image_height","status","view_box")
       VALUES ($1,1000,800,'published','0 0 1000 800') RETURNING "id"`,
      [pid],
    );
    const planId = Number(plan[0].id);

    // ---- MANZANAS ----
    await this.insertBlock(queryRunner, pid, planId, 'A', [[120,120],[420,120],[420,420],[120,420]]);
    await this.insertBlock(queryRunner, pid, planId, 'B', [[470,120],[770,120],[770,420],[470,420]]);
    await this.insertBlock(queryRunner, pid, planId, 'C', [[290,470],[590,470],[590,720],[290,720]]);

    // ---- CLIENTES ----
    await queryRunner.query(
      `INSERT INTO "clients" ("full_name","phone","email","source","project_interest_id","agent_id","pipeline_status")
       VALUES ('Juan Pérez','988111222','juan@mail.com','facebook',$1,(SELECT id FROM users WHERE email='maria@crm.com'),'contactado'),
              ('Lucía Ramos','988333444','lucia@mail.com','tiktok',$1,(SELECT id FROM users WHERE email='carlos@crm.com'),'reservado'),
              ('Pedro Soto','988555666','pedro@mail.com','web',$1,(SELECT id FROM users WHERE email='maria@crm.com'),'compro'),
              ('Ana Torres','988777888','ana@mail.com','instagram',$1,(SELECT id FROM users WHERE email='carlos@crm.com'),'nuevo')`,
      [pid],
    );

    // ---- LOTES ----
    await this.insertLot(queryRunner, pid, planId, 'A-01', 'A', [[130,130],[250,130],[250,340],[130,340]], 120, 95000, 'disponible', null, 'maria@crm.com');
    await this.insertLot(queryRunner, pid, planId, 'A-02', 'A', [[260,130],[400,130],[400,340],[260,340]], 135, 108000, 'reservado', 'Juan Pérez', 'maria@crm.com');
    await this.insertLot(queryRunner, pid, planId, 'B-01', 'B', [[480,130],[600,130],[600,340],[480,340]], 120, 95000, 'adelanto', 'Lucía Ramos', 'carlos@crm.com');
    await this.insertLot(queryRunner, pid, planId, 'B-02', 'B', [[610,130],[750,130],[750,340],[610,340]], 125, 100000, 'primera_cuota', 'Pedro Soto', 'maria@crm.com');
    await this.insertLot(queryRunner, pid, planId, 'C-01', 'C', [[300,480],[440,480],[440,650],[300,650]], 110, 88000, 'vendido', 'Ana Torres', 'carlos@crm.com');
    await this.insertLot(queryRunner, pid, planId, 'C-02', 'C', [[450,480],[580,480],[580,650],[450,650]], 115, 92000, 'disponible', null, null);
  }

  private async insertBlock(
    qr: QueryRunner,
    pid: number,
    planId: number,
    name: string,
    pts: number[][],
  ): Promise<void> {
    await qr.query(
      `INSERT INTO "blocks" ("project_id","plan_id","name","points") VALUES ($1,$2,$3,$4::jsonb)`,
      [pid, planId, name, JSON.stringify(pts.map((p) => ({ x: p[0], y: p[1] })))],
    );
  }

  private async insertLot(
    qr: QueryRunner,
    pid: number,
    planId: number,
    code: string,
    blockName: string,
    pts: number[][],
    area: number,
    price: number,
    status: string,
    clientName: string | null,
    agentEmail: string | null,
  ): Promise<void> {
    await qr.query(
      `INSERT INTO "lots" ("project_id","plan_id","block_id","code","points","area_m2","price","status","client_id","agent_id")
       VALUES ($1,$2,(SELECT id FROM blocks WHERE project_id=$1 AND name=$3),$4,$5::jsonb,$6,$7,$8,
               (SELECT id FROM clients WHERE full_name=$9),(SELECT id FROM users WHERE email=$10))`,
      [pid, planId, blockName, code, JSON.stringify(pts.map((p) => ({ x: p[0], y: p[1] }))), area, price, status, clientName, agentEmail],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "audit_log"`);
    await queryRunner.query(`DELETE FROM "expenses"`);
    await queryRunner.query(`DELETE FROM "financial_transactions"`);
    await queryRunner.query(`DELETE FROM "payments"`);
    await queryRunner.query(`DELETE FROM "sales"`);
    await queryRunner.query(`DELETE FROM "client_contacts"`);
    await queryRunner.query(`DELETE FROM "lot_status_history"`);
    await queryRunner.query(`DELETE FROM "lots"`);
    await queryRunner.query(`DELETE FROM "blocks"`);
    await queryRunner.query(`DELETE FROM "plan"`);
    await queryRunner.query(`DELETE FROM "campaigns"`);
    await queryRunner.query(`DELETE FROM "clients"`);
    await queryRunner.query(`DELETE FROM "user_projects"`);
    await queryRunner.query(`DELETE FROM "projects"`);
    await queryRunner.query(`DELETE FROM "users"`);
  }
}