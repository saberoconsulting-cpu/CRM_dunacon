export type PaymentConcept = 'reserva' | 'cuota_inicial' | 'cuota' | 'otro';

const CONCEPT_RANK: Record<string, number> = {
  reserva: 0,
  adelanto: 1,
  cuota_inicial: 1,
  primera_cuota: 2,
  cuota: 2,
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
  const concept = paymentConcept(type);
  if (concept === 'reserva') return 'Reserva';
  if (concept === 'cuota_inicial') return 'Cuota inicial';
  if (concept === 'cuota') return 'Cuota';
  const raw = String(type || '').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Pago';
}

export function paymentEffectiveDate(payment: {
  paidAt?: Date | string | null;
  dueDate?: Date | string | null;
  createdAt?: Date | string | null;
  status?: string | null;
}): string {
  const pick = (value?: Date | string | null) => (value ? String(value).slice(0, 10) : '');
  const paid = String(payment.status || '') === 'pagado';
  return pick(payment.paidAt) || pick(payment.dueDate) || pick(payment.createdAt) || (paid ? '' : '9999-12-31');
}

export function comparePaymentsForDisplay(
  a: { type?: string | null; installmentNo?: number | null; paidAt?: any; dueDate?: any; createdAt?: any; status?: any; id?: number },
  b: { type?: string | null; installmentNo?: number | null; paidAt?: any; dueDate?: any; createdAt?: any; status?: any; id?: number },
): number {
  const rank = paymentConceptRank(a.type) - paymentConceptRank(b.type);
  if (rank !== 0) return rank;

  const aNo = Number(a.installmentNo || 0);
  const bNo = Number(b.installmentNo || 0);
  if (aNo !== bNo) return aNo - bNo;

  const dateA = paymentEffectiveDate(a);
  const dateB = paymentEffectiveDate(b);
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;

  return Number(a.id || 0) - Number(b.id || 0);
}
