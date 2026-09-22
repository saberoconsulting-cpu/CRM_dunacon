'use client';

export type PaymentConcept = 'reserva' | 'cuota_inicial' | 'cuota' | 'otro';

const CONCEPT_RANK: Record<string, number> = {
  reserva: 0,
  adelanto: 1,
  cuota_inicial: 1,
  primera_cuota: 2,
  cuota: 2,
};

export const PAYMENT_CONCEPT_LABEL: Record<string, string> = {
  reserva: 'Reserva',
  adelanto: 'Cuota inicial',
  cuota_inicial: 'Cuota inicial',
  primera_cuota: 'Cuota 1',
  cuota: 'Cuota',
};

export function paymentConceptRank(type?: string | null): number {
  const key = String(type || '').trim().toLowerCase();
  return CONCEPT_RANK[key] ?? 3;
}

export function paymentConcept(type?: string | null): PaymentConcept {
  const rank = paymentConceptRank(type);
  if (rank === 0) return 'reserva';
  if (rank === 1) return 'cuota_inicial';
  if (rank === 2) return 'cuota';
  return 'otro';
}

export function paymentConceptLabel(type?: string | null): string {
  return PAYMENT_CONCEPT_LABEL[String(type || '').trim().toLowerCase()] || (
    type ? String(type).charAt(0).toUpperCase() + String(type).slice(1) : 'Pago'
  );
}

function effectiveDate(row: { paidAt?: string | null; dueDate?: string | null; createdAt?: string | null; status?: string | null }): string {
  const pick = (value?: string | null) => (value ? String(value).slice(0, 10) : '');
  const paid = String(row.status || '') === 'pagado';
  return pick(row.paidAt) || pick(row.dueDate) || pick(row.createdAt) || (paid ? '' : '9999-12-31');
}

export function comparePaymentRows(a: any, b: any): number {
  const stageA = String(a?.status || '') === 'pagado' ? 0 : 1;
  const stageB = String(b?.status || '') === 'pagado' ? 0 : 1;
  if (stageA !== stageB) return stageA - stageB;

  const rank = (a?.conceptRank ?? paymentConceptRank(a?.type)) - (b?.conceptRank ?? paymentConceptRank(b?.type));
  if (rank !== 0) return rank;

  const dateA = effectiveDate(a);
  const dateB = effectiveDate(b);
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;

  return Number(a?.id || 0) - Number(b?.id || 0);
}
