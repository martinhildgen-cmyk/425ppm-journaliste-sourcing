"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { Journalist, Note } from "@/lib/types";
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

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

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

    fetchJournalist();
    fetchNotes();
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
        <CardHeader>
          <CardTitle>Intelligence IA</CardTitle>
          <CardDescription>
            Analyse automatique du profil journaliste
          </CardDescription>
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
