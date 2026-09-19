'use client';
import { useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FiCreditCard, FiDollarSign, FiLayers, FiTag, FiUsers } from 'react-icons/fi';
import { AgentDashboard } from '@/lib/dboard';
import { ProjectBars, SectionShell } from './GeneralView';
import { formatMoney } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/ui';

const BLUE = '#1877F2';
const BLUE_DARK = '#1259C4';
const GREEN = '#16A36A';
const AMBER = '#D97706';
const BORDER = '#E5E7EB';
const MUTED = '#64748B';
const INK = '#0F172A';

const ACTIVITY_COLORS = ['#1877F2', '#16A36A', '#D97706', '#B6253C', '#6A4C93', '#0EA5A9'];
const LEADS_PER_PAGE = 7;

const PIPELINE: Record<string, [string, string, string]> = {
  nuevo: ['Nuevo', '#EEF2F6', '#475569'],
  contactado: ['Contactado', '#E7F0FE', BLUE_DARK],
  visito: ['Visito', '#E7F0FE', BLUE_DARK],
  reservado: ['Reservado', '#FFF6E4', '#B45309'],
  compro: ['Compro', '#EAF7EE', '#257849'],
  perdido: ['Perdido', '#FEECEC', '#B91C1C'],
};
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
  const salesInMonth = n(d.cards.salesMonth);
  const [monthsFilter, setMonthsFilter] = useState<'3' | '6'>('3');
  const [editMeta, setEditMeta] = useState(false);
  const [goalLots, setGoalLots] = useState<number>(n(d.cards.goalLots));
  const [goalAmount, setGoalAmount] = useState<number>(n(d.cards.goalAmount));
  const [savingMeta, setSavingMeta] = useState(false);
  const [leadsPage, setLeadsPage] = useState(0);
  const progress = Math.min(goalLots > 0 ? Math.round((salesInMonth / goalLots) * 100) : 0, 100);

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await api.post('/auth/profile', {
        monthlyGoalLots: Number(goalLots || 0),
        monthlyGoalAmount: Number(goalAmount || 0),
      });
      toast('Meta mensual actualizada');
      setEditMeta(false);
    } catch (err: any) {
      toast(err?.message || 'No se pudo guardar la meta', 'err');
    } finally {
      setSavingMeta(false);
    }
  }

  // El backend agrupa por dia; se agrega por mes para que el grafico sea legible.
  const byMonth = new Map<string, { monto: number; ventas: number; comision: number }>();
  for (const row of d.salesByPeriod || []) {
    const key = String(row.date || '').slice(0, 7);
    if (!key) continue;
    const current = byMonth.get(key) || { monto: 0, ventas: 0, comision: 0 };
    current.monto += n(row.amount);
    current.ventas += n(row.total);
    current.comision += n(row.commission);
    byMonth.set(key, current);
  }
  const now = new Date();
  const activity = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    return { month, monto: byMonth.get(month)?.monto || 0, ventas: byMonth.get(month)?.ventas || 0, comision: byMonth.get(month)?.comision || 0, current: i === 5 };
  });
  const projects = d.salesByProject || [];
  const leads = d.leads || [];
  const totalLeadPages = Math.max(1, Math.ceil(leads.length / LEADS_PER_PAGE));
  const pageIndex = Math.min(leadsPage, totalLeadPages - 1);
  const pageLeads = leads.slice(pageIndex * LEADS_PER_PAGE, pageIndex * LEADS_PER_PAGE + LEADS_PER_PAGE);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Ventas del mes" value={String(salesInMonth)} helper="Separaciones y ventas" icon={<FiTag />} accent={BLUE} />
        <KpiTile label="Ventas totales" value={formatMoney(d.cards.salesAmount)} helper="Total de este agente" icon={<FiDollarSign />} accent={GREEN} />
        <KpiTile label="Comisiones" value={formatMoney(d.cards.commissionMonth)} helper="Total acumulado" icon={<FiCreditCard />} accent={AMBER} />
        <KpiTile label="Lotes vendidos" value={String(n(d.cards.lotsSold))} helper="Aprobados" icon={<FiLayers />} accent={BLUE_DARK} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProjectBars
            title="Mi actividad"
            subtitle="Comisiones del agente por mes (ultimos 6 meses)"
            rows={activity.map((row, i) => ({ name: monthLabel(row.month), value: row.comision, color: ACTIVITY_COLORS[i % ACTIVITY_COLORS.length] }))}
            valueFormatter={formatMoney}
            className="h-full min-h-[320px]"
            sorted={false}
          />
        </div>

        <SectionShell
          title="Mi meta mensual"
          subtitle="Lotes vendidos este mes"
          className="h-full"
          control={
            <button
              type="button"
              onClick={() => setEditMeta((v) => !v)}
              className="rounded px-2 py-1 text-[11px] font-semibold uppercase leading-none transition-colors"
              style={editMeta ? { background: AMBER, color: '#fff' } : { background: '#EEF2F6', color: BLUE_DARK }}
            >
              {editMeta ? 'Cancelar' : 'Editar meta'}
            </button>
          }
        >
          {editMeta ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase" style={{ color: MUTED }}>Meta de lotes / mes</label>
                <input
                  type="number" min={0} className="input w-full"
                  value={goalLots}
                  onChange={(e) => setGoalLots(Number(e.target.value || 0))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase" style={{ color: MUTED }}>Meta en monto (S/) / mes</label>
                <input
                  type="number" min={0} className="input w-full"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(Number(e.target.value || 0))}
                />
              </div>
              <button className="btn-primary w-full justify-center" disabled={savingMeta} onClick={saveMeta}>
                {savingMeta ? 'Guardando…' : 'Guardar meta'}
              </button>
            </div>
          ) : (
            <>
              <div className="relative mx-auto h-[190px] w-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[{ v: progress }, { v: Math.max(0, 100 - progress) }]}
                      dataKey="v" startAngle={90} endAngle={-270} innerRadius={66} outerRadius={88} stroke="none" isAnimationActive={false}
                    >
                      <Cell fill={BLUE} />
                      <Cell fill="#E8EDF3" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-3xl font-bold tabular-nums" style={{ color: INK }}>
                      {goalLots > 0 ? `${Math.min(salesInMonth, goalLots)} / ${goalLots}` : salesInMonth}
                    </p>
                    <p className="text-[11px] font-semibold" style={{ color: BLUE_DARK }}>{goalLots > 0 ? `${progress}% de la meta` : 'vendidos'}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t pt-3 text-[11px]" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2" style={{ background: BLUE }} />Meta en monto</span>
                  <b className="tabular-nums" style={{ color: BLUE_DARK }}>{formatMoney(goalAmount)}</b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2" style={{ background: GREEN }} />Comisiones</span>
                  <b className="tabular-nums" style={{ color: BLUE_DARK }}>{formatMoney(d.cards.commissionMonth)}</b>
                </div>
              </div>
            </>
          )}
        </SectionShell>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ProjectBars
          title="Lotes vendidos por mes"
          subtitle={`Ventas cerradas por mes (ultimos ${monthsFilter} meses)`}
          rows={activity.slice(-Number(monthsFilter)).map((row) => ({ name: monthLabel(row.month), value: row.ventas, color: row.current ? BLUE : '#7FB2F7' }))}
          valueFormatter={(v) => String(v)}
          sorted={false}
          minMax={4}
          className="h-full min-h-[320px]"
          control={
            <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: BORDER }}>
              {([
                ['3', '3 meses'],
                ['6', '6 meses'],
              ] as const).map(([opt, label]) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMonthsFilter(opt)}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase leading-none transition-colors ${monthsFilter === opt ? 'text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                  style={monthsFilter === opt ? { background: BLUE } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <SectionShell title="Proyectos más rentables" subtitle="Ventas por proyecto de este agente">
          {projects.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={projects} dataKey="amount" nameKey="name" cx="50%" cy="46%" outerRadius="68%" label={false}>
                    {projects.map((project, index) => <Cell key={project.projectId} fill={['#1769D1', '#1C7C54', '#F59E0B', '#B6253C', '#6A4C93', '#0EA5A9'][index % 6]} />)}
                  </Pie>
                  <Tooltip formatter={(value: number | string) => [formatMoney(Number(value)), 'Ventas']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="py-12 text-center text-sm text-slate-400">Sin ventas por proyecto.</p>}
        </SectionShell>
        <SectionShell title={`Mis leads (${leads.length})`}>
          <ul className="divide-y text-sm" style={{ borderColor: BORDER }}>
            {pageLeads.map((c: any) => {
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
            {!leads.length && <li className="py-6 text-center text-slate-400">Sin leads asignados</li>}
          </ul>
          {leads.length > LEADS_PER_PAGE && (
            <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: BORDER }}>
              <button
                type="button"
                disabled={pageIndex === 0}
                onClick={() => setLeadsPage((p) => Math.max(0, p - 1))}
                className="rounded px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{ background: '#EEF2F6', color: BLUE_DARK, opacity: pageIndex === 0 ? 0.4 : 1 }}
              >
                ‹ Anterior
              </button>
              <span className="text-[11px] tabular-nums" style={{ color: MUTED }}>{pageIndex + 1} / {totalLeadPages}</span>
              <button
                type="button"
                disabled={pageIndex >= totalLeadPages - 1}
                onClick={() => setLeadsPage((p) => Math.min(totalLeadPages - 1, p + 1))}
                className="rounded px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{ background: '#EEF2F6', color: BLUE_DARK, opacity: pageIndex >= totalLeadPages - 1 ? 0.4 : 1 }}
              >
                Siguiente ›
              </button>
            </div>
          )}
        </SectionShell>
      </div>
    </div>
  );
}
