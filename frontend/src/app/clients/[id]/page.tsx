"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Client, Campaign, MediaList } from "@/lib/types";
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

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = use(params);
  const { token } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignLists, setCampaignLists] = useState<
    Record<string, MediaList[]>
  >({});
  const [loading, setLoading] = useState(true);

  // Create campaign form
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
  });
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  // Create list form
  const [showListFormFor, setShowListFormFor] = useState<string | null>(null);
  const [listName, setListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [clientData, campaignsData] = await Promise.all([
          apiFetch<Client>(`/clients/${id}`, { token: token ?? undefined }),
          apiFetch<Campaign[]>(`/campaigns/?client_id=${id}`, {
            token: token ?? undefined,
          }),
        ]);
        setClient(clientData);
        setCampaigns(campaignsData);

        // Fetch lists for each campaign
        const listsMap: Record<string, MediaList[]> = {};
        await Promise.all(
          campaignsData.map(async (campaign) => {
            try {
              const lists = await apiFetch<MediaList[]>(
                `/lists/?campaign_id=${campaign.id}`,
                { token: token ?? undefined }
              );
              listsMap[campaign.id] = lists;
            } catch {
              listsMap[campaign.id] = [];
            }
          })
        );
        setCampaignLists(listsMap);
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, token]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.name.trim()) return;
    setCreatingCampaign(true);
    try {
      const campaign = await apiFetch<Campaign>("/campaigns/", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({
          name: campaignForm.name,
          client_id: id,
          description: campaignForm.description || undefined,
        }),
      });
      setCampaigns([...campaigns, campaign]);
      setCampaignLists({ ...campaignLists, [campaign.id]: [] });
      setShowCampaignForm(false);
      setCampaignForm({ name: "", description: "" });
    } catch {
      // error
    } finally {
      setCreatingCampaign(false);
    }
  };

  const handleCreateList = async (campaignId: string) => {
    if (!listName.trim()) return;
    setCreatingList(true);
    try {
      const list = await apiFetch<MediaList>("/lists/", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({
          name: listName,
          campaign_id: campaignId,
        }),
      });
      setCampaignLists({
        ...campaignLists,
        [campaignId]: [...(campaignLists[campaignId] ?? []), list],
      });
      setShowListFormFor(null);
      setListName("");
    } catch {
      // error
    } finally {
      setCreatingList(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-muted-foreground">Client non trouve.</p>
        <Button asChild variant="outline">
          <Link href="/clients">Retour</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/clients">← Retour</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <p className="text-muted-foreground text-sm">
            {client.sector && <>{client.sector} &middot; </>}
            {client.description ?? "Aucune description"}
          </p>
        </div>
      </div>

      {/* Campaigns */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Campagnes</h2>
        <Button
          size="sm"
          onClick={() => setShowCampaignForm(!showCampaignForm)}
        >
          {showCampaignForm ? "Annuler" : "Nouvelle campagne"}
        </Button>
      </div>

      {showCampaignForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreateCampaign} className="flex gap-4">
              <Input
                placeholder="Nom de la campagne *"
                value={campaignForm.name}
                onChange={(e) =>
                  setCampaignForm({ ...campaignForm, name: e.target.value })
                }
                required
                className="flex-1"
              />
              <Input
                placeholder="Description"
                value={campaignForm.description}
                onChange={(e) =>
                  setCampaignForm({
                    ...campaignForm,
                    description: e.target.value,
                  })
                }
                className="flex-1"
              />
              <Button type="submit" disabled={creatingCampaign}>
                {creatingCampaign ? "..." : "Creer"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Aucune campagne. Creez une campagne pour commencer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const lists = campaignLists[campaign.id] ?? [];
            return (
              <Card key={campaign.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{campaign.name}</CardTitle>
                      {campaign.description && (
                        <CardDescription>
                          {campaign.description}
                        </CardDescription>
                      )}
                    </div>
                    <Badge variant="secondary">{campaign.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">
                      Listes ({lists.length})
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setShowListFormFor(
                          showListFormFor === campaign.id
                            ? null
                            : campaign.id
                        )
                      }
                    >
                      {showListFormFor === campaign.id
                        ? "Annuler"
                        : "Nouvelle liste"}
                    </Button>
                  </div>

                  {showListFormFor === campaign.id && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nom de la liste"
                        value={listName}
                        onChange={(e) => setListName(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        disabled={creatingList}
                        onClick={() => handleCreateList(campaign.id)}
                      >
                        {creatingList ? "..." : "Creer"}
                      </Button>
                    </div>
                  )}

                  {lists.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucune liste.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {lists.map((list) => (
                        <Link
                          key={list.id}
                          href={`/lists/${list.id}`}
                          className="flex items-center justify-between rounded-md border p-3 text-sm transition-colors hover:bg-muted/50"
                        >
                          <span className="font-medium">{list.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(list.created_at).toLocaleDateString(
                              "fr-FR"
                            )}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
