'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

const fmtUsd = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = {
  month: number; saldoInicial: number; interes: number; amortizacionCapital: number;
  amortizacionExtraordinaria: number; cuota: number; saldoFinal: number;
};

export default function FinanciamientoDocPage() {
  const { quoteId } = useParams<{ id: string; quoteId: string }>();
  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get<any>(`/quotes/${quoteId}`), api.get<Row[]>(`/quotes/${quoteId}/schedule`)])
      .then(([d, sched]) => { setData(d); setRows(sched || []); })
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
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <div className="max-w-4xl mx-auto">
        <div className="no-print flex justify-end mb-4">
          <button onClick={() => window.print()} className="btn-primary">Imprimir / Guardar PDF</button>
        </div>
        <div className="px-4 py-4 rounded-t-2xl text-white" style={{ background: 'linear-gradient(135deg,#1877F2 0%,#166FE0 100%)' }}>
          <p className="text-xs uppercase tracking-wider opacity-80">Cronograma de pago</p>
          <h1 className="text-xl font-bold mt-1">{project?.name} — Lote {lot?.code}</h1>
        </div>
        <div className="border-x border-b rounded-b-2xl p-4 text-sm grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" style={{ borderColor: '#E5E7EB' }}>
          <div><span className="text-slate-500 block text-xs">Cliente</span><b>{quote.clientName}</b></div>
          <div><span className="text-slate-500 block text-xs">Dirección del lote</span><b>{block?.address || '—'}</b></div>
          <div><span className="text-slate-500 block text-xs">Tipo de interés</span><b>{quote.interestType === 'tea' ? `TCEA ${Number(quote.tea)}%` : 'Sin intereses'}</b></div>
          <div><span className="text-slate-500 block text-xs">Plazo (meses)</span><b>{quote.totalCuotas}</b></div>
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
