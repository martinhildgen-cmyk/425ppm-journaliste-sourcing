"""AI Router — endpoints for AI analysis and pitch matching."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_user_uuid
from app.database import get_session
from app.models.content import Content
from app.models.journalist import Journalist
from app.models.pitch_match import PitchMatch
from app.models.prompt_version import PromptVersion
from app.schemas import (
    AIAnalyzeRequest,
    AIAnalyzeResponse,
    PitchMatchListResponse,
    PitchMatchRequest,
    PitchMatchResponse,
    PromptVersionRead,
)

router = APIRouter(prefix="/ai", tags=["ai"])


async def _get_journalist_with_articles(journalist_id: UUID, session: AsyncSession) -> tuple:
    """Fetch journalist and their articles."""
    result = await session.execute(select(Journalist).where(Journalist.id == journalist_id))
    journalist = result.scalar_one_or_none()
    if not journalist:
        raise HTTPException(status_code=404, detail="Journalist not found")

    articles_result = await session.execute(
        select(Content)
        .where(Content.journalist_id == journalist_id)
        .order_by(Content.published_at.desc().nullslast())
        .limit(5)
    )
    articles = articles_result.scalars().all()

    journalist_dict = {
        "first_name": journalist.first_name or "",
        "last_name": journalist.last_name or "",
        "job_title": journalist.job_title or "",
        "media_name": journalist.media_name or "",
        "ai_summary": journalist.ai_summary,
        "sector_macro": journalist.sector_macro,
        "tags_micro": journalist.tags_micro,
    }

    articles_list = [{"title": a.title or "", "text": a.body_text or ""} for a in articles]

    return journalist, journalist_dict, articles_list


@router.post("/journalists/{journalist_id}/analyze", response_model=AIAnalyzeResponse)
async def analyze_journalist(
    journalist_id: UUID,
    body: AIAnalyzeRequest | None = None,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Run AI analysis (Profiler + Classifier) on a journalist.

    If is_draft=True (sandbox mode), results are returned but NOT saved to the journalist.
    """
    if body is None:
        body = AIAnalyzeRequest()

    journalist, journalist_dict, articles_list = await _get_journalist_with_articles(
        journalist_id, session
    )

    # Allow analysis even without articles — AI will use journalist metadata only

    from app.services.ai_prompts import run_full_analysis

    result = await run_full_analysis(
        journalist_dict, articles_list, provider=body.provider, model=body.model
    )

    if not body.is_draft:
        # Persist results to journalist
        journalist.ai_summary = result["ai_summary"]
        journalist.ai_tonality = result["ai_tonality"]
        journalist.ai_preferred_formats = result["ai_preferred_formats"]
        journalist.ai_avoid_topics = result["ai_avoid_topics"]
        journalist.sector_macro = result["sector_macro"]
        journalist.tags_micro = result["tags_micro"]
        journalist.ai_last_analyzed_at = datetime.now(timezone.utc)
        journalist.ai_prompt_version = "v1"
        journalist.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(journalist)

    return AIAnalyzeResponse(
        ai_summary=result["ai_summary"],
        ai_tonality=result["ai_tonality"],
        ai_preferred_formats=result["ai_preferred_formats"],
        ai_avoid_topics=result["ai_avoid_topics"],
        sector_macro=result["sector_macro"],
        tags_micro=result["tags_micro"],
        is_draft=body.is_draft,
    )


@router.post("/journalists/{journalist_id}/pitch-match", response_model=PitchMatchResponse)
async def pitch_match(
    journalist_id: UUID,
    body: PitchMatchRequest,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Run Pitch Matcher (Prompt 3) — evaluate a pitch against a journalist."""
    journalist, journalist_dict, articles_list = await _get_journalist_with_articles(
        journalist_id, session
    )

    from app.services.ai_prompts import run_matcher

    result = await run_matcher(
        journalist_dict,
        articles_list,
        body.pitch_text,
        provider=body.provider,
        model=body.model,
    )

    if not result:
        raise HTTPException(
            status_code=502,
            detail="L'analyse IA a échoué après 3 tentatives. Réessayez.",
        )

    pitch = PitchMatch(
        journalist_id=journalist_id,
        pitch_subject=body.pitch_text,
        score_match=result.get("score_match"),
        verdict=result.get("verdict"),
        justification=result.get("justification"),
        angle_suggere=result.get("angle_suggere"),
        pitch_advice=result.get("justification"),  # use justification as advice
        bad_buzz_risk=result.get("bad_buzz_risk", False),
        risk_details=result.get("risk_details"),
        is_draft=body.is_draft,
        created_by=get_user_uuid(user),
    )
    session.add(pitch)
    await session.commit()
    await session.refresh(pitch)

    return pitch


@router.get(
    "/journalists/{journalist_id}/pitch-matches",
    response_model=PitchMatchListResponse,
)
async def list_pitch_matches(
    journalist_id: UUID,
    include_drafts: bool = False,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """List pitch match results for a journalist."""
    query = (
        select(PitchMatch)
        .where(PitchMatch.journalist_id == journalist_id)
        .order_by(PitchMatch.created_at.desc())
    )
    if not include_drafts:
        query = query.where(PitchMatch.is_draft == False)  # noqa: E712

    result = await session.execute(query)
    matches = result.scalars().all()
    return PitchMatchListResponse(items=matches)


@router.get("/prompt-versions", response_model=list[PromptVersionRead])
async def list_prompt_versions(
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """List all prompt versions."""
    result = await session.execute(
        select(PromptVersion).order_by(PromptVersion.prompt_name, PromptVersion.version.desc())
    )
    return result.scalars().all()
