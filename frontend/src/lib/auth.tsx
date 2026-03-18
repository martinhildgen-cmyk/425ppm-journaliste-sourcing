"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AuthContextType {
  authenticated: boolean;
  loading: boolean;
  /** @deprecated Use cookie-based auth. Only kept for Chrome extension backward compat. */
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  loading: true,
  token: null,
  setToken: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  // Legacy token support for backward compatibility during migration
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    // Check if we have a valid session via cookie
    async function checkSession() {
      try {
        const res = await fetch(`${BASE_URL}/auth/me`, {
          credentials: "include",
        });
        if (res.ok) {
          setAuthenticated(true);
          // Generate a dummy token string so existing components that check `token` still work
          setTokenState("cookie-auth");
        } else {
          // Check legacy localStorage token
          const stored = localStorage.getItem("token");
          if (stored) {
            const legacyRes = await fetch(`${BASE_URL}/auth/me`, {
              headers: { Authorization: `Bearer ${stored}` },
            });
            if (legacyRes.ok) {
              setAuthenticated(true);
              setTokenState(stored);
            } else {
              localStorage.removeItem("token");
            }
          }
        }
      } catch {
        // Server unreachable
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  const setToken = (t: string | null) => {
    setTokenState(t);
    if (t && t !== "cookie-auth") {
      localStorage.setItem("token", t);
    } else if (!t) {
      localStorage.removeItem("token");
    }
    setAuthenticated(!!t);
  };

  const logout = async () => {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    localStorage.removeItem("token");
    setTokenState(null);
    setAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ authenticated, loading, token, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
