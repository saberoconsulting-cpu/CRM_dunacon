'use client';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  FiAward,
  FiBell,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiCreditCard,
  FiFileText,
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
import ProjectDocuments from '@/components/features/projects/ProjectDocuments';

interface NavItem {
  href: string;
  label: string;
  icon: JSX.Element;
  roles: UserRole[];
  key?: string;
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
    { key: 'dashboard', number: 1, href: `/projects/${projectId}`, label: 'Dashboard', icon: <FiHome />, roles: ['superadmin', 'admin', 'agent'] },
    { key: 'lots', number: 2, href: `/projects/${projectId}/lots`, label: 'Lotizacion', icon: <FiLayers />, roles: ['superadmin', 'admin', 'agent'] },
    { key: 'plan', number: 3, href: `/projects/${projectId}/plan-editor`, label: 'Plano', icon: <FiMap />, roles: ['superadmin', 'admin', 'agent'] },
    { key: 'quotes', number: 4, href: `/projects/${projectId}/quotes`, label: 'Cotizaciones', icon: <FiFileText />, roles: ['superadmin', 'admin', 'agent'] },
    { key: 'sales', number: 5, href: `/projects/${projectId}/sales`, label: 'Ventas', icon: <FiTag />, roles: ['superadmin', 'admin', 'agent'] },
    { key: 'payments', number: 6, href: `/projects/${projectId}/payments`, label: 'Pagos de lotes', icon: <FiCreditCard />, roles: ['superadmin', 'admin', 'agent'] },
    { key: 'finances', number: 7, href: `/projects/${projectId}/finances`, label: 'Finanzas', icon: <FiPieChart />, roles: ['superadmin', 'admin'] },
    { key: 'campaigns', number: 8, href: `/projects/${projectId}/campaigns`, label: 'Campanas', icon: <FiVolume2 />, roles: ['superadmin', 'admin'] },
    { key: 'clients', number: 9, href: `/projects/${projectId}/clients`, label: 'Clientes y leads', icon: <FiUsers />, roles: ['superadmin', 'admin', 'agent'] },
    { key: 'banking', number: 10, href: `/projects/${projectId}/bank-accounts`, label: 'Cuentas y bancos', icon: <FiCreditCard />, roles: ['superadmin', 'admin'] },
    { key: 'construction-budget', number: 11, href: `/projects/${projectId}/construction-budget`, label: 'Presupuesto de obra', icon: <FiLayers />, roles: ['superadmin', 'admin'] },
    { key: 'income-statement', number: 12, href: `/projects/${projectId}/income-statement`, label: 'Estado de resultados', icon: <FiPieChart />, roles: ['superadmin', 'admin'] },
    { key: 'cashflow', number: 13, href: '#flujo-caja', label: 'Flujo de caja', icon: <FiPieChart />, roles: ['superadmin', 'admin'], soon: true },
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

export default function Layout({ children, title, titleLogoUrl }: { children: ReactNode; title?: string; titleLogoUrl?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingApp, setPendingApp] = useState<{ count: number; rows: any[] }>({ count: 0, rows: [] });
  const [bellOpen, setBellOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<{ id: number; name: string; logoImageUrl?: string | null } | null>(null);
  const [projectDocumentsOpen, setProjectDocumentsOpen] = useState(false);
  const [moduleAccess, setModuleAccess] = useState<Record<number, string[] | null>>({});

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

    const loadActiveProject = () => {
      api.get<any>(`/projects/${activeProjectId}`)
        .then((project) => setActiveProject({ id: activeProjectId, name: project?.name || `Proyecto ${activeProjectId}`, logoImageUrl: project?.logoImageUrl || null }))
        .catch(() => setActiveProject({ id: activeProjectId, name: `Proyecto ${activeProjectId}` }));
    };

    loadActiveProject();
    // Escucha el evento que emite la pantalla del proyecto al cambiar el logo,
    // para que el sidebar y el header se actualicen sin recargar la pagina.
    window.addEventListener('project-logo-updated', loadActiveProject);
    return () => window.removeEventListener('project-logo-updated', loadActiveProject);
  }, [activeProjectId]);

  useEffect(() => {
    if (!user) return undefined;
    const canManage = user.role === 'superadmin' || user.role === 'admin';

    async function refreshApprovals() {
      if (!canManage) return;
      try {
        const query = activeProjectId ? `?projectId=${activeProjectId}` : '';
        const data: any = await api.get<any>(`/sales/pending${query}`);
        const rows: any[] = Array.isArray(data) ? data : (data?.items || []);
        const pending = rows.filter((row: any) => (row.approvalStatus || row.status || 'pendiente') === 'pendiente');
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
  }, [user, activeProjectId]);

  useEffect(() => {
    if (!user) return;
    api.get<any>('/users/access')
      .then((data) => {
        const next: Record<number, string[] | null> = {};
        for (const row of data?.projects || []) next[Number(row.projectId)] = Array.isArray(row.modules) ? row.modules : null;
        setModuleAccess(next);
      })
      .catch(() => setModuleAccess({}));
  }, [user]);

  if (!user) return null;

  const canManage = user.role === 'superadmin' || user.role === 'admin';
  const isProjectContext = activeProjectId != null;
  const projectAllowedModules = activeProjectId ? moduleAccess[activeProjectId] : null;
  const visiblePrimary = (isProjectContext ? projectNav(activeProjectId) : GLOBAL_NAV)
    .filter((item) => item.roles.includes(user.role))
    .filter((item) => !isProjectContext || user.role === 'superadmin' || !Array.isArray(projectAllowedModules) || projectAllowedModules.includes(item.key || ''));
  const visibleEnd = isProjectContext ? [] : GLOBAL_END_NAV.filter((item) => item.roles.includes(user.role));
  const showLabels = drawerOpen || !collapsed;
  const sidebarWidth = collapsed ? 76 : 248;
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
        className={`relative w-full overflow-hidden rounded-md text-sm transition-colors ${showLabels ? 'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 text-left' : 'flex items-center justify-center px-0'} ${active ? 'text-white shadow-sm' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
        style={{ height: 38, fontWeight: active ? 600 : 500, background: active ? BRAND.blue : undefined }}
      >
        <span className="grid w-5 shrink-0 place-items-center" style={{ fontSize: 16 }}>{item.icon}</span>
        {showLabels && <span className="min-w-0 truncate text-left">{item.label}</span>}
        {badge && (
          <span className={`${showLabels ? '' : 'absolute right-1 top-1'} grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white`} style={{ background: active ? BRAND.blueDark : BRAND.blue }}>
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
        className={`relative w-full overflow-hidden rounded-md text-sm transition-colors ${showLabels ? 'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 text-left' : 'flex items-center justify-center px-0'} ${disabled ? 'cursor-not-allowed text-slate-400' : active ? 'text-white shadow-sm' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
        style={{ height: 38, fontWeight: active ? 600 : 500, background: active && !disabled ? BRAND.blue : undefined }}
      >
        <span className="grid w-5 shrink-0 place-items-center" style={{ fontSize: 16 }}>{item.icon}</span>
        {showLabels && <span className="min-w-0 truncate text-left">{item.label}</span>}
        {showLabels && disabled && <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-400">Proximamente</span>}
        {badge && !disabled && (
          <span className={`${showLabels ? '' : 'absolute right-1 top-1'} grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white`} style={{ background: active ? BRAND.blueDark : BRAND.blue }}>
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
        <div className="shrink-0 border-b p-2" style={{ borderColor: BRAND.border }}>
          {showLabels ? (
            <div className="flex h-11 items-center gap-1.5">
              <span className="w-8 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-md hover:bg-[#F3F4F6]"
                title="Dunacon - ir al inicio"
              >
                <img
                  src="/logo/dunacon.png"
                  alt="Dunacon"
                  className="h-11 w-auto max-w-full object-contain mr-3"
                />
              </button>
              <button
                type="button"
                onClick={toggleCollapsed}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-white text-[#374151] transition-colors hover:bg-[#F3F4F6]"
                style={{ borderColor: BRAND.border }}
                aria-label="Contraer menu"
                title="Contraer menu"
              >
                <FiChevronLeft />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="grid h-9 w-full place-items-center overflow-hidden rounded-md hover:bg-[#F3F4F6]"
                title="Dunacon - ir al inicio"
              >
                <img
                  src="/logo/dunacon.png"
                  alt="Dunacon"
                  className="h-8 max-w-10 object-contain"
                />
              </button>
              <button
                type="button"
                onClick={toggleCollapsed}
                className="grid h-8 w-full place-items-center rounded-md border bg-white text-[#374151] transition-colors hover:bg-[#F3F4F6]"
                style={{ borderColor: BRAND.border }}
                title="Expandir menu"
                aria-label="Expandir menu"
              >
                <FiChevronRight />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-14 shrink-0 items-center justify-center border-b px-2" style={{ borderColor: BRAND.border }}>
          <img src="/logo/dunacon.png" alt="Dunacon" className={`${showLabels ? 'h-11 w-auto mr-3' : 'h-8 max-w-10 object-contain'}`} />
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
              className={`w-full overflow-hidden rounded-md text-sm ${showLabels ? 'grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 px-3 text-left' : 'flex items-center justify-center px-0'} ${isActive('/profile') ? 'text-white shadow-sm' : 'text-[#374151] hover:bg-[#F3F4F6]'}`}
              style={{ height: 38, fontWeight: 500, background: isActive('/profile') ? BRAND.blue : undefined }}
            >
              <span className="grid w-5 shrink-0 place-items-center" style={{ fontSize: 16 }}><FiUser /></span>
              {showLabels && <span className="min-w-0 truncate text-left">Perfil</span>}
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
          className={`w-full rounded-md text-sm text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#1877F2] ${showLabels ? 'grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 px-3 text-left' : 'flex items-center justify-center px-0'}`}
          style={{ height: 34 }}
        >
          <span className="grid w-5 shrink-0 place-items-center" style={{ fontSize: 16 }}><FiLogOut /></span>
          {showLabels && <span className="min-w-0 truncate text-left">Cerrar sesion</span>}
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
            {(() => {
              // En pestanas de proyecto el header muestra SOLO el logo del proyecto
              // (sin el nombre), al mismo tamano que el logo Dunacon del sidebar
              // para que se vea con presencia. El Layout obtiene `activeProject` de
              // la URL, asi que aplica a todas las pestanas del proyecto.
              if (isProjectContext && activeProject?.logoImageUrl) {
                return (
                  <img
                    src={activeProject.logoImageUrl}
                    alt={activeProject.name || 'Proyecto'}
                    className="h-10 w-auto max-w-52 object-contain"
                  />
                );
              }
              if (titleLogoUrl) {
                return <img src={titleLogoUrl} alt={title || 'Proyecto'} className="h-10 max-w-52 object-contain" />;
              }
              return title ? <h1 className="truncate" style={{ fontSize: 17 }}>{title}</h1> : null;
            })()}
          </div>
          {isProjectContext && activeProjectId && (
            <button
              type="button"
              onClick={() => setProjectDocumentsOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-md border bg-white px-3 text-xs font-semibold text-[#1877F2] transition-colors hover:bg-softblue sm:inline-flex"
              style={{ borderColor: BRAND.border }}
            >
              <FiFileText /> Documentos del proyecto
            </button>
          )}
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
      {projectDocumentsOpen && activeProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setProjectDocumentsOpen(false)} />
          <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-md border bg-white p-5 shadow-2xl" style={{ borderColor: BRAND.border }}>
            <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: BRAND.border }}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: BRAND.ink }}>{activeProject?.name || 'Proyecto'}</p>
                <p className="text-xs" style={{ color: BRAND.muted }}>Archivos comerciales, cotizaciones y financiamiento.</p>
              </div>
              <button className="btn-neutral !h-8 text-sm" onClick={() => setProjectDocumentsOpen(false)}>Cerrar</button>
            </div>
            <ProjectDocuments projectId={activeProjectId} />
          </div>
        </div>
      )}
    </div>
  );
}
