"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { authenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (authenticated) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [authenticated, loading, router]);

  return null;
}
