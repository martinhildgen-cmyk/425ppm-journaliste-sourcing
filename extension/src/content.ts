/**
 * Content script injected on LinkedIn pages.
 *
 * Extracts profile data from the DOM using externalized selectors,
 * enforces rate limits, and communicates with the background service worker.
 */

import { SELECTORS } from "./selectors.js";
import type {
  LinkedInProfile,
  Experience,
  ExtractedData,
  RateLimiterState,
} from "./types.js";

// ---------------------------------------------------------------------------
// Rate limiter state
// ---------------------------------------------------------------------------

const RATE_LIMITS = {
  MAX_PER_HOUR: 30,
  MAX_PER_DAY: 100,
} as const;

let rateLimiterState: RateLimiterState = {
  profilesThisHour: 0,
  profilesToday: 0,
  lastHourReset: Date.now(),
  lastDayReset: Date.now(),
};

// Restore persisted rate limiter state on load
chrome.storage.local.get("rateLimiter", (result) => {
  if (result.rateLimiter) {
    rateLimiterState = result.rateLimiter as RateLimiterState;
  }
});

/**
 * Persist the current rate limiter state to chrome.storage.local.
 */
function persistRateLimiterState(): void {
  chrome.storage.local.set({ rateLimiter: rateLimiterState });
}

/**
 * Check and reset rate limiter windows, then return whether a new
 * extraction is allowed.
 */
function checkRateLimit(): boolean {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  // Reset hourly window
  if (now - rateLimiterState.lastHourReset >= ONE_HOUR) {
    rateLimiterState.profilesThisHour = 0;
    rateLimiterState.lastHourReset = now;
  }

  // Reset daily window
  if (now - rateLimiterState.lastDayReset >= ONE_DAY) {
    rateLimiterState.profilesToday = 0;
    rateLimiterState.lastDayReset = now;
  }

  if (rateLimiterState.profilesThisHour >= RATE_LIMITS.MAX_PER_HOUR) {
    console.warn("[425PPM] Hourly rate limit reached.");
    return false;
  }

  if (rateLimiterState.profilesToday >= RATE_LIMITS.MAX_PER_DAY) {
    console.warn("[425PPM] Daily rate limit reached.");
    return false;
  }

  return true;
}

/**
 * Return a random delay between 2 and 5 seconds (in milliseconds)
 * to mimic human browsing behaviour and reduce detection risk.
 */
function humanDelay(): number {
  return Math.floor(Math.random() * 3000) + 2000;
}

// ---------------------------------------------------------------------------
// Profile extraction
// ---------------------------------------------------------------------------

/**
 * Read a text value from the DOM using a CSS selector.
 */
function textFromSelector(selector: string): string {
  const el = document.querySelector(selector);
  return el?.textContent?.trim() ?? "";
}

/**
 * Extract experience entries from the LinkedIn profile page.
 */
function extractExperiences(): Experience[] {
  const items = document.querySelectorAll(SELECTORS.EXPERIENCE_ITEMS);
  const experiences: Experience[] = [];

  items.forEach((item) => {
    const title =
      item.querySelector(".t-bold span[aria-hidden='true']")?.textContent?.trim() ?? "";
    const company =
      item.querySelector(".t-normal span[aria-hidden='true']")?.textContent?.trim() ?? "";
    const dateRange =
      item.querySelector(".t-black--light span[aria-hidden='true']")?.textContent?.trim() ?? "";
    const location =
      item
        .querySelectorAll(".t-black--light span[aria-hidden='true']")[1]
        ?.textContent?.trim() ?? "";

    if (title || company) {
      experiences.push({ title, company, dateRange, location });
    }
  });

  return experiences;
}

/**
 * Extract profile data from the current LinkedIn profile page DOM.
 */
export function extractProfileData(): LinkedInProfile {
  const name = textFromSelector(SELECTORS.PROFILE_NAME);
  const headline = textFromSelector(SELECTORS.PROFILE_TITLE);
  const location = textFromSelector(SELECTORS.PROFILE_LOCATION);
  const about = textFromSelector(SELECTORS.PROFILE_ABOUT);
  const experiences = extractExperiences();

  const currentCompany =
    experiences.length > 0 ? experiences[0].company : "";

  return {
    name,
    headline,
    location,
    about,
    currentCompany,
    linkedinUrl: window.location.href,
    experiences,
  };
}

/**
 * Extract the current profile and send it to the background service worker.
 * Respects rate limits and adds a human-like delay.
 */
export async function captureProfile(): Promise<void> {
  if (!checkRateLimit()) {
    return;
  }

  // Human-like delay before scraping
  await new Promise((resolve) => setTimeout(resolve, humanDelay()));

  const profile = extractProfileData();

  if (!profile.name) {
    console.warn("[425PPM] Could not extract profile name — aborting.");
    return;
  }

  const data: ExtractedData = {
    profile,
    extractedAt: new Date().toISOString(),
  };

  // Update rate limiter counters
  rateLimiterState.profilesThisHour++;
  rateLimiterState.profilesToday++;
  persistRateLimiterState();

  // Send to background
  chrome.runtime.sendMessage(
    { type: "PROFILE_EXTRACTED", data },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("[425PPM] Message error:", chrome.runtime.lastError.message);
        return;
      }
      console.log("[425PPM] Profile sent to background:", response);
    },
  );
}

// ---------------------------------------------------------------------------
// Listen for messages from the side panel / background
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (message.type === "CAPTURE_PROFILE") {
      captureProfile().then(
        () => sendResponse({ success: true }),
        (err) => sendResponse({ success: false, error: (err as Error).message }),
      );
      return true;
    }
    return false;
  },
);
