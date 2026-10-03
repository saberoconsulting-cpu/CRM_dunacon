import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Homologa los conceptos (TIPO INGRESO/GASTO) que ya aparecen en los movimientos
 * bancarios importados pero que no existian en la tabla maestra de categorias.
 *
 * Al dejarlos en `bank_category_mappings` con su CLASIFICACION EERR correcta,
 * el flujo de caja dinamico los agrupa en la seccion que les corresponde y esa
 * misma data se consume en el Estado de Resultados y el Presupuesto de Obra.
 *
 * No crea filas ni formulas nuevas en el flujo: solo completa la homologacion.
 *
 * [movementType, eerrClassification]
 */
const HOMOLOGATED: Array<[string, string]> = [
  ['ASESORIA LEGAL, GASTOS NOTARIALES', 'DISEÑO - INGENIERIAS'],
  ['ADQUISICIÓN DE TERRENO', 'COMPRA TERRENO'],
  ['MARKETING DIGITAL', 'MARKETING - MKT DIGITAL'],
  ['COMISIÓN DE VENTAS', 'Comisión de Ventas'],
  ['CUOTA INICIAL', 'VENTA DE LOTE'],
  ['COMISIONES BANCARIAS', 'Gastos Financieros'],
  ['CUOTAS DE FINANCIAMIENTO', 'PRESTAMO'],
  ['DISEÑO PROYECTO, LICENCIAS', 'DISEÑO - INGENIERIAS'],
  ['INDEMNIZACIÓN, TITULACIÓN', 'Independización y Titulación'],
  ['PLANTAS Y GRASS', 'COSTO DE CONSTRUCCIÓN'],
  ['JUEGO DE NIÑOS - EJERCICIOS', 'COSTO DE CONSTRUCCIÓN'],
  ['POZO SUBTERRÁNEO', 'COSTO DE CONSTRUCCIÓN'],
  ['MOVIMIENTO DE TIERRAS', 'COSTO DE CONSTRUCCIÓN'],
  ['INTERESES DE PRESTAMOS', 'Gastos Financieros'],
  ['CONEXIÓN SERVICIOS PÚBLICOS', 'CONEXIÓN SERVICIOS PÚBLICOS'],
  ['SUPERVISIÓN TÉCNICA', 'SUPERVISIÓN TÉCNICA'],
  ['ALCABALA', 'ALCABALA'],
  ['POST VENTA', 'POST VENTA'],
];

function categoryCode(value: string) {
  const words = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'CAT';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.map((word) => word[0]).join('').slice(0, 4).toUpperCase();
}

export class HomologateBankCategories1710000000039 implements MigrationInterface {
  name = 'HomologateBankCategories1710000000039';

  public async up(q: QueryRunner): Promise<void> {
    for (const [movementType, eerrClassification] of HOMOLOGATED) {
      // 1) Inserta la categoria faltante en cada proyecto.
      await q.query(
        `INSERT INTO "bank_category_mappings" ("project_id", "code", "movement_type", "eerr_classification", "is_active")
         SELECT p."id", $2::varchar, $1::varchar, $3::varchar, true FROM "projects" p
         WHERE NOT EXISTS (
           SELECT 1 FROM "bank_category_mappings" m
           WHERE m."project_id" = p."id" AND m."movement_type" = $1::varchar
         )`,
        [movementType, categoryCode(movementType), eerrClassification],
      );
      // 2) Si el concepto existia sin clasificacion, se le asigna la homologada.
      await q.query(
        `UPDATE "bank_category_mappings"
         SET "eerr_classification" = $2::varchar
         WHERE "movement_type" = $1::varchar
           AND ("eerr_classification" IS NULL OR trim("eerr_classification") = '')`,
        [movementType, eerrClassification],
      );
      // 3) Homologa los movimientos ya registrados que traian el concepto sin clasificar.
      await q.query(
        `UPDATE "bank_account_movements"
         SET "eerr_classification" = $2::varchar
         WHERE "movement_type" = $1::varchar
           AND ("eerr_classification" IS NULL OR trim("eerr_classification") = '')`,
        [movementType, eerrClassification],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM "bank_category_mappings" WHERE "movement_type" = ANY($1)`,
      [HOMOLOGATED.map(([movementType]) => movementType)],
    );
  }
}
