"use client";

import { AuthProvider } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/auth/"),
  );

  return (
    <AuthProvider>
      {isPublicPage ? (
        <>{children}</>
      ) : (
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )}
    </AuthProvider>
  );
}
