"use client";

import { AuthProvider, useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/auth/"),
  );

  useEffect(() => {
    if (!loading && !authenticated && !isPublic) {
      router.replace("/login");
    }
  }, [authenticated, loading, isPublic, router]);

  if (loading && !isPublic) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!authenticated && !isPublic) {
    return null;
  }

  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/auth/"),
  );

  return (
    <AuthProvider>
      <AuthGuard>
        {isPublicPage ? (
          <>{children}</>
        ) : (
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        )}
      </AuthGuard>
    </AuthProvider>
  );
}
