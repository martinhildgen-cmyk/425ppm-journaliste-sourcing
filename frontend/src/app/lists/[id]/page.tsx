"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { MediaList, Journalist } from "@/lib/types";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

interface ListDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ListDetailPage({ params }: ListDetailPageProps) {
  const { id } = use(params);
  const { token } = useAuth();

  const [list, setList] = useState<MediaList | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Journalist[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchList() {
      try {
        const data = await apiFetch<MediaList>(`/lists/${id}`, {
          token: token ?? undefined,
        });
        setList(data);
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, [id, token]);

  const handleExport = () => {
    const BASE_URL =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    window.open(`${BASE_URL}/export/lists/${id}`, "_blank");
  };

  const handleRemoveJournalist = async (journalistId: string) => {
    try {
      await apiFetch<void>(`/lists/${id}/journalists/${journalistId}`, {
        method: "DELETE",
        token: token ?? undefined,
      });
      if (list) {
        setList({
          ...list,
          journalists: list.journalists?.filter(
            (j) => j.id !== journalistId
          ),
        });
      }
    } catch {
      // error
    }
  };

  const handleSearchJournalists = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await apiFetch<{ items: Journalist[] }>(
        `/journalists/?search=${encodeURIComponent(query)}&page_size=10`,
        { token: token ?? undefined }
      );
      // Filter out journalists already in the list
      const existingIds = new Set((list?.journalists ?? []).map((j) => j.id));
      setSearchResults(res.items.filter((j) => !existingIds.has(j.id)));
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const handleAddJournalist = async (journalistId: string) => {
    setAddingIds((prev) => new Set(prev).add(journalistId));
    try {
      await apiFetch<{ added: number }>(`/lists/${id}/journalists`, {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({ journalist_ids: [journalistId] }),
      });
      // Refresh the list
      const data = await apiFetch<MediaList>(`/lists/${id}`, {
        token: token ?? undefined,
      });
      setList(data);
      // Remove from search results
      setSearchResults((prev) => prev.filter((j) => j.id !== journalistId));
    } catch {
      // ignore
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(journalistId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-muted-foreground">Liste non trouvee.</p>
        <Button asChild variant="outline">
          <Link href="/clients">Retour aux clients</Link>
        </Button>
      </div>
    );
  }

  const journalists = list.journalists ?? [];

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/clients">← Retour</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{list.name}</h1>
            <p className="text-muted-foreground text-sm">
              {journalists.length} journaliste
              {journalists.length !== 1 ? "s" : ""} dans cette liste
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddPanel(!showAddPanel)}>
            {showAddPanel ? "Fermer" : "Ajouter des journalistes"}
          </Button>
          <Button onClick={handleExport} variant="outline">
            Exporter CSV
          </Button>
        </div>
      </div>

      {/* Add journalists panel */}
      {showAddPanel && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Ajouter des journalistes</CardTitle>
            <CardDescription>
              Recherchez dans l&apos;annuaire pour ajouter des journalistes a cette liste
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Rechercher par nom, media, email..."
              value={searchQuery}
              onChange={(e) => handleSearchJournalists(e.target.value)}
              autoFocus
            />
            {searching && (
              <p className="text-sm text-muted-foreground">Recherche...</p>
            )}
            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((j) => (
                  <div
                    key={j.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {[j.first_name, j.last_name].filter(Boolean).join(" ") || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {j.media_name ?? "—"} · {j.job_title ?? "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddJournalist(j.id)}
                      disabled={addingIds.has(j.id)}
                    >
                      {addingIds.has(j.id) ? "Ajout..." : "Ajouter"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucun journaliste trouve. Essayez un autre terme.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Journalists table */}
      <Card>
        <CardHeader>
          <CardTitle>Journalistes</CardTitle>
          <CardDescription>
            Contacts inclus dans cette liste media
          </CardDescription>
        </CardHeader>
        <CardContent>
          {journalists.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                Aucun journaliste dans cette liste.
              </p>
              <Button onClick={() => setShowAddPanel(true)}>
                Ajouter des journalistes
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                      Nom
                    </th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                      Media
                    </th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                      Poste
                    </th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {journalists.map((j) => (
                    <tr
                      key={j.id}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/journalists/${j.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {[j.first_name, j.last_name]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {j.media_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {j.job_title ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[160px]">
                            {j.email ?? "—"}
                          </span>
                          <EmailStatusBadge status={j.email_status} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveJournalist(j.id)}
                        >
                          Retirer
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
