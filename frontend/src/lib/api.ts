const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface FetchOptions extends RequestInit {
  token?: string;
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
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    if (res.status === 401) {
      // Token expired or invalid — clear it and redirect to login
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
      throw new Error("Session expiree. Reconnectez-vous.");
    }

    // Try to extract error detail from response
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

  return res.json() as Promise<T>;
}
