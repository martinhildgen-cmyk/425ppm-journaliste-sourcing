"use client";

import React, { createContext, useContext } from "react";

interface AuthContextType {
  token: string | null;
  loading: boolean;
  authenticated: boolean;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  token: "no-auth",
  loading: false,
  authenticated: true,
  setToken: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        token: "no-auth",
        loading: false,
        authenticated: true,
        setToken: () => {},
        logout: () => {
          window.location.href = "/";
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
