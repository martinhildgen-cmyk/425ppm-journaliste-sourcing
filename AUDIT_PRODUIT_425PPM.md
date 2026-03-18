# 425PPM — Audit Produit Complet

> **Document préparé pour** : Head of Product
> **Date** : 18 mars 2026
> **Version** : 1.0
> **Auteur** : Équipe technique 425PPM
> **Objectif** : Cartographier l'intégralité de l'outil existant (écrans, flows, tech, données, limites) pour poser les bases d'une refonte produit.

---

## Table des matières

1. [Vue d'ensemble du produit](#1-vue-densemble-du-produit)
2. [Architecture technique](#2-architecture-technique)
3. [Modèle de données](#3-modèle-de-données)
4. [Cartographie des écrans (UI)](#4-cartographie-des-écrans-ui)
5. [Extension Chrome LinkedIn](#5-extension-chrome-linkedin)
6. [Flows utilisateur de bout en bout](#6-flows-utilisateur-de-bout-en-bout)
7. [Intelligence Artificielle — Prompts & Logique](#7-intelligence-artificielle--prompts--logique)
8. [Services d'enrichissement](#8-services-denrichissement)
9. [Tâches de fond & Crons](#9-tâches-de-fond--crons)
10. [Conformité RGPD](#10-conformité-rgpd)
11. [Infrastructure & Déploiement](#11-infrastructure--déploiement)
12. [Coûts opérationnels](#12-coûts-opérationnels)
13. [Problèmes connus & Dettes techniques](#13-problèmes-connus--dettes-techniques)
14. [Annexes](#14-annexes)

---

## 1. Vue d'ensemble du produit

### 1.1 Ce que c'est

**425PPM Sourcing** est un outil interne de veille et sourcing journalistes pour l'agence de relations presse 425PPM. C'est un "Mini-Meltwater" qui automatise :

- La **recherche** de contacts presse (via LinkedIn et import CSV)
- L'**enrichissement** de ces contacts (email via Dropcontact, articles via Brave Search + Trafilatura)
- La **qualification IA** des journalistes (profil éditorial, tonalité, secteurs, tags)
- L'**évaluation de pertinence** d'un pitch pour un journaliste donné (Pitch Matcher)
- L'**organisation** en clients → campagnes → listes de médias
- L'**export** au format CSV compatible HubSpot

### 1.2 Utilisateurs cibles

- **2-3 utilisateurs** maximum (équipe 425PPM)
- Profils : attachés de presse, consultants RP
- Volume cible MVP : **2 000 journalistes**

### 1.3 Stack technique résumée

| Composant | Technologie |
|-----------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| Backend API | FastAPI (Python 3.12), SQLAlchemy (async), Pydantic |
| Base de données | PostgreSQL 16 |
| Cache & Broker | Redis 7 |
| Tâches async | Celery (worker + beat scheduler) |
| IA / LLM | Multi-provider : Gemini (défaut), OpenAI, Mistral |
| Enrichissement email | Dropcontact API |
| Recherche articles | Brave Search API + Trafilatura (extraction) |
| Extension navigateur | Chrome Manifest V3, TypeScript, esbuild |
| Auth | Google OAuth2 + JWT (HS256, 60 min) |
| Hébergement | Vercel (frontend) + Railway (API, DB, Redis) |
| CI/CD | GitHub Actions (lint, test, build) |
| Monitoring | Sentry |

### 1.4 Structure du monorepo

```
425ppm-journaliste-sourcing/
├── backend/           → API FastAPI + Celery workers
│   ├── app/
│   │   ├── routers/   → 11 fichiers de routes (50+ endpoints)
│   │   ├── models/    → 10 modèles SQLAlchemy
│   │   ├── services/  → 8 services métier
│   │   └── ...
│   ├── alembic/       → 4 migrations de schéma
│   └── scripts/       → Seed de données de test
├── frontend/          → Application Next.js
│   └── src/
│       ├── app/       → 9 pages/écrans
│       ├── components/→ Sidebar, AppShell, UI primitives
│       └── lib/       → API client, types, auth
├── extension/         → Extension Chrome LinkedIn
│   └── src/           → background, content, sidepanel
├── .github/workflows/ → CI pipeline
└── docker-compose.yml → Orchestration locale (6 services)
```

---

## 2. Architecture technique

### 2.1 Diagramme d'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTILISATEUR                               │
└──────────┬────────────────────────────┬─────────────────────────┘
           │                            │
           ▼                            ▼
┌─────────────────────┐    ┌─────────────────────────┐
│   Frontend Next.js  │    │  Extension Chrome        │
│   (Vercel)          │    │  (LinkedIn)              │
│                     │    │                          │
│  • Dashboard        │    │  • Content Script        │
│  • Journalistes     │    │    (scrape profils)      │
│  • Clients          │    │  • Side Panel            │
│  • Import CSV       │    │    (contrôles)           │
│  • Listes           │    │  • Background Worker     │
└────────┬────────────┘    └──────────┬───────────────┘
         │ REST API                   │ REST API
         │ (Bearer JWT)               │ (Bearer JWT)
         ▼                            ▼
┌─────────────────────────────────────────────────────┐
│              Backend FastAPI (Railway)                │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Routers  │  │ Services │  │ Background Tasks  │  │
│  │ (11)     │  │ (8)      │  │ (Celery)          │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│       ▼              ▼                 ▼              │
│  ┌──────────────────────────────────────────────┐    │
│  │           SQLAlchemy ORM (async)              │    │
│  └──────────────────┬───────────────────────────┘    │
└─────────────────────┼────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │ Postgres │  │  Redis  │  │  APIs   │
    │   16     │  │   7     │  │ externes│
    └─────────┘  └─────────┘  └─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              Dropcontact    Brave Search    LLM Provider
              (emails)       (articles)     (Gemini/GPT/
                                            Mistral)
```

### 2.2 Authentification

| Étape | Description |
|-------|-------------|
| 1 | L'utilisateur clique "Se connecter avec Google" |
| 2 | Redirect vers `/auth/google/login` (backend) |
| 3 | Google OAuth2 consent screen |
| 4 | Callback backend : upsert User en BDD, génère JWT |
| 5 | Redirect vers `/auth/callback?token=...` (frontend) |
| 6 | Token stocké dans `localStorage` |
| 7 | Toutes les requêtes API incluent `Authorization: Bearer {token}` |
| 8 | Token expire après **60 minutes** (pas de refresh token) |

**Problème identifié** : Pas de refresh token → l'utilisateur est déconnecté toutes les heures sans avertissement. Le token dans `localStorage` est vulnérable aux attaques XSS.

### 2.3 Gestion des erreurs API

- **Réseau** : message "Impossible de contacter le serveur"
- **401** : efface le token, redirige vers `/login`
- **Autres** : extrait le champ `detail` de la réponse JSON
- **Messages** : tous en français

### 2.4 CORS

- `allow_origins=["*"]` — autorise toutes les origines
- `allow_credentials=False`

**Problème identifié** : CORS ouvert à `*` est un risque de sécurité en production.

### 2.5 Résilience

**Circuit Breakers** implémentés pour les services externes :

| Service | Seuil de pannes | Timeout de récupération |
|---------|-----------------|------------------------|
| Dropcontact | 3 échecs | 60 secondes |
| Brave Search | 5 échecs | 30 secondes |
| Trafilatura | 10 échecs | 30 secondes |

**Cache Redis** : TTL de 7 jours pour les résultats d'enrichissement.

---

## 3. Modèle de données

### 3.1 Schéma relationnel

```
┌──────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│  User    │     │  Client   │     │ Campaign │     │   List   │
│──────────│     │───────────│     │──────────│     │──────────│
│ id (UUID)│     │ id (UUID) │◄────│client_id │◄────│campaign_id│
│ email    │     │ name      │     │ name     │     │ name     │
│ full_name│     │ sector    │     │ status   │     │ owner_id │
│ role     │     │ keywords  │     │ owner_id │     └────┬─────┘
└──────────┘     │ owner_id  │     └──────────┘          │
                 └───────────┘                    ┌──────┴──────┐
                                                  │ListJournalist│
                                                  │(junction)    │
                                                  │list_id       │
┌────────────┐                                    │journalist_id │
│ Journalist │◄───────────────────────────────────┘──────────────┘
│────────────│
│ id (UUID)  │     ┌──────────┐     ┌─────────────┐
│ ~40 champs │────►│   Note   │     │ PitchMatch  │
│ first_name │     │──────────│     │─────────────│
│ last_name  │     │ body     │     │ pitch_subject│
│ email      │     │ author_id│     │ score_match │
│ job_title  │     │ journa.. │     │ verdict     │
│ media_name │     └──────────┘     │ justification│
│ ai_summary │                      │ journalist_id│
│ sector_macro│    ┌──────────┐     └─────────────┘
│ tags_micro │     │ Content  │
│ is_watched │     │──────────│     ┌───────────────┐
│ movement.. │     │ url      │     │ PromptVersion │
│ bad_buzz.. │     │ title    │     │───────────────│
│ ...        │────►│ body_text│     │ prompt_name   │
└────────────┘     │ journa.. │     │ system_prompt │
                   └──────────┘     │ is_active     │
                                    └───────────────┘
┌──────────┐
│ AuditLog │
│──────────│
│ user_id  │
│ action   │
│ entity.. │
│ details  │
└──────────┘
```

### 3.2 Détail du modèle Journalist (entité centrale)

Le modèle `Journalist` est le cœur du système avec **~40 champs** répartis en catégories :

| Catégorie | Champs | Description |
|-----------|--------|-------------|
| **Identité** | `first_name`, `last_name`, `email`, `email_status` | Informations de base |
| **Contact** | `linkedin_url`, `twitter_url`, `bluesky_url`, `city`, `country` | Canaux de contact |
| **Média** | `media_name`, `media_type`, `media_scope` | Rattachement média |
| **Analyse IA** | `ai_summary`, `ai_tonality`, `ai_preferred_formats`, `ai_avoid_topics`, `sector_macro`, `tags_micro` | Résultats d'analyse LLM |
| **Suivi IA** | `ai_last_analyzed_at`, `ai_prompt_version` | Traçabilité des analyses |
| **Mouvements** | `job_title_previous`, `media_name_previous`, `job_last_updated_at`, `job_last_checked_at`, `movement_alert` | Détection de changement de poste |
| **Flags** | `bad_buzz_risk`, `is_watched` | Indicateurs critiques |
| **Métadonnées** | `source`, `owner_id`, `created_at`, `updated_at`, `last_accessed_at` | Traçabilité RGPD |

**Types de media** (`media_type`) : `presse_ecrite`, `web`, `tv`, `radio`, `podcast`, `newsletter`, `agence`

**Portées de media** (`media_scope`) : `pqn` (presse quotidienne nationale), `pqr` (régionale), `specialisee`, `grand_public`

**Secteurs macro** (16 options) : Politique, Économie, Tech, Santé, Environnement, Culture, Sport, International, Société, Science, Éducation, Immobilier, Finance, Luxe, Automobile, Alimentation

### 3.3 Hiérarchie Client → Campagne → Liste

```
Client (ex: "TotalEnergies")
  └── Campaign (ex: "Lancement produit solaire Q2")
       ├── List (ex: "Journalistes énergie PQN")
       │    ├── Journaliste A
       │    ├── Journaliste B
       │    └── Journaliste C
       └── List (ex: "Podcasteurs tech")
            ├── Journaliste D
            └── Journaliste E
```

### 3.4 PitchMatch (évaluation de pertinence)

| Champ | Type | Description |
|-------|------|-------------|
| `pitch_subject` | Text | Description du pitch soumis |
| `score_match` | Integer 0-100 | Score de pertinence |
| `verdict` | Enum | `GO` (≥70), `À RISQUE` (40-69), `NO GO` (<40) |
| `justification` | Text | Explication détaillée du score |
| `angle_suggere` | Text | Angle d'approche recommandé |
| `bad_buzz_risk` | Boolean | Risque identifié |
| `risk_details` | Text | Détails du risque |
| `is_draft` | Boolean | Mode "test" (non sauvegardé en profil) |

---

## 4. Cartographie des écrans (UI)

### 4.1 Navigation globale

**Sidebar fixe** (gauche, 240px) avec 4 entrées :

```
┌────────────────────┐
│  425PPM            │  ← Logo, lien vers /dashboard
│────────────────────│
│  📊 Dashboard      │  ← /dashboard
│  👥 Journalistes   │  ← /journalists
│  💼 Clients        │  ← /clients
│  📤 Import CSV     │  ← /import
│────────────────────│
│                    │
│                    │
│  [Déconnexion]     │  ← Bouton en bas
└────────────────────┘
```

**Pages publiques** (sans sidebar) : `/` (accueil), `/login`, `/auth/callback`

**Pages authentifiées** (avec sidebar) : `/dashboard`, `/journalists`, `/journalists/[id]`, `/clients`, `/clients/[id]`, `/lists/[id]`, `/import`

---

### 4.2 Écran 0 — Page d'accueil (`/`)

**Rôle** : Landing page minimaliste.

**Contenu** :
- Titre : "425PPM — Outil de Sourcing Journalistes"
- Sous-titre : "Plateforme de gestion des contacts presse et médias"
- Un seul bouton : "Se connecter" → `/login`

**Problèmes** :
- Page inutile pour un outil interne — l'utilisateur devrait atterrir directement sur le login ou le dashboard.
- Aucune proposition de valeur, aucune explication de ce que fait l'outil.

---

### 4.3 Écran 1 — Login (`/login`)

**Rôle** : Authentification via Google.

**Contenu** :
- Branding 425PPM
- Sous-titre "Sourcing Journalistes"
- Bouton Google : "Se connecter avec Google" (avec icône Google colorée)

**Flow** :
1. Clic → redirect vers Google OAuth
2. Consent Google → callback backend → JWT
3. Redirect vers `/dashboard`
4. Si déjà authentifié (token en `localStorage`), redirect auto vers `/dashboard`

**Problèmes** :
- Aucun message d'erreur affiché si l'OAuth échoue
- Pas de gestion du cas "utilisateur non autorisé" (tout compte Google est accepté)

---

### 4.4 Écran 2 — Dashboard (`/dashboard`)

**Rôle** : Vue d'ensemble de la base journalistes et alertes.

**Layout** :

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard                                                │
│  Vue d'ensemble de votre base journalistes                │
│  [🔍 Rechercher un journaliste par nom, media ou tag...] │
├──────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│  │ Total  │ │Alertes │ │ Suivis │ │Analysés│ │Actions │ │
│  │  142   │ │   3    │ │  28    │ │  89    │ │rapides │ │
│  │journ.  │ │mvmts   │ │actifs  │ │  IA    │ │[🔍][📤]│ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘│
├────────────────────────┬─────────────────────────────────┤
│  Alertes de mouvement  │  Journalistes récents           │
│  ──────────────────    │  ──────────────────              │
│  • Pierre Dupont       │  • Marie Martin                 │
│    Le Monde → Mediapart│    Le Figaro · Rédactrice       │
│    [Fermer]            │    ✅ Email valide               │
│                        │                                  │
│  • Julie Blanc         │  • Jean Durand                   │
│    TF1 → France 2     │    Libération · Journaliste      │
│    [Fermer]            │    ⚠️ Email manquant             │
│                        │                                  │
│  [Voir toutes (3)]     │  [+ 3 autres]                   │
├────────────────────────┴─────────────────────────────────┤
│  Clients                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │TotalEn.  │ │ LVMH     │ │ Danone   │                  │
│  │Énergie   │ │ Luxe     │ │ Alim.    │                  │
│  │2 campagn.│ │1 campagn.│ │0 campagn.│                  │
│  └──────────┘ └──────────┘ └──────────┘                  │
└──────────────────────────────────────────────────────────┘
```

**Données affichées** :
- **5 KPI** : Total journalistes, Alertes mouvement (rouge), Suivis actifs, Analysés IA, + Actions rapides (recherche, import)
- **Alertes de mouvement** (max 5) : Nom, ancien poste → nouveau poste, ancien média → nouveau média, date de détection, bouton "Fermer" pour dismiss
- **Journalistes récents** (5 derniers) : Nom (lien), média, poste, badges (alerte mouvement, suivi, statut email)
- **Clients** : Grille de cards avec nom, secteur, nombre de campagnes

**Bannière d'onboarding** : Affichée si la BDD est vide, avec 3 étapes expliquées + liens vers import et ajout.

**API appelées** :
- `GET /dashboard/stats`
- `GET /dashboard/alerts?page_size=5`
- `GET /journalists/?page=1&page_size=5`
- `GET /clients/`
- `POST /dashboard/alerts/{id}/dismiss`

**Problèmes** :
- Le KPI "Emails valides" n'est pas affiché alors qu'il est disponible dans l'API
- Pas de graphiques ou tendances dans le temps
- La barre de recherche globale redirige vers `/journalists?search=...` — pas de recherche inline
- Les clients en bas de page sont facilement manqués (pas visible sans scroll)
- Pas de filtrage temporel (cette semaine, ce mois, etc.)

---

### 4.5 Écran 3 — Liste des journalistes (`/journalists`)

**Rôle** : Consulter, rechercher, filtrer et ajouter des journalistes.

**Layout** :

```
┌──────────────────────────────────────────────────────────┐
│  Journalistes (142)                                       │
│                    [Ajouter depuis LinkedIn] [Saisie man.]│
├──────────────────────────────────────────────────────────┤
│  (Mode LinkedIn : champ URL + bouton Envoyer)             │
│  ou                                                       │
│  (Mode Manuel : formulaire 8 champs sur 2 colonnes)       │
├──────────────────────────────────────────────────────────┤
│  [🔍 Recherche...] [Media Type ▼] [Portée ▼] [Secteur ▼]│
├──────────────────────────────────────────────────────────┤
│  Nom         │ Média      │ Poste      │ Email  │Secteur│
│──────────────┼────────────┼────────────┼────────┼───────│
│  P. Dupont   │ Le Monde   │ Rédacteur  │ ✅     │ Env.  │
│  J. Martin   │ TF1        │ Présentat. │ ⚠️     │ Pol.  │
│  M. Blanc    │ Mediapart  │ Enquêtrice │ ✅     │ Éco.  │
│  ...         │            │            │        │       │
├──────────────────────────────────────────────────────────┤
│  [◄ Préc.]  Page 1 sur 8 (142 résultats)  [Suiv. ►]     │
└──────────────────────────────────────────────────────────┘
```

**Colonnes du tableau** :
1. **Nom** (lien cliquable vers la fiche)
2. **Média** (nom du média)
3. **Poste** (job title)
4. **Email** (badge de statut : Valide vert / Invalide rouge / Catch-all orange / Manquant gris)
5. **Secteur** (secteur macro)
6. **Tags** (3 premiers tags + "+N" si plus)
7. **IA** (badge "Analysé" bleu ou "Non analysé" gris)
8. **Actions** (bouton Voir + badge alerte si applicable)

**Deux modes d'ajout** :

**Mode LinkedIn** :
- Input pour coller une URL LinkedIn (`https://linkedin.com/in/...`)
- Envoie `POST /extension/journalists/from-url`
- Le backend extrait le nom depuis le slug de l'URL
- Déclenche l'enrichissement automatique

**Mode Saisie manuelle** :
- Formulaire avec : Prénom, Nom, Email, Poste, Nom du média, Type de média (dropdown), Portée (dropdown), Secteur macro
- Envoie `POST /journalists/`
- Déclenche l'enrichissement automatique

**Filtres** :
- Recherche texte libre (nom, média, tag)
- Type de média (dropdown)
- Portée du média (dropdown)
- Secteur macro (dropdown)

**Pagination** : 20 résultats par page, navigation Précédent/Suivant.

**API appelées** :
- `GET /journalists/?page=X&page_size=20&search=...&media_type=...&media_scope=...&sector_macro=...`
- `POST /extension/journalists/from-url` (ajout LinkedIn)
- `POST /journalists/` (ajout manuel)

**Problèmes** :
- Pas de tri sur les colonnes (impossible de trier par nom, média, date, etc.)
- Pas de sélection multiple pour actions groupées (supprimer, ajouter à une liste, etc.)
- Le bouton "Ajouter depuis LinkedIn" crée le journaliste avec des infos minimales (juste le nom extrait du slug URL) — résultat souvent incomplet
- Pas de filtre par `is_watched`, `movement_alert`, `bad_buzz_risk`
- Pas de filtre par date de création/modification
- Pas d'indicateur visuel de l'enrichissement en cours
- Page size fixe (20), non configurable
- Les filtres ne sont pas persistés dans l'URL (perdus au refresh)

---

### 4.6 Écran 4 — Fiche journaliste (`/journalists/[id]`)

**Rôle** : Vue complète d'un journaliste avec toutes les actions possibles. C'est l'écran le plus riche et complexe de l'application.

**Layout** :

```
┌──────────────────────────────────────────────────────────┐
│  ← Retour aux journalistes                               │
│  Pierre Dupont                                            │
│  Rédacteur en chef · Le Monde                            │
│  [👁 Suivre] [✏️ Modifier] [🗑 Supprimer]                │
├──────────────────────────────────────────────────────────┤
│  ⚠️ ALERTE : Ce journaliste a changé de poste            │
│  Rédacteur → Rédacteur en chef · Mediapart → Le Monde   │
├──────────────────────────────────────────────────────────┤
│  🔴 RISQUE BAD BUZZ détecté pour ce journaliste          │
├──────────────┬───────────────────────────────────────────┤
│  IDENTITÉ    │  MÉDIA                                     │
│  ──────────  │  ──────                                    │
│  Prénom: ... │  Nom du média: Le Monde                    │
│  Nom: ...    │  Type: Presse écrite                       │
│  Email: ✅   │  Portée: PQN                               │
│  Poste: ...  │                                            │
│  LinkedIn: 🔗│                                            │
│  Twitter: 🔗 │                                            │
│  Ville: Paris│                                            │
├──────────────┴───────────────────────────────────────────┤
│  INTELLIGENCE IA                                          │
│  ────────────────                                         │
│  [Re-analyser (test)]  [Analyser]                         │
│                                                           │
│  (Si mode test actif : aperçu des résultats test)         │
│                                                           │
│  Résumé IA : "Journaliste spécialisé en environnement..." │
│  Tonalité : Investigateur                                 │
│  Formats préférés : Enquête, Analyse, Interview           │
│  Sujets à éviter : Nucléaire (conflit d'intérêt familial)│
│  Secteur macro : Environnement                            │
│  Tags micro : [climat] [transition] [biodiversité]        │
│  Dernière analyse : 15/03/2026                            │
├──────────────────────────────────────────────────────────┤
│  SUIVI                                                    │
│  ─────                                                    │
│  Suivi actif : ✅ Oui                                     │
│  Alerte mouvement : ⚠️ Changement détecté                │
│  Ancien poste : Rédacteur (Mediapart)                     │
│  Source : extension_linkedin                              │
│  Créé le : 01/02/2026                                     │
├──────────────────────────────────────────────────────────┤
│  ARTICLES RÉCENTS                        [Enrichir]       │
│  ─────────────────                                        │
│  • "La transition énergétique en question" (12/03/2026)   │
│    🔗 lemonde.fr · [Texte extrait]                        │
│  • "COP31 : les enjeux" (05/03/2026)                      │
│    🔗 lemonde.fr · [Texte extrait]                        │
├──────────────────────────────────────────────────────────┤
│  PITCH MATCHER                                            │
│  ─────────────                                            │
│  [Décrivez le pitch à évaluer...                     ]    │
│  [Évaluer le pitch]                                       │
│                                                           │
│  Résultat :                                               │
│  ┌─────────────────────────────────────────────────┐      │
│  │  ✅ GO  —  Score : 85/100                       │      │
│  │  Justification : "Ce journaliste couvre..."     │      │
│  │  Angle suggéré : "Aborder sous l'angle..."      │      │
│  └─────────────────────────────────────────────────┘      │
│                                                           │
│  Historique (5 derniers pitchs) :                          │
│  • "Lancement produit X" — GO 85/100                      │
│  • "Crise Y" — NO GO 20/100 [test]                        │
├──────────────────────────────────────────────────────────┤
│  NOTES                                                    │
│  ─────                                                    │
│  [Ajouter une note...                     ] [Ajouter]     │
│  • "Préfère être contacté par email" — 12/03/2026         │
│    [Supprimer]                                            │
│  • "A couvert notre dernier événement" — 01/03/2026       │
│    [Supprimer]                                            │
└──────────────────────────────────────────────────────────┘
```

**7 sections (cards)** :

#### Section 1 : En-tête + Actions
- Nom complet, poste, média
- **Bouton Suivre/Suivi actif** : toggle `is_watched` — `PUT /journalists/{id}`
- **Bouton Modifier** : passe en mode édition inline (tous les champs deviennent éditables)
- **Bouton Sauvegarder** : enregistre les modifications — `PUT /journalists/{id}`
- **Bouton Supprimer** : confirmation dialog, puis `DELETE /journalists/{id}`

#### Section 2 : Alertes (conditionnelles)
- **Alerte Bad Buzz** (rouge) : si `bad_buzz_risk=true`
- **Alerte Mouvement** (jaune) : si `movement_alert=true`, affiche ancien poste → nouveau poste

#### Section 3 : Identité + Média (2 colonnes)
- Champs éditables en mode modification
- Liens cliquables pour LinkedIn et Twitter
- Badge de statut email (Valide/Invalide/Catch-all/Manquant)

#### Section 4 : Intelligence IA
- **Bouton "Re-analyser (test)"** : lance l'analyse en mode draft (`is_draft=true`) — `POST /ai/journalists/{id}/analyze`
  - Affiche un aperçu "Mode test" sans sauvegarder en base
- **Bouton "Analyser"** : lance l'analyse et sauvegarde — `POST /ai/journalists/{id}/analyze`
- Affiche : résumé IA, tonalité, formats préférés, sujets à éviter, secteur, tags, date de dernière analyse

#### Section 5 : Suivi
- Informations de tracking en lecture seule
- Source d'acquisition (extension, import CSV, manuel)
- Dates de création et modification

#### Section 6 : Articles récents
- **Bouton "Enrichir"** : déclenche la recherche d'articles — `POST /enrichment/journalists/{id}`
- Liste les 5 derniers articles avec titre (lien), date, badge "Texte extrait"
- API : `GET /enrichment/journalists/{id}/articles`

#### Section 7 : Pitch Matcher
- **Textarea** pour décrire le pitch (min 10 caractères)
- **Bouton "Évaluer le pitch"** — `POST /ai/journalists/{id}/pitch-match`
- Affiche le résultat : verdict (GO/À RISQUE/NO GO), score, justification, angle suggéré, risque bad buzz
- **Historique** : 5 derniers pitchs évalués avec verdict et score

#### Section 8 : Notes
- Input + bouton "Ajouter" — `POST /journalists/{id}/notes/`
- Liste chronologique avec body, date, bouton Supprimer

**API appelées** (9 endpoints) :
- `GET /journalists/{id}`
- `GET /journalists/{id}/notes/`
- `GET /enrichment/journalists/{id}/articles`
- `GET /ai/journalists/{id}/pitch-matches?include_drafts=true`
- `PUT /journalists/{id}` (édition, toggle watch)
- `DELETE /journalists/{id}`
- `POST /enrichment/journalists/{id}`
- `POST /ai/journalists/{id}/analyze`
- `POST /ai/journalists/{id}/pitch-match`
- `POST /journalists/{id}/notes/`
- `DELETE /journalists/{id}/notes/{noteId}`

**Problèmes** :
- **Écran surchargé** : 8 sections sur une seule page, scroll très long
- Pas d'onglets ou de navigation interne pour organiser l'information
- Le mode édition est un toggle global — on édite tout ou rien
- Pas d'indicateur de chargement pour l'analyse IA (peut prendre plusieurs secondes)
- L'enrichissement d'articles ne montre pas de progression (pas de spinner dédié)
- Le Pitch Matcher et les Notes sont tout en bas — facilement manqués
- Pas de moyen d'ajouter le journaliste à une liste depuis cette page
- Pas d'historique des analyses IA (seule la dernière est visible)
- Le mode test (draft) de l'analyse IA n'est pas intuitif — l'utilisateur ne comprend pas la différence

---

### 4.7 Écran 5 — Liste des clients (`/clients`)

**Rôle** : Gérer les clients et accéder à leurs campagnes.

**Layout** :

```
┌──────────────────────────────────────────────────────────┐
│  Clients                                                  │
│  Gérez vos clients et leurs campagnes                     │
│                                           [Nouveau client]│
├──────────────────────────────────────────────────────────┤
│  (Formulaire création : Nom*, Secteur, Description)       │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │TotalEnergies │ │ LVMH         │ │ Danone       │      │
│  │Énergie       │ │ Luxe         │ │ Alimentation │      │
│  │"Description  │ │"Description  │ │"Description  │      │
│  │ tronquée..." │ │ tronquée..." │ │ tronquée..." │      │
│  │──────────────│ │──────────────│ │──────────────│      │
│  │ 2 campagnes  │ │ 1 campagne   │ │ 0 campagnes  │      │
│  └──────────────┘ └──────────────┘ └──────────────┘      │
└──────────────────────────────────────────────────────────┘
```

**API appelées** :
- `GET /clients/`
- `GET /campaigns/?client_id={id}` (pour chaque client, pour le compteur)
- `POST /clients/`

**Problèmes** :
- Pas de recherche/filtre sur les clients
- Pas de modification/suppression depuis cette vue
- Le chargement des campagnes se fait en N+1 (une requête par client)
- Pas de pagination (problème si beaucoup de clients)
- Le formulaire de création est très basique (pas de mots-clés, pas de brief)

---

### 4.8 Écran 6 — Détail client (`/clients/[id]`)

**Rôle** : Voir et gérer les campagnes et listes d'un client.

**Layout** :

```
┌──────────────────────────────────────────────────────────┐
│  ← Retour aux clients                                    │
│  TotalEnergies                                            │
│  Énergie · "Description du client..."                     │
├──────────────────────────────────────────────────────────┤
│  Campagnes                              [Nouvelle campagne]│
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │  Lancement Solaire Q2          Status: draft       │  │
│  │  "Description de la campagne"                      │  │
│  │  Listes (2)                    [Nouvelle liste]    │  │
│  │  ├── Journalistes énergie PQN → /lists/xxx        │  │
│  │  └── Podcasteurs tech         → /lists/yyy        │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Communication RSE             Status: draft       │  │
│  │  "Description de la campagne"                      │  │
│  │  Listes (0)                    [Nouvelle liste]    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**API appelées** :
- `GET /clients/{id}`
- `GET /campaigns/?client_id={id}`
- `GET /lists/?campaign_id={id}` (pour chaque campagne)
- `POST /campaigns/`
- `POST /lists/`

**Problèmes** :
- Pas de modification/suppression de campagne
- Pas de modification/suppression du client depuis cette page
- Le statut de campagne est toujours "draft" — pas de workflow de statut
- Pas de vue d'ensemble du nombre de journalistes par campagne
- On ne peut pas ajouter de journalistes directement depuis cette vue
- Les listes n'ont qu'un lien — pas de preview du contenu

---

### 4.9 Écran 7 — Détail d'une liste (`/lists/[id]`)

**Rôle** : Voir les journalistes d'une liste et exporter en CSV.

**Layout** :

```
┌──────────────────────────────────────────────────────────┐
│  ← Retour aux clients                                    │
│  Journalistes énergie PQN                                 │
│  12 journalistes                          [Exporter CSV]  │
├──────────────────────────────────────────────────────────┤
│  Nom         │ Média      │ Poste      │ Email  │Actions │
│──────────────┼────────────┼────────────┼────────┼────────│
│  P. Dupont   │ Le Monde   │ Rédacteur  │ ✅     │[Retirer]│
│  J. Martin   │ TF1        │ Présentat. │ ⚠️     │[Retirer]│
│  ...         │            │            │        │        │
└──────────────────────────────────────────────────────────┘
```

**Export CSV** : Téléchargement direct via `GET /export/lists/{id}` — format compatible HubSpot avec colonnes : First Name, Email, Job Title, Company Name, Media Type, Media Scope, AI Summary, AI Tonality, Pitch Advice.

**API appelées** :
- `GET /lists/{id}` (inclut le tableau `journalists[]`)
- `DELETE /lists/{id}/journalists/{journalistId}`
- Export : `GET /export/lists/{id}`

**Problèmes** :
- **Pas de moyen d'ajouter des journalistes à la liste depuis cette page** — c'est un manque critique
- Pas de tri ni de recherche dans la liste
- Pas de pagination
- Le bouton "Retour" ramène aux clients, pas au détail du client/campagne parent
- Pas de modification du nom de la liste
- Pas de suppression de la liste entière

---

### 4.10 Écran 8 — Import CSV (`/import`)

**Rôle** : Importer un fichier CSV de journalistes en masse.

**Layout** :

```
┌──────────────────────────────────────────────────────────┐
│  Import CSV                                               │
│  Importez un fichier CSV de journalistes                  │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │        📄 Glissez votre fichier CSV ici            │  │
│  │           ou cliquez pour parcourir                 │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  fichier.csv (45 KB)              [Annuler] [Importer]    │
│                                                           │
│  ✅ Import terminé                                        │
│  • Créés : 38                                             │
│  • Ignorés : 7 (doublons)                                 │
│  • Erreurs : 2                                            │
│  [Voir les détails des erreurs ▼]                         │
└──────────────────────────────────────────────────────────┘
```

**Déduplication** : basée sur `linkedin_url` ou `email` — les doublons sont ignorés.

**API appelées** :
- `POST /import/journalists` (multipart form data)

**Problèmes** :
- Aucune documentation du format CSV attendu (quelles colonnes ? quel encodage ?)
- Pas de preview du fichier avant import
- Pas de mapping de colonnes (le CSV doit correspondre exactement au format attendu)
- Pas de possibilité d'associer les journalistes importés à un client/campagne/liste
- Pas d'export d'un template CSV vide pour guider l'utilisateur
- Les erreurs ne sont pas assez détaillées (quelle ligne a échoué et pourquoi ?)

---

## 5. Extension Chrome LinkedIn

### 5.1 Vue d'ensemble

L'extension Chrome est un composant clé qui permet de capturer des profils journalistes directement depuis LinkedIn.

**Manifest V3** — permissions : `activeTab`, `storage`, `sidePanel`
**Host permissions** : `https://www.linkedin.com/*`

### 5.2 Architecture de l'extension

```
┌──────────────────────────────────────────────────────────┐
│                    LINKEDIN.COM                            │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Content Script (content.js)                        │  │
│  │  • Injecté sur toutes les pages LinkedIn            │  │
│  │  • Extrait les données du DOM                       │  │
│  │  • Injecte checkboxes (mode bulk)                   │  │
│  │  • Affiche badges vert ✓ après capture              │  │
│  │  • Rate limiting côté client                        │  │
│  └──────────────┬──────────────────────────────────────┘  │
│                 │ chrome.runtime.sendMessage               │
│                 ▼                                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Background Service Worker (background.js)          │  │
│  │  • Relais entre content script et side panel        │  │
│  │  • Appels API vers le backend                       │  │
│  │  • Gestion santé de la connexion                    │  │
│  └──────────────┬──────────────────────────────────────┘  │
│                 │                                          │
│                 ▼                                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Side Panel (sidepanel.html + sidepanel.js)         │  │
│  │  • Interface utilisateur principale                 │  │
│  │  • Statut de connexion (vert/rouge)                 │  │
│  │  • Compteurs rate limit                             │  │
│  │  • Sélecteur Client/Campagne/Tags                   │  │
│  │  • Boutons de capture                               │  │
│  │  • Configuration API URL + Token                    │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Side Panel — Interface utilisateur

```
┌──────────────────────────┐
│  425PPM Sourcing         │
├──────────────────────────┤
│  ● Connecté              │  ← Statut API (vert/rouge)
├──────────────────────────┤
│  Rate limits :           │
│  Heure : 5/30            │  ← Compteurs temps réel
│  Jour  : 12/100          │
├──────────────────────────┤
│  Client :  [▼ Sélect.]  │
│  Campagne: [▼ Sélect.]  │
│  Tags :    [_________ ]  │  ← Séparés par virgules
├──────────────────────────┤
│  [Capturer ce profil]    │  ← Bouton principal (vert)
│  [Importer par URL]      │  ← Mode dégradé
├──────────────────────────┤
│  -- Section Bulk --      │  ← Visible sur /search/
│  [Afficher checkboxes]   │
│  3 sélectionnés          │
│  [Capturer la sélection] │
├──────────────────────────┤
│  ⚙️ Paramètres           │
│  API URL: [___________]  │
│  Token:   [***********]  │
│  [Enregistrer]           │
└──────────────────────────┘
```

### 5.4 Données extraites par le Content Script

**Sur une page profil** (`/in/...`) :
- Nom complet (`.text-heading-xlarge`)
- Titre/Headline (`.text-body-medium`)
- Localisation (`.text-body-small`)
- Section "À propos" (`#about ~ ...`)
- Expériences professionnelles (`#experience ~ ...` — liste)

**Sur une page de recherche** (`/search/...`) :
- Nom (`.entity-result__title-text a span`)
- Headline (`.entity-result__primary-subtitle`)
- Localisation (`.entity-result__secondary-subtitle`)
- Lien profil (`.entity-result__title-text a`)

### 5.5 Rate Limiting

| Limite | Valeur | Scope |
|--------|--------|-------|
| Par heure | 30 profils max | Fenêtre glissante |
| Par jour | 100 profils max | Fenêtre glissante |
| Délai humain | 2-5 secondes | Aléatoire entre chaque capture |
| Batch bulk max | 25 profils | Par envoi |

Les compteurs sont persistés dans `chrome.storage.local`.

### 5.6 Mode dégradé

Si les sélecteurs CSS de LinkedIn changent (LinkedIn met à jour son DOM) :
1. Le content script détecte que les sélecteurs ne matchent plus
2. Le side panel affiche une alerte jaune : "Sélecteurs LinkedIn cassés — mode dégradé actif"
3. L'utilisateur peut quand même capturer via le bouton "Importer par URL"
4. Le backend reçoit uniquement l'URL LinkedIn et extrait le nom depuis le slug
5. Le profil est créé avec des données minimales (nom seulement)

### 5.7 Flows de l'extension

**Capture profil unique** :
```
Page profil LinkedIn → Clic "Capturer ce profil" → Délai 2-5s →
Extraction DOM → Envoi API /extension/journalists/from-profile →
Badge vert ✓ affiché → Enrichissement auto déclenché en backend
```

**Capture bulk (recherche)** :
```
Page recherche LinkedIn → Clic "Afficher checkboxes" → Checkboxes injectées →
Sélection des profils → Clic "Capturer la sélection" →
Envoi batch API /extension/journalists/from-bulk →
Badges verts ✓ → Checkboxes décochées
```

**Problèmes** :
- Les sélecteurs LinkedIn sont fragiles et changent régulièrement — maintenance constante nécessaire
- Le rate limiting est uniquement côté client (contournable)
- Pas de gestion d'erreur visible pour l'utilisateur si l'API est down (juste un pastille rouge)
- Le token Bearer doit être copié-collé manuellement dans les paramètres — pas de login intégré
- Pas de synchronisation du token avec le frontend (deux authentifications séparées)
- L'association Client/Campagne/Tags depuis l'extension ne crée pas automatiquement de liste
- Les données extraites du DOM sont parfois incomplètes ou mal parsées (noms composés, titres multilignes)

---

## 6. Flows utilisateur de bout en bout

### 6.1 Flow 1 — Ajouter un journaliste depuis LinkedIn (extension)

```
1. L'utilisateur navigue sur LinkedIn
2. Il ouvre le side panel 425PPM
3. Il vérifie que le statut est "Connecté" (vert)
4. Il sélectionne optionnellement un Client et une Campagne
5. Il va sur le profil d'un journaliste
6. Il clique "Capturer ce profil"
7. Attente 2-5 secondes (délai anti-détection)
8. Le profil est extrait et envoyé au backend
9. Badge vert ✓ apparaît sur la page
10. EN BACKEND (invisible pour l'utilisateur) :
    a. Le journaliste est créé en BDD
    b. Enrichissement email lancé (Dropcontact) → email + statut
    c. Recherche d'articles lancée (Brave Search) → 5 articles
    d. Extraction de texte (Trafilatura) → contenu des articles
    e. Analyse IA lancée (Profiler + Classifier) → résumé, tonalité, secteur, tags
11. L'utilisateur peut ensuite voir le profil enrichi dans le frontend
```

**Temps total estimé** : ~15-30 secondes pour l'enrichissement complet (en tâche de fond).

**Points de friction** :
- L'utilisateur ne sait pas quand l'enrichissement est terminé
- Il doit aller sur le frontend pour voir le résultat
- Pas de notification quand c'est prêt

### 6.2 Flow 2 — Ajouter un journaliste manuellement

```
1. L'utilisateur va sur /journalists
2. Clique "Saisie manuelle"
3. Remplit le formulaire (8 champs)
4. Clique "Créer"
5. Le journaliste est créé
6. Enrichissement automatique déclenché en background
7. Le journaliste apparaît dans la liste
```

### 6.3 Flow 3 — Importer un fichier CSV

```
1. L'utilisateur va sur /import
2. Glisse ou sélectionne un fichier CSV
3. Clique "Importer"
4. Résultat : X créés, Y ignorés, Z erreurs
5. Les journalistes apparaissent dans la liste /journalists
```

**Points de friction** :
- L'utilisateur ne sait pas quel format de CSV utiliser
- Pas de lien vers un template
- Les journalistes importés ne sont associés à aucun client/campagne

### 6.4 Flow 4 — Évaluer un pitch pour un journaliste

```
1. L'utilisateur va sur /journalists/{id}
2. Scroll jusqu'à la section "Pitch Matcher"
3. Décrit son pitch dans la textarea
4. Clique "Évaluer le pitch"
5. L'IA analyse la pertinence
6. Résultat affiché : GO/À RISQUE/NO GO + score + justification + angle suggéré
7. Le résultat est sauvegardé dans l'historique
```

### 6.5 Flow 5 — Construire une liste de médias pour une campagne

```
1. Créer un client (/clients → "Nouveau client")
2. Aller sur le client (/clients/{id})
3. Créer une campagne ("Nouvelle campagne")
4. Créer une liste dans la campagne ("Nouvelle liste")
5. ??? COMMENT AJOUTER DES JOURNALISTES À LA LISTE ???
   → Il n'y a AUCUN mécanisme dans l'UI pour ça depuis le frontend !
   → L'API existe (POST /lists/{id}/journalists) mais n'est pas exposée dans l'interface
   → Seule l'extension Chrome permet d'associer un journaliste à une campagne (au moment de la capture)
6. Aller sur la liste (/lists/{id})
7. Exporter en CSV
```

**C'est un problème majeur** : le flow principal de l'outil (construire des listes de médias) est cassé dans l'interface web.

### 6.6 Flow 6 — Surveiller les changements de poste

```
1. L'utilisateur marque des journalistes comme "Suivis" (toggle sur la fiche)
2. Chaque dimanche à 3h du matin, le cron vérifie les changements
3. Si un changement est détecté : movement_alert = true
4. L'alerte apparaît sur le Dashboard
5. L'utilisateur voit l'ancien vs nouveau poste/média
6. Il peut "Fermer" l'alerte (dismiss)
```

### 6.7 Flow 7 — Export vers HubSpot

```
1. L'utilisateur va sur une liste (/lists/{id})
2. Clique "Exporter CSV"
3. Le navigateur télécharge un CSV avec les colonnes :
   First Name, Email, Job Title, Company Name, Media Type,
   Media Scope, AI Summary, AI Tonality, Pitch Advice
4. L'utilisateur importe ce CSV dans HubSpot
```

---

## 7. Intelligence Artificielle — Prompts & Logique

### 7.1 Les 3 prompts IA

L'IA opère via 3 prompts spécialisés, exécutés séquentiellement :

#### Prompt 1 : PROFILER (analyse éditoriale)

**Input** : Nom, poste, média, articles récents (titres + extraits)

**Output** (JSON) :
```json
{
  "resume_editorial": "Résumé de 2-3 phrases du profil éditorial",
  "tonalite": "investigateur|vulgarisateur|engagé|neutre|critique|enthousiaste",
  "formats_preferes": ["enquête", "interview", "analyse"],
  "sujets_a_eviter": "Sujets sensibles ou conflits d'intérêt identifiés"
}
```

**Tonalités possibles** (6) : investigateur, vulgarisateur, engagé, neutre, critique, enthousiaste

**Formats possibles** (10) : enquête, interview, reportage, chronique, analyse, brève, portrait, tribune, podcast, newsletter

#### Prompt 2 : CLASSIFIER (catégorisation)

**Input** : Nom, poste, média, articles récents

**Output** (JSON) :
```json
{
  "secteur_macro": "Environnement",
  "tags_micro": ["climat", "transition énergétique", "biodiversité"]
}
```

**Secteurs macro** (16) : Politique, Économie, Tech & Numérique, Santé, Environnement & Énergie, Culture & Médias, Sport, International, Société, Science & Recherche, Éducation, Immobilier & Urbanisme, Finance & Marchés, Luxe & Mode, Automobile & Mobilité, Alimentation & Agriculture

**Tags micro** : 2-5 tags libres, spécifiques au journaliste

#### Prompt 3 : MATCHER (évaluation de pitch)

**Input** : Profil journaliste complet (résumé IA, tonalité, articles) + description du pitch

**Output** (JSON) :
```json
{
  "score_match": 85,
  "verdict": "GO",
  "justification": "Explication détaillée...",
  "angle_suggere": "Suggestion d'angle d'approche...",
  "bad_buzz_risk": false,
  "risk_details": null
}
```

**Règles de verdict** :
- Score ≥ 70 → `GO`
- Score 40-69 → `À RISQUE`
- Score < 40 → `NO GO`

### 7.2 Provider LLM

| Provider | Modèle par défaut | Modèle alternatif | Coût estimé |
|----------|-------------------|-------------------|-------------|
| **Gemini** (défaut) | Flash-Lite | Flash | ~$0.78/mois (1000 journalistes) |
| OpenAI | GPT-4.1 nano | GPT-4.1 mini | ~$1.60/mois |
| Mistral | Small 3.2 | Medium 3.1 | ~$1.20/mois |

**Configuration** : via variables d'environnement `LLM_PROVIDER` et `LLM_MODEL`.

### 7.3 Sécurité des prompts

- **Sanitisation des inputs** : fonction `sanitize_input()` pour prévenir l'injection de prompt
- **Retry** : 3 tentatives avec backoff exponentiel (1s)
- **Parsing** : gestion des blocs markdown dans les réponses JSON

### 7.4 Mode test (draft)

L'utilisateur peut lancer une analyse en mode "test" (`is_draft=true`) :
- Les résultats sont affichés mais **non sauvegardés** dans le profil du journaliste
- Permet de tester les prompts sans polluer les données
- Les pitch matchs en mode test sont marqués `[test]` dans l'historique

**Problèmes** :
- Le concept de "test" vs "production" n'est pas clair pour l'utilisateur
- Pas de comparaison côte-à-côte entre différentes analyses
- Pas de feedback loop (l'utilisateur ne peut pas noter la qualité de l'analyse)
- Les prompts sont versionnés en BDD mais il n'y a pas d'interface pour les gérer

---

## 8. Services d'enrichissement

### 8.1 Enrichissement email (Dropcontact)

**Service** : Dropcontact API
**Coût** : ~29€/mois (pack de base)

**Flow** :
```
Soumission batch (nom, prénom, entreprise, LinkedIn)
       ↓
Polling (toutes les 5s, timeout 60s)
       ↓
Résultat : email, statut email, téléphone, poste, entreprise
```

**Statuts email** : `valid`, `invalid`, `catch-all`, `unknown`

**Circuit breaker** : se déclenche après 3 échecs consécutifs, réouverture après 60s.

### 8.2 Découverte d'articles (Brave Search)

**Service** : Brave Search API
**Coût** : ~5-10$/mois

**Flow** :
```
Requête : "{prénom} {nom} {média}" → 5 résultats
       ↓
Filtrage : exclut Facebook, Twitter, Instagram, TikTok, LinkedIn, YouTube, Pinterest, PagesJaunes, Societe.com, Kompass
       ↓
Résultat : titre, URL, description, date de publication
```

### 8.3 Extraction de contenu (Trafilatura)

**Service** : Trafilatura (open-source, gratuit)
**Fallback** : newspaper4k

**Flow** :
```
URL d'article → Trafilatura → texte brut, titre, auteur, date
       ↓ (si échec)
URL d'article → newspaper4k → texte brut, titre, auteur, date
```

**Circuit breaker** : se déclenche après 10 échecs consécutifs.

### 8.4 Pipeline d'enrichissement complet

Quand un journaliste est créé, le pipeline complet est déclenché automatiquement :

```
Création du journaliste
       ↓
1. Enrichissement email (Dropcontact)
       ↓
2. Découverte d'articles (Brave Search)
       ↓
3. Extraction de texte (Trafilatura) pour chaque article
       ↓
4. Analyse IA (Profiler + Classifier) basée sur les articles extraits
```

---

## 9. Tâches de fond & Crons

### 9.1 Tâches à la demande (Celery)

| Tâche | Déclencheur | Description |
|-------|------------|-------------|
| `enrich_journalist` | Création d'un journaliste | Pipeline complet : email + articles + IA |
| `enrich_email_task` | Bouton dans l'UI | Enrichissement email seul (Dropcontact) |
| `discover_articles_task` | Bouton dans l'UI | Découverte d'articles seule (Brave Search) |
| `analyze_journalist_ai_task` | Bouton dans l'UI | Analyse IA seule (Profiler + Classifier) |

### 9.2 Tâches planifiées (Celery Beat)

| Tâche | Fréquence | Description |
|-------|-----------|-------------|
| `check_job_changes` | Dimanche 3h00 | Vérifie les changements de poste/média pour les journalistes suivis (`is_watched=true`) via Brave Search |
| `refresh_articles` | Tous les jours 4h00 | Rafraîchit les articles des 20 journalistes les plus consultés |
| `purge_inactive` | 1er du mois 2h00 | Supprime les journalistes inactifs depuis 12+ mois (RGPD) — uniquement si `is_watched=false` |

**Timezone** : Europe/Paris

### 9.3 Infrastructure Celery

- **Broker** : Redis
- **Backend** : Redis
- **Sérialisation** : JSON
- **Workers** : 1 worker + 1 beat scheduler (docker-compose)

---

## 10. Conformité RGPD

### 10.1 Mesures implémentées

| Mesure | Implémentation |
|--------|----------------|
| **Droit à l'effacement** | `DELETE /journalists/{id}` — suppression complète + log audit |
| **Purge automatique** | Cron mensuel : supprime les journalistes non consultés depuis 12 mois (si non suivis) |
| **Traçabilité d'accès** | `last_accessed_at` mis à jour à chaque consultation de fiche |
| **Registre des traitements** | `GET /dashboard/rgpd/registre` — stats sur les données stockées |
| **Audit log** | Chaque action significative est loguée (user, action, entité, détails, date) |
| **Minimisation** | Seules les données nécessaires au sourcing sont collectées |

### 10.2 Registre RGPD (endpoint)

Retourne :
- Total de journalistes en base
- Nombre avec email, avec LinkedIn
- Répartition par source (extension, import, manuel)
- Politique de rétention (12 mois)
- Endpoints de suppression disponibles

### 10.3 Lacunes RGPD identifiées

- Pas de consentement explicite des journalistes pour le traitement de leurs données
- Pas de base légale documentée (intérêt légitime ?)
- Le registre est un endpoint API mais pas une page dans l'interface
- Pas d'export des données d'un journaliste (droit d'accès/portabilité)
- Les données Dropcontact (téléphone) sont stockées sans justification claire

---

## 11. Infrastructure & Déploiement

### 11.1 Environnements

| Environnement | Frontend | Backend | Base de données |
|----------------|----------|---------|-----------------|
| **Local** | `localhost:3000` | `localhost:8000` | Docker PostgreSQL + Redis |
| **Preview** | Vercel Preview | Railway (staging) | Railway PostgreSQL |
| **Production** | Vercel Production | Railway Production | Railway PostgreSQL + Redis |

### 11.2 CI/CD (GitHub Actions)

5 jobs déclenchés sur push/PR vers `main` :

1. **backend-lint** : ruff (linting + formatting Python)
2. **backend-test** : pytest avec PostgreSQL + Redis de test
3. **frontend-lint** : ESLint + TypeScript type-check
4. **frontend-build** : Build de production Next.js
5. **extension-lint** : Build de l'extension Chrome

### 11.3 Docker Compose (local)

6 services orchestrés :
- `db` : PostgreSQL 16 (health checked)
- `redis` : Redis 7 (health checked)
- `api` : FastAPI (port 8000, reload auto)
- `celery-worker` : Worker async
- `celery-beat` : Scheduler cron
- `frontend` : Next.js (port 3000, hot reload)

### 11.4 Variables d'environnement requises

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL PostgreSQL |
| `REDIS_URL` | URL Redis |
| `SECRET_KEY` | Clé de signature JWT |
| `GOOGLE_CLIENT_ID` | OAuth2 Google |
| `GOOGLE_CLIENT_SECRET` | OAuth2 Google |
| `FRONTEND_URL` | URL du frontend (redirections OAuth) |
| `DROPCONTACT_API_KEY` | API Dropcontact |
| `BRAVE_API_KEY` | API Brave Search |
| `LLM_PROVIDER` | gemini / openai / mistral |
| `LLM_MODEL` | Modèle spécifique |
| `GEMINI_API_KEY` | API Google Gemini |
| `OPENAI_API_KEY` | API OpenAI (optionnel) |
| `MISTRAL_API_KEY` | API Mistral (optionnel) |
| `SENTRY_DSN` | Monitoring Sentry |

---

## 12. Coûts opérationnels

### 12.1 Budget mensuel estimé (MVP — 1000 journalistes, 2-3 users)

| Service | Coût/mois | Notes |
|---------|-----------|-------|
| Dropcontact | ~29€ | Pack de base, enrichissement email |
| Brave Search | ~5-10$ | ~1000 requêtes/mois |
| Trafilatura | Gratuit | Open-source |
| LLM (Gemini) | ~1$ | Flash-Lite, ~1000 analyses |
| Vercel | Gratuit | Hobby plan suffisant |
| Railway | 15-25$ | API + PostgreSQL + Redis |
| **Total** | **~50-65€/mois** | |

### 12.2 Comparaison avec alternatives

| Solution | Coût/mois |
|----------|-----------|
| **425PPM (actuel)** | ~50-65€ |
| Meltwater | ~3 000-10 000€ |
| Cision | ~2 000-5 000€ |
| Muck Rack | ~1 000-3 000€ |

---

## 13. Problèmes connus & Dettes techniques

### 13.1 Problèmes critiques (bloquants pour l'adoption)

| # | Problème | Impact | Écran |
|---|----------|--------|-------|
| 1 | **Impossible d'ajouter des journalistes à une liste depuis le frontend** | Le flow principal de l'outil est cassé. L'API `POST /lists/{id}/journalists` existe mais n'est pas exposée dans l'UI. | `/lists/[id]` |
| 2 | **Token JWT expire après 60 min sans refresh** | L'utilisateur est déconnecté brutalement en pleine session de travail, sans avertissement ni possibilité de se reconnecter automatiquement. | Global |
| 3 | **Extension : token à copier-coller manuellement** | L'utilisateur doit aller chercher le token JWT dans les devtools du frontend et le coller dans l'extension. Pas de login intégré. | Extension |
| 4 | **Aucune documentation du format CSV d'import** | L'utilisateur ne sait pas quelles colonnes sont attendues, quel encodage utiliser, etc. | `/import` |

### 13.2 Problèmes UX majeurs

| # | Problème | Impact | Écran |
|---|----------|--------|-------|
| 5 | **Fiche journaliste surchargée** | 8 sections sur une seule page, scroll interminable. L'information est difficile à trouver et les actions importantes (Pitch Matcher, Notes) sont cachées en bas. | `/journalists/[id]` |
| 6 | **Pas de tri sur la liste des journalistes** | Impossible de trier par nom, média, date d'ajout, etc. | `/journalists` |
| 7 | **Pas de sélection multiple / actions groupées** | Impossible de sélectionner plusieurs journalistes pour les ajouter à une liste, les supprimer, ou lancer une analyse groupée. | `/journalists` |
| 8 | **Pas de feedback d'enrichissement** | Quand un journaliste est créé, l'enrichissement tourne en background mais l'utilisateur ne sait pas quand c'est terminé. Pas de spinner, pas de notification. | `/journalists/[id]` |
| 9 | **Filtres non persistés dans l'URL** | Si l'utilisateur filtre la liste des journalistes puis revient en arrière, les filtres sont perdus. | `/journalists` |
| 10 | **Clients/Campagnes : pas de modification ni suppression** | Une fois créés, les clients et campagnes ne peuvent pas être modifiés ou supprimés. | `/clients`, `/clients/[id]` |
| 11 | **Le concept de "mode test" IA est confus** | La distinction entre "Re-analyser (test)" et "Analyser" n'est pas intuitive. | `/journalists/[id]` |
| 12 | **Page d'accueil inutile** | Pour un outil interne, la landing page n'apporte rien. L'utilisateur devrait atterrir directement sur le dashboard. | `/` |

### 13.3 Problèmes de sécurité

| # | Problème | Impact |
|---|----------|--------|
| 13 | **CORS `allow_origins=["*"]`** | Toute origine peut appeler l'API. Devrait être restreint au domaine Vercel. |
| 14 | **Token JWT dans localStorage** | Vulnérable aux attaques XSS. Les cookies HttpOnly seraient plus sécurisés. |
| 15 | **Tout compte Google est accepté** | Pas de whitelist de domaines email. N'importe qui avec un compte Google peut se connecter. |

### 13.4 Dettes techniques

| # | Problème | Impact |
|---|----------|--------|
| 16 | **Sélecteurs LinkedIn fragiles** | Les sélecteurs CSS du content script cassent régulièrement quand LinkedIn met à jour son DOM. Nécessite une maintenance constante. |
| 17 | **Requêtes N+1 sur la page clients** | Une requête par client pour compter les campagnes. Non scalable. |
| 18 | **Pas de tests frontend** | Aucun test unitaire ou d'intégration côté React. |
| 19 | **Seed script avec données fictives en prod** | Le script de seed s'exécute au démarrage du container — risque d'insertion de données de test en production. |
| 20 | **4 migrations correctives** | 3 des 4 migrations sont des correctifs de la migration initiale, signe d'un schéma qui a évolué de manière chaotique. |

---

## 14. Annexes

### 14.1 Liste complète des endpoints API (50+)

#### Santé
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/health` | Statut de l'API + BDD |

#### Authentification
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/auth/google/login` | Redirect vers Google OAuth |
| GET | `/auth/google/callback` | Callback OAuth, retourne JWT |
| GET | `/auth/me` | Info utilisateur courant |

#### Journalistes
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/journalists/` | Liste paginée + filtres |
| POST | `/journalists/` | Création manuelle |
| GET | `/journalists/{id}` | Détail (met à jour `last_accessed_at`) |
| PUT | `/journalists/{id}` | Modification |
| DELETE | `/journalists/{id}` | Suppression (RGPD) |

#### Clients
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/clients/` | Liste des clients |
| POST | `/clients/` | Création |
| GET | `/clients/{id}` | Détail |
| PUT | `/clients/{id}` | Modification |
| DELETE | `/clients/{id}` | Suppression |

#### Campagnes
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/campaigns/` | Liste (filtre `client_id`) |
| POST | `/campaigns/` | Création |
| GET | `/campaigns/{id}` | Détail |
| PUT | `/campaigns/{id}` | Modification |
| DELETE | `/campaigns/{id}` | Suppression |

#### Listes
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/lists/` | Liste (filtre `campaign_id`) |
| POST | `/lists/` | Création |
| GET | `/lists/{id}` | Détail avec journalistes |
| PUT | `/lists/{id}` | Modification |
| DELETE | `/lists/{id}` | Suppression |
| POST | `/lists/{id}/journalists` | Ajouter des journalistes |
| DELETE | `/lists/{id}/journalists/{jid}` | Retirer un journaliste |

#### Notes
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/journalists/{id}/notes/` | Liste des notes |
| POST | `/journalists/{id}/notes/` | Créer une note |
| DELETE | `/journalists/{id}/notes/{nid}` | Supprimer une note |

#### IA
| Méthode | Path | Description |
|---------|------|-------------|
| POST | `/ai/journalists/{id}/analyze` | Analyse Profiler + Classifier |
| POST | `/ai/journalists/{id}/pitch-match` | Évaluation de pitch |
| GET | `/ai/journalists/{id}/pitch-matches` | Historique des pitchs |
| GET | `/ai/prompt-versions` | Versions des prompts |

#### Enrichissement
| Méthode | Path | Description |
|---------|------|-------------|
| POST | `/enrichment/journalists/{id}` | Enrichissement inline (articles) |
| POST | `/enrichment/journalists/{id}/email` | Queue enrichissement email |
| POST | `/enrichment/journalists/{id}/articles` | Queue découverte articles |
| GET | `/enrichment/tasks/{task_id}` | Statut d'une tâche Celery |
| GET | `/enrichment/journalists/{id}/articles` | 5 derniers articles |
| GET | `/enrichment/journalists/{id}/progress` | SSE progression en temps réel |

#### Import/Export
| Méthode | Path | Description |
|---------|------|-------------|
| POST | `/import/journalists` | Import CSV |
| GET | `/export/journalists` | Export CSV global (HubSpot) |
| GET | `/export/lists/{id}` | Export CSV d'une liste |

#### Extension Chrome
| Méthode | Path | Description |
|---------|------|-------------|
| POST | `/extension/journalists/from-profile` | Capture profil unique |
| POST | `/extension/journalists/from-bulk` | Capture bulk |
| POST | `/extension/journalists/from-url` | Import par URL (dégradé) |

#### Dashboard
| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/dashboard/stats` | KPI globaux |
| GET | `/dashboard/alerts` | Alertes de mouvement |
| POST | `/dashboard/alerts/{id}/dismiss` | Fermer une alerte |
| GET | `/dashboard/audit-log` | Journal d'audit |
| GET | `/dashboard/rgpd/registre` | Registre RGPD |

### 14.2 Données de test (Seed)

10 journalistes fictifs couvrant les cas limites :
1. Cas parfait (profil complet idéal)
2. Bad buzz (risque majeur)
3. Alerte mouvement (changement de poste détecté)
4. Email manquant (échec Dropcontact)
5. Test sémantique (lithium pour véhicule électrique)
6. Podcasteur (filtre par format)
7. Paywall dur (échec Trafilatura)
8. Pigiste/freelance (multiple médias)
9. Présentateur TV (pas d'articles récents)
10. Cible régionale (PQR + ville)

+ 3 versions de prompts IA (profiler, classifier, matcher)

### 14.3 Dépendances principales

**Backend Python** :
fastapi, sqlalchemy[asyncio], asyncpg, celery, redis, pydantic, python-jose (JWT), httpx, trafilatura, authlib (OAuth), sentry-sdk, alembic

**Frontend Node** :
next 15, react 19, typescript, tailwindcss 4, @radix-ui, @tanstack/react-table, lucide-react, class-variance-authority

**Extension** :
typescript, esbuild, @types/chrome

---

*Document généré le 18 mars 2026 — basé sur l'analyse complète du code source (commit fea3869, branche main).*
