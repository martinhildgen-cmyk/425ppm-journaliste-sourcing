# Revue Critique & Plan d'Implémentation — Outil de Veille & Sourcing Journalistes 425PPM

**Date** : 2026-03-15
**Statut** : Revue v2 — Questions PO tranchées, budget optimisé
**Auteur** : Revue technique
**PO** : Martin

---

## TABLE DES MATIÈRES

1. [Synthèse Exécutive](#1-synthèse-exécutive)
2. [Revue Critique du PRD — Points Forts](#2-revue-critique--points-forts)
3. [Revue Critique du PRD — Risques et Faiblesses](#3-revue-critique--risques-et-faiblesses)
4. [Questions Ouvertes — Décisions PO](#4-questions-ouvertes--décisions-po)
5. [Comparatif LLM — Gemini vs GPT vs Mistral](#5-comparatif-llm--gemini-vs-gpt-vs-mistral)
6. [Architecture Technique Recommandée](#6-architecture-technique-recommandée)
7. [Plan d'Implémentation Détaillé (Sprints)](#7-plan-dimplémentation-détaillé)
8. [Estimations de Coûts Mensuels — Budget Optimisé](#8-estimations-de-coûts-mensuels--budget-optimisé)
9. [Matrice des Risques](#9-matrice-des-risques)
10. [Critères d'Acceptance MVP](#10-critères-dacceptance-mvp)

---

## 1. Synthèse Exécutive

Le PRD décrit un outil ambitieux et pertinent : un "Mini-Meltwater" interne pour l'agence 425PPM. La vision est solide — remplacer un processus manuel coûteux par un pipeline automatisé de sourcing, enrichissement et qualification IA de journalistes.

**Verdict global : Le PRD est bon sur la vision, mais insuffisant sur l'exécution.** Il manque des éléments critiques pour passer à l'implémentation sereinement. Ce document identifie ces lacunes et propose un plan concret.

---

## 2. Revue Critique — Points Forts

### 2.1 Vision Produit Claire
Le "pourquoi" est bien articulé. Le pain point (sourcing manuel, bases obsolètes, pitchs hors-sujet) est réel et mesurable. Les KPIs sont concrets (< 15 min, < 5% bounce, 100% adoption).

### 2.2 Modèle de Données Solide
La structure en 4 blocs (Identité, Catégorisation, Intelligence IA, Métier) est bien pensée. La séparation entre données factuelles et données générées par l'IA est correcte.

### 2.3 Prompts IA Détaillés
Le fait d'avoir 3 prompts de production pré-définis avec des formats JSON stricts est un excellent point de départ. La spécialisation (Profiler, Classifieur, Match Maker) montre une réflexion sur les cas d'usage.

### 2.4 Fallbacks Documentés
La section 3.2 montre une maturité technique : email manquant, erreurs API, paywalls, hallucinations IA — chaque cas a une réponse prévue.

### 2.5 Export HubSpot-Ready
La spécification exacte des en-têtes CSV (section 8) facilite l'intégration avec le workflow existant de l'agence.

---

## 3. Revue Critique — Risques et Faiblesses

### 3.1 RÉÉVALUÉ (Risque Modéré) — L'Extension Chrome LinkedIn

**Réévaluation** : Après analyse des extensions existantes (Lemlist, Kaspr, Waalaxy), le modèle est viable. Ces extensions fonctionnent parce qu'elles :

- Lisent le **DOM déjà chargé** dans le navigateur (pas de requêtes HTTP directes vers LinkedIn)
- Agissent **dans la session authentifiée** de l'utilisateur — pour LinkedIn, c'est l'utilisateur qui "consulte"
- Imposent un **rate limiting strict** (~80-100 actions/jour)
- **Espacent les actions** avec des délais aléatoires pour mimer un comportement humain

**Le vrai risque n'est pas le blocage mais la maintenance** : LinkedIn modifie régulièrement ses classes CSS. Lemlist/Kaspr ont des équipes dédiées pour mettre à jour les sélecteurs. Pour 425PPM, il faut :

- **Rate limiter strict** (30 profils/heure, 100/jour) avec délais aléatoires
- **Sélecteurs CSS versionnés** (config externe, pas en dur dans le code)
- **Détection de breaking changes** (si le sélecteur ne matche rien → alerte au lieu de crash)
- **Mode dégradé URL** : import via URL LinkedIn + enrichissement Dropcontact si le DOM change

### 3.2 CRITIQUE — Absence Totale de Gestion des Utilisateurs et de la Sécurité

Le PRD ne mentionne **aucun** mécanisme d'authentification ou d'autorisation :

- Qui peut accéder à l'outil ? Comment ?
- Y a-t-il des rôles (admin, attaché de presse, lecture seule) ?
- Comment protéger les données personnelles des journalistes (RGPD) ?
- Où sont stockées les clés API (Dropcontact, LLM) ?
- Le champ "Notes internes" est décrit comme "collaboratif" — quelle gestion de la concurrence ?

**Recommandation** :
- Ajouter un système d'authentification (SSO Google Workspace ou email/password avec invite).
- Définir au minimum 2 rôles : Admin (gestion des clés API, utilisateurs) et Utilisateur (usage normal).
- Implémenter un **audit log** basique (qui a modifié quoi, quand).
- Chiffrer les clés API en base.

### 3.3 CRITIQUE — RGPD Non Adressé

L'outil stocke des **données personnelles** (nom, email, profil LinkedIn, localisation) de journalistes qui n'ont pas donné leur consentement. En France, c'est un sujet RGPD majeur.

- **Aucune mention de base légale** pour le traitement (intérêt légitime ? consentement ?)
- Pas de **durée de rétention** définie
- Pas de **droit de suppression** prévu
- Pas de **registre de traitement**

**Recommandation** :
- Documenter la base légale : probablement "intérêt légitime" pour les contacts professionnels B2B (autorisé par la CNIL sous conditions).
- Implémenter une **purge automatique** des fiches non consultées depuis > 12 mois.
- Prévoir un endpoint de **suppression sur demande** (droit à l'oubli).
- Ajouter un champ "source" sur chaque fiche (traçabilité).

### 3.4 MAJEUR — Dépendance Excessive aux APIs Tierces Sans Redondance

Le PRD liste 5+ APIs externes, chacune étant un single point of failure.

**Recommandation** :
- Implémenter un **circuit breaker pattern** pour chaque intégration API.
- Prévoir un **cache agressif** des résultats d'enrichissement (TTL 7 jours minimum).
- Ajouter un **health dashboard** interne montrant le statut de chaque API.
- Prévoir un **fournisseur alternatif** pour l'email (Hunter.io en fallback de Dropcontact).

### 3.5 MAJEUR — KPI "15 minutes pour une liste qualifiée" — Calcul de Latence

Le PRD annonce "< 15 minutes" mais ne fournit aucun calcul de latence :

- Scraping LinkedIn via extension : ~3-5s par profil (avec rate limiting)
- Appel Dropcontact par contact : ~2-10s
- Extraction d'articles (Trafilatura) : ~2-5s par article × 5 articles = 10-25s par journaliste
- Analyse LLM (3 prompts) : ~1-5s par prompt = 3-15s par journaliste

**Pour une liste de 20 journalistes (en parallèle, 5 à la fois)** : ~4 batches × 30s = ~2-3 minutes pour les journalistes déjà en base avec pré-enrichissement. Pour les nouveaux : ~8-10 minutes.

**Recommandation** :
- **Pré-enrichir** tous les profils à la création (articles + IA calculés en background)
- Paralléliser (5 contacts simultanés via Celery workers)
- Le KPI "< 15 min" est tenable pour 20 contacts **déjà en base**

### 3.6 MAJEUR — Aucune Stratégie de Test ou de Qualité

**Recommandation** :
- Prévoir des **mocks** pour chaque API tierce (tests sans appels réels).
- Mettre en place un **environnement de staging** dès le Sprint 1.
- Ajouter du **monitoring** (Sentry pour les erreurs, UptimeRobot pour la disponibilité).
- Implémenter des **tests de non-régression** sur les prompts IA (golden tests).

### 3.7 MODÉRÉ — Les Prompts IA Sont Fragiles

**Recommandation** :
- Ajouter `"langue_sortie": "français"` dans chaque prompt système.
- Sanitizer tous les inputs utilisateur avant injection dans les prompts.
- Stocker les prompts en base avec **versioning** (v1, v2...) et A/B testing possible.
- Assouplir : "entre 2 et 5 tags_micro" plutôt que "exactement 3".
- Définir des seuils pour score_match : 0-30 = NO GO, 31-60 = À RISQUE, 61-100 = GO.
- **Bouton "Re-analyser (test)"** sur la fiche profil pour itérer sans polluer la prod.

### 3.8 MODÉRÉ — UI/UX Sans Designer

Pas de designer disponible. **Solution** : utiliser **shadcn/ui** (kit de composants React pré-construits, design Notion-like) + **TanStack Table** (grilles de données). Desktop-first.

### 3.9 MINEUR — Bluesky et X (Twitter) Sont Accessoires

**Décision** : **Reporter X/Bluesky à la V2.** Se concentrer sur LinkedIn + Articles pour le MVP.

### 3.10 MINEUR — "Dossier Client" Sous-Spécifié

**Décision** : **Client** (entité) → **Campagne** (sous-ensemble temporel) → **Liste** (sélection de journalistes pour un envoi). Un journaliste peut appartenir à N listes.

---

## 4. Questions Ouvertes — Décisions PO

| # | Question | Décision | Impact sur le plan |
|---|----------|----------|-------------------|
| Q1 | Combien d'utilisateurs simultanés ? | **2-3 max** | Infra légère, pas de load balancing, un seul worker Celery suffit |
| Q2 | Volume de la base cible ? | **2000 journalistes pour le MVP** | PostgreSQL largement suffisant, index basiques |
| Q3 | Budget mensuel APIs ? | **Le moins cher possible, compromis réaliste** | Exit Diffbot, exit Crustdata webhooks, LLM low-cost |
| Q4 | Mode hors connexion ? | **Non** | Architecture classique client-serveur |
| Q5 | Quel LLM ? | **Test comparatif Gemini / GPT / Mistral** | Abstraction LLM obligatoire pour switcher facilement |
| Q6 | LinkedIn Standard ou Sales Nav ? | **LinkedIn Standard d'abord**, Sales Nav en V1.1 | Un seul set de sélecteurs DOM à maintenir |
| Q7 | Mode bac à sable prompts ? | **Oui** — bouton "Re-analyser (test)" sans enregistrer | Champ `is_draft` sur les résultats IA |
| Q8 | Product Owner ? | **Martin** | Décisions rapides, pas de comité |
| Q9 | Designer disponible ? | **Non** — wireframes dev avec shadcn/ui | Kit UI pré-construit, itérations rapides |
| Q10 | Hébergement ? | **Vercel (frontend Next.js) + Railway (API + BDD + Redis)** | Stack déjà maîtrisée côté Railway |

---

## 5. Comparatif LLM — Gemini vs GPT vs Mistral

### 5.1 Tarifs par 1M de tokens (Mars 2026)

#### Modèles économiques (pour Prompts 1 & 2 : Profiler + Classifieur)

| Modèle | Provider | Input/1M tokens | Output/1M tokens | Free tier |
|--------|----------|-----------------|-------------------|-----------|
| **GPT-4.1 nano** | OpenAI | $0.02 | $0.15 | Non |
| **Mistral Small 3.2** | Mistral | $0.06 | $0.18 | Non (mais open-weight) |
| **Gemini 2.5 Flash-Lite** | Google | $0.10 | $0.40 | Oui — 1000 req/jour |
| **Gemini 2.0 Flash** | Google | $0.10 | $0.40 | Oui — 1000 req/jour |
| GPT-4o mini | OpenAI | $0.15 | $0.60 | Non |
| Mistral Small 3.1 | Mistral | $0.10 | $0.30 | Non |

#### Modèles mid-tier (pour Prompt 3 : Match Maker — nécessite plus de raisonnement)

| Modèle | Provider | Input/1M tokens | Output/1M tokens | Free tier |
|--------|----------|-----------------|-------------------|-----------|
| **Gemini 2.5 Flash** | Google | $0.30 | $2.50 | Oui — 1000 req/jour |
| **GPT-4.1 mini** | OpenAI | $0.40 | $1.60 | Non |
| **Mistral Medium 3.1** | Mistral | $0.40 | $2.00 | Non |
| Mistral Large 3 | Mistral | $0.50 | $1.50 | Non |

### 5.2 Simulation de coûts pour 1000 journalistes/mois

Hypothèses :
- **Prompt 1 (Profiler)** : ~1500 tokens input (articles), ~300 tokens output = ~1800 tokens total
- **Prompt 2 (Classifieur)** : ~1500 tokens input, ~100 tokens output = ~1600 tokens total
- **Prompt 3 (Match Maker)** : ~2000 tokens input (articles + pitch), ~200 tokens output = ~2200 tokens total
- **1000 journalistes × 3 prompts** = 3000 appels/mois

| Stratégie | Prompt 1 & 2 (×2000 appels) | Prompt 3 (×1000 appels) | Total/mois |
|-----------|---------------------------|------------------------|------------|
| **Option A : Tout Gemini Flash-Lite** | 2000 × 1700 tokens × $0.10/1M + 2000 × 200 tokens × $0.40/1M = **$0.50** | 1000 × 2000 × $0.10/1M + 1000 × 200 × $0.40/1M = **$0.28** | **~$0.78** |
| **Option B : GPT-4.1 nano + mini** | 2000 × 1700 × $0.02/1M + 2000 × 200 × $0.15/1M = **$0.13** | 1000 × 2000 × $0.40/1M + 1000 × 200 × $1.60/1M = **$1.12** | **~$1.25** |
| **Option C : Mistral Small + Medium** | 2000 × 1700 × $0.06/1M + 2000 × 200 × $0.18/1M = **$0.28** | 1000 × 2000 × $0.40/1M + 1000 × 200 × $2.00/1M = **$1.20** | **~$1.48** |
| **Option D : Gemini Flash-Lite + Flash** | 2000 × 1700 × $0.10/1M + 2000 × 200 × $0.40/1M = **$0.50** | 1000 × 2000 × $0.30/1M + 1000 × 200 × $2.50/1M = **$1.10** | **~$1.60** |

**Constat : Le LLM coûte quasiment rien.** Même avec 1000 journalistes/mois, on est entre **$0.78 et $1.60/mois**. Le choix du LLM doit se faire sur la **qualité en français**, pas le prix.

### 5.3 Recommandation LLM

| Critère | Gemini | GPT | Mistral |
|---------|--------|-----|---------|
| **Prix** | Imbattable (free tier !) | Très bon (nano = quasi gratuit) | Bon |
| **Qualité en français** | Bonne | Bonne | Excellente (modèle français) |
| **Free tier** | Oui (1000 req/jour = 30K/mois) | Non | Non |
| **Conformité RGPD** | USA (Google) | USA (OpenAI) | **EU (serveurs européens)** |
| **JSON mode fiable** | Oui (response_mime_type) | Oui (json_mode) | Oui (json_mode) |
| **Latence** | Très rapide (Flash) | Rapide (nano/mini) | Rapide |

**Recommandation** :
1. **Commencer avec Gemini 2.5 Flash-Lite** (free tier = 0$/mois pendant le dev et le MVP early)
2. **Tester Mistral Small 3.2** en parallèle pour la qualité en français + RGPD
3. **Implémenter une abstraction LLM** (interface commune) pour pouvoir switcher sans refactoring
4. GPT-4.1 nano est le backup le moins cher si les deux autres déçoivent

**Plan de test** : Prendre 10 journalistes de référence, lancer les 3 prompts sur les 3 providers, comparer les résultats côte à côte. Critères : pertinence du résumé, cohérence des tags, qualité du français, respect du format JSON.

---

## 6. Architecture Technique Recommandée

### 6.1 Stack Recommandé

```
┌──────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                       │
│  Next.js 14+ (App Router) — TypeScript — Tailwind CSS    │
│  + shadcn/ui (composants) + TanStack Table (grilles)     │
└──────────────────┬───────────────────────────────────────┘
                   │ REST API / SSE (Server-Sent Events)
┌──────────────────▼───────────────────────────────────────┐
│                    BACKEND API (Railway)                   │
│  Python (FastAPI) — async natif — Pydantic validation    │
│  + Celery (tâches async) + Redis (cache + queue + broker)│
└──────────────────┬───────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────┐
│                    BASE DE DONNÉES (Railway)               │
│  PostgreSQL (données structurées)                         │
│  + pgvector (recherche sémantique future V2)             │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│               EXTENSION CHROME                            │
│  Manifest V3 — TypeScript — Content Script + Side Panel  │
│  Rate limiter intégré (30/h, 100/j, délais aléatoires)  │
│  Communication avec le backend via API REST authentifiée  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│               SERVICES EXTERNES                           │
│  Dropcontact API    │ Brave Search API               │
│  Trafilatura (self) │ LLM API (Gemini/Mistral/GPT)      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│          CRON JOBS (Celery Beat — Railway)                │
│  Hebdo : Check changements de poste LinkedIn (scraping)  │
│  Quotidien : Refresh articles des journalistes suivis    │
│  Mensuel : Purge fiches inactives > 12 mois (RGPD)      │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Remplacement de Diffbot par Trafilatura (gratuit, meilleur score)

**Diffbot** ($299/mois minimum) est remplacé par **Trafilatura**, une librairie Python open-source qui **bat Diffbot dans les benchmarks** (ScrapingHub Article Extraction Benchmark) :

| Critère | Diffbot | Trafilatura |
|---------|---------|-------------|
| **Prix** | $299/mois (Startup) | **Gratuit** (pip install) |
| **Score F1 (benchmark)** | 0.951 | **0.958** (meilleur !) |
| **Gestion paywalls** | Partielle | Partielle (titre + chapô, comme prévu dans le PRD) |
| **Maintenance** | Aucune (SaaS) | Faible (librairie mature, releases régulières) |
| **Vitesse** | ~5-15s/page (API call) | **~1-3s/page** (local, pas de réseau) |
| **Volume illimité** | Non (crédits) | **Oui** |
| **Multilangue (FR)** | Oui | **Oui** |

**Chaîne de fallback** : Trafilatura (F1: 0.958) → readability-lxml (F1: 0.922, meilleur score médian) → newspaper4k (F1: 0.949)

**Comment ça marche** :
```python
import trafilatura

# Télécharger et extraire le texte propre d'un article
downloaded = trafilatura.fetch_url('https://www.lemonde.fr/article...')
text = trafilatura.extract(downloaded, include_comments=False)
# → Retourne le texte principal sans pub, menus, footers
```

**Fallback** : Si Trafilatura échoue (site très dynamique), on utilise **newspaper4k** (autre librairie Python gratuite) en second recours. Si les deux échouent → on garde titre + description de Brave Search (toujours disponible).

### 6.3 Remplacement de Bing News par Brave Search API

> **ATTENTION** : L'API Bing Search a été **retirée par Microsoft le 11 août 2025**. Le remplacement Microsoft ("Grounding with Bing") coûte $35/1000 requêtes — déraisonnable.

**Alternatives recherchées** :

| Service | Prix/1000 requêtes | Production OK | Notes |
|---------|-------------------|---------------|-------|
| **Brave Search API** | **~$5** | Oui | Pas de tracking, bonne qualité |
| Google Custom Search | $5 | Oui | 100 req/jour gratuit |
| Valyu Search API | $1.50 | Oui | Nouveau, moins éprouvé |
| NewsAPI.org | $449/mois (!) | Oui | Beaucoup trop cher, exclu |

**Choix : Brave Search API** — bon rapport qualité/prix, pas de tracking (cohérent avec la philosophie RGPD), API simple et bien documentée.

---

### 6.4 Remplacement de Crustdata par un Check Périodique (cron)

**Crustdata** ($200/mois pour les webhooks temps réel) est remplacé par un **cron hebdomadaire** :

#### Fonctionnement du Check Périodique

```
Celery Beat (chaque dimanche 3h du matin)
    │
    ├── Pour chaque journaliste "suivi" en base :
    │   ├── 1. Récupérer son URL LinkedIn stockée
    │   ├── 2. Faire une recherche Google : "Prénom Nom LinkedIn"
    │   ├── 3. Extraire le titre/snippet Google (contient le poste actuel)
    │   ├── 4. Comparer avec le poste stocké en base
    │   └── 5. Si différent → flag movement_alert = true + notification
    │
    └── Alternative plus fiable : Brave Search API
        ├── Requête : "Prénom Nom site:linkedin.com/in"
        ├── Le snippet contient : "Rédacteur en Chef chez Le Monde"
        └── Comparaison avec job_title en base
```

**Coût** : ~50-100 requêtes Brave/semaine (pour 2000 journalistes, on check les 50-100 les plus importants chaque semaine en rotation). ~$1-2/mois supplémentaire, inclus dans le budget Brave Search.

**Limites vs Crustdata** :
| | Crustdata (webhooks) | Check périodique (cron) |
|---|---|---|
| **Délai de détection** | Temps réel (~minutes) | **J+7 max** |
| **Fiabilité** | Haute (API dédiée) | Moyenne (dépend du snippet Google/Brave) |
| **Coût** | $200/mois | **~$1-2/mois** (inclus dans quota Brave Search) |
| **Couverture** | Tous les profils surveillés | Rotation (50-100/semaine) |

**Compromis acceptable** : Un changement de poste détecté en J+7 au lieu de temps réel est suffisant pour une agence RP. Les journalistes ne changent pas de média toutes les semaines.

**Amélioration V1.1** : Si le cron ne suffit pas, on peut ajouter Crustdata plus tard pour les 50 journalistes les plus critiques uniquement (~coût réduit).

### 6.5 Justification des Choix Techniques

| Choix | Justification | Alternative rejetée |
|-------|---------------|---------------------|
| **FastAPI** (pas Flask) | Async natif, validation Pydantic, OpenAPI auto-générée | Flask (pas adapté à l'async lourd) |
| **Next.js sur Vercel** | Déploiement zero-config, SSR, écosystème riche | Vanilla JS (trop de complexité pour 5 écrans) |
| **Railway** (API) | Déjà maîtrisé par l'équipe, PostgreSQL + Redis managés | Render (moins familier) |
| **PostgreSQL** | Requêtes complexes, intégrité relationnelle, pgvector pour V2 | MongoDB (pas de jointures) |
| **Celery + Redis** | Traitement async, cache, cron jobs (Celery Beat) | Synchrone (bloquerait l'UX) |
| **Trafilatura** | Gratuit, rapide, local, bat Diffbot en benchmark (F1: 0.958) | Diffbot ($299/mois — déraisonnable) |
| **Brave Search** | ~$5/1000 req, simple, pas de tracking | Bing (retiré août 2025), NewsAPI ($449/mois) |
| **Cron hebdo** | ~$1-2/mois, compromis délai acceptable | Crustdata ($200/mois — cher pour du MVP) |
| **Abstraction LLM** | Permet de tester/switcher Gemini/GPT/Mistral facilement | Lock-in sur un provider |
| **shadcn/ui** | Pas de designer, composants prêts, look Notion-like | Design custom (pas de designer dispo) |

### 6.6 Schéma de Base de Données (Simplifié)

```sql
-- Utilisateurs de l'agence
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user', -- 'admin' | 'user'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journalistes (entité centrale)
CREATE TABLE journalists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Bloc Identité
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    job_title VARCHAR(500),
    email VARCHAR(255),
    email_status VARCHAR(50) DEFAULT 'manquant', -- validé|invalide|catch-all|manquant
    linkedin_url VARCHAR(500) UNIQUE,
    twitter_url VARCHAR(500),
    bluesky_url VARCHAR(500),
    city VARCHAR(255),
    country VARCHAR(255),
    -- Bloc Média
    media_name VARCHAR(500),
    media_type VARCHAR(100), -- presse_ecrite|web|podcast|radio|tv|agence|newsletter
    media_scope VARCHAR(100), -- pqr|pqn|specialisee|grand_public|economique
    -- Bloc IA
    ai_summary TEXT,
    ai_tonality VARCHAR(100),
    ai_preferred_formats TEXT[], -- ARRAY
    ai_avoid_topics TEXT,
    sector_macro VARCHAR(100),
    tags_micro TEXT[],
    ai_last_analyzed_at TIMESTAMPTZ,
    ai_prompt_version VARCHAR(20),
    -- Bloc Suivi
    job_title_previous VARCHAR(500), -- pour détecter les changements
    media_name_previous VARCHAR(500),
    job_last_updated_at TIMESTAMPTZ,
    job_last_checked_at TIMESTAMPTZ, -- dernier check cron
    movement_alert BOOLEAN DEFAULT FALSE,
    is_watched BOOLEAN DEFAULT FALSE, -- suivi par le cron hebdo
    source VARCHAR(100), -- 'chrome_extension' | 'manual' | 'csv_import'
    -- Métadonnées
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW() -- pour purge RGPD
);

-- Articles ingérés
CREATE TABLE contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journalist_id UUID REFERENCES journalists(id) ON DELETE CASCADE,
    content_type VARCHAR(50), -- 'article'
    title VARCHAR(1000),
    url VARCHAR(2000) UNIQUE,
    body_text TEXT,
    published_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients de l'agence
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campagnes (sous un client)
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listes de journalistes (sous une campagne)
CREATE TABLE lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table de liaison Journaliste ↔ Liste (N:N)
CREATE TABLE list_journalists (
    list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
    journalist_id UUID REFERENCES journalists(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID REFERENCES users(id),
    PRIMARY KEY (list_id, journalist_id)
);

-- Notes collaboratives
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journalist_id UUID REFERENCES journalists(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Résultats de pitch matching (Prompt 3)
CREATE TABLE pitch_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journalist_id UUID REFERENCES journalists(id) ON DELETE CASCADE,
    pitch_subject TEXT NOT NULL,
    score_match INTEGER CHECK (score_match BETWEEN 0 AND 100),
    verdict VARCHAR(20), -- 'GO' | 'NO GO' | 'À RISQUE'
    pitch_advice TEXT,
    bad_buzz_risk BOOLEAN DEFAULT FALSE,
    is_draft BOOLEAN DEFAULT FALSE, -- mode bac à sable
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Versioning des prompts IA
CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_name VARCHAR(100) NOT NULL, -- 'profiler' | 'classifier' | 'matcher'
    version INTEGER NOT NULL,
    system_prompt TEXT NOT NULL,
    user_prompt_template TEXT NOT NULL,
    llm_provider VARCHAR(50), -- 'gemini' | 'openai' | 'mistral'
    llm_model VARCHAR(100),
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(prompt_name, version)
);

-- Audit log
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index critiques
CREATE INDEX idx_journalists_email ON journalists(email);
CREATE INDEX idx_journalists_linkedin ON journalists(linkedin_url);
CREATE INDEX idx_journalists_name ON journalists(last_name, first_name);
CREATE INDEX idx_journalists_media ON journalists(media_name, media_type);
CREATE INDEX idx_journalists_sector ON journalists(sector_macro);
CREATE INDEX idx_journalists_tags ON journalists USING GIN(tags_micro);
CREATE INDEX idx_journalists_watched ON journalists(is_watched) WHERE is_watched = true;
CREATE INDEX idx_contents_journalist ON contents(journalist_id, published_at DESC);
CREATE INDEX idx_contents_url ON contents(url);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
```

---

## 7. Plan d'Implémentation Détaillé

### Phase 0 — Fondations (Semaine 1-2)

**Objectif** : Infrastructure, CI/CD, auth, schéma BDD — rien de visible pour l'utilisateur mais tout est prêt.

| Tâche | Détail | Livrable |
|-------|--------|----------|
| 0.1 | Initialiser le monorepo : `/backend` (FastAPI), `/frontend` (Next.js), `/extension` (Chrome) | Repo GitHub structuré |
| 0.2 | Setup Docker Compose local : PostgreSQL + Redis + API + Frontend | `docker-compose.yml` fonctionnel |
| 0.3 | Implémenter le schéma BDD (Alembic migrations) | Migrations v001 |
| 0.4 | Auth : Google OAuth2 (SSO) + JWT tokens + middleware FastAPI | Login fonctionnel |
| 0.5 | CI/CD : GitHub Actions (lint + tests + build) | Pipeline vert |
| 0.6 | Deploy staging : Vercel (frontend) + Railway (API + BDD + Redis) | URLs de staging |
| 0.7 | Intégrer Sentry (error tracking) + health endpoint | Monitoring actif |
| 0.8 | Implémenter l'**abstraction LLM** (interface commune Gemini/GPT/Mistral) | Service LLM switchable |
| 0.9 | Seed data : 10 journalistes fictifs pour les tests | Fixtures |

**Critères de validation Phase 0** :
- [ ] `docker compose up` lance tout le stack localement
- [ ] Un utilisateur peut se connecter via Google OAuth
- [ ] Le schéma BDD est créé via migrations
- [ ] La CI passe au vert sur chaque PR
- [ ] Le service LLM peut appeler Gemini, GPT ou Mistral de manière interchangeable

---

### Phase 1 — CRUD Journalistes & Import Manuel (Semaine 3-4)

**Objectif** : L'utilisateur peut créer, consulter, modifier et rechercher des journalistes. Pas encore d'IA ni d'enrichissement.

| Tâche | Détail | User Story |
|-------|--------|------------|
| 1.1 | API CRUD journalistes (FastAPI + Pydantic) | — |
| 1.2 | Écran "Fiche Profil" (Écran 4 du PRD, sans IA) | — |
| 1.3 | Écran "Recherche" avec filtres stricts (média, portée, nom) | US 3.1 (partiel) |
| 1.4 | Import CSV basique (réutiliser la logique de `app.py` existant) | — |
| 1.5 | Gestion des Clients → Campagnes → Listes (CRUD complet) | US 4.1 |
| 1.6 | Ajout/retrait de journalistes dans les listes | US 4.1 |
| 1.7 | Export CSV HubSpot-ready (section 8 du PRD) | US 4.2 |
| 1.8 | Notes collaboratives sur les fiches | — |

**Critères de validation Phase 1** :
- [ ] Un utilisateur peut créer un journaliste manuellement
- [ ] La recherche par nom/média/portée fonctionne
- [ ] Un CSV de 50 journalistes peut être importé
- [ ] Un export CSV HubSpot-ready est téléchargeable
- [ ] Les notes sont partagées entre utilisateurs

---

### Phase 2 — Enrichissement Email & Articles (Semaine 5-6)

**Objectif** : Intégration Dropcontact pour les emails + ingestion automatique d'articles via Trafilatura.

| Tâche | Détail | User Story |
|-------|--------|------------|
| 2.1 | Intégration Dropcontact : enrichissement email à la création | US 2.1 |
| 2.2 | Badge visuel statut email (Validé vert / Invalide rouge / Manquant) | US 2.1 |
| 2.3 | Worker Celery : recherche articles (Brave Search API) | US 2.3 |
| 2.4 | Worker Celery : extraction texte articles (Trafilatura + newspaper4k fallback) | US 2.3 |
| 2.5 | Affichage Timeline des 5 derniers articles sur la fiche | Écran 4 |
| 2.6 | Cache Redis des résultats d'enrichissement (TTL 7 jours) | — |
| 2.7 | Circuit breaker pattern pour chaque API externe | — |
| 2.8 | Barre de progression d'enrichissement (SSE) | — |

**Critères de validation Phase 2** :
- [ ] Un journaliste créé avec prénom+nom+média reçoit un email enrichi en < 30s
- [ ] Les articles récents apparaissent sur la fiche en < 2min
- [ ] Si Dropcontact est down, la fiche est créée avec le flag "Email Manquant"
- [ ] Trafilatura extrait correctement le texte de 80%+ des articles testés

---

### Phase 3 — Intelligence Artificielle (Semaine 7-8)

**Objectif** : Les 3 prompts IA sont en production. L'outil "pense" pour l'utilisateur.

| Tâche | Détail | User Story |
|-------|--------|------------|
| 3.1 | **Test comparatif LLM** : 10 journalistes × 3 prompts × 3 providers | — |
| 3.2 | Service IA : Prompt 1 (Profiler) — résumé éditorial + tonalité | US 3.3 |
| 3.3 | Service IA : Prompt 2 (Classifieur) — secteur macro + tags micro | US 3.3 |
| 3.4 | Service IA : Prompt 3 (Match Maker) — score match + verdict | US 3.2 |
| 3.5 | Système de versioning des prompts (table `prompt_versions`) | — |
| 3.6 | Sanitization des inputs utilisateur (anti prompt injection) | — |
| 3.7 | Affichage du bloc IA sur la fiche (encadré, mis en avant) | Écran 4 |
| 3.8 | Score Match IA visible dans les résultats de recherche | Écran 2 |
| 3.9 | Bouton "Re-analyser (test)" — mode bac à sable | Q7 |
| 3.10 | Fallback : retry x2 si erreur IA, garder état précédent | PRD 3.2 |
| 3.11 | Golden tests : 10 journalistes de référence avec résultats attendus | — |
| 3.12 | Interface "Pitch Matcher" : saisir un pitch, voir les scores | US 3.2 |

**Critères de validation Phase 3** :
- [ ] Le meilleur LLM est choisi (rapport qualité français / prix)
- [ ] Chaque journaliste avec ≥3 articles a un résumé IA et des tags
- [ ] Le Pitch Matcher retourne un score + verdict en < 10s
- [ ] Les golden tests passent à 80%+ de cohérence
- [ ] Le mode bac à sable fonctionne sans modifier les données prod

---

### Phase 4 — Extension Chrome (Semaine 9-11)

**Objectif** : L'acquisition est automatisée via l'extension Chrome LinkedIn (standard).

| Tâche | Détail | User Story |
|-------|--------|------------|
| 4.1 | Scaffold extension Manifest V3 (Side Panel + Content Script) | — |
| 4.2 | Auth : l'extension utilise le JWT de la webapp | — |
| 4.3 | Mode unitaire : lecture DOM d'un profil LinkedIn individuel | US 1.1 |
| 4.4 | Mode Bulk : injection de cases à cocher sur les résultats de recherche | US 1.2 |
| 4.5 | Sélecteur de dossier client + tags manuels avant envoi | US 1.3 |
| 4.6 | Rate limiter strict (30/h, 100/j) avec délais aléatoires + compteur visible | — |
| 4.7 | Sélecteurs CSS externalisés (config JSON, pas en dur) | — |
| 4.8 | Détection de breaking changes (alerte si sélecteurs ne matchent pas) | — |
| 4.9 | Mode dégradé : import via URL LinkedIn (sans lecture DOM) | — |
| 4.10 | Animation de succès (coche verte) | Écran 3 |

**Critères de validation Phase 4** :
- [ ] Un profil LinkedIn peut être ajouté à la base en 2 clics
- [ ] Le mode Bulk fonctionne sur une recherche LinkedIn (max 25 résultats)
- [ ] Le rate limiter bloque au-delà de 30 profils/heure
- [ ] Le mode dégradé (URL) fonctionne si les sélecteurs sont cassés

---

### Phase 5 — Alertes, Dashboard & Cron (Semaine 12-13)

**Objectif** : L'outil surveille proactivement les changements et alerte l'utilisateur.

| Tâche | Détail | User Story |
|-------|--------|------------|
| 5.1 | **Cron hebdomadaire** : check changement de poste via Brave Search | US 2.2 |
| 5.2 | Comparaison automatique poste actuel vs poste stocké | US 2.2 |
| 5.3 | Traitement des alertes mouvement (MAJ fiche + flag + notification) | US 2.2 |
| 5.4 | Toggle "Suivre ce journaliste" sur la fiche profil | — |
| 5.5 | Écran Dashboard (Écran 1) : fil d'alertes mouvements | Écran 1 |
| 5.6 | Barre de recherche globale | Écran 1 |
| 5.7 | Cartes raccourcis vers les dossiers clients | Écran 1 |
| 5.8 | Re-trigger automatique de l'analyse IA post-changement de poste | — |
| 5.9 | Cron quotidien : refresh articles des journalistes les plus consultés | — |
| 5.10 | Cron mensuel : purge RGPD (fiches inactives > 12 mois) | — |

**Critères de validation Phase 5** :
- [ ] Le cron détecte un changement de poste simulé en < 1 semaine
- [ ] L'alerte apparaît sur le dashboard avec ancien/nouveau poste
- [ ] La recherche globale trouve par nom, média ou tag
- [ ] L'analyse IA est relancée automatiquement après un changement

---

### Phase 6 — Polish, Sécurité & Lancement (Semaine 14-15)

| Tâche | Détail |
|-------|--------|
| 6.1 | Audit de sécurité : injection SQL, XSS, CSRF, API keys exposure |
| 6.2 | Conformité RGPD : vérifier purge auto, droit à l'oubli, registre |
| 6.3 | Performance : optimisation des requêtes lentes (EXPLAIN ANALYZE) |
| 6.4 | Onboarding : tutoriel in-app pour les 2-3 utilisateurs |
| 6.5 | Documentation technique (README, API docs auto-générée FastAPI) |
| 6.6 | Tests de charge : 3 utilisateurs simultanés, 2000 journalistes en base |
| 6.7 | Formation de l'équipe (1 session live de 30 min) |
| 6.8 | Go-live en production |

---

## 8. Estimations de Coûts Mensuels — Budget Optimisé

### 8.1 Budget MVP (1000 journalistes/mois, 2-3 utilisateurs)

| Service | Coût estimé | Notes |
|---------|-------------|-------|
| **Dropcontact** | 29 EUR/mois | Plan Starter 500 crédits (59 EUR pour 1500 crédits si besoin) |
| **Brave Search API** | ~5-10 $/mois | ~$5/1000 requêtes, ~1000-2000 req/mois (articles + check postes) |
| **Trafilatura** | **Gratuit** | Librairie Python open-source, exécution locale |
| **LLM (Gemini Flash-Lite)** | **~$1/mois** (ou gratuit avec free tier) | 3000 appels/mois, voir calcul section 5.2 |
| **Vercel** | **Gratuit** | Plan Hobby (suffisant pour 2-3 users) |
| **Railway** | ~15-25 $/mois | API (FastAPI) + PostgreSQL + Redis |
| **Sentry** | **Gratuit** | Plan Developer |
| **Domaine** | ~12 $/an (~1 $/mois) | Optionnel |
| **TOTAL MVP** | **~50-65 $/mois (~45-60 EUR)** | |

### 8.2 Comparaison avec le budget v1

| | Budget v1 (initial) | Budget v2 (optimisé) | Économie |
|---|---|---|---|
| LLM | ~50-150 $ (Claude API) | **~$1** (Gemini) | **-99%** |
| Extraction articles | ~300 $ (Diffbot) | **$0** (Trafilatura) | **-100%** |
| Suivi postes | ~200 $ (Crustdata) | **~$1-2** (cron + Brave Search) | **-99%** |
| Enrichissement email | ~29 EUR (Dropcontact) | ~29 EUR (inchangé) | 0 |
| News search | ~15 $ (Bing, retiré) | ~5-10 $ (Brave Search) | -50% |
| Hébergement | ~25-50 $ | ~15-25 $ (Vercel gratuit + Railway) | -50% |
| **TOTAL** | **~615-740 $/mois** | **~50-65 $/mois** | **-92%** |

### 8.3 Projection de coûts si scale

| Volume | Dropcontact | Brave Search | LLM | Railway | Total estimé |
|--------|-------------|-------------|-----|---------|-------------|
| 500 journalistes/mois | 29 EUR | $5 | ~$0.50 | $20 | **~$57** |
| 1000 journalistes/mois | 29 EUR | $5 | ~$1 | $20 | **~$57** |
| 2000 journalistes/mois | 59 EUR | $10 | ~$2 | $25 | **~$100** |
| 5000 journalistes/mois | 79 EUR | $25 | ~$5 | $35 | **~$150** |

---

## 9. Matrice des Risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| LinkedIn modifie son DOM (casse l'extension) | **Haute** | Moyenne | Sélecteurs externalisés, mode dégradé URL, alertes |
| Qualité IA insuffisante (français) | Moyenne | Haute | Test comparatif 3 providers, golden tests, versioning |
| Trafilatura échoue sur certains sites | Moyenne | Faible | Fallback newspaper4k, puis titre+description Brave |
| Dropcontact down | Faible | Moyenne | Flag "Email Manquant", retry, fallback Hunter.io |
| Dépassement de budget API | **Très faible** | Faible | Budget à ~$60/mois, cache agressif |
| Non-adoption par l'équipe | Faible | Critique | PO impliqué, UX shadcn/ui soignée, formation |
| Fuite de données (RGPD) | Faible | Critique | Audit sécu, chiffrement, purge auto 12 mois |
| Check poste cron insuffisant (vs temps réel) | Moyenne | Faible | Acceptable pour le MVP, Crustdata en V1.1 si besoin |

---

## 10. Critères d'Acceptance MVP

Le MVP est considéré **livré** quand :

1. **Fonctionnel** :
   - [ ] Un attaché de presse peut créer une liste de 20 journalistes qualifiés en < 30 minutes
   - [ ] Chaque journaliste a : email (enrichi ou flaggé), résumé IA, tags, 5 derniers articles
   - [ ] L'export CSV est compatible HubSpot (import sans erreur)
   - [ ] L'extension Chrome fonctionne sur LinkedIn standard
   - [ ] Le check hebdomadaire de changement de poste fonctionne

2. **Qualité** :
   - [ ] Taux d'erreur API < 2% sur 7 jours
   - [ ] Temps de réponse moyen < 3s pour les pages web
   - [ ] Zero critical/high vulnerability dans l'audit de sécurité
   - [ ] Les golden tests IA passent à 80%+ de cohérence
   - [ ] Trafilatura extrait correctement 80%+ des articles testés

3. **Adoption** :
   - [ ] Les 2-3 utilisateurs ont un compte actif
   - [ ] Formation dispensée (1 session de 30 min)
   - [ ] Documentation accessible

---

## Conclusion

Ce PRD est une **bonne base de réflexion** qui nécessitait des compléments importants. La v2 de cette revue intègre :

1. **Budget divisé par 10** (~$60/mois vs ~$700/mois) grâce à Trafilatura (gratuit), cron maison (gratuit), et LLM low-cost (Gemini ~$1/mois)
2. **Toutes les questions PO tranchées** — prêt pour l'exécution
3. **Extension Chrome réévaluée** — risque modéré (pas critique) si on suit le modèle Lemlist/Kaspr
4. **Plan de test LLM** — comparatif Gemini vs GPT vs Mistral sur 10 journalistes de référence
5. **Architecture clarifiée** — Vercel + Railway, abstraction LLM, crons Celery Beat

**Prochaine étape** : Initialiser le repo monorepo et lancer la Phase 0.
