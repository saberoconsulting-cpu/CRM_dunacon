'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Toaster, toast, Field, EmptyState } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/types';

type Q = {
  id: number; lotId: number; lotCode?: string | null; clientName: string;
  finalPriceUsd: number; cuotaInicialUsd: number; totalCuotas: number;
  paymentMethod: string; exchangeRate: number; createdAt: string;
};

const fmtUsd = (n: number) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function QuotesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  // Cliente
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  // Lote / precio
  const [lotId, setLotId] = useState(0);
  const [pricePerM2Usd, setPricePerM2Usd] = useState(0);
  const [lotPriceUsd, setLotPriceUsd] = useState(0);
  const [bonoDescuento, setBonoDescuento] = useState(0);
  const [bonoEspecial, setBonoEspecial] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(3.75);
  // Financiamiento
  const [paymentMethod, setPaymentMethod] = useState<'contado' | 'credito'>('credito');
  const [cuotaInicialUsd, setCuotaInicialUsd] = useState(0);
  const [totalCuotas, setTotalCuotas] = useState(60);
  const [interestType, setInterestType] = useState<'sin_intereses' | 'tea'>('sin_intereses');
  const [tea, setTea] = useState(10);

  function load() {
    const q = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    api.get<Q[]>(`/quotes${q}`).then((d) => setRows(d || [])).catch((e: any) => toast(e.message, 'err')).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [lockedProjectId]);
  useEffect(() => {
    api.get<any[]>('/lots?limit=500').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
  }, []);

  // Si venimos desde "Cotizar" en la ficha de un lote (?lotId=X), abrir el
  // formulario ya con ese lote elegido.
  useEffect(() => {
    const pre = searchParams?.get('lotId');
    if (pre) { selectLot(Number(pre)); setOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, lots.length]);

  const availableLots = lockedProjectId ? lots.filter((l: any) => Number(l.projectId) === Number(lockedProjectId)) : lots;
  const selectedLot = lots.find((l: any) => l.id === lotId);

  function selectLot(id: number) {
    setLotId(id);
    const lot = lots.find((l: any) => l.id === id);
    if (lot) {
      const perM2 = Number(lot.areaM2) > 0 ? Number(lot.salePrice || lot.price || 0) / Number(lot.areaM2) / exchangeRate : 0;
      setPricePerM2Usd(Number(perM2.toFixed(2)));
      setLotPriceUsd(Number((perM2 * Number(lot.areaM2)).toFixed(2)));
    }
  }

  // Recalcular el precio del lote cuando cambia el precio por m² a mano.
  function onPricePerM2Change(v: number) {
    setPricePerM2Usd(v);
    if (selectedLot) setLotPriceUsd(Number((v * Number(selectedLot.areaM2)).toFixed(2)));
  }

  const finalPrice = Math.max(0, lotPriceUsd - bonoDescuento - bonoEspecial);
  const saldoAFinanciar = paymentMethod === 'credito' ? Math.max(0, finalPrice - cuotaInicialUsd) : 0;

  function resetForm() {
    setClientName(''); setClientEmail(''); setClientPhone('');
    setLotId(0); setPricePerM2Usd(0); setLotPriceUsd(0); setBonoDescuento(0); setBonoEspecial(0);
    setPaymentMethod('credito'); setCuotaInicialUsd(0); setTotalCuotas(60); setInterestType('sin_intereses'); setTea(10);
  }

  async function guardar() {
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientName.trim()) return toast('Ingresa el nombre del cliente', 'err');
    if (!lotPriceUsd) return toast('Ingresa el precio del lote', 'err');
    try {
      await api.post('/quotes', {
        projectId: lockedProjectId || selectedLot?.projectId || 1,
        lotId, clientName, clientEmail: clientEmail || undefined, clientPhone: clientPhone || undefined,
        pricePerM2Usd, lotPriceUsd, bonoDescuentoUsd: bonoDescuento || undefined, bonoEspecialUsd: bonoEspecial || undefined,
        paymentMethod,
        cuotaInicialUsd: paymentMethod === 'credito' ? cuotaInicialUsd || undefined : undefined,
        totalCuotas: paymentMethod === 'credito' ? totalCuotas || undefined : undefined,
        interestType: paymentMethod === 'credito' ? interestType : undefined,
        tea: paymentMethod === 'credito' && interestType === 'tea' ? tea : undefined,
        exchangeRate,
      });
      toast('Cotización generada'); setOpen(false); resetForm(); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Cotizaciones de lotes</h3>
              <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>Calcula el financiamiento y genera la Cotización y el cronograma de pagos para el cliente.</p>
            </div>
            <button className="btn-primary" onClick={() => setOpen(true)}>Nueva cotización</button>
          </div>
        </div>
        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <EmptyState text="Aún no hay cotizaciones generadas." />
            : (
            <table className="table-base" style={{ width: '100%', minWidth: 760 }}>
              <thead><tr>
                <th className="th-base">Id</th><th className="th-base">Lote</th><th className="th-base">Cliente</th>
                <th className="th-base">Precio final</th><th className="th-base">Cuota inicial</th>
                <th className="th-base">Cuotas</th><th className="th-base">Fecha</th><th className="th-base"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((q) => (
                  <tr key={q.id}>
                    <td className="td-base text-slate-400">Q{q.id}</td>
                    <td className="td-base font-medium">{q.lotCode || `Lote ${q.lotId}`}</td>
                    <td className="td-base">{q.clientName}</td>
                    <td className="td-base font-medium">{fmtUsd(q.finalPriceUsd)}</td>
                    <td className="td-base">{q.paymentMethod === 'credito' ? fmtUsd(q.cuotaInicialUsd) : 'Contado'}</td>
                    <td className="td-base">{q.totalCuotas || '—'}</td>
                    <td className="td-base">{formatDate(q.createdAt)}</td>
                    <td className="td-base whitespace-nowrap">
                      <button className="btn-secondary !h-7 !px-2 text-xs mr-1" onClick={() => window.open(`/projects/${lockedProjectId}/quotes/${q.id}/cotizacion`, '_blank')}>Ver Cotización</button>
                      {q.paymentMethod === 'credito' && (
                        <button className="btn-secondary !h-7 !px-2 text-xs" onClick={() => window.open(`/projects/${lockedProjectId}/quotes/${q.id}/financiamiento`, '_blank')}>Ver Financiamiento</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <h3 className="font-semibold mb-1" style={{ fontSize: 17 }}>Calcula tu financiamiento</h3>
            <p className="text-xs text-slate-500 mb-4">Esta calculadora trabaja en US$, con un tipo de cambio manual para mostrar el equivalente en soles.</p>

            <h4 className="font-semibold text-sm text-slate-700 mb-2">Cliente</h4>
            <Field label="Nombres *"><input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correo electrónico"><input className="input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} /></Field>
              <Field label="Teléfono"><input className="input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} /></Field>
            </div>

            <h4 className="font-semibold text-sm text-slate-700 mb-2 mt-4">Lote</h4>
            <Field label="Lote elegido *">
              <select className="input" value={lotId} onChange={(e) => selectLot(Number(e.target.value))}>
                <option value={0}>Selecciona…</option>
                {availableLots.map((l: any) => <option key={l.id} value={l.id}>Lote {l.code}{l.blockAddress ? ` — ${l.blockAddress}` : ''}</option>)}
              </select>
            </Field>
            {selectedLot && (
              <div className="grid grid-cols-2 gap-3 text-sm mb-2">
                <div><span className="label">Dirección</span><p>{selectedLot.blockAddress || '—'}</p></div>
                <div><span className="label">Área (m²)</span><p>{selectedLot.areaM2}</p></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio US$/m²"><input type="number" className="input" value={pricePerM2Usd || ''} onChange={(e) => onPricePerM2Change(Number(e.target.value))} /></Field>
              <Field label="Precio del lote US$"><input type="number" className="input" value={lotPriceUsd || ''} onChange={(e) => setLotPriceUsd(Number(e.target.value))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bono de descuento US$"><input type="number" className="input" value={bonoDescuento || ''} onChange={(e) => setBonoDescuento(Number(e.target.value))} /></Field>
              <Field label="Bono especial US$"><input type="number" className="input" value={bonoEspecial || ''} onChange={(e) => setBonoEspecial(Number(e.target.value))} /></Field>
            </div>
            <div className="rounded-lg bg-canvas p-3 text-sm flex justify-between mb-3">
              <span className="text-slate-600">Precio final:</span><b>{fmtUsd(finalPrice)}</b>
            </div>

            <h4 className="font-semibold text-sm text-slate-700 mb-2">Forma de pago</h4>
            <Field label="Forma de pago">
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </Field>
            {paymentMethod === 'credito' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cuota inicial US$"><input type="number" className="input" value={cuotaInicialUsd || ''} onChange={(e) => setCuotaInicialUsd(Number(e.target.value))} /></Field>
                  <Field label="Plazo (meses)"><input type="number" className="input" value={totalCuotas || ''} onChange={(e) => setTotalCuotas(Number(e.target.value))} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Interés">
                    <select className="input" value={interestType} onChange={(e) => setInterestType(e.target.value as any)}>
                      <option value="sin_intereses">Sin intereses</option>
                      <option value="tea">Con TEA</option>
                    </select>
                  </Field>
                  {interestType === 'tea' && <Field label="TEA (%)"><input type="number" className="input" value={tea || ''} onChange={(e) => setTea(Number(e.target.value))} /></Field>}
                </div>
                <div className="rounded-lg bg-canvas p-3 text-sm flex justify-between mb-3">
                  <span className="text-slate-600">Saldo a financiar:</span><b>{fmtUsd(saldoAFinanciar)}</b>
                </div>
              </>
            )}

            <Field label="Tipo de cambio (S/ por US$)"><input type="number" step="0.01" className="input" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} /></Field>

            <div className="flex justify-end gap-2 pt-4 mt-1 border-t">
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardar}>Generar cotización</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
