'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/ui';
import PlanEditor from '@/components/features/plan/PlanEditor';
import { getSessionUser } from '@/lib/api';

export default function PlanEditorPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [can, setCan] = useState<boolean | null>(null);
  useEffect(() => {
    const u = getSessionUser();
    setCan(!!u && (u.role === 'admin' || u.role === 'superadmin'));
  }, []);
  return (
    <Layout title="Editor de plano">
      <Toaster />
      {can === null ? <p className="text-slate-400">Comprobando permisos…</p>
        : can === false ? <p className="text-slate-400">Solo el equipo administrativo edita planos.</p>
        : <PlanEditor projectId={id} />}
    </Layout>
  );
}

