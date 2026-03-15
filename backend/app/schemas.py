"""Pydantic schemas for request/response validation."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── Pagination ──────────────────────────────────────────────────────────────


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int


# ── User ────────────────────────────────────────────────────────────────────


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    full_name: str
    role: str
    created_at: datetime


# ── Journalist ──────────────────────────────────────────────────────────────


class JournalistCreate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    job_title: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    twitter_url: str | None = None
    bluesky_url: str | None = None
    city: str | None = None
    country: str | None = None
    media_name: str | None = None
    media_type: str | None = None
    media_scope: str | None = None
    source: str | None = "manual"


class JournalistUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    job_title: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    twitter_url: str | None = None
    bluesky_url: str | None = None
    city: str | None = None
    country: str | None = None
    media_name: str | None = None
    media_type: str | None = None
    media_scope: str | None = None
    is_watched: bool | None = None


class JournalistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    first_name: str | None = None
    last_name: str | None = None
    job_title: str | None = None
    email: str | None = None
    email_status: str = "manquant"
    linkedin_url: str | None = None
    twitter_url: str | None = None
    bluesky_url: str | None = None
    city: str | None = None
    country: str | None = None
    media_name: str | None = None
    media_type: str | None = None
    media_scope: str | None = None
    ai_summary: str | None = None
    ai_tonality: str | None = None
    ai_preferred_formats: list[str] | None = None
    ai_avoid_topics: str | None = None
    sector_macro: str | None = None
    tags_micro: list[str] | None = None
    ai_last_analyzed_at: datetime | None = None
    ai_prompt_version: str | None = None
    job_title_previous: str | None = None
    media_name_previous: str | None = None
    movement_alert: bool = False
    is_watched: bool = False
    source: str | None = None
    owner_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    last_accessed_at: datetime


class JournalistListResponse(PaginatedResponse):
    items: list[JournalistRead]


# ── Client ──────────────────────────────────────────────────────────────────


class ClientCreate(BaseModel):
    name: str
    sector: str | None = None
    description: str | None = None
    keywords: list[str] | None = None


class ClientUpdate(BaseModel):
    name: str | None = None
    sector: str | None = None
    description: str | None = None
    keywords: list[str] | None = None


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    sector: str | None = None
    description: str | None = None
    keywords: list[str] | None = None
    owner_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


# ── Campaign ────────────────────────────────────────────────────────────────


class CampaignCreate(BaseModel):
    name: str
    client_id: UUID
    description: str | None = None


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    client_id: UUID | None = None
    description: str | None = None
    status: str = "draft"
    owner_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


# ── List ────────────────────────────────────────────────────────────────────


class ListCreate(BaseModel):
    name: str
    campaign_id: UUID


class ListUpdate(BaseModel):
    name: str | None = None


class ListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    campaign_id: UUID | None = None
    owner_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class ListDetailRead(ListRead):
    journalists: list[JournalistRead] = []


class ListAddJournalists(BaseModel):
    journalist_ids: list[UUID]


# ── Note ────────────────────────────────────────────────────────────────────


class NoteCreate(BaseModel):
    body: str = Field(min_length=1)


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    journalist_id: UUID
    author_id: UUID
    body: str
    created_at: datetime
