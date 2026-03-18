"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Journalist, JournalistListResponse, Client, Campaign, MediaList } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

const columnHelper = createColumnHelper<Journalist>();

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

export default function JournalistsPage() {
  return (
    <Suspense fallback={<div className="p-8">Chargement...</div>}>
      <JournalistsPageContent />
    </Suspense>
  );
}

type AddMode = "none" | "linkedin" | "manual";

function JournalistsPageContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<Journalist[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(Number(searchParams.get("page") ?? "1"));
  const [pageSize] = useState(20);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [mediaType, setMediaType] = useState(searchParams.get("media_type") ?? "");
  const [mediaScope, setMediaScope] = useState(searchParams.get("media_scope") ?? "");
  const [sectorMacro, setSectorMacro] = useState(searchParams.get("sector_macro") ?? "");
  const [movementAlertFilter] = useState(searchParams.get("movement_alert") === "true");
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<AddMode>("none");

  // LinkedIn URL form
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const [linkedinSuccess, setLinkedinSuccess] = useState<string | null>(null);

  // Manual create form
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    job_title: "",
    media_name: "",
    media_type: "",
    media_scope: "",
    sector_macro: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  // Bulk add to list
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<MediaList[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
        });
        if (search) params.set("search", search);
        if (mediaType) params.set("media_type", mediaType);
        if (mediaScope) params.set("media_scope", mediaScope);
        if (sectorMacro) params.set("sector_macro", sectorMacro);
        if (movementAlertFilter) params.set("movement_alert", "true");

        const res = await apiFetch<JournalistListResponse>(
          `/journalists/?${params.toString()}`,
          { token: token ?? undefined }
        );
        setData(res.items);
        setTotal(res.total);
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, page, pageSize, search, mediaType, mediaScope, sectorMacro, movementAlertFilter, refreshKey]);

  const totalPages = Math.ceil(total / pageSize);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: () => (
          <input
            type="checkbox"
            checked={data.length > 0 && selectedIds.size === data.length}
            onChange={toggleSelectAll}
            className="h-4 w-4 accent-primary"
          />
        ),
        cell: (info) => (
          <input
            type="checkbox"
            checked={selectedIds.has(info.row.original.id)}
            onChange={() => toggleSelect(info.row.original.id)}
            className="h-4 w-4 accent-primary"
          />
        ),
      }),
      columnHelper.accessor(
        (row) =>
          [row.first_name, row.last_name].filter(Boolean).join(" ") || "—",
        {
          id: "name",
          header: "Nom",
          cell: (info) => (
            <Link
              href={`/journalists/${info.row.original.id}`}
              className="font-medium text-primary hover:underline"
            >
              {info.getValue()}
            </Link>
          ),
        }
      ),
      columnHelper.accessor("media_name", {
        header: "Media",
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("job_title", {
        header: "Poste",
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("email_status", {
        header: "Email",
        cell: (info) => <EmailStatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("sector_macro", {
        header: "Secteur",
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("tags_micro", {
        header: "Tags",
        cell: (info) => {
          const tags = info.getValue();
          if (!tags || tags.length === 0) return "—";
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("ai_summary", {
        header: "IA",
        cell: (info) => {
          const val = info.getValue();
          if (!val) return <span className="text-muted-foreground text-xs">Non analyse</span>;
          return (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
              Analyse
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => (
          <div className="flex gap-1">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/journalists/${info.row.original.id}`}>
                Voir
              </Link>
            </Button>
            {info.row.original.movement_alert && (
              <Badge variant="destructive" className="text-[10px]">
                Changement detecte
              </Badge>
            )}
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, selectedIds]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  // Clear search results when input is emptied
  useEffect(() => {
    if (searchInput === "" && search !== "") {
      setSearch("");
      setPage(1);
    }
  }, [searchInput, search]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (mediaType) params.set("media_type", mediaType);
    if (mediaScope) params.set("media_scope", mediaScope);
    if (sectorMacro) params.set("sector_macro", sectorMacro);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    const newUrl = query ? `/journalists?${query}` : "/journalists";
    router.replace(newUrl, { scroll: false });
  }, [search, mediaType, mediaScope, sectorMacro, page, router]);

  useEffect(() => {
    if (!showBulkAdd) return;
    async function fetchClients() {
      try {
        const res = await apiFetch<Client[]>("/clients/", {
          token: token ?? undefined,
        });
        setClients(res);
      } catch {
        // ignore
      }
    }
    fetchClients();
  }, [showBulkAdd, token]);

  useEffect(() => {
    if (!selectedClientId) { setCampaigns([]); setSelectedCampaignId(""); return; }
    async function fetchCampaigns() {
      try {
        const res = await apiFetch<Campaign[]>(
          `/campaigns/?client_id=${selectedClientId}`,
          { token: token ?? undefined }
        );
        setCampaigns(res);
        setSelectedCampaignId("");
      } catch {
        // ignore
      }
    }
    fetchCampaigns();
  }, [selectedClientId, token]);

  useEffect(() => {
    if (!selectedCampaignId) { setLists([]); setSelectedListId(""); return; }
    async function fetchLists() {
      try {
        const res = await apiFetch<MediaList[]>(
          `/lists/?campaign_id=${selectedCampaignId}`,
          { token: token ?? undefined }
        );
        setLists(res);
        setSelectedListId("");
      } catch {
        // ignore
      }
    }
    fetchLists();
  }, [selectedCampaignId, token]);

  const handleLinkedInAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkedinUrl.trim()) return;
    if (!linkedinUrl.includes("linkedin.com")) {
      setLinkedinError("Collez un lien LinkedIn valide (ex: https://www.linkedin.com/in/nom-journaliste)");
      return;
    }
    setLinkedinLoading(true);
    setLinkedinError(null);
    setLinkedinSuccess(null);
    try {
      const journalist = await apiFetch<Journalist>("/extension/journalists/from-url", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({ linkedin_url: linkedinUrl }),
      });
      const name = [journalist.first_name, journalist.last_name].filter(Boolean).join(" ") || "Journaliste";
      setLinkedinSuccess(`${name} ajoute ! L'IA va enrichir le profil automatiquement.`);
      setLinkedinUrl("");
      setRefreshKey((k) => k + 1);
      setPage(1);
    } catch (err) {
      setLinkedinError(
        err instanceof Error ? err.message : "Erreur lors de l'ajout."
      );
    } finally {
      setLinkedinLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch<Journalist>("/journalists/", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify(createForm),
      });
      setAddMode("none");
      setCreateForm({
        first_name: "",
        last_name: "",
        email: "",
        job_title: "",
        media_name: "",
        media_type: "",
        media_scope: "",
        sector_macro: "",
      });
      setRefreshKey((k) => k + 1);
      setPage(1);
      setSearch("");
      setSearchInput("");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Erreur lors de la creation du journaliste."
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((j) => j.id)));
    }
  };

  const handleBulkAddToList = async () => {
    if (!selectedListId || selectedIds.size === 0) return;
    setBulkAdding(true);
    setBulkSuccess(null);
    try {
      const res = await apiFetch<{ added: number }>(
        `/lists/${selectedListId}/journalists`,
        {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({ journalist_ids: Array.from(selectedIds) }),
        }
      );
      setBulkSuccess(`${res.added} journaliste(s) ajoute(s) a la liste.`);
      setSelectedIds(new Set());
      setTimeout(() => {
        setShowBulkAdd(false);
        setBulkSuccess(null);
      }, 2000);
    } catch (err) {
      setBulkSuccess(
        err instanceof Error ? err.message : "Erreur lors de l'ajout."
      );
    } finally {
      setBulkAdding(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Journalistes</h1>
          <p className="text-muted-foreground mt-1">
            {total} contacts dans la base
          </p>
        </div>
        <div className="flex gap-2">
          {addMode === "none" ? (
            <>
              <Button onClick={() => setAddMode("linkedin")}>
                + Ajouter depuis LinkedIn
              </Button>
              <Button variant="outline" onClick={() => setAddMode("manual")}>
                Saisie manuelle
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => { setAddMode("none"); setLinkedinError(null); setLinkedinSuccess(null); setCreateError(null); }}>
              Annuler
            </Button>
          )}
        </div>
      </div>

      {/* LinkedIn URL add — primary action */}
      {addMode === "linkedin" && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Ajouter depuis LinkedIn</CardTitle>
            <CardDescription>
              Collez le lien du profil LinkedIn d&apos;un journaliste. L&apos;IA analysera automatiquement son profil, ses sujets de predilection et ses articles recents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLinkedInAdd} className="space-y-3">
              {linkedinError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{linkedinError}</p>
                </div>
              )}
              {linkedinSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-800">{linkedinSuccess}</p>
                </div>
              )}
              <div className="flex gap-3">
                <Input
                  placeholder="https://www.linkedin.com/in/nom-journaliste"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  className="flex-1"
                  type="url"
                />
                <Button type="submit" disabled={linkedinLoading}>
                  {linkedinLoading ? "Ajout..." : "Ajouter"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Vous pouvez aussi utiliser l&apos;extension Chrome pour capturer les profils directement depuis LinkedIn.
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Manual create form — secondary action */}
      {addMode === "manual" && (
        <Card>
          <CardHeader>
            <CardTitle>Saisie manuelle</CardTitle>
            <CardDescription>
              Ajoutez un journaliste en remplissant les informations manuellement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              {createError && (
                <div className="col-span-2 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{createError}</p>
                </div>
              )}
              <Input
                placeholder="Prenom"
                value={createForm.first_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, first_name: e.target.value })
                }
              />
              <Input
                placeholder="Nom"
                value={createForm.last_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, last_name: e.target.value })
                }
              />
              <Input
                placeholder="Email"
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
              />
              <Input
                placeholder="Poste"
                value={createForm.job_title}
                onChange={(e) =>
                  setCreateForm({ ...createForm, job_title: e.target.value })
                }
              />
              <Input
                placeholder="Nom du media"
                value={createForm.media_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, media_name: e.target.value })
                }
              />
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={createForm.media_type}
                onChange={(e) =>
                  setCreateForm({ ...createForm, media_type: e.target.value })
                }
              >
                <option value="">Type de media</option>
                <option value="presse_ecrite">Presse ecrite</option>
                <option value="tv">TV</option>
                <option value="radio">Radio</option>
                <option value="web">Web</option>
                <option value="podcast">Podcast</option>
                <option value="agence">Agence</option>
              </select>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={createForm.media_scope}
                onChange={(e) =>
                  setCreateForm({ ...createForm, media_scope: e.target.value })
                }
              >
                <option value="">Portee</option>
                <option value="national">National</option>
                <option value="regional">Regional</option>
                <option value="international">International</option>
                <option value="specialise">Specialise</option>
              </select>
              <Input
                placeholder="Secteur macro"
                value={createForm.sector_macro}
                onChange={(e) =>
                  setCreateForm({ ...createForm, sector_macro: e.target.value })
                }
              />
              <div className="col-span-2 flex justify-end">
                <Button type="submit" disabled={creating}>
                  {creating ? "Creation..." : "Creer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search and filters */}
      <div className="flex flex-wrap items-end gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Rechercher (nom, media, email...)"
            className="w-72"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>
        <select
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          value={mediaType}
          onChange={(e) => {
            setMediaType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous les types</option>
          <option value="presse_ecrite">Presse ecrite</option>
          <option value="tv">TV</option>
          <option value="radio">Radio</option>
          <option value="web">Web</option>
          <option value="podcast">Podcast</option>
          <option value="agence">Agence</option>
        </select>
        <select
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          value={mediaScope}
          onChange={(e) => {
            setMediaScope(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Toutes portees</option>
          <option value="national">National</option>
          <option value="regional">Regional</option>
          <option value="international">International</option>
          <option value="specialise">Specialise</option>
        </select>
        <select
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          value={sectorMacro}
          onChange={(e) => {
            setSectorMacro(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous secteurs</option>
          <option value="environnement">Environnement</option>
          <option value="energie">Energie</option>
          <option value="tech">Tech</option>
          <option value="politique">Politique</option>
          <option value="economie">Economie</option>
          <option value="sante">Sante</option>
          <option value="culture">Culture</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 rounded-md border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} selectionne{selectedIds.size > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            onClick={() => setShowBulkAdd(true)}
          >
            Ajouter a une liste
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Deselectionner
          </Button>
        </div>
      )}

      {/* Bulk add modal */}
      {showBulkAdd && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ajouter a une liste</CardTitle>
                <CardDescription>
                  Selectionnez la liste de destination pour {selectedIds.size} journaliste{selectedIds.size > 1 ? "s" : ""}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowBulkAdd(false)}>
                Fermer
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {bulkSuccess && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-800">{bulkSuccess}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Client</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">Choisir un client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Campagne</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  disabled={!selectedClientId}
                >
                  <option value="">Choisir une campagne</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Liste</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  disabled={!selectedCampaignId}
                >
                  <option value="">Choisir une liste</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleBulkAddToList}
                disabled={!selectedListId || bulkAdding}
              >
                {bulkAdding ? "Ajout en cours..." : `Ajouter ${selectedIds.size} journaliste${selectedIds.size > 1 ? "s" : ""}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-10 px-4 text-left font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center">
                  Chargement...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Aucun journaliste trouve.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} sur {totalPages} ({total} resultats)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Precedent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
