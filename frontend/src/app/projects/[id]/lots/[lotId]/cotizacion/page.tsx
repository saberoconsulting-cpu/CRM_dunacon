'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatMoney, LOT_STATUS_LABEL, LotStatus } from '@/lib/types';

export default function CotizacionPage() {
  const { lotId } = useParams<{ id: string; lotId: string }>();
  const [data, setData] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<any>(`/lots/${lotId}`)
      .then((d) => { setData(d); return api.get<any>(`/projects/${d.lot.projectId}`); })
      .then(setProject)
      .catch((e: any) => setError(e.message || 'No se pudo cargar la cotización'));
  }, [lotId]);

  if (error) return <div className="p-10 text-center text-slate-400">{error}</div>;
  if (!data) return <div className="p-10 text-center text-slate-400">Cargando…</div>;

  const { lot, block } = data;
  const pricePerM2 = Number(lot.areaM2) > 0 ? Number(lot.price) / Number(lot.areaM2) : 0;

  const rows: [string, string][] = [
    ['Proyecto', project?.name || '—'],
    ['Dirección', block?.address || '—'],
    ['Tipo', lot.type || '—'],
    ['Estado', LOT_STATUS_LABEL[lot.status as LotStatus] || lot.status],
    ['Área', `${lot.areaM2} m²`],
    ['Precio por m²', pricePerM2 ? formatMoney(pricePerM2) : '—'],
    ['Precio de lista', formatMoney(lot.price)],
    ['Precio de venta', lot.salePrice ? formatMoney(lot.salePrice) : '—'],
    ['Precio final', lot.finalPrice ? formatMoney(lot.finalPrice) : '—'],
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-10 px-4 print:py-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <div className="w-full max-w-lg">
        <div className="no-print flex justify-end mb-4">
          <button onClick={() => window.print()} className="btn-primary">Imprimir / Guardar PDF</button>
        </div>
        <div className="border rounded-2xl overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
          <div className="px-6 py-5 text-white" style={{ background: 'linear-gradient(135deg,#1877F2 0%,#166FE0 100%)' }}>
            <p className="text-xs uppercase tracking-wider opacity-80">Cotización de lote</p>
            <h1 className="text-2xl font-bold mt-1">Lote {lot.code}</h1>
          </div>
          <div>
            {rows.map(([label, value], i) => (
              <div key={label} className="flex items-center justify-between px-6 py-3 text-sm" style={{ background: i % 2 ? '#FAFAFB' : '#fff', borderTop: i ? '1px solid #F0F1F3' : 'none' }}>
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-center text-slate-400 mt-6">
          Cotización generada el {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}.
          Precios referenciales, sujetos a confirmación.
        </p>
      </div>
    </div>
  );
}
