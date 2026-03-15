"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setToken(token);
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
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
