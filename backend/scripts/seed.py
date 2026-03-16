"""
Seed script — insère 10 journalistes fictifs pour les tests (Addendum Produit V1).

Chaque profil cible un edge case spécifique de l'application :
  1. Cas parfait (cible idéale)
  2. Bad Buzz (risque majeur)
  3. Alerte mouvement (transfert détecté)
  4. Email manquant (échec Dropcontact)
  5. Sémantique (test pgvector — "lithium" doit remonter pour "vélo électrique")
  6. Podcasteur (filtre format)
  7. Hard paywall (échec Trafilatura)
  8. Pigiste / freelance (média multiple)
  9. Anchor TV (sans articles récents — fallback IA sur contenu manuel)
  10. Cible régionale (test géographique PQR + ville)

Usage: python -m scripts.seed
"""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

SEED_JOURNALISTS = [
    # Profil 1 : Le Cas Parfait (La cible idéale)
    {
        "first_name": "Alice",
        "last_name": "Dupont",
        "job_title": "Journaliste Tech",
        "email": "alice.dupont@lesechos.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/alice-dupont-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "Les Echos",
        "media_type": "presse_ecrite",
        "media_scope": "pqn",
        "sector_macro": "tech",
        "tags_micro": ["vélo électrique", "mobilité douce", "batterie"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 2 : Le Cas "Bad Buzz" (Le risque majeur)
    {
        "first_name": "Marc",
        "last_name": "Lemoine",
        "job_title": "Journaliste Enquête",
        "email": "marc.lemoine@reporterre.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/marc-lemoine-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "Reporterre",
        "media_type": "web",
        "media_scope": "specialisee",
        "sector_macro": "environnement",
        "tags_micro": ["greenwashing", "suv", "pollution"],
        "movement_alert": False,
        "bad_buzz_risk": True,
        "source": "manual",
    },
    # Profil 3 : Le Cas "Alerte Mouvement" (Le transfert détecté)
    {
        "first_name": "Sophie",
        "last_name": "Martin",
        "job_title": "Cheffe de rubrique Politique",
        "email": "sophie.martin@express.example.fr",
        "email_status": "invalide",
        "linkedin_url": "https://www.linkedin.com/in/sophie-martin-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "Le Figaro",
        "media_type": "presse_ecrite",
        "media_scope": "pqn",
        "media_name_previous": "L'Express",
        "sector_macro": "politique",
        "tags_micro": ["politique intérieure", "réforme", "institutions"],
        "movement_alert": True,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 4 : Le Cas "Email Manquant" (L'échec Dropcontact)
    {
        "first_name": "Julien",
        "last_name": "Dubois",
        "job_title": "Journaliste Lifestyle",
        "email": None,
        "email_status": "manquant",
        "linkedin_url": "https://www.linkedin.com/in/julien-dubois-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "GQ Magazine",
        "media_type": "presse_ecrite",
        "media_scope": "grand_public",
        "sector_macro": "culture",
        "tags_micro": ["mode", "lifestyle", "luxe"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 5 : Le Cas Sémantique (Test de pgvector)
    # Ne contient PAS le mot "voiture" ni "vélo" → DOIT remonter via embedding
    {
        "first_name": "Emma",
        "last_name": "Leroy",
        "job_title": "Journaliste Industrie",
        "email": "emma.leroy@usinenouvelle.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/emma-leroy-fictif",
        "city": "Lyon",
        "country": "France",
        "media_name": "L'Usine Nouvelle",
        "media_type": "web",
        "media_scope": "specialisee",
        "sector_macro": "économie",
        "tags_micro": ["gigafactory", "lithium", "réseau électrique"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 6 : Le Podcasteur (Le filtre format)
    {
        "first_name": "Thomas",
        "last_name": "Blanc",
        "job_title": "Producteur & Animateur",
        "email": "thomas.blanc@techcafe.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/thomas-blanc-fictif",
        "city": "Bordeaux",
        "country": "France",
        "media_name": "Tech Café",
        "media_type": "podcast",
        "media_scope": "grand_public",
        "sector_macro": "tech",
        "tags_micro": ["startups", "innovation", "numérique"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 7 : Le Cas "Hard Paywall" (L'échec Trafilatura)
    {
        "first_name": "Chloé",
        "last_name": "Petit",
        "job_title": "Journaliste Investigation",
        "email": "chloe.petit@mediapart.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/chloe-petit-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "Mediapart",
        "media_type": "web",
        "media_scope": "pqn",
        "sector_macro": "politique",
        "tags_micro": ["investigation", "corruption", "finance"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 8 : Le Pigiste / Freelance (Média Multiple)
    {
        "first_name": "Nicolas",
        "last_name": "Rousseau",
        "job_title": "Pigiste",
        "email": "nicolas.rousseau@pigiste.example.fr",
        "email_status": "catch-all",
        "linkedin_url": "https://www.linkedin.com/in/nicolas-rousseau-fictif",
        "city": "Marseille",
        "country": "France",
        "media_name": "Pigiste",
        "media_type": "presse_ecrite",
        "media_scope": "grand_public",
        "sector_macro": "culture",
        "tags_micro": ["cinéma", "littérature", "tech"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 9 : L'Anchor TV (Sans articles récents)
    # Pas d'ingestion Twitter pour le MVP — le fallback IA se base sur le contenu manuel (notes/bio)
    {
        "first_name": "Léa",
        "last_name": "Roux",
        "job_title": "Présentatrice",
        "email": "lea.roux@bfmtv.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/lea-roux-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "BFM TV",
        "media_type": "tv",
        "media_scope": "pqn",
        "sector_macro": "économie",
        "tags_micro": ["macroéconomie", "marchés", "conjoncture"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
    # Profil 10 : La Cible Régionale (Test géographique)
    {
        "first_name": "Hugo",
        "last_name": "Moreau",
        "job_title": "Journaliste PQR",
        "email": "hugo.moreau@ouestfrance.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/hugo-moreau-fictif",
        "city": "Nantes",
        "country": "France",
        "media_name": "Ouest-France",
        "media_type": "presse_ecrite",
        "media_scope": "pqr",
        "sector_macro": "local",
        "tags_micro": ["agriculture", "littoral", "urbanisme"],
        "movement_alert": False,
        "bad_buzz_risk": False,
        "source": "manual",
    },
]


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if data already exists
        result = await session.execute(
            text("SELECT COUNT(*) FROM journalists")
        )
        count = result.scalar()
        if count and count > 0:
            print(f"Database already has {count} journalists. Skipping seed.")
            return

        from app.models.journalist import Journalist

        now = datetime.now(timezone.utc)
        for j in SEED_JOURNALISTS:
            journalist = Journalist(
                first_name=j["first_name"],
                last_name=j["last_name"],
                job_title=j["job_title"],
                email=j.get("email"),
                email_status=j["email_status"],
                linkedin_url=j["linkedin_url"],
                city=j["city"],
                country=j["country"],
                media_name=j["media_name"],
                media_type=j["media_type"],
                media_scope=j["media_scope"],
                sector_macro=j["sector_macro"],
                tags_micro=j["tags_micro"],
                movement_alert=j.get("movement_alert", False),
                bad_buzz_risk=j.get("bad_buzz_risk", False),
                media_name_previous=j.get("media_name_previous"),
                source=j["source"],
                created_at=now,
                updated_at=now,
                last_accessed_at=now,
            )
            session.add(journalist)

        await session.commit()
        print(f"Seeded {len(SEED_JOURNALISTS)} fictional journalists.")

        # Seed prompt versions
        from app.services.ai_prompts import (
            PROFILER_SYSTEM_PROMPT,
            PROFILER_USER_TEMPLATE,
            CLASSIFIER_SYSTEM_PROMPT,
            CLASSIFIER_USER_TEMPLATE,
            MATCHER_SYSTEM_PROMPT,
            MATCHER_USER_TEMPLATE,
        )

        prompts = [
            ("profiler", PROFILER_SYSTEM_PROMPT, PROFILER_USER_TEMPLATE),
            ("classifier", CLASSIFIER_SYSTEM_PROMPT, CLASSIFIER_USER_TEMPLATE),
            ("matcher", MATCHER_SYSTEM_PROMPT, MATCHER_USER_TEMPLATE),
        ]

        for prompt_name, sys_prompt, user_template in prompts:
            await session.execute(
                text("""
                    INSERT INTO prompt_versions (
                        id, prompt_name, version, system_prompt,
                        user_prompt_template, is_active, created_at
                    ) VALUES (
                        :id, :prompt_name, 1, :system_prompt,
                        :user_prompt_template, TRUE, :now
                    )
                    ON CONFLICT (prompt_name, version) DO NOTHING
                """),
                {
                    "id": str(uuid.uuid4()),
                    "prompt_name": prompt_name,
                    "system_prompt": sys_prompt,
                    "user_prompt_template": user_template,
                    "now": now,
                },
            )

        await session.commit()
        print("Seeded 3 prompt versions (profiler, classifier, matcher).")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
