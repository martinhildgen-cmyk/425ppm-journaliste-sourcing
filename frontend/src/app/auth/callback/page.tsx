"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useAuth();

  useEffect(() => {
    // Legacy support: if token is in URL params (old flow), store it
    const token = searchParams.get("token");
    if (token) {
      setToken(token);
    }
    // In the new flow, cookies are already set by the backend redirect.
    // Either way, redirect to dashboard.
    router.replace("/dashboard");
  }, [searchParams, setToken, router]);

  return <p className="text-muted-foreground">Connexion en cours...</p>;
}

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<p className="text-muted-foreground">Chargement...</p>}>
        <CallbackHandler />
      </Suspense>
    </main>
  );
}
