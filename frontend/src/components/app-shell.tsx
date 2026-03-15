"use client";

import { AuthProvider, useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/auth/"),
  );

  useEffect(() => {
    if (!token && !isPublic) {
      router.replace("/login");
    }
  }, [token, isPublic, router]);

  if (!token && !isPublic) {
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
