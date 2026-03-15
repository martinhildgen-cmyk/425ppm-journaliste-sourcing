"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Journalist, JournalistListResponse, Client } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface DashboardStats {
  total_journalists: number;
  movement_alerts: number;
  watched_journalists: number;
  ai_analyzed: number;
  email_valid: number;
}

interface MovementAlert {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  job_title_previous: string | null;
  media_name: string | null;
  media_name_previous: string | null;
  job_last_updated_at: string | null;
}

interface AlertsResponse {
  items: MovementAlert[];
  total: number;
  page: number;
  page_size: number;
}

export default function DashboardPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<MovementAlert[]>([]);
  const [recentJournalists, setRecentJournalists] = useState<Journalist[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [statsData, alertsData, recentData, clientsData] = await Promise.all([
        apiFetch<DashboardStats>("/dashboard/stats", { token }),
        apiFetch<AlertsResponse>("/dashboard/alerts?page_size=5", { token }),
        apiFetch<JournalistListResponse>("/journalists/?page=1&page_size=5", { token }),
        apiFetch<Client[]>("/clients/", { token }).catch(() => [] as Client[]),
      ]);
      setStats(statsData);
      setAlerts(alertsData.items);
      setRecentJournalists(recentData.items);
      setClients(clientsData);
    } catch {
      // API might not be available yet
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDismissAlert = async (journalistId: string) => {
    try {
      await apiFetch(`/dashboard/alerts/${journalistId}/dismiss`, {
        method: "POST",
        token: token ?? undefined,
      });
      setAlerts((prev) => prev.filter((a) => a.id !== journalistId));
      if (stats) {
        setStats({ ...stats, movement_alerts: stats.movement_alerts - 1 });
      }
    } catch {
      // silently ignore
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/journalists?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Vue d&apos;ensemble de votre base journalistes
          </p>
        </div>
      </div>

      {/* Global search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
        <Input
          type="search"
          placeholder="Rechercher un journaliste par nom, media ou tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="sm">
          Rechercher
        </Button>
      </form>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total journalistes</CardDescription>
            <CardTitle className="text-3xl">
              {loading ? "..." : stats?.total_journalists ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Contacts dans la base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alertes mouvement</CardDescription>
            <CardTitle className="text-3xl text-destructive">
              {loading ? "..." : stats?.movement_alerts ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Changements de poste</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Suivis</CardDescription>
            <CardTitle className="text-3xl">
              {loading ? "..." : stats?.watched_journalists ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Journalistes surveilles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Analyses IA</CardDescription>
            <CardTitle className="text-3xl">
              {loading ? "..." : stats?.ai_analyzed ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Profils analyses</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Movement alerts feed */}
        <Card>
          <CardHeader>
            <CardTitle>Alertes de mouvement</CardTitle>
            <CardDescription>
              Changements de poste ou de media detectes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune alerte de mouvement.
              </p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3"
                  >
                    <div className="flex items-start justify-between">
                      <Link
                        href={`/journalists/${alert.id}`}
                        className="hover:underline"
                      >
                        <p className="text-sm font-medium">
                          {alert.first_name} {alert.last_name}
                        </p>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6"
                        onClick={() => handleDismissAlert(alert.id)}
                      >
                        Fermer
                      </Button>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {alert.job_title_previous && (
                        <p>
                          Poste : <span className="line-through">{alert.job_title_previous}</span>
                          {alert.job_title && (
                            <span className="text-foreground font-medium"> → {alert.job_title}</span>
                          )}
                        </p>
                      )}
                      {alert.media_name_previous && (
                        <p>
                          Media : <span className="line-through">{alert.media_name_previous}</span>
                          {alert.media_name && (
                            <span className="text-foreground font-medium"> → {alert.media_name}</span>
                          )}
                        </p>
                      )}
                      {alert.job_last_updated_at && (
                        <p className="text-[10px]">
                          Detecte le {new Date(alert.job_last_updated_at).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {(stats?.movement_alerts ?? 0) > 5 && (
                  <Link href="/journalists?movement_alert=true">
                    <Button variant="link" size="sm" className="w-full">
                      Voir toutes les alertes ({stats?.movement_alerts})
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
                          Changement
                        </Badge>
                      )}
                      {j.is_watched && (
                        <Badge variant="secondary" className="text-[10px]">
                          Suivi
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

      {/* Client cards */}
      {clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dossiers clients</CardTitle>
            <CardDescription>Acces rapide aux clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clients.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="rounded-md border p-4 transition-colors hover:bg-muted"
                >
                  <p className="text-sm font-medium">{client.name}</p>
                  {client.sector && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {client.sector}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
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
