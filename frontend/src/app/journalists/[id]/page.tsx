"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Journalist, Note, AIAnalyzeResponse, PitchMatch } from "@/lib/types";
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

interface JournalistDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function JournalistDetailPage({
  params,
}: JournalistDetailPageProps) {
  const { id } = use(params);
  const { token } = useAuth();
  const router = useRouter();

  const [journalist, setJournalist] = useState<Journalist | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Journalist>>({});
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Articles
  const [articles, setArticles] = useState<
    { id: string; title: string; url: string; published_at: string | null; has_text: boolean }[]
  >([]);
  const [enriching, setEnriching] = useState(false);

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // AI Analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [draftAnalysis, setDraftAnalysis] = useState<AIAnalyzeResponse | null>(null);

  // Pitch Matcher
  const [pitchText, setPitchText] = useState("");
  const [pitchResult, setPitchResult] = useState<PitchMatch | null>(null);
  const [pitching, setPitching] = useState(false);
  const [pitchHistory, setPitchHistory] = useState<PitchMatch[]>([]);

  useEffect(() => {
    async function fetchJournalist() {
      try {
        const j = await apiFetch<Journalist>(`/journalists/${id}`, {
          token: token ?? undefined,
        });
        setJournalist(j);
        setEditForm(j);
      } catch {
        // not found
      } finally {
        setLoading(false);
      }
    }

    async function fetchNotes() {
      try {
        const n = await apiFetch<Note[]>(`/journalists/${id}/notes/`, {
          token: token ?? undefined,
        });
        setNotes(n);
      } catch {
        // ignore
      }
    }

    async function fetchArticles() {
      try {
        const a = await apiFetch<typeof articles>(
          `/enrichment/journalists/${id}/articles`,
          { token: token ?? undefined }
        );
        setArticles(a);
      } catch {
        // ignore
      }
    }

    async function fetchPitchHistory() {
      try {
        const res = await apiFetch<{ items: PitchMatch[] }>(
          `/ai/journalists/${id}/pitch-matches?include_drafts=true`,
          { token: token ?? undefined }
        );
        setPitchHistory(res.items);
      } catch {
        // ignore
      }
    }

    fetchJournalist();
    fetchNotes();
    fetchArticles();
    fetchPitchHistory();
  }, [id, token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch<Journalist>(`/journalists/${id}`, {
        method: "PUT",
        token: token ?? undefined,
        body: JSON.stringify(editForm),
      });
      setJournalist(updated);
      setEditForm(updated);
      setEditing(false);
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch<void>(`/journalists/${id}`, {
        method: "DELETE",
        token: token ?? undefined,
      });
      router.push("/journalists");
    } catch {
      // error
    }
  };

  const handleToggleWatch = async () => {
    if (!journalist) return;
    try {
      const updated = await apiFetch<Journalist>(`/journalists/${id}`, {
        method: "PUT",
        token: token ?? undefined,
        body: JSON.stringify({ is_watched: !journalist.is_watched }),
      });
      setJournalist(updated);
      setEditForm(updated);
    } catch {
      // error
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      await apiFetch(`/enrichment/journalists/${id}`, {
        method: "POST",
        token: token ?? undefined,
      });
      // Poll for updates after a delay
      setTimeout(async () => {
        try {
          const j = await apiFetch<Journalist>(`/journalists/${id}`, {
            token: token ?? undefined,
          });
          setJournalist(j);
          const a = await apiFetch<typeof articles>(
            `/enrichment/journalists/${id}/articles`,
            { token: token ?? undefined }
          );
          setArticles(a);
        } catch {
          // ignore
        }
        setEnriching(false);
      }, 5000);
    } catch {
      setEnriching(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const note = await apiFetch<Note>(`/journalists/${id}/notes/`, {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({ body: newNote }),
      });
      setNotes([note, ...notes]);
      setNewNote("");
    } catch {
      // error
    } finally {
      setAddingNote(false);
    }
  };

  const handleAnalyze = async (isDraft: boolean) => {
    setAnalyzing(true);
    setDraftAnalysis(null);
    try {
      const result = await apiFetch<AIAnalyzeResponse>(
        `/ai/journalists/${id}/analyze`,
        {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({ is_draft: isDraft }),
        }
      );
      if (isDraft) {
        setDraftAnalysis(result);
      } else {
        // Refresh journalist data
        const j = await apiFetch<Journalist>(`/journalists/${id}`, {
          token: token ?? undefined,
        });
        setJournalist(j);
        setEditForm(j);
      }
    } catch {
      // error
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePitchMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pitchText.trim()) return;
    setPitching(true);
    setPitchResult(null);
    try {
      const result = await apiFetch<PitchMatch>(
        `/ai/journalists/${id}/pitch-match`,
        {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({ pitch_text: pitchText, is_draft: false }),
        }
      );
      setPitchResult(result);
      setPitchHistory([result, ...pitchHistory]);
    } catch {
      // error
    } finally {
      setPitching(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await apiFetch<void>(`/journalists/${id}/notes/${noteId}`, {
        method: "DELETE",
        token: token ?? undefined,
      });
      setNotes(notes.filter((n) => n.id !== noteId));
    } catch {
      // error
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!journalist) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-muted-foreground">Journaliste non trouve.</p>
        <Button asChild variant="outline">
          <Link href="/journalists">Retour</Link>
        </Button>
      </div>
    );
  }

  const fullName =
    [journalist.first_name, journalist.last_name].filter(Boolean).join(" ") ||
    "Sans nom";

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/journalists">← Retour</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            <p className="text-muted-foreground text-sm">
              {journalist.job_title ?? "—"} &middot;{" "}
              {journalist.media_name ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={journalist.is_watched ? "default" : "outline"}
            size="sm"
            onClick={handleToggleWatch}
          >
            {journalist.is_watched ? "Suivi actif" : "Suivre"}
          </Button>
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setEditForm(journalist);
                }}
              >
                Annuler
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              Modifier
            </Button>
          )}
          {showDeleteConfirm ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
              >
                Confirmer
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Non
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Supprimer
            </Button>
          )}
        </div>
      </div>

      {/* Movement alert */}
      {journalist.movement_alert && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <Badge variant="destructive">Changement detecte</Badge>
          <p className="text-sm text-red-800">
            Ce journaliste a change de poste ou de media.
            {journalist.job_title_previous && (
              <> Ancien poste : {journalist.job_title_previous}.</>
            )}
            {journalist.media_name_previous && (
              <> Ancien media : {journalist.media_name_previous}.</>
            )}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identite */}
        <Card>
          <CardHeader>
            <CardTitle>Identite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <Field label="Prenom">
                  <Input
                    value={editForm.first_name ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, first_name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Nom">
                  <Input
                    value={editForm.last_name ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, last_name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email">
                  <Input
                    value={editForm.email ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                  />
                </Field>
                <Field label="Poste">
                  <Input
                    value={editForm.job_title ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, job_title: e.target.value })
                    }
                  />
                </Field>
                <Field label="LinkedIn">
                  <Input
                    value={editForm.linkedin_url ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, linkedin_url: e.target.value })
                    }
                  />
                </Field>
                <Field label="Twitter">
                  <Input
                    value={editForm.twitter_url ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, twitter_url: e.target.value })
                    }
                  />
                </Field>
                <Field label="Ville">
                  <Input
                    value={editForm.city ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, city: e.target.value })
                    }
                  />
                </Field>
                <Field label="Pays">
                  <Input
                    value={editForm.country ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, country: e.target.value })
                    }
                  />
                </Field>
              </>
            ) : (
              <>
                <FieldDisplay label="Email">
                  <span className="flex items-center gap-2">
                    {journalist.email ?? "—"}
                    <EmailStatusBadge status={journalist.email_status} />
                  </span>
                </FieldDisplay>
                <FieldDisplay label="Poste">
                  {journalist.job_title ?? "—"}
                </FieldDisplay>
                <FieldDisplay label="LinkedIn">
                  {journalist.linkedin_url ? (
                    <a
                      href={journalist.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {journalist.linkedin_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </FieldDisplay>
                <FieldDisplay label="Twitter">
                  {journalist.twitter_url ? (
                    <a
                      href={journalist.twitter_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {journalist.twitter_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </FieldDisplay>
                <FieldDisplay label="Localisation">
                  {[journalist.city, journalist.country]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </FieldDisplay>
              </>
            )}
          </CardContent>
        </Card>

        {/* Media */}
        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <Field label="Nom du media">
                  <Input
                    value={editForm.media_name ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, media_name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Type de media">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={editForm.media_type ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, media_type: e.target.value })
                    }
                  >
                    <option value="">—</option>
                    <option value="presse_ecrite">Presse ecrite</option>
                    <option value="tv">TV</option>
                    <option value="radio">Radio</option>
                    <option value="web">Web</option>
                    <option value="podcast">Podcast</option>
                    <option value="agence">Agence</option>
                  </select>
                </Field>
                <Field label="Portee">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={editForm.media_scope ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, media_scope: e.target.value })
                    }
                  >
                    <option value="">—</option>
                    <option value="national">National</option>
                    <option value="regional">Regional</option>
                    <option value="international">International</option>
                    <option value="specialise">Specialise</option>
                  </select>
                </Field>
              </>
            ) : (
              <>
                <FieldDisplay label="Nom du media">
                  {journalist.media_name ?? "—"}
                </FieldDisplay>
                <FieldDisplay label="Type">
                  {journalist.media_type ?? "—"}
                </FieldDisplay>
                <FieldDisplay label="Portee">
                  {journalist.media_scope ?? "—"}
                </FieldDisplay>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Intelligence IA */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Intelligence IA</CardTitle>
            <CardDescription>
              Analyse automatique du profil journaliste
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAnalyze(true)}
              disabled={analyzing}
            >
              {analyzing ? "Analyse..." : "Re-analyser (test)"}
            </Button>
            <Button
              size="sm"
              onClick={() => handleAnalyze(false)}
              disabled={analyzing}
            >
              {analyzing ? "Analyse..." : "Analyser"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Draft preview */}
          {draftAnalysis && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                  Mode test
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Ces resultats ne sont pas enregistres
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => setDraftAnalysis(null)}
                >
                  Fermer
                </Button>
              </div>
              <FieldDisplay label="Resume IA (test)">
                {draftAnalysis.ai_summary ?? "—"}
              </FieldDisplay>
              <FieldDisplay label="Tonalite (test)">
                {draftAnalysis.ai_tonality ?? "—"}
              </FieldDisplay>
              <FieldDisplay label="Secteur (test)">
                {draftAnalysis.sector_macro ?? "—"}
              </FieldDisplay>
              <FieldDisplay label="Tags (test)">
                {draftAnalysis.tags_micro && draftAnalysis.tags_micro.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {draftAnalysis.tags_micro.map((tag) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                ) : "—"}
              </FieldDisplay>
            </div>
          )}

          <FieldDisplay label="Resume IA">
            {journalist.ai_summary ?? "Pas encore analyse"}
          </FieldDisplay>
          <FieldDisplay label="Tonalite">
            {journalist.ai_tonality ?? "—"}
          </FieldDisplay>
          <FieldDisplay label="Formats preferes">
            {journalist.ai_preferred_formats?.join(", ") ?? "—"}
          </FieldDisplay>
          <FieldDisplay label="Sujets a eviter">
            {journalist.ai_avoid_topics ?? "—"}
          </FieldDisplay>
          <FieldDisplay label="Secteur macro">
            {journalist.sector_macro ?? "—"}
          </FieldDisplay>
          <FieldDisplay label="Tags micro">
            {journalist.tags_micro && journalist.tags_micro.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {journalist.tags_micro.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              "—"
            )}
          </FieldDisplay>
          {journalist.ai_last_analyzed_at && (
            <p className="text-xs text-muted-foreground">
              Derniere analyse :{" "}
              {new Date(journalist.ai_last_analyzed_at).toLocaleDateString(
                "fr-FR"
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Suivi */}
      <Card>
        <CardHeader>
          <CardTitle>Suivi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldDisplay label="Suivi actif">
            <Badge variant={journalist.is_watched ? "default" : "secondary"}>
              {journalist.is_watched ? "Oui" : "Non"}
            </Badge>
          </FieldDisplay>
          <FieldDisplay label="Alerte mouvement">
            {journalist.movement_alert ? (
              <Badge variant="destructive">Changement detecte</Badge>
            ) : (
              <span className="text-muted-foreground">Aucun</span>
            )}
          </FieldDisplay>
          {journalist.job_title_previous && (
            <FieldDisplay label="Ancien poste">
              {journalist.job_title_previous}
            </FieldDisplay>
          )}
          {journalist.media_name_previous && (
            <FieldDisplay label="Ancien media">
              {journalist.media_name_previous}
            </FieldDisplay>
          )}
          <FieldDisplay label="Source">
            {journalist.source ?? "—"}
          </FieldDisplay>
          <FieldDisplay label="Cree le">
            {new Date(journalist.created_at).toLocaleDateString("fr-FR")}
          </FieldDisplay>
          <FieldDisplay label="Modifie le">
            {new Date(journalist.updated_at).toLocaleDateString("fr-FR")}
          </FieldDisplay>
        </CardContent>
      </Card>

      {/* Enrichissement + Articles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Articles récents</CardTitle>
            <CardDescription>
              Derniers articles publiés par ce journaliste
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnrich}
            disabled={enriching}
          >
            {enriching ? "Enrichissement..." : "Enrichir"}
          </Button>
        </CardHeader>
        <CardContent>
          {articles.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun article trouvé. Cliquez sur &quot;Enrichir&quot; pour lancer
              la recherche.
            </p>
          ) : (
            <div className="space-y-3">
              {articles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-start justify-between rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline"
                    >
                      {article.title || article.url}
                    </a>
                    {article.published_at && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {new Date(article.published_at).toLocaleDateString(
                          "fr-FR"
                        )}
                      </p>
                    )}
                  </div>
                  {article.has_text && (
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      Texte extrait
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pitch Matcher */}
      <Card className="border-blue-200/50 bg-blue-50/30">
        <CardHeader>
          <CardTitle>Pitch Matcher</CardTitle>
          <CardDescription>
            Evaluez la pertinence d&apos;un pitch pour ce journaliste
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handlePitchMatch} className="space-y-3">
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground"
              placeholder="Decrivez votre pitch ici (min. 10 caracteres)..."
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
            />
            <Button type="submit" disabled={pitching || pitchText.length < 10}>
              {pitching ? "Analyse en cours..." : "Evaluer le pitch"}
            </Button>
          </form>

          {/* Current result */}
          {pitchResult && (
            <div className={`rounded-md border p-4 space-y-3 ${
              pitchResult.verdict === "GO"
                ? "border-green-200 bg-green-50"
                : pitchResult.verdict === "NO GO"
                ? "border-red-200 bg-red-50"
                : "border-amber-200 bg-amber-50"
            }`}>
              <div className="flex items-center gap-3">
                <Badge
                  variant={pitchResult.verdict === "GO" ? "default" : "destructive"}
                  className={pitchResult.verdict === "A RISQUE" ? "bg-amber-500" : ""}
                >
                  {pitchResult.verdict}
                </Badge>
                <span className="text-2xl font-bold">
                  {pitchResult.score_match}/100
                </span>
              </div>
              {pitchResult.justification && (
                <FieldDisplay label="Justification">
                  {pitchResult.justification}
                </FieldDisplay>
              )}
              {pitchResult.angle_suggere && (
                <FieldDisplay label="Angle suggere">
                  {pitchResult.angle_suggere}
                </FieldDisplay>
              )}
              {pitchResult.bad_buzz_risk && pitchResult.risk_details && (
                <div className="rounded border border-red-300 bg-red-100 p-2 text-sm text-red-800">
                  Risque bad buzz : {pitchResult.risk_details}
                </div>
              )}
            </div>
          )}

          {/* History */}
          {pitchHistory.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Historique ({pitchHistory.length})
              </p>
              {pitchHistory.slice(0, 5).map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                >
                  <span className="truncate max-w-[300px]">
                    {pm.pitch_subject.slice(0, 60)}...
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={pm.verdict === "GO" ? "default" : "destructive"}
                      className={`text-[10px] ${pm.verdict === "\u00c0 RISQUE" ? "bg-amber-500" : ""}`}
                    >
                      {pm.verdict}
                    </Badge>
                    <span className="text-xs font-mono">{pm.score_match}/100</span>
                    {pm.is_draft && (
                      <Badge variant="outline" className="text-[10px]">test</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>
            Notes internes sur ce journaliste
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddNote} className="flex gap-2">
            <Input
              placeholder="Ajouter une note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={addingNote || !newNote.trim()}>
              {addingNote ? "..." : "Ajouter"}
            </Button>
          </form>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune note.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-start justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm">{note.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(note.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteNote(note.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldDisplay({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
