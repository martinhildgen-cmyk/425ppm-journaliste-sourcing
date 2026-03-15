"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Journalist, JournalistListResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
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
  const { token } = useAuth();
  const [data, setData] = useState<Journalist[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [mediaScope, setMediaScope] = useState("");
  const [sectorMacro, setSectorMacro] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
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
  }, [token, page, pageSize, search, mediaType, mediaScope, sectorMacro]);

  const totalPages = Math.ceil(total / pageSize);

  const columns = useMemo(
    () => [
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
    []
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
    setSearch(searchInput);
    setPage(1);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiFetch<Journalist>("/journalists/", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify(createForm),
      });
      setShowCreateForm(false);
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
      // Refresh
      setPage(1);
      setSearch("");
      setSearchInput("");
    } catch {
      // handle error
    } finally {
      setCreating(false);
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
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? "Annuler" : "Creer un journaliste"}
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau journaliste</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
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
