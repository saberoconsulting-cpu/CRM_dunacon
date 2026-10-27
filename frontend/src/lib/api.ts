// src/lib/api.ts
// Cliente HTTP con token JWT (localStorage) para el frontend

const BASE = '/api';

export function isSessionLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.startsWith('Candado activado.');
}

export function projectContextHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const match = window.location.pathname.match(/^\/projects\/(\d+)/);
  return match ? { 'X-Project-Id': match[1] } : {};
}

const SESSION_LOCK_MESSAGE = 'Candado activado. Desactívalo para realizar esta acción.';
const projectLocks = new Map<number, boolean>();
let lockSessionToken: string | null = null;

function sessionProjectLocks() {
  const token = getToken();
  if (token !== lockSessionToken) {
    projectLocks.clear();
    lockSessionToken = token;
  }
  return projectLocks;
}

function requestProjects(path: string, body?: unknown): number[] {
  const query = new URLSearchParams(path.split('?')[1] || '');
  const routeProject = typeof window === 'undefined' ? null : window.location.pathname.match(/^\/projects\/(\d+)/)?.[1];
  const bodyProject = body && typeof body === 'object' ? (body as Record<string, unknown>).projectId : null;
  return [...new Set([routeProject, query.get('projectId'), bodyProject].map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
}

function assertProjectWritable(method: string, path: string, body?: unknown) {
  const route = path.split('?')[0].replace(/\/$/, '');
  if (['GET', 'HEAD', 'OPTIONS'].includes(method) || route.startsWith('/auth/') || route.startsWith('/users')) return;
  // Project list actions are outside the internal project lock, as in the API guard.
  if (method === 'POST' && (/^\/projects\/(update|cover|logo|delete|restore|purge)\/\d+$/.test(route)
    || /^\/projects\/status\/\d+\/(active|inactive)$/.test(route))) return;
  const locks = sessionProjectLocks();
  if (requestProjects(path, body).some(id => locks.get(id) === true)) throw new Error(SESSION_LOCK_MESSAGE);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  assertProjectWritable(method, path, body);
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...projectContextHeaders(),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    // Token inválido/expirado -> cerrar sesión
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = data?.message
      ? Array.isArray(data.message) ? data.message.join(', ') : data.message
      : data?.error || 'Error de solicitud';
    if (isSessionLockError(msg)) {
      const locks = sessionProjectLocks();
      requestProjects(path, body).forEach(id => locks.set(id, true));
      throw new Error(SESSION_LOCK_MESSAGE);
    }
    throw new Error(msg);
  }
  if (path.split('?')[0] === '/auth/session-lock' && typeof data?.locked === 'boolean') {
    const locks = sessionProjectLocks();
    const projectId = Number((body as any)?.projectId || new URLSearchParams(path.split('?')[1] || '').get('projectId'));
    if (Number.isSafeInteger(projectId) && projectId > 0) locks.set(projectId, data.locked);
  }
  return data as T;
}

// ---- Sesión ----
const TOKEN_KEY = 'crm_token';
const USER_KEY = 'crm_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser() {
  if (typeof window === 'undefined') return null;
  try { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; } catch { return null; }
}

export function saveSession(session: { token: string; user: unknown }) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ---- Genéricos ----
export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  delete: <T>(p: string) => request<T>('DELETE', p),
};

export async function uploadFile(path: string, file: File, fields?: Record<string, string | number>): Promise<any> {
  assertProjectWritable('POST', path, fields);
  const form = new FormData();
  const upload = /\.jpng$/i.test(file.name)
    ? new File([file], file.name.replace(/\.jpng$/i, '.jpg'), { type: file.type || 'image/jpeg' })
    : file;
  form.append('file', upload);
  Object.entries(fields || {}).forEach(([key, value]) => form.append(key, String(value)));
  const token = getToken();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { ...projectContextHeaders(), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: form,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || 'Error al subir archivo');
  return data;
}
