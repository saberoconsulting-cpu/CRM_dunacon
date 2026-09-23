import { MigrationInterface, QueryRunner } from 'typeorm';

const CATEGORIES: Array<[string, string]> = [
  ['APORTE CAPITAL', 'APORTE CAPITAL'],
  ['PRESTAMO', 'PRESTAMO'],
  ['VENTA DE LOTE', 'VENTA DE LOTE'],
  ['INGRESO EXTRAORDINARIO', 'INGRESO EXTRAORDINARIO'],
  ['CAMBIO DOLARES/SOLES', 'CAMBIO DOLARES/SOLES'],
  ['COMPRA TERRENO', 'COMPRA TERRENO'],
  ['DISEÑO - INGENIERIAS', 'DISEÑO - INGENIERIAS'],
  ['MOVIMIENTO DE TIERRA', 'COSTO DE CONSTRUCCIÓN'],
  ['CERCO PERIMETRICO', 'COSTO DE CONSTRUCCIÓN'],
  ['PORTICO', 'COSTO DE CONSTRUCCIÓN'],
  ['AFIRMADO DE TERRENO', 'COSTO DE CONSTRUCCIÓN'],
  ['SARDINELES', 'COSTO DE CONSTRUCCIÓN'],
  ['CISTERNA DE AGUA', 'COSTO DE CONSTRUCCIÓN'],
  ['LOSA DE FULBITO - TENNIS', 'COSTO DE CONSTRUCCIÓN'],
  ['PISCINA', 'COSTO DE CONSTRUCCIÓN'],
  ['ZONA DE PARRILLAS', 'COSTO DE CONSTRUCCIÓN'],
  ['CAMARAS DE VIDEOVIGILANCIA', 'COSTO DE CONSTRUCCIÓN'],
  ['AREAS VERDES', 'COSTO DE CONSTRUCCIÓN'],
  ['MARKETING - MKT DIGITAL', 'MARKETING - MKT DIGITAL'],
  ['CAMPAÑAS - META ADS', 'CAMPAÑAS - META ADS'],
  ['SERVICIO DE LUZ - AGUA', 'COSTO DE CONSTRUCCIÓN'],
  ['ZONA DE FOGATAS', 'COSTO DE CONSTRUCCIÓN'],
  ['JUEGO NIÑOS - EJERCICIOS', 'COSTO DE CONSTRUCCIÓN'],
  ['OFICINA-STAND', 'COSTO DE CONSTRUCCIÓN'],
  ['REDES DE AGUA', 'COSTO DE CONSTRUCCIÓN'],
  ['REDES ELECTRICAS BT - INICIALES', 'COSTO DE CONSTRUCCIÓN'],
  ['REDES ELECTRICAS BT/AP', 'COSTO DE CONSTRUCCIÓN'],
  ['REDES ELECTRICAS MT', 'COSTO DE CONSTRUCCIÓN'],
  ['REDES TELEFONIA', 'COSTO DE CONSTRUCCIÓN'],
  ['RIEGO TECNIFICADO', 'COSTO DE CONSTRUCCIÓN'],
  ['REDES SANITARIAS', 'COSTO DE CONSTRUCCIÓN'],
  ['POZO DE AGUA', 'COSTO DE CONSTRUCCIÓN'],
  ['CLUB HOUSE', 'COSTO DE CONSTRUCCIÓN'],
  ['VEREDAS', 'COSTO DE CONSTRUCCIÓN'],
  ['PISTAS', 'COSTO DE CONSTRUCCIÓN'],
  ['INDEPENDIZACION LOTES', 'Independización y Titulación'],
  ['DEVOLUCION', 'DEVOLUCION'],
  ['Gastos de Administración', 'Gastos de Administración'],
  ['Gastos Financieros', 'Gastos Financieros'],
  ['PAGO DETRACCIONES', 'Gastos Financieros'],
  ['VIGILANCIA', 'COSTO DE CONSTRUCCIÓN'],
  ['VERIFICAR', 'VERIFICAR'],
  ['COMISION VENTA LOTES', 'Comisión de Ventas'],
  ['Gerencia de Proyectos', 'Gerencia de Proyectos'],
  ['Mantenimiento de Instalaciones', 'COSTO DE CONSTRUCCIÓN'],
];

export class BankCategorySeed1710000000033 implements MigrationInterface {
  name = 'BankCategorySeed1710000000033';

  public async up(q: QueryRunner): Promise<void> {
    for (const [movementType, eerrClassification] of CATEGORIES) {
      await q.query(
        `INSERT INTO "bank_category_mappings" ("project_id", "movement_type", "eerr_classification", "is_active")
         SELECT p."id", $1::varchar, $2::varchar, true FROM "projects" p
         WHERE NOT EXISTS (
           SELECT 1 FROM "bank_category_mappings" m
           WHERE m."project_id" = p."id" AND m."movement_type" = $1::varchar
         )`,
        [movementType, eerrClassification],
      );
    }
    await q.query(`
      WITH ranked AS (
        SELECT "id", ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "id") AS rn
        FROM "bank_category_mappings"
      )
      UPDATE "bank_category_mappings" m
      SET "sort_order" = ranked.rn
      FROM ranked
      WHERE m."id" = ranked."id"
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM "bank_category_mappings" WHERE "movement_type" = ANY($1)`,
      [CATEGORIES.map(([type]) => type)],
    );
  }
}