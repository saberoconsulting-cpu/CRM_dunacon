// modules/finances/application/dto/cashflow.dto.ts

export type CashflowMode = 'estatico' | 'dinamico';

/** Fila del modelo de flujo de caja (misma estructura en ambos modos). */
export type CashflowRowDto = {
  id: string;
  label: string;
  values: number[];
};

export type SaveCashflowModelDto = {
  projectId: number;
  mode: CashflowMode;
  assumptions?: Record<string, unknown> | null;
  rows?: CashflowRowDto[];
};
