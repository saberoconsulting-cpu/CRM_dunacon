'use client';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  FiArrowLeft,
  FiAward,
  FiBell,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiCreditCard,
  FiHome,
  FiLayers,
  FiLogOut,
  FiMap,
  FiMenu,
  FiPieChart,
  FiSettings,
  FiTag,
  FiUser,
  FiUserCheck,
  FiUsers,
  FiVolume2,
} from 'react-icons/fi';
import { api, clearSession, getSessionUser, getToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { BRAND, User, UserRole } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: JSX.Element;
  roles: UserRole[];
  number?: number;
  soon?: boolean;
}

const GLOBAL_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: <FiHome />, roles: ['superadmin', 'admin', 'agent'] },
  { href: '/projects', label: 'Proyectos', icon: <FiMap />, roles: ['superadmin', 'admin', 'agent'] },
];

const GLOBAL_END_NAV: NavItem[] = [
  { href: '/agents', label: 'Agentes', icon: <FiAward />, roles: ['superadmin', 'admin'] },
  { href: '/users', label: 'Usuarios', icon: <FiUserCheck />, roles: ['superadmin', 'admin'] },
  { href: '/settings', label: 'Configuracion', icon: <FiSettings />, roles: ['superadmin'] },
];

function projectNav(projectId: number): NavItem[] {
  return [
    { number: 1, href: `/projects/${projectId}`, label: 'Inicio - DashBoard', icon: <FiHome />, roles: ['superadmin', 'admin', 'agent'] },
    { number: 2, href: `/projects/${projectId}/lots`, label: 'Lotizacion', icon: <FiLayers />, roles: ['superadmin', 'admin', 'agent'] },
    { number: 3, href: `/projects/${projectId}/plan-editor`, label: 'Plano', icon: <FiMap />, roles: ['superadmin', 'admin', 'agent'] },
    { number: 4, href: '#cotizaciones-lotes', label: 'Cotizaciones Lotes', icon: <FiTag />, roles: ['superadmin', 'admin', 'agent'], soon: true },
    { number: 5, href: `/projects/${projectId}/sales`, label: 'Venta', icon: <FiTag />, roles: ['superadmin', 'admin', 'agent'] },
    { number: 6, href: `/projects/${projectId}/payments`, label: 'Pago de Lotes', icon: <FiCreditCard />, roles: ['superadmin', 'admin', 'agent'] },
    { number: 7, href: `/projects/${projectId}/finances`, label: 'Finanzas', icon: <FiPieChart />, roles: ['superadmin', 'admin'] },
    { number: 8, href: `/projects/${projectId}/campaigns`, label: 'Campanas', icon: <FiVolume2 />, roles: ['superadmin', 'admin'] },
    { number: 9, href: `/projects/${projectId}/clients`, label: 'Clientes y Leads', icon: <FiUsers />, roles: ['superadmin', 'admin', 'agent'] },
    { number: 10, href: '#estado-cc-bancos', label: 'Estado CC - Bancos', icon: <FiCreditCard />, roles: ['superadmin', 'admin'], soon: true },
    { number: 11, href: '#ppto-obra', label: 'Ppto. Obra', icon: <FiLayers />, roles: ['superadmin', 'admin'], soon: true },
    { number: 12, href: '#estado-resultados', label: 'Estado Resultados', icon: <FiPieChart />, roles: ['superadmin', 'admin'], soon: true },
    { number: 13, href: '#flujo-caja', label: 'Flujo de Caja', icon: <FiPieChart />, roles: ['superadmin', 'admin'], soon: true },
  ];
}

function readSidebarPreference() {
  try {
    return localStorage.getItem('crm_sidebar_collapsed') === '1';
  } catch {
    return false;
  }
}

function writeSidebarPreference(collapsed: boolean) {
  try {
    localStorage.setItem('crm_sidebar_collapsed', collapsed ? '1' : '0');
  } catch {}
}

export default function Layout({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingApp, setPendingApp] = useState<{ count: number; rows: any[] }>({ count: 0, rows: [] });
  const [bellOpen, setBellOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<{ id: number; name: string } | null>(null);
  const [projectOptions, setProjectOptions] = useState<{ id: number; name: string }[]>([]);

  const activeProjectId = useMemo(() => {
    const match = pathname.match(/^\/projects\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [pathname]);

  useEffect(() => {
    setCollapsed(readSidebarPreference());
  }, []);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser) {
      router.push('/login');
      return;
    }
    setUser(sessionUser);
  }, [router]);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(null);
      return;
    }

    api.get<any>(`/projects/${activeProjectId}`)
      .then((project) => setActiveProject({ id: activeProjectId, name: project?.name || `Proyecto ${activeProjectId}` }))
      .catch(() => setActiveProject({ id: activeProjectId, name: `Proyecto ${activeProjectId}` }));
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) {
      setProjectOptions([]);
      return;
    }

    api.get<any[]>('/projects')
      .then((data) => {
        const rows = Array.isArray(data) ? data : ((data as any)?.items || []);
        setProjectOptions(rows.map((project: any) => ({ id: Number(project.id), name: project.name || `Proyecto ${project.id}` })));
      })
      .catch(() => setProjectOptions([]));
  }, [activeProjectId]);

  useEffect(() => {
    if (!user) return undefined;
    const canManage = user.role === 'superadmin' || user.role === 'admin';

    async function refreshApprovals() {
      if (!canManage) return;
      try {
        const data: any = await api.get<any>('/sales/pending');
        const rows: any[] = Array.isArray(data) ? data : (data?.items || []);
        const pending = rows.filter((row) => (row.approvalStatus || row.status || 'pendiente') === 'pendiente');
        setPendingApp({ count: pending.length, rows: pending });
      } catch {}
    }

    refreshApprovals();
    const token = getToken();
    if (!token || !canManage) return undefined;

    const socket = getSocket(token);
    const events = ['sale.created', 'lot.updated', 'approval.created'];
    const listener = () => { refreshApprovals(); setBellOpen(false); };
    events.forEach((event) => socket.on(event as any, listener as any));
    return () => { events.forEach((event) => socket.off(event as any, listener as any)); };
  }, [user]);

  if (!user) return null;

  const canManage = user.role === 'superadmin' || user.role === 'admin';
  const isProjectContext = activeProjectId != null;
  const visiblePrimary = (isProjectContext ? projectNav(activeProjectId) : GLOBAL_NAV).filter((item) => item.roles.includes(user.role));
  const visibleEnd = isProjectContext ? [] : GLOBAL_END_NAV.filter((item) => item.roles.includes(user.role));
  const showLabels = drawerOpen || !collapsed;
  const sidebarWidth = collapsed ? 76 : 284;
  const userInitial = user.name?.trim()?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U';

  function isActive(href: string) {
    if (href.startsWith('#')) return false;
    if (/^\/projects\/\d+$/.test(href)) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  function navigate(href: string) {
    if (href.startsWith('#')) return;
    router.push(href);
    setDrawerOpen(false);
  }

  function logout() {
    clearSession();
    router.push('/login');
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      writeSidebarPreference(next);
      return next;
    });
  }

  function goToPendingSale(sale: any) {
    setBellOpen(false);
    navigate(sale?.projectId ? `/projects/${sale.projectId}/sales` : '/projects');
  }

  function GlobalNavButton({ item }: { item: NavItem }) {
    const active = isActive(item.href);
    const badge = item.href.endsWith('/sales') && pendingApp.count > 0;

    return (
      <button
        type="button"
        onClick={() => navigate(item.href)}
        title={!showLabels ? item.label : undefined}
        className={`relative flex w-full items-center overflow-hidden rounded-md text-sm transition-colors ${showLabels ? 'gap-3 px-3' : 'justify-center px-0'} ${active ? 'text-white shadow-sm' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
        style={{ height: 38, fontWeight: active ? 600 : 500, background: active ? BRAND.blue : undefined }}
      >
        <span className="shrink-0" style={{ fontSize: 16 }}>{item.icon}</span>
        {showLabels && <span className="truncate">{item.label}</span>}
        {badge && (
          <span className={`${showLabels ? 'ml-auto' : 'absolute right-1 top-1'} grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white`} style={{ background: active ? BRAND.blueDark : BRAND.blue }}>
            {pendingApp.count}
          </span>
        )}
      </button>
    );
  }

  function ProjectNavButton({ item }: { item: NavItem }) {
    const active = isActive(item.href);
    const badge = item.href.endsWith('/sales') && pendingApp.count > 0;
    const disabled = !!item.soon;

    return (
      <button
        type="button"
        onClick={() => navigate(item.href)}
        disabled={disabled}
        title={!showLabels ? item.label : undefined}
        className={`group relative flex w-full items-center overflow-hidden border text-left text-sm transition-colors ${showLabels ? 'gap-2.5 px-3' : 'justify-center px-0'} ${disabled ? 'cursor-not-allowed bg-[#FAFAFA] text-slate-400' : active ? 'bg-softblue text-[#171717]' : 'bg-white text-[#171717] hover:bg-[#F8FAFC]'}`}
        style={{ height: 38, borderColor: active ? BRAND.blue : BRAND.border, borderRadius: 2, fontWeight: active ? 700 : 600 }}
      >
        {showLabels ? (
          <>
            <span className="shrink-0 tabular-nums">{item.number}-</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {disabled && <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-400">Proximamente</span>}
          </>
        ) : (
          <span className="shrink-0" style={{ fontSize: 16 }}>{item.icon}</span>
        )}
        {badge && !disabled && (
          <span className={`${showLabels ? 'ml-1' : 'absolute right-1 top-1'} grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white`} style={{ background: BRAND.blue }}>
            {pendingApp.count}
          </span>
        )}
      </button>
    );
  }

  const sidebar = (
    <aside
      className={`${drawerOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-30 flex w-[min(90vw,320px)] flex-col border-r bg-white shadow-2xl transition-[transform,width] duration-200 md:static md:translate-x-0 md:shadow-none`}
      style={{ borderColor: BRAND.border, width: drawerOpen ? undefined : sidebarWidth }}
    >
      {isProjectContext ? (
        <div className="shrink-0 border-b p-3" style={{ borderColor: BRAND.border }}>
          {showLabels ? (
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] border bg-white" style={{ borderColor: BRAND.ink, borderRadius: 2 }}>
              <button
                type="button"
                onClick={() => navigate('/projects')}
                className="flex items-center justify-center border-r px-2 text-sm font-bold"
                style={{ borderColor: BRAND.ink, color: BRAND.ink }}
              >
                Proyecto
              </button>
              <select
                className="min-w-0 bg-white px-2 text-sm font-bold outline-none"
                value={activeProjectId || ''}
                onChange={(event) => navigate(`/projects/${event.target.value}`)}
                style={{ color: BRAND.ink }}
              >
                {(projectOptions.length ? projectOptions : activeProject ? [activeProject] : []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <button type="button" onClick={toggleCollapsed} className="grid place-items-center border-l text-[#374151] md:grid" style={{ borderColor: BRAND.ink }}>
                <FiChevronLeft />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="grid h-9 w-full place-items-center border bg-white"
              style={{ borderColor: BRAND.ink, borderRadius: 2, color: BRAND.ink }}
              title="Expandir menu"
            >
              <FiChevronRight />
            </button>
          )}
        </div>
      ) : (
        <div className={`flex h-14 shrink-0 items-center border-b ${showLabels ? 'px-5' : 'justify-center px-0'}`} style={{ borderColor: BRAND.border }}>
          <img src="/logo/dunacon.png" alt="Dunacon" className={`${showLabels ? 'h-11 w-auto' : 'h-8 max-w-10 object-contain'}`} />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className={isProjectContext ? 'space-y-1' : 'space-y-0.5'}>
          {visiblePrimary.map((item) => (
            <li key={`${item.number || item.href}-${item.href}`}>
              {isProjectContext ? <ProjectNavButton item={item} /> : <GlobalNavButton item={item} />}
            </li>
          ))}
        </ul>

        {visibleEnd.length > 0 && (
          <>
            <div className={`mb-1.5 mt-4 border-t pt-3 ${showLabels ? 'px-3' : 'px-1'}`} style={{ borderColor: BRAND.border }}>
              {showLabels && <p className="text-[11px] font-semibold tracking-wide" style={{ color: BRAND.muted }}>GENERAL</p>}
            </div>
            <ul className="space-y-0.5">
              {visibleEnd.map((item) => <li key={item.href}><GlobalNavButton item={item} /></li>)}
            </ul>
          </>
        )}

        {!isProjectContext && (
          <>
            <div className={`mb-1.5 mt-4 border-t pt-3 ${showLabels ? 'px-3' : 'px-1'}`} style={{ borderColor: BRAND.border }}>
              {showLabels && <p className="text-[11px] font-semibold tracking-wide" style={{ color: BRAND.muted }}>CUENTA</p>}
            </div>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              title={!showLabels ? 'Perfil' : undefined}
              className={`flex w-full items-center overflow-hidden rounded-md text-sm ${showLabels ? 'gap-3 px-3' : 'justify-center px-0'} ${isActive('/profile') ? 'text-white shadow-sm' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
              style={{ height: 38, fontWeight: 500, background: isActive('/profile') ? BRAND.blue : undefined }}
            >
              <span className="shrink-0" style={{ fontSize: 16 }}><FiUser /></span>
              {showLabels && <span className="truncate">Perfil</span>}
            </button>
          </>
        )}
      </nav>

      <div className="shrink-0 space-y-2 border-t px-3 py-3" style={{ borderColor: BRAND.border }}>
        {!isProjectContext && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden w-full items-center justify-center rounded-md border bg-white text-[#6B7280] transition-colors hover:bg-[#F8FAFC] hover:text-[#1877F2] md:flex"
            style={{ height: 32, borderColor: BRAND.border }}
            aria-label={collapsed ? 'Expandir menu' : 'Contraer menu'}
            title={collapsed ? 'Expandir menu' : 'Contraer menu'}
          >
            {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
          </button>
        )}
        <div className={`flex items-center ${showLabels ? 'gap-2.5 px-2' : 'justify-center px-0'}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-softblue font-semibold" style={{ color: BRAND.blue, fontSize: 13 }}>{userInitial}</span>
          {showLabels && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold" style={{ color: BRAND.ink }}>{user.name}</span>
              <span className="block truncate text-[11px] capitalize" style={{ color: BRAND.muted }}>{user.role === 'agent' ? 'Agente comercial' : user.role}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={logout}
          title={!showLabels ? 'Cerrar sesion' : undefined}
          className={`flex w-full items-center rounded-md text-sm text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#1877F2] ${showLabels ? 'gap-3 px-3' : 'justify-center px-0'}`}
          style={{ height: 34 }}
        >
          <span className="shrink-0" style={{ fontSize: 16 }}><FiLogOut /></span>
          {showLabels && <span className="truncate">Cerrar sesion</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {sidebar}
      {drawerOpen && <div className="fixed inset-0 z-20 bg-black/25 md:hidden" onClick={() => setDrawerOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b bg-white px-4 sm:px-5" style={{ borderColor: BRAND.border }}>
          <button type="button" className="text-[#374151] md:hidden" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu">
            <FiMenu style={{ fontSize: 22 }} />
          </button>
          <div className="min-w-0 flex-1">
            {title && <h1 className="truncate" style={{ fontSize: 17 }}>{title}</h1>}
          </div>
          {canManage && (
            <span className="hidden items-center gap-1.5 rounded-md bg-softblue px-3 sm:inline-flex" style={{ height: 28, fontSize: 12, color: BRAND.blue }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND.blue }} /> Acceso de administracion
            </span>
          )}
          <div className="relative">
            <button className="relative p-1 text-[#6B7280] hover:text-[#171717]" aria-label="Notificaciones" onClick={() => setBellOpen((value) => !value)}>
              <FiBell style={{ fontSize: 17 }} />
              {canManage && pendingApp.count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: BRAND.blue }}>{pendingApp.count}</span>
              )}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 top-11 z-50 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-auto rounded-lg border bg-white shadow-2xl" style={{ borderColor: BRAND.border }}>
                  <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: BRAND.border }}>
                    <span className="text-sm font-semibold">Separaciones por aprobar</span>
                    <span className="badge bg-softblue" style={{ color: BRAND.blue }}>{pendingApp.count}</span>
                  </div>
                  <div className="divide-y">
                    {pendingApp.rows.slice(0, 15).map((sale) => (
                      <button key={sale.id} onClick={() => goToPendingSale(sale)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                        <span className="truncate text-sm">Lote {sale.lotCode ? sale.lotCode : `#${sale.lotId ?? '-'}`}</span>
                        <span className="badge bg-softblue text-[11px]" style={{ color: BRAND.blueDark }}>Pendiente</span>
                      </button>
                    ))}
                  </div>
                  {pendingApp.rows.length === 0 && (
                    <p className="flex flex-col items-center gap-1.5 px-4 py-8 text-center text-sm text-slate-400">
                      <FiCheckCircle style={{ fontSize: 20 }} /> Sin separaciones pendientes
                    </p>
                  )}
                  {pendingApp.rows.length > 0 && (
                    <div className="border-t px-3 py-2.5" style={{ borderColor: BRAND.border }}>
                      <button className="btn-primary w-full justify-center" onClick={() => goToPendingSale(pendingApp.rows[0])}>Ir a revisar y aprobar</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-canvas p-4 sm:p-5 md:p-6">{children}</main>
      </div>
    </div>
  );
}
