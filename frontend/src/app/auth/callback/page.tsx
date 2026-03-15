"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function AuthCallbackPage() {
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

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Connexion en cours...</p>
    </main>
  );
}
