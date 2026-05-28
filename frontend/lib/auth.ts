export type AuthUser = {
  id: number;
  email: string;
  plan: string;
  subscription_status: string;
  is_admin: boolean;
  is_pro: boolean;
};

const TOKEN_KEY = 'kalshibot_access_token';

export function getAccessToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

function apiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000').trim();
  if (raw.startsWith('http')) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const r = await fetch(`${apiBase()}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  const d = (await r.json()) as { access_token: string; user: AuthUser };
  setAccessToken(d.access_token);
  return d.user;
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const r = await fetch(`${apiBase()}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  const d = (await r.json()) as { access_token: string; user: AuthUser };
  setAccessToken(d.access_token);
  return d.user;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const token = getAccessToken();
  if (!token) return null;
  const r = await fetch(`${apiBase()}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    cache: 'no-store',
  });
  if (!r.ok) {
    if (r.status === 401) clearAccessToken();
    return null;
  }
  const d = (await r.json()) as { user: AuthUser };
  return d.user;
}
