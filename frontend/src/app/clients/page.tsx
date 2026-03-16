"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Client, Campaign } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ClientsPage() {
  const { token } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [campaignCounts, setCampaignCounts] = useState<Record<string, number>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [createForm, setCreateForm] = useState({
    name: "",
    sector: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClients() {
      try {
        const data = await apiFetch<Client[]>("/clients/", {
          token: token ?? undefined,
        });
        setClients(data);

        // Fetch campaign counts for each client
        const counts: Record<string, number> = {};
        await Promise.all(
          data.map(async (client) => {
            try {
              const campaigns = await apiFetch<Campaign[]>(
                `/campaigns/?client_id=${client.id}`,
                { token: token ?? undefined }
              );
              counts[client.id] = campaigns.length;
            } catch {
              counts[client.id] = 0;
            }
          })
        );
        setCampaignCounts(counts);
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const client = await apiFetch<Client>("/clients/", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({
          name: createForm.name,
          sector: createForm.sector || undefined,
          description: createForm.description || undefined,
        }),
      });
      setClients([...clients, client]);
      setCampaignCounts({ ...campaignCounts, [client.id]: 0 });
      setShowCreateForm(false);
      setCreateForm({ name: "", sector: "", description: "" });
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Erreur lors de la creation du client."
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">
            Gerez vos clients et leurs campagnes
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? "Annuler" : "Nouveau client"}
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau client</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{createError}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Nom du client *"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  required
                />
                <Input
                  placeholder="Secteur"
                  value={createForm.sector}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, sector: e.target.value })
                  }
                />
              </div>
              <Input
                placeholder="Description"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    description: e.target.value,
                  })
                }
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={creating}>
                  {creating ? "Creation..." : "Creer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Aucun client. Creez votre premier client pour commencer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle>{client.name}</CardTitle>
                  {client.sector && (
                    <CardDescription>{client.sector}</CardDescription>
                  )}
                </CardHeader>
                {client.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {client.description}
                    </p>
                  </CardContent>
                )}
                <CardFooter>
                  <p className="text-xs text-muted-foreground">
                    {campaignCounts[client.id] ?? 0} campagne
                    {(campaignCounts[client.id] ?? 0) !== 1 ? "s" : ""}
                  </p>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
