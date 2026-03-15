# 425PPM — Outil de Sourcing Journalistes

Outil interne de veille et sourcing journalistes pour l'agence 425PPM. Un "Mini-Meltwater" qui automatise la recherche, l'enrichissement et la qualification IA de contacts presse.

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| **Frontend** | Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Table |
| **Backend** | Python, FastAPI (async), Pydantic, SQLAlchemy, Alembic |
| **Base de donnees** | PostgreSQL |
| **Cache / Queue** | Redis, Celery (workers + Beat cron) |
| **IA** | Abstraction multi-LLM (Gemini / OpenAI / Mistral) |
| **Extension** | Chrome Manifest V3 (Side Panel + Content Script) |
| **Hebergement** | Vercel (frontend) + Railway (API + BDD + Redis) |

## Architecture

```
frontend/          → Next.js (Vercel)
backend/           → FastAPI + Celery (Railway)
  app/
    routers/       → Endpoints API (journalists, ai, extension, dashboard...)
    models/        → SQLAlchemy models
    services/      → Dropcontact, Brave Search, Trafilatura, LLM, cache, audit
    tasks.py       → Celery tasks (enrichissement, crons)
    worker.py      → Celery config + Beat schedule
extension/         → Chrome extension (TypeScript, Manifest V3)
  src/             → content.ts, background.ts, sidepanel.ts, api.ts, selectors.ts
```

## Installation locale

### Pre-requis

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configurer les variables d'environnement
cp .env.example .env
# Editer .env avec vos cles API

# Migrations
alembic upgrade head

# Seed data (optionnel)
python scripts/seed.py

# Lancer le serveur
uvicorn app.main:app --reload --port 8000

# Lancer le worker Celery (dans un autre terminal)
celery -A app.worker:celery_app worker --loglevel=info

# Lancer Celery Beat (crons, dans un autre terminal)
celery -A app.worker:celery_app beat --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Accessible sur http://localhost:3000
```

### Extension Chrome

```bash
cd extension
npm install
npm run build
# Charger extension/dist/ dans chrome://extensions (mode developpeur)
```

## Variables d'environnement

| Variable | Description | Defaut |
|----------|-------------|--------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://...localhost/journaliste_sourcing` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379/0` |
| `SECRET_KEY` | Cle JWT (changer en prod) | `change-me-in-production` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | |
| `FRONTEND_URL` | URL du frontend | `http://localhost:3000` |
| `LLM_PROVIDER` | Provider IA (`gemini`, `openai`, `mistral`) | `gemini` |
| `LLM_API_KEY` | Cle API du provider LLM | |
| `DROPCONTACT_API_KEY` | Cle API Dropcontact (enrichissement email) | |
| `BRAVE_SEARCH_API_KEY` | Cle API Brave Search (articles) | |
| `SENTRY_DSN` | Sentry error tracking (optionnel) | |

## API Documentation

La documentation OpenAPI est auto-generee par FastAPI :

- **Swagger UI** : `http://localhost:8000/docs`
- **ReDoc** : `http://localhost:8000/redoc`

### Endpoints principaux

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/journalists/` | Lister avec filtres et pagination |
| `POST` | `/journalists/` | Creer un journaliste |
| `GET` | `/journalists/{id}` | Fiche detaillee |
| `PUT` | `/journalists/{id}` | Modifier |
| `DELETE` | `/journalists/{id}` | Supprimer (RGPD) |
| `POST` | `/enrichment/journalists/{id}` | Lancer enrichissement |
| `POST` | `/ai/journalists/{id}/analyze` | Analyse IA (Profiler + Classifieur) |
| `POST` | `/ai/journalists/{id}/pitch-match` | Pitch Matcher |
| `POST` | `/import/journalists` | Import CSV |
| `GET` | `/dashboard/stats` | Statistiques |
| `GET` | `/dashboard/alerts` | Alertes mouvement |
| `GET` | `/dashboard/rgpd/registre` | Registre RGPD |

## Cron Jobs (Celery Beat)

| Job | Frequence | Description |
|-----|-----------|-------------|
| `check_job_changes` | Dimanche 3h | Detection changements de poste via Brave Search |
| `refresh_articles` | Quotidien 4h | Rafraichissement articles (top 20 journalistes) |
| `purge_inactive` | 1er du mois 2h | Purge RGPD (fiches inactives > 12 mois) |

## Extension Chrome

L'extension permet de capturer des profils LinkedIn directement dans l'outil :

- **Mode unitaire** : clic sur un profil LinkedIn → capture en 2 clics
- **Mode bulk** : cases a cocher sur les resultats de recherche → capture en masse
- **Mode degrade** : import par URL si les selecteurs CSS LinkedIn changent
- **Rate limiting** : 30/heure, 100/jour
- **Detection de casse** : alerte automatique si les selecteurs ne fonctionnent plus

## Tests

```bash
cd backend
python -m pytest tests/ -v
```

## Conformite RGPD

- **Base legale** : Interet legitime (contacts professionnels B2B)
- **Droit a l'oubli** : `DELETE /journalists/{id}`
- **Purge automatique** : fiches non consultees depuis 12+ mois (hors suivis)
- **Registre de traitement** : `GET /dashboard/rgpd/registre`
- **Audit log** : toutes les actions sont tracees
- **Chiffrement** : tokens JWT, cles API en variables d'environnement

## Couts estimes (MVP)

~50-65 $/mois pour 1000 journalistes et 2-3 utilisateurs.

| Service | Cout |
|---------|------|
| Dropcontact | 29 EUR/mois |
| Brave Search | ~5-10 $/mois |
| LLM (Gemini) | ~1 $/mois |
| Railway | ~15-25 $/mois |
| Vercel | Gratuit |
| Trafilatura | Gratuit |
