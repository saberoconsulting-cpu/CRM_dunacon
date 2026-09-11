'use client';
import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Toaster, toast } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { FormattedDashboard, AgentDashboard } from '@/lib/dboard';
import GeneralView from '@/components/features/dashboard/GeneralView';
import AgentView from '@/components/features/dashboard/AgentView';

export default function DashboardPage() {
  const [role, setRole] = useState('agent');
  const [gen, setGen] = useState<FormattedDashboard | null>(null);
  const [agi, setAgi] = useState<AgentDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('crm_user') || '{}');
    setRole(u.role || 'agent');
    const load = () => {
      if (u.role === 'agent') api.get<any>('/dashboards/agent').then(setAgi).catch((e)=>toast(e.message,'err')).finally(()=>setLoading(false));
      else api.get<any>('/dashboards/general').then((d)=>setGen(d)).catch((e)=>toast(e.message,'err')).finally(()=>setLoading(false));
    };
    load();
    const t = localStorage.getItem('crm_token');
    const reload = () => { if (u.role === 'agent') api.get<any>('/dashboards/agent').then(setAgi).catch(()=>{}); else api.get<any>('/dashboards/general').then(setGen).catch(()=>{}); };
    if (t) {
      const s = getSocket(t);
      ['lot.updated','payment.created','sale.created','expense.created'].forEach((ev) => s.on(ev, reload));
      return () => { s.removeAllListeners(); disconnectSocket(); };
    }
  }, []);

  return (
    <Layout title="Dashboard">
      <Toaster />
      {loading ? <p className="text-slate-400">Cargando datos del dashboard…</p> : role === 'agent' ? <AgentView d={agi} /> : <GeneralView d={gen} />}
    </Layout>
  );
}
