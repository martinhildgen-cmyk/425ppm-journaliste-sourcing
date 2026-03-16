export interface Journalist {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  email_status: string;
  linkedin_url: string | null;
  twitter_url: string | null;
  bluesky_url: string | null;
  city: string | null;
  country: string | null;
  media_name: string | null;
  media_type: string | null;
  media_scope: string | null;
  ai_summary: string | null;
  ai_tonality: string | null;
  ai_preferred_formats: string[] | null;
  ai_avoid_topics: string | null;
  sector_macro: string | null;
  tags_micro: string[] | null;
  ai_last_analyzed_at: string | null;
  ai_prompt_version: string | null;
  job_title_previous: string | null;
  media_name_previous: string | null;
  movement_alert: boolean;
  bad_buzz_risk: boolean;
  is_watched: boolean;
  source: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
}

export interface JournalistListResponse {
  items: Journalist[];
  total: number;
  page: number;
  page_size: number;
}

export interface Client {
  id: string;
  name: string;
  sector: string | null;
  description: string | null;
  keywords: string[] | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  client_id: string | null;
  description: string | null;
  status: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaList {
  id: string;
  name: string;
  campaign_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  journalists?: Journalist[];
}

export interface Note {
  id: string;
  journalist_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface AIAnalyzeResponse {
  ai_summary: string | null;
  ai_tonality: string | null;
  ai_preferred_formats: string[] | null;
  ai_avoid_topics: string | null;
  sector_macro: string | null;
  tags_micro: string[] | null;
  is_draft: boolean;
}

export interface PitchMatch {
  id: string;
  journalist_id: string;
  pitch_subject: string;
  score_match: number | null;
  verdict: string | null;
  justification: string | null;
  angle_suggere: string | null;
  pitch_advice: string | null;
  bad_buzz_risk: boolean;
  risk_details: string | null;
  is_draft: boolean;
  created_at: string;
}
