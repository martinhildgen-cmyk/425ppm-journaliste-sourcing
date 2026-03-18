"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export default function ImportPage() {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith(".csv")) {
      setFile(droppedFile);
      setResult(null);
      setError(null);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const BASE_URL =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${BASE_URL}/import/journalists`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Erreur ${res.status}: ${res.statusText}`);
      }

      const data: ImportResult = await res.json();
      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import CSV</h1>
        <p className="text-muted-foreground mt-1">
          Importez un fichier CSV de journalistes
        </p>
      </div>

      {/* Format instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Format attendu</CardTitle>
          <CardDescription>
            Le fichier CSV doit contenir au minimum un prenom, nom ou email par ligne
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
            prenom, nom, email, poste, media, media_type, media_scope, linkedin, twitter, ville, pays
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              <strong>media_type</strong> : presse_ecrite, tv, radio, web, podcast, agence
              &nbsp;·&nbsp;
              <strong>media_scope</strong> : national, regional, international, specialise
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
                window.open(`${BASE_URL}/import/template`, "_blank");
              }}
            >
              Telecharger le modele CSV
            </Button>
            <p className="text-xs text-muted-foreground">
              Encodage UTF-8, separateur virgule. Les doublons (email ou LinkedIn) sont ignores.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uploader un fichier</CardTitle>
          <CardDescription>
            Glissez-deposez un fichier CSV ou cliquez pour en selectionner un
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-4 text-muted-foreground"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            <p className="text-sm text-muted-foreground mb-2">
              Glissez votre fichier CSV ici
            </p>
            <label className="cursor-pointer">
              <span className="text-sm text-primary underline">
                ou cliquez pour parcourir
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>

          {file && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm">
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground ml-2">
                  ({(file.size / 1024).toFixed(1)} Ko)
                </span>
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? "Import en cours..." : "Importer"}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-2">
              <p className="text-sm font-medium text-green-800">
                Import termine
              </p>
              <ul className="text-sm text-green-700 space-y-1">
                <li>Crees : {result.created}</li>
                <li>Ignores : {result.skipped}</li>
                {result.errors.length > 0 && (
                  <li>Erreurs : {result.errors.length}</li>
                )}
              </ul>
              {result.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-red-600">
                    Voir les erreurs
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-600">
                        {err}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
