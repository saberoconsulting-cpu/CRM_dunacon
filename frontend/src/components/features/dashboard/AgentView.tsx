'use client';
import { FiCreditCard, FiDollarSign, FiLayers, FiTag, FiUsers } from 'react-icons/fi';
import { AgentDashboard } from '@/lib/dboard';
import { ProjectBars, SectionShell } from './GeneralView';
import { formatMoney, formatDate } from '@/lib/types';

const BLUE = '#1877F2';
const BLUE_DARK = '#1259C4';
const GREEN = '#16A36A';
const AMBER = '#D97706';
const BORDER = '#E5E7EB';
const MUTED = '#64748B';
const INK = '#0F172A';

const PIPELINE: Record<string, [string, string, string]> = {
  nuevo: ['Nuevo', '#EEF2F6', '#475569'],
  contactado: ['Contactado', '#E7F0FE', BLUE_DARK],
  visito: ['Visito', '#E7F0FE', BLUE_DARK],
  reservado: ['Reservado', '#FFF6E4', '#B45309'],
  compro: ['Compro', '#EAF7EE', '#257849'],
  perdido: ['Perdido', '#FEECEC', '#B91C1C'],
};
const PAYMENT_TYPE: Record<string, string> = { reserva: 'Reserva', adelanto: 'Cuota inicial', primera_cuota: 'Cuota normal', cuota: 'Cuota' };

function shortMoney(n: number) {
  const value = Number(n || 0);
  if (Math.abs(value) >= 1000000) return `S/ ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(value) >= 1000) return `S/ ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `S/ ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

function monthLabel(month: string) {
  const [year, rawMonth] = String(month || '').split('-');
  const date = new Date(Number(year), Number(rawMonth || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return month || '-';
  return date.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }).replace('.', '');
}

function KpiTile({ label, value, helper, icon, accent }: { label: string; value: string; helper: string; icon: JSX.Element; accent: string }) {
  return (
    <div className="rounded-md border bg-white px-4 py-3 shadow-sm" style={{ borderColor: BORDER }}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase" style={{ color: MUTED }}>{label}</p>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
      </div>
      <p className="mt-2 truncate text-xl font-bold tabular-nums" style={{ color: INK }}>{value}</p>
      <p className="mt-0.5 truncate text-[11px]" style={{ color: MUTED }}>{helper}</p>
    </div>
  );
}

export default function AgentView({ d }: { d: AgentDashboard | null }) {
  if (!d) return <p className="text-slate-400">Sin datos</p>;

  const n = (v: unknown) => Number(v || 0);
  const goalLots = n(d.cards.goalLots);
  const progress = Math.min(n(d.cards.progressLots), 100);
  const salesInMonth = n(d.cards.salesMonth);

  // El backend agrupa por dia; se agrega por mes para que el grafico sea legible.
  const byMonth = new Map<string, { monto: number; ventas: number }>();
  for (const row of d.salesByPeriod || []) {
    const key = String(row.date || '').slice(0, 7);
    if (!key) continue;
    const current = byMonth.get(key) || { monto: 0, ventas: 0 };
    current.monto += n(row.amount);
    current.ventas += n(row.total);
    byMonth.set(key, current);
  }
  const now = new Date();
  const activity = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    return { month, monto: byMonth.get(month)?.monto || 0, ventas: byMonth.get(month)?.ventas || 0, current: i === 5 };
  });
  const projectRows = (d.salesByProject || []).map((row) => ({ name: row.name, value: n(row.amount) }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Ventas del mes" value={String(salesInMonth)} helper="Separaciones y ventas" icon={<FiTag />} accent={BLUE} />
        <KpiTile label="Ingresos" value={formatMoney(d.cards.salesAmount)} helper="Total acumulado" icon={<FiDollarSign />} accent={GREEN} />
        <KpiTile label="Comisiones" value={formatMoney(d.cards.commissionMonth)} helper="Total acumulado" icon={<FiCreditCard />} accent={AMBER} />
        <KpiTile label="Lotes vendidos" value={String(n(d.cards.lotsSold))} helper="Aprobados" icon={<FiLayers />} accent={BLUE_DARK} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProjectBars
            title="Mi actividad"
            subtitle="Grafico de barras - ingresos por mes (ultimos 6 meses)"
            rows={activity.map((row) => ({ name: monthLabel(row.month), value: row.monto, color: row.current ? BLUE : '#7FB2F7' }))}
            valueFormatter={formatMoney}
            className="h-full min-h-[320px]"
            sorted={false}
          />
        </div>

        <SectionShell title="Mi meta mensual" subtitle="Lotes vendidos este mes" className="h-full">
          <p className="text-3xl font-bold tabular-nums" style={{ color: INK }}>
            {goalLots > 0 ? `${Math.min(salesInMonth, goalLots)} / ${goalLots}` : `${salesInMonth} vendidos`}
            {goalLots > 0 && <span className="ml-2 text-sm font-semibold" style={{ color: BLUE_DARK }}>{progress}%</span>}
          </p>
          <div className="mt-3 h-2 overflow-hidden bg-slate-100" style={{ borderRadius: 2 }}>
            <div className="h-full" style={{ width: `${progress}%`, background: BLUE }} />
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t pt-3 text-[11px]" style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2" style={{ background: BLUE }} />Meta en monto</span>
              <b className="tabular-nums" style={{ color: BLUE_DARK }}>{formatMoney(d.cards.goalAmount)}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2" style={{ background: GREEN }} />Comisiones</span>
              <b className="tabular-nums" style={{ color: BLUE_DARK }}>{formatMoney(d.cards.commissionMonth)}</b>
            </div>
          </div>
        </SectionShell>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ProjectBars
          title="Lotes vendidos por mes"
          subtitle="Grafico de barras - ventas cerradas (ultimos 6 meses)"
          rows={activity.map((row) => ({ name: monthLabel(row.month), value: row.ventas, color: row.current ? BLUE : '#7FB2F7' }))}
          valueFormatter={(v) => String(v)}
          sorted={false}
          minMax={4}
          className="min-h-[320px]"
        />
        <ProjectBars
          title="Proyectos mas rentables"
          subtitle="Grafico de barras - ingresos por proyecto"
          rows={projectRows}
          valueFormatter={formatMoney}
          className="min-h-[320px]"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SectionShell title={`Mis leads (${d.leads.length})`}>
          <ul className="divide-y text-sm" style={{ borderColor: BORDER }}>
            {d.leads.map((c: any) => {
              const status = c.pipelineStatus || c.pipeline_status || 'nuevo';
              const [label, bg, color] = PIPELINE[status] || [status, '#EEF2F6', '#475569'];
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="inline-flex min-w-0 items-center gap-2" style={{ color: INK }}>
                    <FiUsers className="shrink-0" style={{ color: MUTED }} />
                    <span className="truncate">{c.fullName || c.full_name || '—'}</span>
                  </span>
                  <span className="badge shrink-0" style={{ background: bg, color }}>{label}</span>
                </li>
              );
            })}
            {!d.leads.length && <li className="py-6 text-center text-slate-400">Sin leads asignados</li>}
          </ul>
        </SectionShell>

        <SectionShell title={`Proximas cuotas (${d.upcoming.length})`}>
          <ul className="divide-y text-sm" style={{ borderColor: BORDER }}>
            {d.upcoming.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <span style={{ color: INK }}>{PAYMENT_TYPE[p.type] || p.type}</span>
                <span className="shrink-0 text-right">
                  <b className="tabular-nums" style={{ color: INK }}>{formatMoney(p.amount)}</b>
                  <span className="block text-[11px]" style={{ color: MUTED }}>Vence {formatDate(p.dueDate || p.due_date)}</span>
                </span>
              </li>
            ))}
            {!d.upcoming.length && <li className="py-6 text-center text-slate-400">Sin cuotas pendientes</li>}
          </ul>
        </SectionShell>
      </div>
    </div>
  );
}
