interface JournalistDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function JournalistDetailPage({
  params,
}: JournalistDetailPageProps) {
  const { id } = await params;

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold tracking-tight">
        Fiche Journaliste
      </h1>
      <p className="text-muted-foreground mt-2">
        Détail du journaliste #{id} — À venir
      </p>
    </main>
  );
}
