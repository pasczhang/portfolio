const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/pms";

async function parseJson<T>(res: Response, path: string): Promise<T> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return parseJson<T>(res, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
