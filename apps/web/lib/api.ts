import { getAuthToken } from "@/lib/auth/session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/pms";

function withAuth(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  const token = getAuthToken();
  if (token) next.set("Authorization", `Bearer ${token}`);
  return next;
}

function handleUnauthorized(res: Response) {
  if (res.status !== 401 || typeof window === "undefined") return;
  window.sessionStorage.setItem("pms-flash", "登录已过期，请重新登录");
  window.sessionStorage.setItem("pms-flash-tone", "error");
  window.location.assign("/login");
}

async function parseJson<T>(res: Response, path: string): Promise<T> {
  handleUnauthorized(res);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: withAuth() });
  handleUnauthorized(res);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return parseJson<T>(res, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  handleUnauthorized(res);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return parseJson<T>(res, path);
}

export async function apiGetOr<T>(path: string, fallback: T): Promise<{ data: T; source: "api" | "mock" }> {
  try {
    const data = await apiGet<T>(path);
    return { data, source: "api" };
  } catch {
    return { data: fallback, source: "mock" };
  }
}
