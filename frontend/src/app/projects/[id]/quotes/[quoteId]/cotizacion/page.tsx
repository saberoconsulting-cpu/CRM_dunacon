'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

const DUNACON_LOGO = '/logo/dunacon.png';

const fmtUsd = (n: number) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPen = (n: number) => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAY_LABEL: Record<string, string> = { contado: 'Contado', Crédito: 'Crédito', credito: 'Crédito' };

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

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
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block w-full plan-print-svg" role="img" aria-label="Plano del lote cotizado">
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
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [error, setError] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const d = await api.get<any>(`/quotes/${quoteId}`);
      setData(d);
      setRateInput(String(d.quote.exchangeRate || ''));
      api.get<any>(`/plan/project/${d.quote.projectId}`).then(setPlanData).catch(() => {});
      api.get<any>(`/quotes/${quoteId}/schedule`).then(setScheduleData).catch(() => {});
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar la cotización');
    }
  }

  async function updateRate() {
    const value = Number(rateInput);
    if (!value || value <= 0) return;
    setSaving(true);
    try {
      await api.patch(`/quotes/${quoteId}/recalculate`, { exchangeRate: value });
      await load();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, [quoteId]);

  if (error) return <div className="p-10 text-center text-slate-400">{error}</div>;
  if (!data) return <div className="p-10 text-center text-slate-400">Cargando…</div>;

  const { quote, lot, block, project } = data;
  const lotAddress = lot?.address || block?.address || lot?.streetAddress || lot?.blockAddress || '—';
  const rate = Number(quote.exchangeRate);
  const toPen = (usd: number) => usd * rate;
  const saldoAFinanciar = Math.max(0, Number(quote.finalPriceUsd) - Number(quote.cuotaInicialUsd));
  const grace = scheduleData || {};
  const initialPlan = grace.initialPlan;


  const resumen: [string, number][] = [
    ['Precio del lote', Number(quote.lotPriceUsd)],
    ['Bono de descuento', -Number(quote.bonoDescuentoUsd)],
    ['Bono especial', -Number(quote.bonoEspecialUsd)],
    ['Precio final', Number(quote.finalPriceUsd)],
  ];
  if (quote.paymentMethod === 'credito') {
    // La cuota inicial es un PAGO del cliente, no un descuento: va en positivo y
    // separada de los bonos (que si son negativos).
    resumen.push(['Cuota inicial', Number(quote.cuotaInicialUsd)]);
    resumen.push(['Saldo a financiar', saldoAFinanciar]);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-6 px-3 print:py-0 sm:py-10 sm:px-4">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 9mm 8mm;
        }
        @media print {
          .no-print { display: none !important; }
          html, body { width: auto !important; max-width: none !important; overflow: visible !important; }
          body { background: #fff !important; margin: 0 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 12px !important; line-height: 1.34 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { font-family: Arial, Helvetica, sans-serif !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          /* La hoja ocupa TODO el ancho util de la A4: sin desaprovechar el espacio. */
          .min-h-screen { min-height: 0 !important; padding: 0 !important; display: block !important; }
          .max-w-2xl { width: 100% !important; max-width: 100% !important; }
          /* Rejillas a todo el ancho, con separacion elegante y equilibrada. */
          .grid { gap: 10px !important; row-gap: 10px !important; }
          .gap-3 { gap: 10px !important; }
          .gap-5, .gap-6 { gap: 12px !important; }
          .px-3, .px-4, .px-6 { padding-left: 14px !important; padding-right: 14px !important; }
          .py-2, .py-3, .py-4, .py-5, .py-6 { padding-top: 7px !important; padding-bottom: 7px !important; }
          .pb-2, .pb-6 { padding-bottom: 10px !important; }
          .p-4, .p-3 { padding: 12px !important; }
          .mb-2 { margin-bottom: 8px !important; }
          .mt-1, .mt-2, .mt-3, .mt-4, .mt-5, .mt-6 { margin-top: 8px !important; }
          /* Tipografia legible: el texto ya NO queda diminuto al descargar el PDF. */
          p { font-size: 12px !important; line-height: 1.36 !important; margin: 2px 0 !important; }
          span, b, strong, label, div { line-height: 1.34 !important; }
          .text-xs { font-size: 11px !important; }
          .text-sm { font-size: 12.5px !important; }
          h1 { font-size: 22px !important; line-height: 1.18 !important; }
          h3 { font-size: 13px !important; line-height: 1.28 !important; margin-bottom: 7px !important; }
          table, th, td { font-size: 12px !important; }
          th, td { padding: 5px 8px !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          /* Financiamiento siempre en una sola fila al imprimir, a todo el ancho. */
          .finance-row { width: 100% !important; table-layout: fixed !important; page-break-inside: avoid !important; }
          .finance-row tr { page-break-inside: avoid !important; }
          .finance-cell { padding: 9px 10px !important; }
          .finance-label { font-size: 9.5px !important; letter-spacing: 0 !important; }
          .finance-value { font-size: 13px !important; }
          /* Tarjetas de resumen/gracias: legibles y sin aplastarse. */
          .rounded-lg { border-radius: 8px !important; }
          /* Controles solo de administrador: no se imprimen. */
          .rate-control { display: none !important; }
          /* Plano de ubicacion: aprovecha el ancho de la hoja sin desbordar. */
          .plan-print-svg { height: 200px !important; width: 100% !important; max-width: 100% !important; margin: 0 auto !important; object-fit: contain !important; }
          /* Evita partir bloques clave entre hojas. */
          .rounded-2xl { break-inside: auto; }
          h1, h3 { break-after: avoid; }
        }
        .finance-row { table-layout: fixed; }
        .finance-cell {
          width: 20%;
          border: 1px solid #E5E7EB;
          border-left-width: 0;
          background: #F8FAFC;
          padding: 12px;
          vertical-align: top;
          word-break: break-word;
        }
        .finance-cell:first-child { border-left-width: 1px; border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
        .finance-cell:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
        .finance-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748B; }
        .finance-value { display: block; margin-top: 4px; font-size: 14px; }
      `}</style>
      <div className="w-full max-w-2xl">
        <div className="no-print flex justify-end mb-4">
          <button onClick={() => window.print()} className="btn-primary">Imprimir / Guardar PDF</button>
        </div>
        <div className="border rounded-2xl overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex items-center justify-between gap-4 border-b bg-white px-4 py-3 sm:px-6" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex min-w-0 items-center gap-3">
              {project?.logoImageUrl && <img src={project.logoImageUrl} alt={project?.name || 'Proyecto'} className="h-11 w-auto max-w-36 object-contain" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{project?.name || 'Proyecto'}</p>
                <p className="text-xs text-slate-500">Documento comercial</p>
              </div>
            </div>
            <img src={DUNACON_LOGO} alt="Dunacon" className="h-10 w-auto max-w-32 shrink-0 object-contain" />
          </div>
          <div className="px-4 py-4 text-white sm:px-6 sm:py-5" style={{ background: 'linear-gradient(135deg,#1877F2 0%,#166FE0 100%)' }}>
            <p className="text-xs uppercase tracking-wider opacity-80">Cotización de lote</p>
            <h1 className="text-xl font-bold mt-1 sm:text-2xl">{project?.name} — Lote {lot?.code}</h1>
          </div>

          <div className="p-4 grid grid-cols-1 gap-5 sm:p-6 sm:grid-cols-2 sm:gap-6">
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
              <p className="text-sm"><b>Dirección del lote:</b> {lotAddress}</p>
              <p className="text-sm"><b>Área del lote (m²):</b> {lot?.areaM2}</p>
              <p className="text-sm"><b>Precio US$/m²:</b> {fmtUsd(quote.pricePerM2Usd)}</p>
            </div>
          </div>

          <div className="px-4 pb-2 sm:px-6">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">Resumen</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[340px] text-sm">
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
          </div>

          <div className="px-4 pb-6 sm:px-6">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">Forma de pago</h3>
            <p className="text-sm">{PAY_LABEL[quote.paymentMethod] || quote.paymentMethod}</p>
            {quote.paymentMethod === 'credito' && (
              <div className="mt-3">
                <h3 className="font-semibold text-sm text-slate-700 mb-2">Financiamiento</h3>
                {/* Una sola fila (tabla de 5 columnas): en pantalla y en el PDF los
                    indicadores de financiamiento quedan alineados horizontalmente,
                    sin partirse en varias filas al imprimir. */}
                <table className="finance-row w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <tbody>
                    <tr>
                      <td className="finance-cell">
                        <span className="finance-label">Saldo a financiar</span>
                        <b className="finance-value">{fmtUsd(saldoAFinanciar)}</b>
                      </td>
                      <td className="finance-cell">
                        <span className="finance-label">Interes</span>
                        <b className="finance-value">{quote.interestType === 'tea' ? `TEA ${Number(quote.tea)}%` : 'Sin intereses'}</b>
                      </td>
                      <td className="finance-cell">
                        <span className="finance-label">Plazo</span>
                        <b className="finance-value">{Number(quote.totalCuotas || 0)} meses</b>
                      </td>
                      <td className="finance-cell">
                        <span className="finance-label">Valor cuota con intereses</span>
                        <b className="finance-value">{fmtUsd(Number(quote.valorCuotaUsd || 0))}</b>
                      </td>
                      <td className="finance-cell">
                        <span className="finance-label">Tipo cambio</span>
                        <b className="finance-value">S/ {rate.toFixed(4)}</b>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Tipo de cambio referencial: S/ {rate.toFixed(4)} por US$ 1.00</p>

          <div className="px-0 pb-6 sm:px-0 rate-control">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">Actualizar tipo de cambio</h3>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">
                S/ por US$
                <input
                  type="number"
                  step="0.01"
                  className="input mt-1 !w-32"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                />
              </label>
              <button type="button" className="btn-primary !h-9 text-xs" disabled={saving} onClick={updateRate}>
                {saving ? 'Actualizando…' : 'Actualizar y recalcular'}
              </button>
            </div>
          </div>

          {quote.paymentMethod === 'credito' && grace.graceMonths > 0 && (
            <div className="px-4 pb-6 sm:px-6">
              <h3 className="font-semibold text-sm text-slate-700 mb-2">Periodo sin intereses</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Meses sin interes</span>
                  <b className="mt-1 block text-sm">{grace.graceMonths}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Cuota en gracia</span>
                  <b className="mt-1 block text-sm">{fmtUsd(grace.graceCuota || 0)}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Meses con interes</span>
                  <b className="mt-1 block text-sm">{grace.interestMonths}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Cuota con interes</span>
                  <b className="mt-1 block text-sm">{fmtUsd(grace.interestCuota || 0)}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Saldo al fin de gracia</span>
                  <b className="mt-1 block text-sm">{fmtUsd(grace.saldoAlFinGracia || 0)}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Total intereses</span>
                  <b className="mt-1 block text-sm">{fmtUsd(grace.totalInteres || 0)}</b>
                </div>
              </div>
            </div>
          )}

          <div className="px-4 pb-6 sm:px-6">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">Cuota inicial (sin intereses)</h3>
            {Number(quote.cuotaInicialUsd || 0) > 0 && initialPlan ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Total</span>
                    <b className="mt-1 block text-sm">{fmtUsd(initialPlan.cuotaInicialTotal)}</b>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Modalidad</span>
                    <b className="mt-1 block text-sm">{initialPlan.modo === 'partes' ? 'En partes' : 'Contado'}</b>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block text-[10px] font-bold uppercase text-slate-500">N° de partes</span>
                    <b className="mt-1 block text-sm">{initialPlan.partes}</b>
                  </div>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1">Parte</th>
                      <th className="py-1 text-right">Monto US$</th>
                      <th className="py-1 text-right">Monto S/</th>
                      <th className="py-1 text-right">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialPlan.partesDetalle.map((parte: any) => (
                      <tr key={parte.numero} className="border-t" style={{ borderColor: '#F0F1F3' }}>
                        <td className="py-1.5">{parte.numero} de {initialPlan.partes}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtUsd(parte.monto)}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtPen(toPen(parte.monto))}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtDate(parte.fecha)}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-semibold" style={{ borderColor: '#E5E7EB' }}>
                      <td className="py-1.5">Total inicial</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtUsd(initialPlan.totalPagado)}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtPen(toPen(initialPlan.totalPagado))}</td>
                      <td className="py-1.5 text-right tabular-nums">—</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-sm text-slate-500">Esta cotización no tiene cuota inicial registrada.</p>
            )}
          </div>

          {quote.paymentMethod === 'credito' && (
            <div className="px-4 pb-6 sm:px-6">
              <h3 className="font-semibold text-sm text-slate-700 mb-2">Financiamiento del saldo</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Saldo</span>
                  <b className="mt-1 block text-sm">{fmtUsd(saldoAFinanciar)}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">N° de cuotas</span>
                  <b className="mt-1 block text-sm">{quote.totalCuotas}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Cuota</span>
                  <b className="mt-1 block text-sm">{fmtUsd(grace.interestCuota || quote.valorCuotaUsd)}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#E5E7EB' }}>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Interés</span>
                  <b className="mt-1 block text-sm">{quote.interestType === 'tea' ? `TCEA ${Number(quote.tea)}%` : 'Sin intereses'}</b>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Las {quote.totalCuotas} cuotas del financiamiento se numeran del 1 al {quote.totalCuotas} y son independientes de la cuota inicial.
              </p>
            </div>
          )}

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
