'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

const DUNACON_LOGO = '/logo/dunacon.png';

const fmtUsd = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = {
  month: number; saldoInicial: number; interes: number; amortizacionCapital: number;
  amortizacionExtraordinaria: number; cuota: number; saldoFinal: number;
};

type InitialPart = { numero: number; monto: number; fecha: string };

type InitialPlan = {
  cuotaInicialTotal: number;
  modo: 'contado' | 'partes';
  partes: number;
  montoPorParte: number;
  totalPagado: number;
  saldoAFinanciar: number;
  partesDetalle: InitialPart[];
};

/** Fecha ISO (YYYY-MM-DD) -> dd/mm/aaaa. */
function fmtDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

export default function FinanciamientoDocPage() {
  const { quoteId } = useParams<{ id: string; quoteId: string }>();
  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [initialPlan, setInitialPlan] = useState<InitialPlan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // El endpoint /schedule devuelve un OBJETO { rows, initialPlan, ... }, no un
    // arreglo: leerlo como Row[] dejaba la tabla de cuotas vacia.
    Promise.all([api.get<any>(`/quotes/${quoteId}`), api.get<any>(`/quotes/${quoteId}/schedule`)])
      .then(([d, sched]) => {
        setData(d);
        setRows(Array.isArray(sched?.rows) ? sched.rows : []);
        setInitialPlan(sched?.initialPlan || null);
      })
      .catch((e: any) => setError(e.message || 'No se pudo cargar el financiamiento'));
  }, [quoteId]);

  if (error) return <div className="p-10 text-center text-slate-400">{error}</div>;
  if (!data) return <div className="p-10 text-center text-slate-400">Cargando…</div>;

  const { quote, lot, block, project } = data;
  const start = new Date(quote.createdAt);
  const dueDate = (m: number) => {
    const d = new Date(start.getFullYear(), start.getMonth() + m, start.getDate());
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-white py-8 px-4 print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; font-family: Arial, Helvetica, sans-serif !important; font-size: 12px !important; }
          body * { font-family: Arial, Helvetica, sans-serif !important; }
          p, span, b, strong, table, th, td, div { font-size: 12px !important; line-height: 1.35 !important; }
          h1 { font-size: 22px !important; line-height: 1.2 !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>
      <div className="max-w-4xl mx-auto">
        <div className="no-print flex justify-end mb-4">
          <button onClick={() => window.print()} className="btn-primary">Imprimir / Guardar PDF</button>
        </div>
        <div className="overflow-hidden rounded-t-2xl border border-b-0 bg-white" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex items-center justify-between gap-4 border-b px-4 py-3" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex min-w-0 items-center gap-3">
              {project?.logoImageUrl && <img src={project.logoImageUrl} alt={project?.name || 'Proyecto'} className="h-11 w-auto max-w-40 object-contain" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{project?.name || 'Proyecto'}</p>
                <p className="text-xs text-slate-500">Documento comercial</p>
              </div>
            </div>
            <img src={DUNACON_LOGO} alt="Dunacon" className="h-10 w-auto max-w-32 shrink-0 object-contain" />
          </div>
          <div className="px-4 py-4 text-white" style={{ background: 'linear-gradient(135deg,#1877F2 0%,#166FE0 100%)' }}>
            <p className="text-xs uppercase tracking-wider opacity-80">Cronograma de pago</p>
            <h1 className="text-xl font-bold mt-1">{project?.name} — Lote {lot?.code}</h1>
          </div>
        </div>
        <div className="border-x border-b rounded-b-2xl p-4 text-sm grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" style={{ borderColor: '#E5E7EB' }}>
          <div><span className="text-slate-500 block text-xs">Cliente</span><b>{quote.clientName}</b></div>
          <div><span className="text-slate-500 block text-xs">Dirección del lote</span><b>{block?.address || '—'}</b></div>
          <div><span className="text-slate-500 block text-xs">Tipo de interés</span><b>{quote.interestType === 'tea' ? `TCEA ${Number(quote.tea)}%` : 'Sin intereses'}</b></div>
          <div><span className="text-slate-500 block text-xs">Plazo (meses)</span><b>{quote.totalCuotas}</b></div>
        </div>

        {initialPlan && initialPlan.partesDetalle.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-2xl border" style={{ borderColor: '#E5E7EB' }}>
            <div className="border-b px-4 py-2" style={{ borderColor: '#E5E7EB', background: '#F4F9FF' }}>
              <h3 className="text-sm font-bold" style={{ color: '#1259C4' }}>Cuota inicial (sin intereses)</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              <div><span className="block text-xs text-slate-500">Total</span><b>{fmtUsd(initialPlan.cuotaInicialTotal)}</b></div>
              <div><span className="block text-xs text-slate-500">Modalidad</span><b>{initialPlan.modo === 'partes' ? 'En partes' : 'Contado'}</b></div>
              <div><span className="block text-xs text-slate-500">N° de partes</span><b>{initialPlan.partes}</b></div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-1 font-semibold">Parte</th>
                  <th className="px-4 py-1 text-right font-semibold">Monto US$</th>
                  <th className="px-4 py-1 text-right font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#F0F1F3' }}>
                {initialPlan.partesDetalle.map((parte) => (
                  <tr key={parte.numero}>
                    <td className="px-4 py-1.5">{parte.numero} de {initialPlan.partes}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{fmtUsd(parte.monto)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{fmtDate(parte.fecha)}</td>
                  </tr>
                ))}
                <tr className="font-semibold" style={{ background: '#F8FAFC' }}>
                  <td className="px-4 py-1.5">Total inicial</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{fmtUsd(initialPlan.totalPagado)}</td>
                  <td className="px-4 py-1.5 text-right">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700">Financiamiento del saldo</h3>
          <p className="text-xs text-slate-500">
            Saldo a financiar <b>{fmtUsd(Number(quote.finalPriceUsd) - Number(quote.cuotaInicialUsd))}</b> —
            numeración del 1 al {rows.length || quote.totalCuotas}, independiente de la cuota inicial.
          </p>
        </div>
        <div className="overflow-x-auto border rounded-2xl" style={{ borderColor: '#E5E7EB' }}>
          <table className="w-full text-sm" style={{ minWidth: 780 }}>
            <thead>
              <tr style={{ background: '#0B2F6E' }} className="text-white">
                <th className="px-2 py-2 text-left">Mes</th>
                <th className="px-2 py-2 text-left">Fecha</th>
                <th className="px-2 py-2 text-right">Saldo inicial US$</th>
                <th className="px-2 py-2 text-right">Amort. capital US$</th>
                <th className="px-2 py-2 text-right">Amort. extraordinaria US$</th>
                <th className="px-2 py-2 text-right">Interés US$</th>
                <th className="px-2 py-2 text-right">Cuota mes US$</th>
                <th className="px-2 py-2 text-right">Saldo final US$</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#F0F1F3' }}>
              <tr className="bg-slate-50">
                <td className="px-2 py-1.5">0</td>
                <td className="px-2 py-1.5">{dueDate(0)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" colSpan={5}></td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtUsd(Number(quote.finalPriceUsd) - Number(quote.cuotaInicialUsd))}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td className="px-2 py-1.5">{r.month}</td>
                  <td className="px-2 py-1.5">{dueDate(r.month)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(r.saldoInicial)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(r.amortizacionCapital)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(r.amortizacionExtraordinaria)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(r.interes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtUsd(r.cuota)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(r.saldoFinal)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">Esta cotización es al contado, no tiene cronograma de cuotas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-center text-slate-400 mt-6">
          Cronograma referencial en dólares. Tipo de cambio de la cotización: S/ {Number(quote.exchangeRate).toFixed(4)} por US$ 1.00.
        </p>
      </div>
    </div>
  );
}
