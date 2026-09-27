'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FiEdit3, FiMap, FiTag } from 'react-icons/fi';
import Layout from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/ui';
import PlanEditor from '@/components/features/plan/PlanEditor';
import InteractivePlan from '@/components/features/plan/InteractivePlan';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import ProjectLotCatalogPanel from '@/components/features/plan/ProjectLotCatalogPanel';
import { api, getSessionUser } from '@/lib/api';
import { Block, Lot, formatMoney } from '@/lib/types';

export default function PlanEditorPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [can, setCan] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [streets, setStreets] = useState<Block[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);

  useEffect(() => {
    const u = getSessionUser();
    setCan(!!u && (u.role === 'admin' || u.role === 'superadmin'));
  }, []);

  async function loadPlan() {
    try {
      const data = await api.get<any>(`/plan/project/${id}`).catch(() => ({ plan: null, streets: [], blocks: [], lots: [] }));
      setPlan(data.plan || null);
      setStreets(data.streets || data.blocks || []);
      setLots(data.lots || []);
    } catch {
      /* el visor muestra su propio estado vacio */
    }
  }

  useEffect(() => {
    if (!id) return;
    loadPlan();
  }, [id]);

  const totalArea = lots.reduce((sum, lot) => sum + Number(lot.areaM2 || 0), 0);
  const totalValue = lots.reduce((sum, lot) => sum + Number(lot.salePrice ?? lot.price ?? 0), 0);

  const summary: { value: number; label: string; icon: React.ReactNode; tone: string }[] = [
    { value: streets.length, label: 'Calles', icon: <FiMap />, tone: '#1259C4' },
    { value: lots.length, label: 'Lotes', icon: <FiTag />, tone: '#0F8B5F' },
  ];
  return (
    <Layout title="Plano">
      <Toaster />
      <LotDetailModal
        lotId={selectedLot}
        onClose={() => setSelectedLot(null)}
        onChanged={loadPlan}
      />
      {can === null ? (
        <p className="text-slate-400">Comprobando permisos...</p>
      ) : editing ? (
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" className="btn-neutral h-9 text-sm" onClick={() => { setEditing(false); loadPlan(); }}>
              Volver al plano
            </button>
          </div>
          <PlanEditor projectId={id} />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-stretch">
          <div className="card min-w-0 overflow-hidden !p-0">
            <InteractivePlan
              imageUrl={plan?.imageUrl}
              blocks={streets}
              lots={lots}
              imageW={plan?.imageWidth || 1000}
              imageH={plan?.imageHeight || 800}
              onLotClick={(lot) => setSelectedLot(lot.id)}
              onBlockClick={(block) => setSelectedBlock(selectedBlock === block.id ? null : block.id)}
              highlightBlockId={selectedBlock}
              selectedLotId={selectedLot}
            />
          </div>

          <aside className="min-w-0 rounded-lg border bg-[#F8FAFC] p-3 xl:sticky xl:top-4 xl:h-[calc(100vh-120px)] xl:flex xl:flex-col" style={{ borderColor: '#E5E7EB' }}>
            {/* Boton Editar siempre visible arriba */}
            <div className="mb-3 shrink-0">
              {can ? (
                <button type="button" className="btn-primary w-full" onClick={() => setEditing(true)}>
                  <FiEdit3 /> Editar plano
                </button>
              ) : (
                <p className="rounded-lg border bg-white px-3 py-2 text-xs" style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>
                  Solo el equipo administrativo puede editar el plano.
                </p>
              )}
            </div>

            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#111827' }}>Reportes del proyecto</p>
                <p className="text-[11px]" style={{ color: '#6B7280' }}>Desliza para revisar cada vista</p>
              </div>
              <span className="rounded-full border bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">Data real</span>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {/* Resumen del plano */}
              <div className="rounded-lg border bg-white p-4" style={{ borderColor: '#E5E7EB' }}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: '#111827' }}>Resumen del plano</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {summary.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-lg border px-3 py-2" style={{ borderColor: '#E5E7EB' }}>
                      <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold" style={{ color: '#111827' }}>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: `${item.tone}12`, color: item.tone }}>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="mt-1 block text-center text-sm font-bold tabular-nums" style={{ color: item.tone }}>{item.value}</span>
                    </div>
                  ))}
                  <div className="min-w-0 rounded-lg border px-3 py-2" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block truncate text-[11px] font-semibold" style={{ color: '#111827' }}>Area total</span>
                    <span className="mt-1 block text-center text-sm font-bold tabular-nums" style={{ color: '#1259C4' }}>{totalArea.toLocaleString('es-PE')} m2</span>
                  </div>
                  <div className="min-w-0 rounded-lg border px-3 py-2" style={{ borderColor: '#E5E7EB' }}>
                    <span className="block truncate text-[11px] font-semibold" style={{ color: '#111827' }}>Valor de venta</span>
                    <span className="mt-1 block text-center text-sm font-bold tabular-nums" style={{ color: '#0F8B5F' }}>{formatMoney(totalValue)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-white p-4" style={{ borderColor: '#E5E7EB' }}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: '#111827' }}>Calles ({streets.length})</h3>
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
                  {streets.map((street, index) => (
                    <li key={street.id} className="rounded-lg border px-3 py-2" style={{ borderColor: selectedBlock === street.id ? '#1877F2' : '#E5E7EB', background: selectedBlock === street.id ? '#E7F0FE' : '#fff' }}>
                      <button type="button" onClick={() => setSelectedBlock(selectedBlock === street.id ? null : street.id)} className="flex w-full items-center gap-2 text-left">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#1259C4] text-xs font-bold text-white">{index + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{street.name}</span>
                          <span className="block text-[11px] text-slate-500">{lots.filter((lot) => Number(lot.streetId ?? lot.blockId) === Number(street.id)).length} lotes</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {streets.length === 0 && <li className="text-xs text-slate-400">Aun no hay calles dibujadas.</li>}
                </ul>
              </div>

              <ProjectLotCatalogPanel projectId={id} canManage={Boolean(can)} />

            </div>
          </aside>
        </div>
      )}
    </Layout>
  );
}
