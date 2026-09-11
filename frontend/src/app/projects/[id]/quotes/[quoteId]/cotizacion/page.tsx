'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

const fmtUsd = (n: number) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPen = (n: number) => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAY_LABEL: Record<string, string> = { contado: 'Contado', credito: 'Crédito' };

export default function CotizacionDocPage() {
  const { quoteId } = useParams<{ id: string; quoteId: string }>();
  const [data, setData] = useState<any>(null);
  const [planImageUrl, setPlanImageUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<any>(`/quotes/${quoteId}`)
      .then((d) => {
        setData(d);
        api.get<any>(`/plan/project/${d.quote.projectId}`).then((pl) => setPlanImageUrl(pl?.plan?.imageUrl || '')).catch(() => {});
      })
      .catch((e: any) => setError(e.message || 'No se pudo cargar la cotización'));
  }, [quoteId]);

  if (error) return <div className="p-10 text-center text-slate-400">{error}</div>;
  if (!data) return <div className="p-10 text-center text-slate-400">Cargando…</div>;

  const { quote, lot, block, project } = data;
  const rate = Number(quote.exchangeRate);
  const toPen = (usd: number) => usd * rate;

  const resumen: [string, number][] = [
    ['Precio del lote', Number(quote.lotPriceUsd)],
    ['Bono de descuento', -Number(quote.bonoDescuentoUsd)],
    ['Bono especial', -Number(quote.bonoEspecialUsd)],
    ['Precio final', Number(quote.finalPriceUsd)],
  ];
  if (quote.paymentMethod === 'credito') {
    resumen.push(['Cuota inicial', -Number(quote.cuotaInicialUsd)]);
    resumen.push(['Saldo a financiar', Number(quote.finalPriceUsd) - Number(quote.cuotaInicialUsd)]);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-10 px-4 print:py-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <div className="w-full max-w-2xl">
        <div className="no-print flex justify-end mb-4">
          <button onClick={() => window.print()} className="btn-primary">Imprimir / Guardar PDF</button>
        </div>
        <div className="border rounded-2xl overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
          <div className="px-6 py-5 text-white" style={{ background: 'linear-gradient(135deg,#1877F2 0%,#166FE0 100%)' }}>
            <p className="text-xs uppercase tracking-wider opacity-80">Cotización de lote</p>
            <h1 className="text-2xl font-bold mt-1">{project?.name} — Lote {lot?.code}</h1>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-sm text-slate-700 mb-2">Cliente</h3>
              <p className="text-sm"><b>Nombres:</b> {quote.clientName}</p>
              {quote.clientEmail && <p className="text-sm"><b>Correo:</b> {quote.clientEmail}</p>}
              {quote.clientPhone && <p className="text-sm"><b>Teléfono:</b> {quote.clientPhone}</p>}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-700 mb-2">Lote</h3>
              <p className="text-sm"><b>Proyecto:</b> {project?.name}</p>
              <p className="text-sm"><b>Lote elegido:</b> N.° {lot?.code}</p>
              <p className="text-sm"><b>Dirección del lote:</b> {block?.address || '—'}</p>
              <p className="text-sm"><b>Área del lote (m²):</b> {lot?.areaM2}</p>
              <p className="text-sm"><b>Precio US$/m²:</b> {fmtUsd(quote.pricePerM2Usd)}</p>
            </div>
          </div>

          <div className="px-6 pb-2">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">Resumen</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500">
                <th className="py-1">Concepto</th><th className="py-1 text-right">US$</th><th className="py-1 text-right">S/</th>
              </tr></thead>
              <tbody>
                {resumen.map(([label, usd]) => (
                  <tr key={label} className="border-t" style={{ borderColor: '#F0F1F3' }}>
                    <td className="py-1.5">{label}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtUsd(usd)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtPen(toPen(usd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 pb-6">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">Forma de pago</h3>
            <p className="text-sm">{PAY_LABEL[quote.paymentMethod] || quote.paymentMethod}</p>
            {quote.paymentMethod === 'credito' && (
              <p className="text-sm mt-1">
                En {quote.totalCuotas} cuotas de {fmtUsd(quote.valorCuotaUsd)}
                {quote.interestType === 'tea' ? ` — con TCEA = ${Number(quote.tea)}%` : ' — sin intereses'}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">Tipo de cambio referencial: S/ {rate.toFixed(4)} por US$ 1.00</p>
          </div>

          {planImageUrl && (
            <div className="px-6 pb-6">
              <h3 className="font-semibold text-sm text-slate-700 mb-2">Plano del proyecto</h3>
              <img src={planImageUrl} alt="Plano del proyecto" className="w-full rounded-lg border" style={{ borderColor: '#E5E7EB' }} />
            </div>
          )}
        </div>
        <p className="text-xs text-center text-slate-400 mt-6">
          Este documento es de carácter informativo. Las condiciones están sujetas a variación.
          Cotización generada el {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </div>
  );
}
