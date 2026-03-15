"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Journalist, JournalistListResponse } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { token } = useAuth();
  const [totalJournalists, setTotalJournalists] = useState<number>(0);
  const [movementAlerts, setMovementAlerts] = useState<number>(0);
  const [recentJournalists, setRecentJournalists] = useState<Journalist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await apiFetch<JournalistListResponse>(
          "/journalists/?page=1&page_size=5",
          { token: token ?? undefined }
        );
        setTotalJournalists(data.total);
        setRecentJournalists(data.items);

        const alertCount = data.items.filter((j) => j.movement_alert).length;
        setMovementAlerts(alertCount);
      } catch {
        // API might not be available yet
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Vue d&apos;ensemble de votre base journalistes
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total journalistes</CardDescription>
            <CardTitle className="text-3xl">
              {loading ? "..." : totalJournalists}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Contacts dans la base
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alertes mouvement</CardDescription>
            <CardTitle className="text-3xl">
              {loading ? "..." : movementAlerts}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Changements de poste detectes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Actions rapides</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/journalists">Rechercher</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/import">Importer CSV</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent journalists */}
      <Card>
        <CardHeader>
          <CardTitle>Journalistes recents</CardTitle>
          <CardDescription>Les 5 derniers contacts ajoutes</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : recentJournalists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun journaliste dans la base.{" "}
              <Link href="/import" className="text-primary underline">
                Importez un CSV
              </Link>{" "}
              pour commencer.
            </p>
          ) : (
            <div className="space-y-3">
              {recentJournalists.map((j) => (
                <Link
                  key={j.id}
                  href={`/journalists/${j.id}`}
                  className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {j.first_name} {j.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {j.media_name ?? "—"} &middot; {j.job_title ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {j.movement_alert && (
                      <Badge variant="destructive" className="text-[10px]">
                        Changement detecte
                      </Badge>
                    )}
                    <EmailStatusBadge status={j.email_status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmailStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    valide: {
      label: "Valide",
      className: "bg-green-100 text-green-800 border-green-200",
    },
    invalide: {
      label: "Invalide",
      className: "bg-red-100 text-red-800 border-red-200",
    },
    "catch-all": {
      label: "Catch-all",
      className: "bg-amber-100 text-amber-800 border-amber-200",
    },
    manquant: {
      label: "Manquant",
      className: "bg-gray-100 text-gray-600 border-gray-200",
    },
  };
  const entry = map[status] ?? map.manquant;
  return (
    <Badge variant="outline" className={entry!.className}>
      {entry!.label}
    </Badge>
  );
}
