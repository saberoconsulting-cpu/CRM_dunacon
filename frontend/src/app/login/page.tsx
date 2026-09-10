'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveSession } from '@/lib/api';
import { AuthSession } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@crm.com');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = (await api.post('/auth/login', { email, password })) as AuthSession;
      saveSession(session);
      // Redirección automática según rol
      const role = session.user.role;
      void role;
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Error de inicio de sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <img src="/logo/dunacon.png" alt="Dunacon" className="mx-auto h-12 w-auto" />
          <h1 className="mt-3 font-semibold" style={{ fontSize: 20, color: '#171717' }}>Inmobiliaria CRM</h1>
          <p className="mt-1 text-sm" style={{ color: '#6B7280' }}>Control comercial y financiero</p>
        </div>

        <form onSubmit={onSubmit} className="card">
          <h2 className="font-semibold mb-6" style={{ fontSize: 17, color:'#171717' }}>Iniciar sesión</h2>

          {error && (
            <div className="mb-4 rounded-lg border px-3 py-2 text-sm" style={{ background:'#E7F0FE', borderColor:'#A9C9FB', color:'#1259C4' }}>
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="label">Correo electrónico</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="mb-6">
            <label className="label">Contraseña</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="text-center text-xs mt-6" style={{ color: '#9AA1AB' }}>
            Usuarios demo · Contraseña Admin123!
            <br /> admin@crm.com · gerente@crm.com · maria@crm.com
          </p>
        </form>
      </div>
    </div>
  );
}
