"""
Seed script — insère 10 journalistes fictifs pour les tests.
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
    {
        "first_name": "Marie",
        "last_name": "Durand",
        "job_title": "Rédactrice en Chef",
        "email": "marie.durand@lemonde.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/marie-durand-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "Le Monde",
        "media_type": "presse_ecrite",
        "media_scope": "pqn",
        "sector_macro": "environnement",
        "tags_micro": ["climat", "énergie", "biodiversité"],
        "source": "manual",
    },
    {
        "first_name": "Thomas",
        "last_name": "Martin",
        "job_title": "Journaliste Économie",
        "email": "thomas.martin@lesechos.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/thomas-martin-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "Les Échos",
        "media_type": "presse_ecrite",
        "media_scope": "economique",
        "sector_macro": "économie",
        "tags_micro": ["RSE", "finance_verte", "investissement"],
        "source": "manual",
    },
    {
        "first_name": "Sophie",
        "last_name": "Bernard",
        "job_title": "Présentatrice",
        "email": "sophie.bernard@france2.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/sophie-bernard-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "France 2",
        "media_type": "tv",
        "media_scope": "grand_public",
        "sector_macro": "environnement",
        "tags_micro": ["transition_énergétique", "mobilité", "alimentation"],
        "source": "manual",
    },
    {
        "first_name": "Lucas",
        "last_name": "Petit",
        "job_title": "Journaliste Tech & Climat",
        "email": "lucas.petit@usinenouvelle.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/lucas-petit-fictif",
        "city": "Lyon",
        "country": "France",
        "media_name": "L'Usine Nouvelle",
        "media_type": "web",
        "media_scope": "specialisee",
        "sector_macro": "industrie",
        "tags_micro": ["cleantech", "industrie_verte", "décarbonation"],
        "source": "manual",
    },
    {
        "first_name": "Camille",
        "last_name": "Roux",
        "job_title": "Cheffe de rubrique Environnement",
        "email": "camille.roux@liberation.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/camille-roux-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "Libération",
        "media_type": "presse_ecrite",
        "media_scope": "pqn",
        "sector_macro": "environnement",
        "tags_micro": ["pollution", "justice_climatique", "agriculture"],
        "source": "manual",
    },
    {
        "first_name": "Antoine",
        "last_name": "Lefebvre",
        "job_title": "Producteur Podcast",
        "email": "antoine.lefebvre@podcast.example.fr",
        "email_status": "catch-all",
        "linkedin_url": "https://www.linkedin.com/in/antoine-lefebvre-fictif",
        "city": "Bordeaux",
        "country": "France",
        "media_name": "Greenletter Club",
        "media_type": "podcast",
        "media_scope": "specialisee",
        "sector_macro": "environnement",
        "tags_micro": ["effondrement", "low_tech", "sobriété"],
        "source": "manual",
    },
    {
        "first_name": "Julie",
        "last_name": "Moreau",
        "job_title": "Correspondante Énergie",
        "email": "julie.moreau@reuters.example.com",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/julie-moreau-fictif",
        "city": "Bruxelles",
        "country": "Belgique",
        "media_name": "Reuters",
        "media_type": "agence",
        "media_scope": "pqn",
        "sector_macro": "énergie",
        "tags_micro": ["nucléaire", "renouvelables", "pétrole", "gaz"],
        "source": "manual",
    },
    {
        "first_name": "Pierre",
        "last_name": "Dubois",
        "job_title": "Rédacteur Newsletter",
        "email": "pierre.dubois@vertlejournal.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/pierre-dubois-fictif",
        "city": "Nantes",
        "country": "France",
        "media_name": "Vert, le journal",
        "media_type": "newsletter",
        "media_scope": "specialisee",
        "sector_macro": "environnement",
        "tags_micro": ["greenwashing", "climat", "biodiversité"],
        "source": "manual",
    },
    {
        "first_name": "Émilie",
        "last_name": "Garcia",
        "job_title": "Journaliste Radio",
        "email": "emilie.garcia@franceinter.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/emilie-garcia-fictif",
        "city": "Paris",
        "country": "France",
        "media_name": "France Inter",
        "media_type": "radio",
        "media_scope": "grand_public",
        "sector_macro": "environnement",
        "tags_micro": ["transition", "société", "santé_environnement"],
        "source": "manual",
    },
    {
        "first_name": "Nicolas",
        "last_name": "Faure",
        "job_title": "Journaliste PQR",
        "email": "nicolas.faure@ouestfrance.example.fr",
        "email_status": "validé",
        "linkedin_url": "https://www.linkedin.com/in/nicolas-faure-fictif",
        "city": "Rennes",
        "country": "France",
        "media_name": "Ouest-France",
        "media_type": "presse_ecrite",
        "media_scope": "pqr",
        "sector_macro": "local",
        "tags_micro": ["agriculture", "littoral", "urbanisme"],
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
                email=j["email"],
                email_status=j["email_status"],
                linkedin_url=j["linkedin_url"],
                city=j["city"],
                country=j["country"],
                media_name=j["media_name"],
                media_type=j["media_type"],
                media_scope=j["media_scope"],
                sector_macro=j["sector_macro"],
                tags_micro=j["tags_micro"],
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
