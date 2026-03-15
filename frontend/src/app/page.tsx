import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold tracking-tight">
        425PPM — Outil de Sourcing Journalistes
      </h1>
      <p className="text-muted-foreground text-lg">
        Plateforme de gestion des contacts presse et médias
      </p>
      <Link
        href="/login"
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-8 text-sm font-medium transition-colors"
      >
        Se connecter
      </Link>
    </main>
  );
}
