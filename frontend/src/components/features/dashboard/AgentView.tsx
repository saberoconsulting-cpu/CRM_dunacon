'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FiCreditCard, FiDollarSign, FiLayers, FiTag, FiUsers } from 'react-icons/fi';
import { AgentDashboard } from '@/lib/dboard';
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

function SectionCard({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: BORDER }}>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" style={{ color: INK }}>{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs" style={{ color: MUTED }}>{subtitle}</p>}
        </div>
        {right && <span className="shrink-0 rounded-md bg-softblue px-2 py-1 text-xs font-semibold" style={{ color: BLUE_DARK }}>{right}</span>}
      </div>
      {children}
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
  const activity = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, v]) => ({ month, ...v }));

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
          <SectionCard title="Mi actividad" subtitle="Ingresos por mes (ultimos 6 meses)">
            {activity.length ? (
              <div className="mx-auto h-[260px] w-full max-w-[680px] px-3 pt-4 sm:px-4 sm:pt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activity} margin={{ left: 8, right: 20, top: 12, bottom: 16 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={62} />
                    <Tooltip
                      cursor={{ fill: 'rgba(24,119,242,0.06)' }}
                      formatter={(value: number, _name: string, item: any) => [`${formatMoney(value)} (${item?.payload?.ventas || 0} venta/s)`, 'Ingresos']}
                      labelFormatter={(label: string) => monthLabel(label)}
                    />
                    <Bar dataKey="monto" name="Ingresos" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={46} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="grid h-[240px] place-items-center px-4 text-center text-sm text-slate-400">Aun no tienes ventas registradas.</div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Mi meta mensual" subtitle="Lotes vendidos este mes" right={goalLots > 0 ? `${progress}%` : undefined}>
          <div className="px-4 py-4">
            <p className="text-3xl font-bold tabular-nums" style={{ color: INK }}>
              {goalLots > 0 ? `${Math.min(salesInMonth, goalLots)} / ${goalLots}` : `${salesInMonth} vendidos`}
            </p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: BLUE }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md border px-3 py-2" style={{ borderColor: BORDER }}>
                <p className="text-[11px] font-medium" style={{ color: MUTED }}>Meta en monto</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: INK }}>{formatMoney(d.cards.goalAmount)}</p>
              </div>
              <div className="rounded-md border px-3 py-2" style={{ borderColor: BORDER }}>
                <p className="text-[11px] font-medium" style={{ color: MUTED }}>Comisiones</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: GREEN }}>{formatMoney(d.cards.commissionMonth)}</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SectionCard title="Mis leads" right={String(d.leads.length)}>
          <ul className="divide-y text-sm" style={{ borderColor: BORDER }}>
            {d.leads.map((c: any) => {
              const status = c.pipelineStatus || c.pipeline_status || 'nuevo';
              const [label, bg, color] = PIPELINE[status] || [status, '#EEF2F6', '#475569'];
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="inline-flex min-w-0 items-center gap-2" style={{ color: INK }}>
                    <FiUsers className="shrink-0" style={{ color: MUTED }} />
                    <span className="truncate">{c.fullName || c.full_name || '—'}</span>
                  </span>
                  <span className="badge shrink-0" style={{ background: bg, color }}>{label}</span>
                </li>
              );
            })}
            {!d.leads.length && <li className="px-4 py-6 text-center text-slate-400">Sin leads asignados</li>}
          </ul>
        </SectionCard>

        <SectionCard title="Proximas cuotas" right={String(d.upcoming.length)}>
          <ul className="divide-y text-sm" style={{ borderColor: BORDER }}>
            {d.upcoming.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span style={{ color: INK }}>{PAYMENT_TYPE[p.type] || p.type}</span>
                <span className="shrink-0 text-right">
                  <b className="tabular-nums" style={{ color: INK }}>{formatMoney(p.amount)}</b>
                  <span className="block text-[11px]" style={{ color: MUTED }}>Vence {formatDate(p.dueDate || p.due_date)}</span>
                </span>
              </li>
            ))}
            {!d.upcoming.length && <li className="px-4 py-6 text-center text-slate-400">Sin cuotas pendientes</li>}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
