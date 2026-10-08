import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige los montos distorsionados del Flujo de Caja ESTÁTICO del proyecto
 * "Altaduna II" (project_id = 6).
 *
 * Causa: el frontend, cuando la vista estaba en soles (toggle S/), convertía
 * los montos tecleados dividiendo/multiplicando por el tipo de cambio (3.75).
 * El sistema debe ser 100% base USD, con el toggle S/ como multiplicación
 * SOLO de vista. Los valores que quedaron persistidos inflados deben volver
 * a su valor en USD dividiendo ÷3.75.
 *
 * Reglas de seguridad:
 *  - SOLO mode = 'estatico' y SOLO project_id = 6.
 *  - SOLO se dividen las FILAS DE DINERO.
 *  - NUNCA se toca la fila 'lots-sold' (es un CONTEO de lotes, no dinero).
 *  - Se guarda el JSON original completo dentro de assumptions
 *    (clave: _backup_before_usd_fix_0044) para permitir un down() fiel.
 *  - Se marca assumptions.usdBaseFixedAt para dejar rastro.
 *
 * Reversible: down() restaura 'rows' desde el backup guardado.
 */
export class FixStaticCashflowUsdBase1710000000044 implements MigrationInterface {
  name = 'FixStaticCashflowUsdBase1710000000044';

  /** Tipo de cambio con el que se distorsionaron los montos. */
  private static readonly RATE = 3.75;
  /** Proyecto afectado (Altaduna II). */
  private static readonly PROJECT_ID = 6;
  /** Clave donde se guarda el backup del JSON original. */
  private static readonly BACKUP_KEY = '_backup_before_usd_fix_0044';
  /** Filas que NO son dinero y por tanto NO se dividen. */
  private static readonly NON_MONEY_ROWS = ['lots-sold'];

  public async up(q: QueryRunner): Promise<void> {
    // 1) Guardar backup del JSON original (idempotente: solo si no existe).
    await q.query(
      `
      UPDATE "cashflow_models"
      SET "assumptions" = COALESCE("assumptions", '{}'::jsonb)
        || jsonb_build_object(
             $1,
             jsonb_build_object(
               'rows', "rows",
               'savedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
             )
           )
      WHERE "project_id" = $2
        AND "mode" = 'estatico'
        AND NOT (COALESCE("assumptions", '{}'::jsonb) ? $1)
      `,
      [FixStaticCashflowUsdBase1710000000044.BACKUP_KEY, FixStaticCashflowUsdBase1710000000044.PROJECT_ID],
    );

    // 2) Dividir ÷3.75 SOLO las filas de dinero. La de conteo ('lots-sold')
    //    queda con sus valores intactos.
    await q.query(
      `
      UPDATE "cashflow_models" cm
      SET "rows" = (
        SELECT jsonb_agg(
          CASE
            WHEN item->>'id' = ANY($3::text[])
              THEN item
            ELSE jsonb_set(
              item,
              '{values}',
              COALESCE(
                (
                  SELECT jsonb_agg(
                    ROUND((value)::numeric / $2::numeric, 6)
                    ORDER BY ord
                  )
                  FROM jsonb_array_elements_text(item->'values')
                       WITH ORDINALITY AS t(value, ord)
                ),
                '[]'::jsonb
              )
            )
          END
          ORDER BY ord
        )
        FROM jsonb_array_elements(cm."rows")
             WITH ORDINALITY AS r(item, ord)
      )
      WHERE cm."project_id" = $1
        AND cm."mode" = 'estatico'
      `,
      [
        FixStaticCashflowUsdBase1710000000044.PROJECT_ID,
        FixStaticCashflowUsdBase1710000000044.RATE,
        FixStaticCashflowUsdBase1710000000044.NON_MONEY_ROWS,
      ],
    );

    // 3) Dejar rastro en assumptions (no altera la validez del modelo).
    await q.query(
      `
      UPDATE "cashflow_models"
      SET "assumptions" = COALESCE("assumptions", '{}'::jsonb)
        || jsonb_build_object(
             'usdBaseFixedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
             'usdBaseFixedRate', $2::numeric
           )
      WHERE "project_id" = $1
        AND "mode" = 'estatico'
      `,
      [FixStaticCashflowUsdBase1710000000044.PROJECT_ID, FixStaticCashflowUsdBase1710000000044.RATE],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // Restaurar 'rows' desde el backup guardado en assumptions.
    // 1) Solo si EXISTE el backup: así no sobreescribimos con NULL si el
    //    backup no está. (El operador `-> $1 -> 'rows'` devuelve el jsonb
    //    original tal cual, listo para asignar.)
    await q.query(
      `
      UPDATE "cashflow_models"
      SET "rows" = COALESCE("assumptions", '{}'::jsonb) -> $1 -> 'rows'
      WHERE "project_id" = $2
        AND "mode" = 'estatico'
        AND (COALESCE("assumptions", '{}'::jsonb) -> $1 -> 'rows') IS NOT NULL
      `,
      [FixStaticCashflowUsdBase1710000000044.BACKUP_KEY, FixStaticCashflowUsdBase1710000000044.PROJECT_ID],
    );

    // 2) Limpiar las marcas y el backup (deja assumptions limpio).
    await q.query(
      `
      UPDATE "cashflow_models"
      SET "assumptions" = (COALESCE("assumptions", '{}'::jsonb)
        - $1) - 'usdBaseFixedAt' - 'usdBaseFixedRate'
      WHERE "project_id" = $2
        AND "mode" = 'estatico'
      `,
      [FixStaticCashflowUsdBase1710000000044.BACKUP_KEY, FixStaticCashflowUsdBase1710000000044.PROJECT_ID],
    );
  }
}
