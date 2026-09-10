'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveSession } from '@/lib/api';
import { AuthSession } from '@/lib/types';
import { FiMail, FiLock, FiArrowRight } from 'react-icons/fi';

const BRAND = '#1a56db';

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
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Error de inicio de sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* ===== Columna izquierda (≈55%) — marca ===== */}
      <div
        className="hidden min-[860px]:flex w-[55%] relative flex-col justify-between overflow-hidden p-10 lg:p-16"
        style={{ background: 'linear-gradient(160deg, #ffffff 0%, #EEF3FC 100%)' }}
      >
        {/* Foto de fondo muy sutil (arquitectura) */}
        <img
          src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1800&auto=format&fit=crop"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.05 }}
        />
        {/* Cuadrícula sutil azul (planos arquitectónicos) */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(26,86,219,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(26,86,219,0.06) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        {/* Logo grande + centrado + frase espaciada */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <img
            src="/logo/dunacon.png"
            alt="Dunacon"
            className="h-auto w-80 max-w-full lg:w-[28rem]"
          />
          <div className="mt-10 max-w-lg">
            <p
              className="font-serif italic"
              style={{ fontSize: 16, letterSpacing: 1.2, color: '#1a56db' }}
            >
              Dunacon CRM
            </p>
            <h1
              className="mt-5 font-serif"
              style={{
                fontSize: 'clamp(30px, 4vw, 44px)',
                fontWeight: 600,
                lineHeight: 1.35,
                letterSpacing: '-0.01em',
                color: '#0B2F6E',
              }}
            >
              La precisión de un plano,
              <br />
              la elegancia de tu gestión.
            </h1>
            <p
              className="mt-7"
              style={{ fontSize: 16, lineHeight: 1.9, color: '#4B5563' }}
            >
              El CRM inmobiliario que une planos, clientes, ventas y finanzas en un solo
              lugar. Construye con orden, decide con certeza.
            </p>
          </div>
        </div>

        <div className="relative z-10 text-center" style={{ fontSize: 12.5, color: '#9AA1AB' }}>
          © {new Date().getFullYear()} Dunacon · Todos los derechos reservados
        </div>
      </div>
{/* ===== Columna derecha (≈45%) — formulario ===== */}
      <div
        className="w-full min-[860px]:w-[45%] flex items-center justify-center overflow-y-auto px-4 py-8 sm:px-10"
        style={{ background: 'linear-gradient(160deg, #0B2F6E 0%, #1a56db 100%)' }}
      >
        <div className="w-full max-w-sm">
          {/* Logo visible en móvil (la izquierda se oculta <860px) — sobre chip blanco para que resalte */}
          <div className="min-[860px]:hidden flex justify-center mb-8">
            <div className="rounded-2xl bg-white px-6 py-4 shadow-lg">
              <img src="/logo/dunacon.png" alt="Dunacon" className="mx-auto h-10 w-auto" />
            </div>
          </div>

          <h1
            className="font-serif text-center min-[860px]:text-left"
            style={{ fontSize: 'clamp(26px, 7vw, 30px)', fontWeight: 600, color: '#ffffff' }}
          >
            Bienvenido de nuevo
          </h1>
          <p
            className="mt-1.5 mb-7 text-center min-[860px]:text-left"
            style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}
          >
            Ingresa tus credenciales para continuar.
          </p>

          <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <form onSubmit={onSubmit} className="space-y-5">
              {error && (
                <div
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ background: '#E7F0FE', borderColor: '#A9C9FB', color: '#1259C4' }}
                >
                  {error}
                </div>
              )}

              <div>
                <label className="block font-medium mb-1.5" style={{ fontSize: 12.5, color: '#4B5563' }}>
                  Correo electrónico
                </label>
                <div className="relative">
                  <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 16 }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="tu@correo.com"
                    className="w-full rounded-lg border border-[#D1D5DB] bg-white pl-10 pr-3 text-sm outline-none transition-all duration-200"
                    style={{ height: 46 }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = BRAND;
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(26,86,219,0.15)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#D1D5DB';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1.5" style={{ fontSize: 12.5, color: '#4B5563' }}>
                  Contraseña
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 16 }} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-[#D1D5DB] bg-white pl-10 pr-3 text-sm outline-none transition-all duration-200"
                    style={{ height: 46 }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = BRAND;
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(26,86,219,0.15)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#D1D5DB';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex items-center justify-center gap-2 rounded-lg text-white font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
                style={{ height: 46, background: BRAND, boxShadow: '0 4px 14px rgba(26,86,219,0.25)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1347b0')}
                onMouseLeave={(e) => (e.currentTarget.style.background = BRAND)}
              >
                {loading ? 'Ingresando…' : 'Ingresar'}
                <FiArrowRight className="transition-transform duration-200 group-hover:translate-x-1" style={{ fontSize: 16 }} />
              </button>
            </form>
          </div>

          {/* Usuarios demo — discreto al pie */}
          <p className="text-center mt-8" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
            Usuarios demo · Contraseña Admin123!
            <br />
            admin@crm.com · gerente@crm.com · maria@crm.com
          </p>
        </div>
      </div>
    </div>
  );
}
