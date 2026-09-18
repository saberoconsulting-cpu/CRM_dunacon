'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiBarChart2, FiChevronDown, FiChevronRight, FiRefreshCw } from 'react-icons/fi';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import type { Currency } from '@/lib/currency';

type MonthRow = {
  month: number;
  name: string;
  saldoInicial: number;
  abonos: number;
  pagos: number;
  saldoFinal: number;
  movimientos: number;
};

type AnnualReport = {
  year: number;
  currency: string;
  availableYears: number[];
  openingBalance: number;
  months: MonthRow[];
  totals: { abonos: number; pagos: number; saldoInicial: number; saldoFinal: number; movimientos: number };
};

const REPORT_BLUE = '#0000FF';
const HEADER_BG = '#BFDBFE';
const SELECT_BG = '#FEF3C7';
const SELECT_BORDER = '#CBD5E1';
const CELL_BORDER = '1px solid #000';

function money(value: number, symbol: string) {
  return `${symbol} ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function short(value: number, symbol: string) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${symbol} ${(value / 1000000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1000) return `${symbol} ${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}k`;
  return `${symbol} ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
}

const cellHead = { border: CELL_BORDER, padding: 3, fontWeight: 'bold' as const, fontSize: 10, whiteSpace: 'nowrap' as const };
const cellBody = { border: CELL_BORDER, padding: 2, textAlign: 'right' as const, fontSize: 10, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const };

export default function AnnualReportPanel({ projectId, accountKey, currency, rate, refreshKey = 0 }: {
  projectId: number;
  accountKey?: string;
  currency: Currency;
  rate: number;
  refreshKey?: number;
}) {
  const [report, setReport] = useState<AnnualReport | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [chartCurrency, setChartCurrency] = useState<Currency>(currency);

  useEffect(() => { setChartCurrency(currency); }, [currency]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ projectId: String(projectId), accountKey: accountKey || 'GENERAL' });
      if (year) params.set('year', String(year));
      const data = await api.get<AnnualReport>(`/bank-accounts/annual-report?${params.toString()}`);
      setReport(data);
      if (!year && data?.year) setYear(data.year);
    } catch (error: any) {
      toast(error?.message || 'No se pudo generar el reporte anual', 'err');
    } finally {
      setLoading(false);
    }
  }, [projectId, year, accountKey]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // El reporte llega en la moneda de la cuenta; se convierte solo para pintar
  // el grafico en la moneda que el usuario elija en el selector.
  const factor = useMemo(() => {
    if (!report || chartCurrency === report.currency) return 1;
    const safeRate = rate > 0 ? rate : 1;
    if (report.currency === 'PEN' && chartCurrency === 'USD') return 1 / safeRate;
    if (report.currency === 'USD' && chartCurrency === 'PEN') return safeRate;
    return 1;
  }, [chartCurrency, report, rate]);

  const symbol = CURRENCY_SYMBOL[chartCurrency];
  const conv = (value: number) => Number(value || 0) * factor;

  const chartData = useMemo(() => (report?.months || []).map((month) => ({
    mes: month.name.slice(0, 3),
    abonos: Number(conv(month.abonos).toFixed(2)),
    pagos: Number(conv(month.pagos).toFixed(2)),
    saldo: Number(conv(month.saldoFinal).toFixed(2)),
  })), [report, factor, chartCurrency]);

  const years = report?.availableYears?.length ? report.availableYears : [year || new Date().getFullYear()];
  const totals = report?.totals;

  return (
    <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: '#E2E8F0' }}>
      <div className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: '#E2E8F0' }}>
        <h3 className="font-bold" style={{ color: REPORT_BLUE, margin: 0 }}>
          REPORTE RESUMEN MENSUAL ANO:{' '}
          <select
            className="ml-1 font-bold"
            style={{ backgroundColor: SELECT_BG, padding: '4px 10px', border: `1px solid ${SELECT_BORDER}`, borderRadius: 4 }}
            value={year ?? ''}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-neutral !h-9 !px-3 text-xs" onClick={load} disabled={loading}>
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button className="btn-outline !h-9 !px-3 text-xs" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? <FiChevronDown /> : <FiChevronRight />} Ver reportes por ano
          </button>
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto border-b p-4" style={{ borderColor: '#E2E8F0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: CELL_BORDER }}>
            <thead>
              <tr style={{ backgroundColor: HEADER_BG, color: '#000', borderBottom: '2px solid #000' }}>
                <th style={cellHead}>Mes</th>
                <th style={cellHead}>Saldo Inicial S/.</th>
                <th style={cellHead}>Abonos S/.</th>
                <th style={cellHead}>Pagos S/.</th>
                <th style={cellHead}>Saldo Final S/.</th>
              </tr>
            </thead>
            <tbody>
              {(report?.months || []).map((month) => (
                <tr key={month.month} style={{ backgroundColor: month.movimientos ? '#fff' : '#F8FAFC' }}>
                  <td style={{ border: CELL_BORDER, padding: 3, textAlign: 'left', fontSize: 10, whiteSpace: 'nowrap', color: '#0F172A' }}>{month.name}</td>
                  <td style={cellBody}>{money(month.saldoInicial, 'S/')}</td>
                  <td style={{ ...cellBody, color: month.abonos > 0 ? '#16A36A' : '#94A3B8' }}>
                    {month.abonos > 0 ? money(month.abonos, 'S/') : '-'}
                  </td>
                  <td style={{ ...cellBody, color: month.pagos > 0 ? '#DC2626' : '#94A3B8' }}>
                    {month.pagos > 0 ? money(month.pagos, 'S/') : '-'}
                  </td>
                  <td style={{ ...cellBody, fontWeight: 600 }}>{money(month.saldoFinal, 'S/')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: HEADER_BG, fontWeight: 'bold' }}>
                <td style={{ ...cellHead, textAlign: 'center' }}>Totales S/.</td>
                <td style={cellBody}>{money(report?.openingBalance || 0, 'S/')}</td>
                <td style={cellBody}>{money(totals?.abonos || 0, 'S/')}</td>
                <td style={cellBody}>{money(totals?.pagos || 0, 'S/')}</td>
                <td style={cellBody}>{money(totals?.saldoFinal || 0, 'S/')}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-xs" style={{ color: '#64748B' }}>
            El saldo inicial de cada mes se arrastra desde el cierre del mes anterior, y el saldo final refleja los abonos y pagos del periodo.
          </p>
        </div>
      )}

      <div style={{ backgroundColor: '#FFFFFF', padding: 15 }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-bold" style={{ color: '#1E293B' }}>
            <FiBarChart2 /> Comparativa Mensual: Abonos vs. Pagos
          </span>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: '#64748B' }}>Moneda:</label>
            <select
              className="input !h-8 !w-auto !px-2 text-xs"
              value={chartCurrency}
              onChange={(event) => setChartCurrency(event.target.value as Currency)}
            >
              <option value="PEN">Soles (S/.)</option>
              <option value="USD">Dolares ($)</option>
            </select>
          </div>
        </div>

        <div className="h-[350px] w-full">
          {loading ? (
            <p className="grid h-full place-items-center text-sm text-slate-400">Generando reporte...</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => short(Number(value), symbol)} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip formatter={(value: any, name: any) => [money(Number(value || 0), symbol), name]} />
                <Legend />
                <Bar dataKey="abonos" name="Abonos" fill="#1877F2" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="pagos" name="Pagos" fill="#DC2626" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Line type="monotone" dataKey="saldo" name="Saldo Final" stroke="#16A36A" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
