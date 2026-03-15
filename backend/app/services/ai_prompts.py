"""
Prompts IA pour l'analyse des journalistes.

3 prompts spécialisés :
  - Profiler : résumé éditorial + tonalité + formats préférés
  - Classifieur : secteur macro + tags micro
  - Match Maker : score match + verdict pour un pitch donné
"""

import json
import logging
import re
from datetime import datetime, timezone

from app.services.llm import LLMResponse, get_llm_service

logger = logging.getLogger(__name__)

# ── Sanitization ────────────────────────────────────────────────────────────

# Characters/patterns that could be used for prompt injection
_INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|above)\s+(instructions|prompts)",
    r"you\s+are\s+now",
    r"system\s*:",
    r"<\|.*?\|>",
    r"\[INST\]",
    r"\[/INST\]",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)


def sanitize_input(text: str) -> str:
    """Sanitize user input before injection into prompts.

    - Strip control characters
    - Truncate to reasonable length
    - Detect prompt injection patterns
    """
    if not text:
        return ""
    # Remove control chars except newlines
    text = "".join(c for c in text if c == "\n" or (c.isprintable()))
    # Truncate to 10000 chars
    text = text[:10000]
    # Replace injection patterns with [FILTERED]
    text = _INJECTION_RE.sub("[FILTERED]", text)
    return text.strip()


# ── Prompt Templates ────────────────────────────────────────────────────────

PROFILER_SYSTEM_PROMPT = """Tu es un analyste média expert français. Ta mission est de produire un profil éditorial d'un journaliste à partir de ses articles récents.

INSTRUCTIONS STRICTES :
- Langue de sortie : français uniquement
- Format de sortie : JSON valide uniquement, sans texte autour
- Sois factuel et synthétique
- Base-toi UNIQUEMENT sur les articles fournis

Format JSON attendu :
{
  "resume_editorial": "string — résumé de 2-3 phrases du style éditorial et des thématiques couvertes",
  "tonalite": "string — une parmi : investigateur|vulgarisateur|engagé|neutre|critique|enthousiaste",
  "formats_preferes": ["string — liste de 1 à 4 formats parmi : enquête|interview|reportage|chronique|analyse|brève|portrait|tribune|podcast|newsletter"],
  "sujets_a_eviter": "string — sujets que ce journaliste ne couvre manifestement pas, ou null si impossible à déterminer"
}"""

PROFILER_USER_TEMPLATE = """Analyse le profil éditorial de ce journaliste.

JOURNALISTE : {first_name} {last_name}
POSTE : {job_title}
MÉDIA : {media_name}

ARTICLES RÉCENTS :
{articles_text}

Produis le JSON d'analyse."""

CLASSIFIER_SYSTEM_PROMPT = """Tu es un classificateur de journalistes expert français. Ta mission est de catégoriser un journaliste selon son secteur et ses thématiques de prédilection.

INSTRUCTIONS STRICTES :
- Langue de sortie : français uniquement
- Format de sortie : JSON valide uniquement, sans texte autour
- secteur_macro : UN seul secteur principal
- tags_micro : entre 2 et 5 tags spécifiques

Format JSON attendu :
{
  "secteur_macro": "string — un parmi : environnement|énergie|tech|politique|économie|santé|culture|sport|international|société|sciences|immobilier|agriculture|transport|médias|défense",
  "tags_micro": ["string — entre 2 et 5 tags spécifiques, ex: biodiversité, transition_énergétique, climat, pollution_air"]
}"""

CLASSIFIER_USER_TEMPLATE = """Classifie ce journaliste.

JOURNALISTE : {first_name} {last_name}
POSTE : {job_title}
MÉDIA : {media_name}

ARTICLES RÉCENTS :
{articles_text}

Produis le JSON de classification."""

MATCHER_SYSTEM_PROMPT = """Tu es un expert en relations presse français. Ta mission est d'évaluer la pertinence d'un pitch pour un journaliste donné, en te basant sur son profil et ses articles récents.

INSTRUCTIONS STRICTES :
- Langue de sortie : français uniquement
- Format de sortie : JSON valide uniquement, sans texte autour
- score_match : entier entre 0 et 100
- verdict : basé sur le score — 0-30 = "NO GO", 31-60 = "À RISQUE", 61-100 = "GO"

Format JSON attendu :
{
  "score_match": 75,
  "verdict": "GO",
  "justification": "string — 2-3 phrases expliquant le score",
  "angle_suggere": "string — suggestion d'angle pour pitcher ce journaliste, ou null",
  "bad_buzz_risk": false,
  "risk_details": "string — détail du risque de bad buzz si true, sinon null"
}"""

MATCHER_USER_TEMPLATE = """Évalue la pertinence de ce pitch pour ce journaliste.

JOURNALISTE : {first_name} {last_name}
POSTE : {job_title}
MÉDIA : {media_name}
RÉSUMÉ IA : {ai_summary}
SECTEUR : {sector_macro}
TAGS : {tags_micro}

ARTICLES RÉCENTS :
{articles_text}

PITCH À ÉVALUER :
{pitch_text}

Produis le JSON d'évaluation."""


# ── AI Service ──────────────────────────────────────────────────────────────


def _format_articles(articles: list[dict]) -> str:
    """Format articles for prompt injection."""
    if not articles:
        return "(Aucun article disponible)"
    parts = []
    for i, a in enumerate(articles, 1):
        title = sanitize_input(a.get("title", "Sans titre"))
        text = sanitize_input(a.get("text", ""))
        # Truncate each article to 1500 chars
        if len(text) > 1500:
            text = text[:1500] + "..."
        parts.append(f"--- Article {i} ---\nTitre : {title}\n{text}")
    return "\n\n".join(parts)


def _parse_json_response(response: LLMResponse) -> dict | None:
    """Parse JSON from LLM response, handling markdown code blocks."""
    content = response.content.strip()
    # Remove markdown code block if present
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Failed to parse LLM JSON response: %s", content[:200])
        return None


async def run_profiler(
    journalist: dict,
    articles: list[dict],
    provider: str | None = None,
    model: str | None = None,
) -> dict | None:
    """Run Prompt 1 — Profiler: editorial summary + tonality.

    Args:
        journalist: dict with first_name, last_name, job_title, media_name
        articles: list of dicts with title, text
        provider/model: override LLM provider/model

    Returns:
        Parsed JSON dict or None on failure.
    """
    llm = get_llm_service(provider=provider, model=model)
    user_prompt = PROFILER_USER_TEMPLATE.format(
        first_name=sanitize_input(journalist.get("first_name", "")),
        last_name=sanitize_input(journalist.get("last_name", "")),
        job_title=sanitize_input(journalist.get("job_title", "")),
        media_name=sanitize_input(journalist.get("media_name", "")),
        articles_text=_format_articles(articles),
    )

    for attempt in range(3):
        try:
            response = await llm.complete(
                PROFILER_SYSTEM_PROMPT,
                user_prompt,
                temperature=0.3,
                max_tokens=512,
                json_mode=True,
            )
            result = _parse_json_response(response)
            if result and "resume_editorial" in result:
                result["_meta"] = {
                    "provider": response.provider,
                    "model": response.model,
                    "input_tokens": response.input_tokens,
                    "output_tokens": response.output_tokens,
                }
                return result
            logger.warning("Profiler returned invalid JSON (attempt %d)", attempt + 1)
        except Exception as e:
            logger.warning("Profiler failed (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                import asyncio
                await asyncio.sleep(1 * (attempt + 1))

    return None


async def run_classifier(
    journalist: dict,
    articles: list[dict],
    provider: str | None = None,
    model: str | None = None,
) -> dict | None:
    """Run Prompt 2 — Classifieur: sector + micro tags."""
    llm = get_llm_service(provider=provider, model=model)
    user_prompt = CLASSIFIER_USER_TEMPLATE.format(
        first_name=sanitize_input(journalist.get("first_name", "")),
        last_name=sanitize_input(journalist.get("last_name", "")),
        job_title=sanitize_input(journalist.get("job_title", "")),
        media_name=sanitize_input(journalist.get("media_name", "")),
        articles_text=_format_articles(articles),
    )

    for attempt in range(3):
        try:
            response = await llm.complete(
                CLASSIFIER_SYSTEM_PROMPT,
                user_prompt,
                temperature=0.2,
                max_tokens=256,
                json_mode=True,
            )
            result = _parse_json_response(response)
            if result and "secteur_macro" in result and "tags_micro" in result:
                result["_meta"] = {
                    "provider": response.provider,
                    "model": response.model,
                    "input_tokens": response.input_tokens,
                    "output_tokens": response.output_tokens,
                }
                return result
            logger.warning("Classifier returned invalid JSON (attempt %d)", attempt + 1)
        except Exception as e:
            logger.warning("Classifier failed (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                import asyncio
                await asyncio.sleep(1 * (attempt + 1))

    return None


async def run_matcher(
    journalist: dict,
    articles: list[dict],
    pitch_text: str,
    provider: str | None = None,
    model: str | None = None,
) -> dict | None:
    """Run Prompt 3 — Match Maker: score + verdict for a pitch."""
    llm = get_llm_service(provider=provider, model=model)
    user_prompt = MATCHER_USER_TEMPLATE.format(
        first_name=sanitize_input(journalist.get("first_name", "")),
        last_name=sanitize_input(journalist.get("last_name", "")),
        job_title=sanitize_input(journalist.get("job_title", "")),
        media_name=sanitize_input(journalist.get("media_name", "")),
        ai_summary=sanitize_input(journalist.get("ai_summary", "") or ""),
        sector_macro=sanitize_input(journalist.get("sector_macro", "") or ""),
        tags_micro=", ".join(journalist.get("tags_micro", []) or []),
        articles_text=_format_articles(articles),
        pitch_text=sanitize_input(pitch_text),
    )

    # Use mid-tier model for matcher (needs more reasoning)
    if model is None:
        from app.config import settings
        effective_provider = provider or settings.LLM_PROVIDER
        if effective_provider == "gemini":
            model = "gemini-2.5-flash"
        elif effective_provider == "openai":
            model = "gpt-4.1-mini"
        elif effective_provider == "mistral":
            model = "mistral-medium-latest"
        llm = get_llm_service(provider=provider, model=model)

    for attempt in range(3):
        try:
            response = await llm.complete(
                MATCHER_SYSTEM_PROMPT,
                user_prompt,
                temperature=0.3,
                max_tokens=512,
                json_mode=True,
            )
            result = _parse_json_response(response)
            if result and "score_match" in result and "verdict" in result:
                # Enforce verdict based on score
                score = result["score_match"]
                if score <= 30:
                    result["verdict"] = "NO GO"
                elif score <= 60:
                    result["verdict"] = "À RISQUE"
                else:
                    result["verdict"] = "GO"
                result["_meta"] = {
                    "provider": response.provider,
                    "model": response.model,
                    "input_tokens": response.input_tokens,
                    "output_tokens": response.output_tokens,
                }
                return result
            logger.warning("Matcher returned invalid JSON (attempt %d)", attempt + 1)
        except Exception as e:
            logger.warning("Matcher failed (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                import asyncio
                await asyncio.sleep(1 * (attempt + 1))

    return None


async def run_full_analysis(
    journalist: dict,
    articles: list[dict],
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """Run Profiler + Classifier on a journalist. Returns combined results."""
    profiler_result = await run_profiler(journalist, articles, provider, model)
    classifier_result = await run_classifier(journalist, articles, provider, model)

    result = {
        "ai_summary": None,
        "ai_tonality": None,
        "ai_preferred_formats": None,
        "ai_avoid_topics": None,
        "sector_macro": None,
        "tags_micro": None,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }

    if profiler_result:
        result["ai_summary"] = profiler_result.get("resume_editorial")
        result["ai_tonality"] = profiler_result.get("tonalite")
        result["ai_preferred_formats"] = profiler_result.get("formats_preferes")
        result["ai_avoid_topics"] = profiler_result.get("sujets_a_eviter")

    if classifier_result:
        result["sector_macro"] = classifier_result.get("secteur_macro")
        result["tags_micro"] = classifier_result.get("tags_micro")

    return result
