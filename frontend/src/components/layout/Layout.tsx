'use client';
import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { clearSession, getSessionUser, api, getToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { User, UserRole } from '@/lib/types';

// Navegación lateral según rol
import {
  FiHome, FiMap, FiLayers, FiUsers, FiTag, FiCreditCard, FiPieChart,
  FiVolume2, FiAward, FiUserCheck, FiSettings, FiUser, FiLogOut, FiBell, FiArrowLeft, FiCheckCircle,
  FiFileText,
} from 'react-icons/fi';

interface NavItem { href: string; label: string; icon: JSX.Element; roles: UserRole[] }

// Navegación global: siempre visible, no depende de un proyecto en contexto.
const GLOBAL_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: <FiHome />, roles: ['superadmin', 'admin', 'agent'] },
  { href: '/projects', label: 'Proyectos', icon: <FiMap />, roles: ['superadmin', 'admin', 'agent'] },
];

// Entidades globales (no pertenecen a un proyecto puntual) — quedan siempre al final del menú.
const GLOBAL_END_NAV: NavItem[] = [
  { href: '/agents', label: 'Agentes', icon: <FiAward />, roles: ['superadmin', 'admin'] },
  { href: '/users', label: 'Usuarios', icon: <FiUserCheck />, roles: ['superadmin', 'admin'] },
  { href: '/settings', label: 'Configuración', icon: <FiSettings />, roles: ['superadmin'] },
];

// Módulos que viven dentro del contexto de un proyecto.
function projectNav(projectId: number): NavItem[] {
  return [
    { href: `/projects/${projectId}`, label: 'DashBoard', icon: <FiMap />, roles: ['superadmin', 'admin', 'agent'] },
    { href: `/projects/${projectId}/lots`, label: 'Lotización', icon: <FiLayers />, roles: ['superadmin', 'admin', 'agent'] },
    { href: `/projects/${projectId}/quotes`, label: 'Cotizaciones Lotes', icon: <FiFileText />, roles: ['superadmin', 'admin', 'agent'] },
    { href: `/projects/${projectId}/clients`, label: 'Clientes y leads', icon: <FiUsers />, roles: ['superadmin', 'admin', 'agent'] },
    { href: `/projects/${projectId}/sales`, label: 'Ventas', icon: <FiTag />, roles: ['superadmin', 'admin', 'agent'] },
    { href: `/projects/${projectId}/payments`, label: 'Pago de Lotes', icon: <FiCreditCard />, roles: ['superadmin', 'admin', 'agent'] },
    { href: `/projects/${projectId}/finances`, label: 'Finanzas', icon: <FiPieChart />, roles: ['superadmin', 'admin'] },
    { href: `/projects/${projectId}/campaigns`, label: 'Campañas', icon: <FiVolume2 />, roles: ['superadmin', 'admin'] },
  ];
}

export default function Layout({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingApp, setPendingApp] = useState<{ count: number; rows: any[] }>({ count: 0, rows: [] });
  const [bellOpen, setBellOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<{ id: number; name: string } | null>(null);

  const projectMatch = pathname.match(/^\/projects\/(\d+)/);
  const activeProjectId = projectMatch ? Number(projectMatch[1]) : null;

  useEffect(() => {
    const u = getSessionUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (!activeProjectId) { setActiveProject(null); return; }
    api.get<any>(`/projects/${activeProjectId}`)
      .then((p) => setActiveProject({ id: activeProjectId, name: p?.name || `Proyecto ${activeProjectId}` }))
      .catch(() => setActiveProject({ id: activeProjectId, name: `Proyecto ${activeProjectId}` }));
  }, [activeProjectId]);

  useEffect(() => {
    if (!user) return;
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    const refresh = async () => {
      if (!isAdmin) return;
      try {
        const data: any = await api.get<any>('/sales/pending');
        const rows: any[] = Array.isArray(data) ? data : (data?.items || []);
        const pending = rows.filter((r: any) => (r.approvalStatus || r.status || 'pendiente') === 'pendiente');
        setPendingApp({ count: pending.length, rows: pending });
      } catch { /* sin endpoint / sesión */ }
    };
    refresh();
    const token = getToken();
    if (token && isAdmin) {
      const s = getSocket(token);
      const evs = ['sale.created', 'lot.updated', 'approval.created'];
      const listener = () => { refresh(); setBellOpen(false); };
      evs.forEach((ev) => s.on(ev as any, listener as any));
      return () => { evs.forEach((ev) => s.off(ev as any, listener as any)); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const canManage = user.role === 'superadmin' || user.role === 'admin';
  const primaryNav = activeProjectId ? projectNav(activeProjectId) : GLOBAL_NAV;
  const visible = primaryNav.filter((n) => n.roles.includes(user.role));
  // Agentes/Usuarios/Configuración son globales: dentro de un proyecto no se muestran,
  // porque navegar a ellos sacaría al usuario del contexto del proyecto sin avisar.
  const visibleEnd = activeProjectId ? [] : GLOBAL_END_NAV.filter((n) => n.roles.includes(user.role));
  const LOGO = user.name?.trim()?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U';

  function isActive(h: string) {
    // El "Resumen" del proyecto (/projects/5) es prefijo de sus propios submódulos
    // (/projects/5/clients, /projects/5/sales...), así que ese exige match exacto.
    if (/^\/projects\/\d+$/.test(h)) return pathname === h;
    return pathname === h || pathname.startsWith(h + '/');
  }
  function logout() { clearSession(); router.push('/login'); }
  function goToPendingSale(s: any) {
    setBellOpen(false);
    router.push(s?.projectId ? `/projects/${s.projectId}/sales` : '/projects');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Sidebar blanca, ítem activo azul */}
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static inset-y-0 left-0 w-60 bg-white border-r z-30 flex flex-col transition-transform`} style={{ borderColor: '#E5E7EB', width: 240 }}>
        {activeProject ? (
          <button onClick={() => { router.push('/projects'); setOpen(false); }}
            className="h-14 px-5 flex items-center gap-2.5 border-b shrink-0 text-left hover:bg-[#F9FAFB]" style={{ borderColor: '#F0F1F3' }}>
            <span className="text-[#6B7280]" style={{ fontSize: 16 }}><FiArrowLeft /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold tracking-wide" style={{ color: '#9AA1AB' }}>VOLVER A PROYECTOS</span>
              <span className="block font-semibold text-[14px] truncate" style={{ color: '#171717' }}>{activeProject.name}</span>
            </span>
          </button>
        ) : (
          <div className="h-14 px-5 flex items-center gap-2.5 border-b shrink-0" style={{ borderColor: '#F0F1F3' }}>
            <img src="/logo/dunacon.png" alt="Dunacon" className="h-11 w-auto" />
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {visible.map((n) => {
              const active = isActive(n.href);
              return (
                <li key={n.href}>
                  <button onClick={() => { router.push(n.href); setOpen(false); }}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 text-sm transition-colors ${active ? 'bg-[#1877F2] text-white' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
                    style={{ height: 38, fontWeight: active ? 600 : 500 }}>
                    <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
                    {n.href.endsWith('/sales') && pendingApp.count > 0 && (
                      <span className="ml-auto grid place-items-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold text-white" style={{ background: '#1877F2' }}>{pendingApp.count}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {visibleEnd.length > 0 && (
            <>
              <div className="mt-4 mb-1.5 px-3 pt-3 border-t" style={{ borderColor: '#F0F1F3' }}>
                <p className="text-[11px] font-semibold tracking-wide" style={{ color: '#9AA1AB' }}>GENERAL</p>
              </div>
              <ul className="space-y-0.5">
                {visibleEnd.map((n) => {
                  const active = isActive(n.href);
                  return (
                    <li key={n.href}>
                      <button onClick={() => { router.push(n.href); setOpen(false); }}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 text-sm transition-colors ${active ? 'bg-[#1877F2] text-white' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
                        style={{ height: 38, fontWeight: active ? 600 : 500 }}>
                        <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {!activeProjectId && (
            <>
              <div className="mt-4 mb-1.5 px-3 pt-3 border-t" style={{ borderColor: '#F0F1F3' }}>
                <p className="text-[11px] font-semibold tracking-wide" style={{ color: '#9AA1AB' }}>CUENTA</p>
              </div>
              <button onClick={() => { router.push('/profile'); setOpen(false); }}
                className={`w-full flex items-center gap-3 rounded-lg px-3 text-sm ${isActive('/profile') ? 'bg-[#1877F2] text-white' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
                style={{ height: 38, fontWeight: 500 }}>
                <span style={{ fontSize: 16 }}><FiUser /></span>Perfil
              </button>
            </>
          )}
        </nav>

        <div className="px-3 py-3 border-t space-y-2 shrink-0" style={{ borderColor: '#F0F1F3' }}>
          <div className="flex items-center gap-2.5 px-2">
            <span className="w-8 h-8 rounded-full bg-softblue text-[#1877F2] font-semibold grid place-items-center" style={{ fontSize: 13 }}>{LOGO}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold truncate" style={{ color: '#171717' }}>{user.name}</span>
              <span className="block text-[11px] capitalize" style={{ color: '#6B7280' }}>{user.role === 'agent' ? 'Agente comercial' : user.role}</span>
            </span>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-3 rounded-lg px-3 text-sm text-[#6B7280] hover:text-[#1877F2] hover:bg-[#F3F4F6]" style={{ height: 34 }}>
            <span style={{ fontSize: 16 }}><FiLogOut /></span>Cerrar sesión
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/25 z-20 md:hidden" onClick={() => setOpen(false)} />}

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b px-5 flex items-center gap-4 sticky top-0 z-10 shrink-0" style={{ borderColor: '#E5E7EB' }}>
          <button className="md:hidden text-[#374151]" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            {title && <h1 className="truncate" style={{ fontSize: 17 }}>{title}</h1>}
          </div>
          {canManage && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-softblue text-[#1877F2] px-3" style={{ height: 28, fontSize: 12 }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#1877F2]" /> Acceso de administración
            </span>
          )}
          <div className="relative">
            <button className="relative p-1 text-[#6B7280] hover:text-[#171717]" aria-label="Notificaciones" onClick={() => setBellOpen((v) => !v)}>
              <FiBell style={{ fontSize: 17 }} />
              {(canManage && pendingApp.count > 0) && (
                <span className="absolute -right-0.5 -top-0.5 grid place-items-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold text-white" style={{ background: '#1877F2' }}>{pendingApp.count}</span>
              )}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 top-11 z-50 w-80 max-h-[70vh] overflow-auto rounded-2xl bg-white shadow-2xl border" style={{ borderColor: '#EDEEF0' }}>
                  <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: '#F0F1F3' }}>
                    <span className="text-sm font-semibold">Separaciones por aprobar</span>
                    <span className="badge bg-softblue text-[#1877F2]">{pendingApp.count}</span>
                  </div>
                  <div className="divide-y">
                    {pendingApp.rows.slice(0, 15).map((s) => (
                      <button key={s.id} onClick={() => goToPendingSale(s)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between gap-3">
                        <span className="text-sm">Lote {s.lotCode ? s.lotCode : `#${s.lotId ?? '—'}`}</span>
                        <span className="badge bg-amber-50 text-amber-700 text-[11px]">Pendiente</span>
                      </button>
                    ))}
                  </div>
                  {pendingApp.rows.length === 0 && (
                    <p className="px-4 py-8 text-sm text-center text-slate-400 flex flex-col items-center gap-1.5">
                      <FiCheckCircle style={{ fontSize: 20 }} /> Sin separaciones pendientes
                    </p>
                  )}
                  {pendingApp.rows.length > 0 && (
                    <div className="px-3 py-2.5 border-t" style={{ borderColor: '#F0F1F3' }}>
                      <button className="btn-primary w-full justify-center" onClick={() => goToPendingSale(pendingApp.rows[0])}>Ir a revisar y aprobar</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-5 md:p-6 bg-canvas">{children}</main>
      </div>
    </div>
  );
}
