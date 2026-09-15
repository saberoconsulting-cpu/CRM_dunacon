'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

const fmtUsd = (n: number) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPen = (n: number) => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAY_LABEL: Record<string, string> = { contado: 'Contado', credito: 'Crédito' };

function pointsToAttr(points: any[]) {
  return (Array.isArray(points) ? points : []).map((point) => `${Number(point.x || 0)},${Number(point.y || 0)}`).join(' ');
}

function centroid(points: any[]) {
  const pts = Array.isArray(points) ? points : [];
  if (!pts.length) return { x: 0, y: 0 };
  return pts.reduce((acc, point) => ({ x: acc.x + Number(point.x || 0) / pts.length, y: acc.y + Number(point.y || 0) / pts.length }), { x: 0, y: 0 });
}

function QuotePlanPreview({ planData, quote, lot }: { planData: any; quote: any; lot: any }) {
  const plan = planData?.plan;
  const lots = Array.isArray(planData?.lots) ? planData.lots : [];
  const selected = lots.find((item: any) => Number(item.id) === Number(quote?.lotId)) || lot;
  const points = Array.isArray(selected?.points) ? selected.points : [];
  if (!plan?.imageUrl || !points.length) return null;

  const SVG_W = 1000;
  const SVG_H = 800;
  const imageW = Number(plan.imageWidth || 1000);
  const imageH = Number(plan.imageHeight || 800);
  const scale = Math.min(SVG_W / imageW, SVG_H / imageH);
  const imgW = imageW * scale;
  const imgH = imageH * scale;
  const imgX = (SVG_W - imgW) / 2;
  const imgY = (SVG_H - imgH) / 2;
  const c = centroid(points);

  return (
    <div className="px-6 pb-6">
      <h3 className="font-semibold text-sm text-slate-700 mb-2">Ubicacion en plano</h3>
      <div className="overflow-hidden rounded-xl border bg-slate-50" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-center justify-between border-b bg-white px-3 py-2" style={{ borderColor: '#E5E7EB' }}>
          <span className="text-xs font-semibold text-slate-600">Lote cotizado resaltado</span>
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: '#EAF3FF', color: '#1259C4' }}>Lote {selected?.code || lot?.code}</span>
        </div>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block w-full" role="img" aria-label="Plano del lote cotizado">
          <rect width={SVG_W} height={SVG_H} fill="#F8FAFC" />
          <image href={plan.imageUrl} x={imgX} y={imgY} width={imgW} height={imgH} preserveAspectRatio="xMidYMid meet" />
          {lots.filter((item: any) => Number(item.id) !== Number(quote?.lotId) && Array.isArray(item.points)).map((item: any) => (
            <polygon key={item.id} points={pointsToAttr(item.points)} fill="rgba(148,163,184,.20)" stroke="#94A3B8" strokeWidth={1.2} />
          ))}
          <polygon points={pointsToAttr(points)} fill="rgba(24,119,242,.74)" stroke="#063B87" strokeWidth={4} />
          <circle cx={c.x} cy={c.y} r={30} fill="rgba(255,255,255,.94)" stroke="#1877F2" strokeWidth={3} />
          <text x={c.x} y={c.y - 4} textAnchor="middle" fontSize={18} fontWeight={800} fill="#063B87">{selected?.code || lot?.code}</text>
          <text x={c.x} y={c.y + 20} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1259C4">{Number(selected?.areaM2 || lot?.areaM2 || 0).toLocaleString('es-PE')} m2</text>
        </svg>
      </div>
    </div>
  );
}

export default function CotizacionDocPage() {
  const { quoteId } = useParams<{ id: string; quoteId: string }>();
  const [data, setData] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<any>(`/quotes/${quoteId}`)
      .then((d) => {
        setData(d);
        api.get<any>(`/plan/project/${d.quote.projectId}`).then(setPlanData).catch(() => {});
      })
      .catch((e: any) => setError(e.message || 'No se pudo cargar la cotización'));
  }, [quoteId]);

  if (error) return <div className="p-10 text-center text-slate-400">{error}</div>;
  if (!data) return <div className="p-10 text-center text-slate-400">Cargando…</div>;

  const { quote, lot, block, project } = data;
  const rate = Number(quote.exchangeRate);
  const toPen = (usd: number) => usd * rate;
  const saldoAFinanciar = Math.max(0, Number(quote.finalPriceUsd) - Number(quote.cuotaInicialUsd));

  const resumen: [string, number][] = [
    ['Precio del lote', Number(quote.lotPriceUsd)],
    ['Bono de descuento', -Number(quote.bonoDescuentoUsd)],
    ['Bono especial', -Number(quote.bonoEspecialUsd)],
    ['Precio final', Number(quote.finalPriceUsd)],
  ];
  if (quote.paymentMethod === 'credito') {
    resumen.push(['Cuota inicial', -Number(quote.cuotaInicialUsd)]);
    resumen.push(['Saldo a financiar', saldoAFinanciar]);
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
              <div className="mt-3">
                <h3 className="font-semibold text-sm text-slate-700 mb-2">Financiamiento</h3>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Saldo a financiar</span>
                    <b className="mt-1 block text-sm">{fmtUsd(saldoAFinanciar)}</b>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Interes</span>
                    <b className="mt-1 block text-sm">{quote.interestType === 'tea' ? `TEA ${Number(quote.tea)}%` : 'Sin intereses'}</b>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Plazo</span>
                    <b className="mt-1 block text-sm">{Number(quote.totalCuotas || 0)} meses</b>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Valor cuota con intereses</span>
                    <b className="mt-1 block text-sm">{fmtUsd(Number(quote.valorCuotaUsd || 0))}</b>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Tipo cambio</span>
                    <b className="mt-1 block text-sm">S/ {rate.toFixed(4)}</b>
                  </div>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Tipo de cambio referencial: S/ {rate.toFixed(4)} por US$ 1.00</p>
          </div>

          <QuotePlanPreview planData={planData} quote={quote} lot={lot} />
        </div>
        <p className="text-xs text-center text-slate-400 mt-6">
          Este documento es de carácter informativo. Las condiciones están sujetas a variación.
          Cotización generada el {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </div>
  );
}
