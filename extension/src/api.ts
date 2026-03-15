/**
 * API client for communicating with the 425PPM backend.
 */

import type { ExtractedData, BulkExtractedData, ClientOption, CampaignOption } from "./types.js";

const DEFAULT_API_URL = "http://localhost:8000";

/**
 * Retrieve the API base URL from chrome.storage.sync.
 */
export async function getApiUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.sync.get("apiUrl", (result) => {
      resolve((result.apiUrl as string) ?? DEFAULT_API_URL);
    });
  });
}

/**
 * Retrieve the authentication token from chrome.storage.local.
 */
export async function getAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get("authToken", (result) => {
      resolve((result.authToken as string) ?? null);
    });
  });
}

/**
 * Build headers for API requests, including auth token when available.
 */
async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Send a single captured profile to the backend.
 */
export async function sendProfile(data: ExtractedData): Promise<{ id: string }> {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();

  const response = await fetch(`${apiUrl}/extension/journalists/from-profile`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      profile: data.profile,
      extractedAt: data.extractedAt,
      clientId: data.clientId ?? null,
      campaignId: data.campaignId ?? null,
      tags: data.tags ?? [],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Send multiple profiles from bulk capture.
 */
export async function sendBulkProfiles(
  data: BulkExtractedData,
): Promise<{ created: number; journalist_ids: string[] }> {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();

  const response = await fetch(`${apiUrl}/extension/journalists/from-bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Degraded mode — send only a LinkedIn URL for backend enrichment.
 */
export async function sendUrlImport(
  linkedinUrl: string,
  clientId?: string,
  campaignId?: string,
  tags?: string[],
): Promise<{ id: string }> {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();

  const response = await fetch(`${apiUrl}/extension/journalists/from-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      linkedin_url: linkedinUrl,
      clientId: clientId ?? null,
      campaignId: campaignId ?? null,
      tags: tags ?? [],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Fetch clients from the backend for the selector dropdown.
 */
export async function fetchClients(): Promise<ClientOption[]> {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();

  try {
    const response = await fetch(`${apiUrl}/clients/`, { headers });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.items ?? data).map((c: { id: string; name: string }) => ({
      id: c.id,
      name: c.name,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch campaigns for a client.
 */
export async function fetchCampaigns(clientId: string): Promise<CampaignOption[]> {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();

  try {
    const response = await fetch(`${apiUrl}/campaigns/?client_id=${clientId}`, {
      headers,
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.items ?? data).map(
      (c: { id: string; name: string; client_id: string }) => ({
        id: c.id,
        name: c.name,
        client_id: c.client_id,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Check whether the backend API is reachable.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
