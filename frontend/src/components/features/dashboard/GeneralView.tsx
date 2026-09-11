'use client';
import { ReactNode, useEffect, useState } from 'react';
import { FiArrowDown, FiCreditCard, FiLayers, FiTag, FiUsers } from 'react-icons/fi';
import { api } from '@/lib/api';
import { FormattedDashboard } from '@/lib/dboard';
import { BRAND, LOT_STATUS_COLOR, formatMoney } from '@/lib/types';

const LOT_LABEL: Record<string, string> = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  adelanto: 'Con adelanto',
  primera_cuota: 'Primera cuota',
  vendido: 'Vendido',
};

const PAGE_SIZE = 10;
const ACTIVITY_PAGE_SIZE = 6;

function money(value: unknown): string {
  return formatMoney(Number(value || 0));
}

function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size));
}

function clampPage(page: number, total: number, size: number) {
  return Math.min(page, pageCount(total, size) - 1);
}

function Pagination({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  const pages = pageCount(total, size);
  if (total <= size) return null;

  const current = clampPage(page, total, size);
  const visible: number[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - (current + 1)) <= 1) visible.push(i);
  }

  const items: ReactNode[] = [];
  visible.forEach((n, index) => {
    if (index > 0 && n > visible[index - 1] + 1) {
      items.push(<span key={`gap-${n}`} className="px-1 text-slate-400">...</span>);
    }
    items.push(
      <button
        key={n}
        type="button"
        onClick={() => onPage(n - 1)}
        className={`${n === current + 1 ? 'text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} h-7 min-w-7 rounded-md border px-2 text-xs font-semibold`}
        style={{ borderColor: BRAND.border, background: n === current + 1 ? BRAND.blue : undefined }}
      >
        {n}
      </button>,
    );
  });

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BRAND.border }}>
      <span className="text-xs text-slate-500">
        {current * size + 1}-{Math.min(total, (current + 1) * size)} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="h-7 rounded-md border bg-white px-2 text-xs font-semibold text-slate-600 disabled:opacity-40" style={{ borderColor: BRAND.border }} disabled={current <= 0} onClick={() => onPage(current - 1)}>Anterior</button>
        {items}
        <button type="button" className="h-7 rounded-md border bg-white px-2 text-xs font-semibold text-slate-600 disabled:opacity-40" style={{ borderColor: BRAND.border }} disabled={current >= pages - 1} onClick={() => onPage(current + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

function SectionShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="border bg-white p-4" style={{ borderColor: BRAND.border, borderRadius: 6, boxShadow: '0 1px 2px rgba(16,24,40,.035)' }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: BRAND.ink }}>{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <span className="mt-1 h-5 w-1" style={{ background: BRAND.blue }} />
      </div>
      {children}
    </section>
  );
}

function CommercialSummary({ d }: { d: FormattedDashboard }) {
  const secondary = [
    { label: 'Ventas del mes', value: d.cards.salesMonth, icon: <FiTag />, tone: BRAND.ink },
    { label: 'Lotes vendidos del periodo', value: d.lots.vendido || 0, icon: <FiLayers />, tone: BRAND.blue },
    { label: 'Leads del mes', value: d.cards.leadsMonth, icon: <FiUsers />, tone: BRAND.muted },
    { label: 'Egresos', value: money(d.cards.expense), icon: <FiArrowDown />, tone: BRAND.blueDark },
  ];

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <div className="relative overflow-hidden border bg-white p-5" style={{ borderColor: BRAND.border, borderRadius: 6 }}>
        <div className="absolute left-0 top-0 h-full w-1.5" style={{ background: BRAND.blue }} />
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Resumen comercial</p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Ingresos</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight" style={{ color: BRAND.ink }}>{money(d.cards.income)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Utilidad</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight" style={{ color: BRAND.blueDark }}>{money(d.cards.profit)}</p>
          </div>
        </div>
        <div className="mt-5 h-px" style={{ background: BRAND.border }} />
        <p className="mt-3 text-xs leading-5 text-slate-500">Datos consolidados desde ventas, pagos, lotes y transacciones registradas.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {secondary.map((item) => (
          <div key={item.label} className="border bg-white p-4" style={{ borderColor: BRAND.border, borderRadius: 6 }}>
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: `${item.tone}12`, color: item.tone }}>{item.icon}</span>
              <span className="h-1.5 w-1.5" style={{ background: BRAND.blue }} />
            </div>
            <p className="mt-4 text-[11px] font-medium text-slate-500">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: BRAND.ink }}>{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectSales({ rows }: { rows: { name: string; value: number }[] }) {
  const ranked = [...rows].filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const max = ranked[0]?.value || 0;

  return (
    <SectionShell title="Proyectos con mayor venta" subtitle="Ranking visual por monto vendido">
      {ranked.length ? (
        <div className="space-y-3">
          {ranked.map((row, index) => {
            const width = max ? Math.max(7, (row.value / max) * 100) : 0;
            return (
              <div key={`${row.name}-${index}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3">
                <span className="text-xs font-semibold tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold" style={{ color: BRAND.ink }}>{row.name}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden" style={{ borderRadius: 2, background: BRAND.mutedLight }}>
                    <div className="h-full" style={{ width: `${width}%`, background: BRAND.blue }} />
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums" style={{ color: BRAND.ink }}>{money(row.value)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-slate-400">Aun no hay ventas registradas en ningun proyecto.</p>
      )}
    </SectionShell>
  );
}

function LotStatusDistribution({ data }: { data: { key: string; label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <SectionShell title="Estados de lotes" subtitle={`Total registrado: ${total}`}>
      {total ? (
        <>
          <div className="flex h-4 overflow-hidden" style={{ borderRadius: 2, background: BRAND.mutedLight }}>
            {data.map((item) => (
              <div key={item.key} title={`${item.label}: ${item.value}`} style={{ width: `${(item.value / total) * 100}%`, background: item.color }} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {data.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0" style={{ borderColor: BRAND.border }}>
                <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0" style={{ background: item.color }} />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-semibold tabular-nums" style={{ color: BRAND.ink }}>{item.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-400">Aun no hay lotes registrados.</p>
      )}
    </SectionShell>
  );
}

function LeadOrigins({ rows }: { rows: { channel: string; total: number }[] }) {
  const total = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);

  return (
    <SectionShell title="Origen de leads" subtitle="Lectura secundaria">
      {total ? (
        <div className="space-y-2">
          {rows.map((item) => {
            const color = BRAND.blue;
            return (
              <div key={item.channel} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium capitalize text-slate-600">{item.channel}</span>
                  </div>
                  <div className="mt-1 h-1.5" style={{ borderRadius: 2, background: BRAND.mutedLight }}>
                    <div className="h-full" style={{ width: `${(Number(item.total || 0) / total) * 100}%`, background: color, borderRadius: 2 }} />
                  </div>
                </div>
                <span className="text-right text-sm font-semibold tabular-nums">{item.total}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">Sin leads registrados.</p>
      )}
    </SectionShell>
  );
}

function AgentRanking({ rows }: { rows: FormattedDashboard['agentRanking'] }) {
  const [page, setPage] = useState(0);
  const safePage = clampPage(page, rows.length, PAGE_SIZE);
  const frame = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <SectionShell title="Ranking de agentes" subtitle="Ventas, monto y comision">
      <div className="overflow-x-auto">
        <table className="table-base" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            <col style={{ width: 92 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 132 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="th-base">#</th>
              <th className="th-base">Agente</th>
              <th className="th-base text-right">Ventas</th>
              <th className="th-base text-right">Monto</th>
              <th className="th-base text-right">Comision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {frame.map((agent, index) => {
              const rank = safePage * PAGE_SIZE + index + 1;
              return (
                <tr key={`${agent.agentId}-${rank}`} className={rank === 1 ? 'bg-softblue' : undefined}>
                  <td className="td-base font-semibold" style={{ color: BRAND.blue }}>{rank}</td>
                  <td className="td-base truncate font-medium">{agent.agentName || '-'}</td>
                  <td className="td-base text-right tabular-nums">{agent.salesCount}</td>
                  <td className="td-base text-right font-semibold tabular-nums">{money(agent.salesAmount)}</td>
                  <td className="td-base text-right tabular-nums">{money(agent.commission)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td className="td-base text-slate-400" colSpan={5}>Sin ventas todavia</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
    </SectionShell>
  );
}

function ActivityList({ title, icon, rows, page, setPage, getLabel, getAmount, empty }: {
  title: string;
  icon: ReactNode;
  rows: any[];
  page: number;
  setPage: (page: number) => void;
  getLabel: (row: any) => string;
  getAmount: (row: any) => number;
  empty: string;
}) {
  const safePage = clampPage(page, rows.length, ACTIVITY_PAGE_SIZE);
  const frame = rows.slice(safePage * ACTIVITY_PAGE_SIZE, safePage * ACTIVITY_PAGE_SIZE + ACTIVITY_PAGE_SIZE);

  return (
    <section className="border bg-white p-4" style={{ borderColor: BRAND.border, borderRadius: 6 }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-softblue" style={{ color: BRAND.blue }}>{icon}</span>
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: BRAND.ink }}>{title}</h3>
      </div>
      {frame.length ? (
        <ul className="divide-y divide-slate-100">
          {frame.map((row, index) => (
            <li key={`${title}-${safePage}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className="truncate text-sm capitalize text-slate-600">{getLabel(row)}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: BRAND.ink }}>{money(getAmount(row))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">{empty}</p>
      )}
      <Pagination page={safePage} total={rows.length} size={ACTIVITY_PAGE_SIZE} onPage={setPage} />
    </section>
  );
}

export default function GeneralView({ d, compact = false }: { d: FormattedDashboard | null; compact?: boolean }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [salesPage, setSalesPage] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(0);

  useEffect(() => {
    api.get<any[]>('/projects')
      .then((data) => setProjects(Array.isArray(data) ? data : ((data as any)?.items || [])))
      .catch(() => {});
  }, []);

  if (!d) return <p className="text-slate-400">Sin datos</p>;

  const projectName = (id: number) => projects.find((project) => Number(project.id) === Number(id))?.name || `Proyecto ${id}`;
  const salesByProject = (d.salesByProject || []).map((row) => ({ name: projectName(row.projectId), value: Number(row.amount || 0) }));
  const lotStatusData = Object.keys(LOT_LABEL).map((key) => ({
    key,
    label: LOT_LABEL[key],
    value: Number(d.lots[key] || 0),
    color: LOT_STATUS_COLOR[key as keyof typeof LOT_STATUS_COLOR],
  }));

  if (compact) {
    return <CommercialSummary d={d} />;
  }

  return (
    <div className="space-y-5">
      <CommercialSummary d={d} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <ProjectSales rows={salesByProject} />
        <div className="grid gap-5">
          <LotStatusDistribution data={lotStatusData} />
          <LeadOrigins rows={d.leadsByChannel || []} />
        </div>
      </div>

      <AgentRanking rows={d.agentRanking || []} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ActivityList
          title="Ultimas ventas"
          icon={<FiTag />}
          rows={d.recentSales || []}
          page={salesPage}
          setPage={setSalesPage}
          getLabel={(sale) => sale.fromPayment ? (sale.type ? `Pago - ${sale.type}` : 'Pago confirmado') : 'Venta'}
          getAmount={(sale) => Number(sale.salePrice || 0)}
          empty="Sin ventas"
        />
        <ActivityList
          title="Ultimos pagos"
          icon={<FiCreditCard />}
          rows={d.recentPayments || []}
          page={paymentsPage}
          setPage={setPaymentsPage}
          getLabel={(payment) => String(payment.type || 'Pago')}
          getAmount={(payment) => Number(payment.amount || 0)}
          empty="Sin pagos"
        />
      </div>
    </div>
  );
}
