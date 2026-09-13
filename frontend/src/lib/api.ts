// src/lib/api.ts
// Cliente HTTP con token JWT (localStorage) para el frontend

const BASE = '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
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
    throw new Error(msg);
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

export async function uploadFile(path: string, file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    body: form,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || 'Error al subir archivo');
  return data;
}
