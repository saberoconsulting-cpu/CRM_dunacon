'use client';
import Layout from '@/components/Layout';
import { Toaster, toast } from '@/components/ui';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

const DEF = { companyName: 'Inmobiliaria S.A.C.', color: '#1877F2', alertCuotas: '1', approvalNotify: '1' };

export default function SettingsPage() {
  const [me, setMe] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...DEF });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<any>('/auth/profile').then(setMe).catch(() => {}); }, []);
  useEffect(() => { api.get<any>('/settings').then((s: any) => { if (s) setForm({ ...DEF, ...s }); }).catch(() => {}); }, []);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      await api.put('/settings', {
        companyName: form.companyName,
        color: form.color,
        alertCuotas: form.alertCuotas,
        approvalNotify: form.approvalNotify,
      });
      toast('Preferencias guardadas');
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  }

  const bool = (v: string | boolean) => String(v) === '1' || v === true;

  return (
    <Layout title="Configuración">
      <Toaster />
      <div className="w-full space-y-5">
        <div className="w-full space-y-5">
          <div className="card">
            <h3 className="font-semibold mb-1">Datos de la empresa</h3>
            <p className="text-sm mb-4" style={{ color: '#6B7280' }}>Identidad mostrada en la aplicación.</p>
            <div className="space-y-4">
              <div><label className="label">Nombre de la inmobiliaria</label><input className="input" value={form.companyName || ''} onChange={(e) => set('companyName', e.target.value)} /></div>
              <div><label className="label">Correo de administración</label><input type="email" className="input" readOnly value={me?.email || ''} /></div>
              <div className="flex items-center gap-3">
                <label className="label mb-0">Color de marca</label>
                <input type="color" value={form.color || '#1877F2'} className="h-10 w-16 border rounded" onChange={(e) => set('color', e.target.value)} />
                <span className="text-sm" style={{ color: '#6B7280' }}>{form.color || '#1877F2'}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2">Operación diaria</h3>
            <p className="text-sm mb-4" style={{ color: '#6B7280' }}>Activa/desactiva avisos internos.</p>
            <label className="flex items-center justify-between py-3 border-b" style={{ borderColor: '#F0F1F3' }}>
              <span className="text-sm">Alertas de cuotas vencidas</span>
              <input type="checkbox" checked={bool(form.alertCuotas)} onChange={(e) => set('alertCuotas', e.target.checked ? '1' : '0')} />
            </label>
            <label className="flex items-center justify-between py-3 border-b" style={{ borderColor: '#F0F1F3' }}>
              <span className="text-sm">Notificar al registrar un pago</span>
              <input type="checkbox" checked={bool(form.notifyPayment === undefined ? true : form.notifyPayment)} onChange={(e) => set('notifyPayment', e.target.checked ? '1' : '0')} />
            </label>
            <label className="flex items-center justify-between py-3" style={{ borderColor: '#F0F1F3' }}>
              <div>
                <span className="text-sm block">Aprobar ventas al admin (notificar)</span>
                <span className="text-xs" style={{ color: '#6B7280' }}>Cuando un agente registra una venta, el Admin recibe aviso para habilitarla.</span>
              </div>
              <input type="checkbox" checked={bool(form.approvalNotify)} onChange={(e) => set('approvalNotify', e.target.checked ? '1' : '0')} />
            </label>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Entorno</h3>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-canvas p-3"><span className="label">Usuario</span>{me?.name || '—'} ({me?.role || ''})</div>
              <div className="rounded-lg bg-canvas p-3"><span className="label">Base de datos</span>crm_inmobiliario · PostgreSQL</div>
              <div className="rounded-lg bg-canvas p-3"><span className="label">Archivos</span>Cloudinary / uploads</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}