import { AUTH_SESSION_KEY, type AuthSession } from "@/lib/auth/types";

function storage(rememberMe: boolean): Storage | null {
  if (typeof window === "undefined") return null;
  return rememberMe ? window.localStorage : window.sessionStorage;
}

export function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_SESSION_KEY) ?? window.sessionStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    if (!session?.token || !session.username || !session.exp) return null;
    if (Date.now() > session.exp) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession): void {
  clearSession();
  storage(session.rememberMe)?.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
}

export function getAuthToken(): string | null {
  return readSession()?.token ?? null;
}
