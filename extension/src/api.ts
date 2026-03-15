/**
 * API client for communicating with the 425PPM backend.
 */

import type { ExtractedData } from "./types.js";

const DEFAULT_API_URL = "http://localhost:3000";

/**
 * Retrieve the API base URL from chrome.storage.sync.
 * Falls back to localhost when no URL is configured.
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
 * Send an extracted profile to the 425PPM backend.
 */
export async function sendProfile(data: ExtractedData): Promise<void> {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();

  const response = await fetch(
    `${apiUrl}/api/journalists/from-extension`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    throw new Error(
      `API error: ${response.status} ${response.statusText}`,
    );
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
