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
  // Error messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pitch Matcher
  const [pitchText, setPitchText] = useState("");
  const [pitchResult, setPitchResult] = useState<PitchMatch | null>(null);
  const [pitching, setPitching] = useState(false);
  const [pitchHistory, setPitchHistory] = useState<PitchMatch[]>([]);

  // Tabs
  const [activeTab, setActiveTab] = useState<"intelligence" | "profil" | "activite" | "notes">("intelligence");

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
    setErrorMsg(null);
    try {
      // Only send editable fields to avoid validation errors
      const payload = {
        first_name: editForm.first_name ?? null,
        last_name: editForm.last_name ?? null,
        email: editForm.email ?? null,
        job_title: editForm.job_title ?? null,
        linkedin_url: editForm.linkedin_url ?? null,
        twitter_url: editForm.twitter_url ?? null,
        city: editForm.city ?? null,
        country: editForm.country ?? null,
        media_name: editForm.media_name ?? null,
        media_type: editForm.media_type ?? null,
        media_scope: editForm.media_scope ?? null,
      };
      const updated = await apiFetch<Journalist>(`/journalists/${id}`, {
        method: "PUT",
        token: token ?? undefined,
        body: JSON.stringify(payload),
      });
      setJournalist(updated);
      setEditForm(updated);
      setEditing(false);
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Erreur lors de la sauvegarde"
      );
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
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Erreur lors de la suppression"
      );
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
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Erreur lors du suivi"
      );
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setErrorMsg(null);
    try {
      const result = await apiFetch<{ status: string; articles_found: number; errors: string[] }>(
        `/enrichment/journalists/${id}`,
        {
          method: "POST",
          token: token ?? undefined,
        }
      );
      // Refresh data
      const j = await apiFetch<Journalist>(`/journalists/${id}`, {
        token: token ?? undefined,
      });
      setJournalist(j);
      const a = await apiFetch<typeof articles>(
        `/enrichment/journalists/${id}/articles`,
        { token: token ?? undefined }
      );
      setArticles(a);
      if (result.articles_found === 0 && result.errors.length > 0) {
        setErrorMsg(`Enrichissement: ${result.errors.join(", ")}`);
      }
    } catch (e) {
      setErrorMsg("Erreur lors de l'enrichissement. Verifiez les logs.");
    } finally {
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
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Erreur lors de l'ajout de la note"
      );
    } finally {
      setAddingNote(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setErrorMsg(null);
    try {
      await apiFetch<AIAnalyzeResponse>(
        `/ai/journalists/${id}/analyze`,
        {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({ is_draft: false }),
        }
      );
      // Refresh journalist data
      const j = await apiFetch<Journalist>(`/journalists/${id}`, {
        token: token ?? undefined,
      });
      setJournalist(j);
      setEditForm(j);
    } catch (e) {
      setErrorMsg("Erreur lors de l'analyse IA. Verifiez la cle API LLM.");
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
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Erreur lors du pitch match"
      );
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
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Erreur lors de la suppression de la note"
      );
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

  const displaySource = editing ? editForm : journalist;
  const fullName =
    [displaySource.first_name, displaySource.last_name].filter(Boolean).join(" ") ||
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

      {/* Error message */}
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{errorMsg}</p>
          <button
            className="text-xs text-red-600 underline mt-1"
            onClick={() => setErrorMsg(null)}
          >
            Fermer
          </button>
        </div>
      )}

      {/* Bad Buzz alert */}
      {journalist.bad_buzz_risk && (
        <div className="rounded-md border border-red-300 bg-red-100 p-4 flex items-center gap-3">
          <Badge variant="destructive" className="bg-red-600">Bad Buzz</Badge>
          <p className="text-sm font-medium text-red-900">
            Ce journaliste presente un risque de bad buzz. Verifiez son historique avant tout pitch.
          </p>
        </div>
      )}

      {/* Movement alert */}
      {journalist.movement_alert && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 flex items-center gap-3">
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">Mouvement</Badge>
          <p className="text-sm text-amber-900">
            Changement de poste recent detecte.
            {journalist.job_title_previous && (
              <> Ancien poste : {journalist.job_title_previous}.</>
            )}
            {journalist.media_name_previous && (
              <> Ancien media : {journalist.media_name_previous}.</>
            )}
          </p>
        </div>
      )}

      {/* Enrichment in progress indicator */}
      {!journalist.ai_summary && journalist.created_at &&
        (new Date().getTime() - new Date(journalist.created_at).getTime()) < 5 * 60 * 1000 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-blue-800">
            Enrichissement en cours... Les donnees de contact, articles et l&apos;analyse IA seront disponibles dans quelques instants.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: "intelligence", label: "Intelligence" },
          { key: "profil", label: "Profil" },
          { key: "activite", label: "Activite" },
          { key: "notes", label: "Notes" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profil" && (
      <>
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
      </>
      )}

      {activeTab === "intelligence" && (
      <>
      {/* Intelligence IA */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Intelligence IA</CardTitle>
            <CardDescription>
              Analyse automatique du profil journaliste
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? "Analyse en cours..." : journalist.ai_summary ? "Re-analyser" : "Analyser"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
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

                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {activeTab === "activite" && (
      <>
      {/* Enrichissement + Articles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Articles recents</CardTitle>
            <CardDescription>
              Derniers articles publies par ce journaliste
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
              Aucun article trouve. Cliquez sur &quot;Enrichir&quot; pour lancer
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
      </>
      )}

      {activeTab === "notes" && (
      <>
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
      </>
      )}
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
