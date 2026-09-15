'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { Toaster, toast } from '@/components/ui/ui';
import InteractivePlan from '@/components/features/plan/InteractivePlan';
import PlanEditor from '@/components/features/plan/PlanEditor';
import LotDetailModal from '@/components/features/lots/LotDetailModal';
import { api, getSessionUser } from '@/lib/api';
import { Block, Lot } from '@/lib/types';

const PROJECT_PLAN_STATUS_COLOR = {
  disponible: '#1F9D63',
  reservado: '#F2B94B',
  adelanto: '#F2B94B',
  primera_cuota: '#F2B94B',
  vendido: '#DC2626',
};
const PROJECT_PLAN_STATUS_LABEL = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  adelanto: 'Reservado',
  primera_cuota: 'Reservado',
  vendido: 'Vendido',
};
const PROJECT_PLAN_LEGEND = [
  { label: 'Disponible', color: PROJECT_PLAN_STATUS_COLOR.disponible },
  { label: 'Reservado', color: PROJECT_PLAN_STATUS_COLOR.reservado },
  { label: 'Vendido', color: PROJECT_PLAN_STATUS_COLOR.vendido },
];

function ProjectPlanLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {PROJECT_PLAN_LEGEND.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export default function PlanEditorPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [blockFilter, setBlockFilter] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);

  const loadPlan = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<any>(`/plan/project/${id}`).catch(() => ({ plan: null, blocks: [], lots: [] }));
      setPlan(data.plan || null);
      setBlocks(data.blocks || []);
      setLots(data.lots || []);
    } catch (e: any) {
      toast(e.message, 'err');
    }
  }, [id]);

  useEffect(() => {
    const user = getSessionUser();
    setCanEdit(!!user && (user.role === 'admin' || user.role === 'superadmin'));
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  if (editing) {
    return (
      <Layout title="Editor de plano">
        <Toaster />
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn-neutral h-9 text-sm" onClick={() => { setEditing(false); loadPlan(); }}>
            Ver plano
          </button>
        </div>
        {canEdit === null ? <p className="text-slate-400">Comprobando permisos...</p>
          : canEdit === false ? <p className="text-slate-400">Solo el equipo administrativo edita planos.</p>
          : <PlanEditor projectId={id} />}
      </Layout>
    );
  }

  return (
    <Layout title="Plano">
      <Toaster />
      <LotDetailModal lotId={selectedLot} onClose={() => setSelectedLot(null)} onChanged={loadPlan} compact />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Plano interactivo</h2>
            <ProjectPlanLegend />
          </div>
          {canEdit && (
            <button type="button" className="btn-primary h-9 text-sm" onClick={() => setEditing(true)}>
              Editar plano
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border bg-white" style={{ height: 'calc(100vh - 190px)', minHeight: 560, borderColor: '#E5E7EB' }}>
          <InteractivePlan
            imageUrl={plan?.imageUrl}
            blocks={blocks}
            lots={lots}
            imageW={plan?.imageWidth || 1000}
            imageH={plan?.imageHeight || 800}
            highlightBlockId={blockFilter}
            onBlockClick={(block) => setBlockFilter(blockFilter === block.id ? null : block.id)}
            onLotClick={(lot) => setSelectedLot(lot.id)}
            selectedLotId={selectedLot}
            lotStatusColors={PROJECT_PLAN_STATUS_COLOR}
            lotStatusLabels={PROJECT_PLAN_STATUS_LABEL}
            tooltipMode="status"
          />
        </div>
      </div>
    </Layout>
  );
}
