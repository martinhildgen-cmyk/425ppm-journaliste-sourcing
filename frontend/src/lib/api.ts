const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface FetchOptions extends RequestInit {
  token?: string;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const url = `${BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token && token !== "no-auth" ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...rest,
    });
  } catch (err) {
    // Network error — server unreachable, CORS blocked, etc.
    const method = (options.method ?? "GET").toUpperCase();
    console.error(`[425PPM] ${method} ${url} failed:`, err);
    throw new Error(
      `Impossible de contacter le serveur (${method} ${path}). Verifiez que l'API est accessible a ${BASE_URL}.`
    );
  }

  if (!res.ok) {

    let detail = "";
    try {
      const body = await res.json();
      detail = body.detail || "";
    } catch {
      // ignore
    }

    throw new Error(
      detail || `Erreur serveur (${res.status})`
    );
  }

  // 204 No Content — return empty
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
