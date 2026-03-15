/**
 * Content script injected on LinkedIn pages.
 *
 * Handles:
 * - Single profile extraction (profile pages)
 * - Bulk mode with checkboxes (search results pages)
 * - Rate limiting (30/hour, 100/day)
 * - Breaking change detection
 * - Degraded URL mode fallback
 */

import { SELECTORS, areSelectorsWorking, checkSelectorsHealth } from "./selectors.js";
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

function persistRateLimiterState(): void {
  chrome.storage.local.set({ rateLimiter: rateLimiterState });
}

function checkRateLimit(): boolean {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (now - rateLimiterState.lastHourReset >= ONE_HOUR) {
    rateLimiterState.profilesThisHour = 0;
    rateLimiterState.lastHourReset = now;
  }
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

function humanDelay(): number {
  return Math.floor(Math.random() * 3000) + 2000;
}

function incrementRateCounter(): void {
  rateLimiterState.profilesThisHour++;
  rateLimiterState.profilesToday++;
  persistRateLimiterState();
}

// ---------------------------------------------------------------------------
// Profile extraction — single profile page
// ---------------------------------------------------------------------------

function textFromSelector(selector: string): string {
  const el = document.querySelector(selector);
  return el?.textContent?.trim() ?? "";
}

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

// ---------------------------------------------------------------------------
// Bulk mode — search results checkboxes
// ---------------------------------------------------------------------------

let bulkCheckboxesInjected = false;

/**
 * Extract minimal profile data from a search result item.
 */
function extractSearchResultProfile(item: Element): LinkedInProfile | null {
  const nameEl = item.querySelector(SELECTORS.SEARCH_RESULT_NAME);
  const headlineEl = item.querySelector(SELECTORS.SEARCH_RESULT_HEADLINE);
  const locationEl = item.querySelector(SELECTORS.SEARCH_RESULT_LOCATION);
  const linkEl = item.querySelector(SELECTORS.SEARCH_RESULT_LINK) as HTMLAnchorElement | null;

  const name = nameEl?.textContent?.trim() ?? "";
  if (!name) return null;

  return {
    name,
    headline: headlineEl?.textContent?.trim() ?? "",
    location: locationEl?.textContent?.trim() ?? "",
    about: "",
    currentCompany: "",
    linkedinUrl: linkEl?.href ?? "",
    experiences: [],
  };
}

/**
 * Inject checkboxes on search result items for bulk capture.
 */
function injectBulkCheckboxes(): void {
  if (bulkCheckboxesInjected) return;

  const results = document.querySelectorAll(SELECTORS.SEARCH_RESULT_ITEMS);
  if (results.length === 0) return;

  results.forEach((item, index) => {
    // Skip if already has checkbox
    if (item.querySelector(".ppm-bulk-checkbox")) return;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ppm-bulk-checkbox";
    checkbox.dataset.index = String(index);
    checkbox.style.cssText =
      "position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; " +
      "z-index: 10; cursor: pointer; accent-color: #22c55e;";

    // Make parent relative for positioning
    const container = item as HTMLElement;
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.prepend(checkbox);
  });

  bulkCheckboxesInjected = true;
}

/**
 * Get all selected search result profiles.
 */
function getSelectedBulkProfiles(): LinkedInProfile[] {
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    ".ppm-bulk-checkbox:checked",
  );
  const profiles: LinkedInProfile[] = [];
  const resultItems = document.querySelectorAll(SELECTORS.SEARCH_RESULT_ITEMS);

  checkboxes.forEach((cb) => {
    const index = parseInt(cb.dataset.index ?? "-1", 10);
    if (index >= 0 && index < resultItems.length) {
      const profile = extractSearchResultProfile(resultItems[index]);
      if (profile) profiles.push(profile);
    }
  });

  return profiles;
}

// ---------------------------------------------------------------------------
// Success badge
// ---------------------------------------------------------------------------

function showCapturedBadge(element?: Element): void {
  if (!element) {
    // For single profile page, add badge next to name
    const nameEl = document.querySelector(SELECTORS.PROFILE_NAME);
    if (nameEl && !nameEl.querySelector(".ppm-captured-badge")) {
      const badge = document.createElement("span");
      badge.className = "ppm-captured-badge";
      nameEl.appendChild(badge);
    }
    return;
  }

  // For search result items
  if (!element.querySelector(".ppm-captured-badge")) {
    const badge = document.createElement("span");
    badge.className = "ppm-captured-badge";
    const nameEl = element.querySelector(SELECTORS.SEARCH_RESULT_NAME);
    if (nameEl) {
      nameEl.appendChild(badge);
    }
  }
}

// ---------------------------------------------------------------------------
// Capture functions
// ---------------------------------------------------------------------------

export async function captureProfile(): Promise<{
  success: boolean;
  degraded?: boolean;
}> {
  if (!checkRateLimit()) {
    return { success: false };
  }

  // Check for breaking changes
  const selectorsOk = areSelectorsWorking();

  if (!selectorsOk) {
    // Degraded mode — just send the URL
    const linkedinUrl = window.location.href;
    if (linkedinUrl.includes("linkedin.com/in/")) {
      chrome.runtime.sendMessage(
        { type: "URL_IMPORT", url: linkedinUrl },
        () => {
          if (!chrome.runtime.lastError) {
            showCapturedBadge();
            incrementRateCounter();
          }
        },
      );
      return { success: true, degraded: true };
    }
    return { success: false };
  }

  // Normal mode — human-like delay before scraping
  await new Promise((resolve) => setTimeout(resolve, humanDelay()));

  const profile = extractProfileData();
  if (!profile.name) {
    console.warn("[425PPM] Could not extract profile name — aborting.");
    return { success: false };
  }

  const data: ExtractedData = {
    profile,
    extractedAt: new Date().toISOString(),
  };

  incrementRateCounter();

  chrome.runtime.sendMessage(
    { type: "PROFILE_EXTRACTED", data },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("[425PPM] Message error:", chrome.runtime.lastError.message);
        return;
      }
      if (response?.success) {
        showCapturedBadge();
      }
      console.log("[425PPM] Profile sent to background:", response);
    },
  );

  return { success: true };
}

export async function captureBulk(): Promise<{
  success: boolean;
  count: number;
}> {
  const profiles = getSelectedBulkProfiles();
  if (profiles.length === 0) {
    return { success: false, count: 0 };
  }

  // Check rate limits for all profiles
  const remaining =
    RATE_LIMITS.MAX_PER_HOUR -
    rateLimiterState.profilesThisHour;
  const dailyRemaining =
    RATE_LIMITS.MAX_PER_DAY - rateLimiterState.profilesToday;
  const maxAllowed = Math.min(remaining, dailyRemaining, 25); // max 25 per batch

  if (maxAllowed <= 0) {
    console.warn("[425PPM] Rate limit reached for bulk capture.");
    return { success: false, count: 0 };
  }

  const toCapture = profiles.slice(0, maxAllowed);

  chrome.runtime.sendMessage(
    { type: "BULK_EXTRACTED", profiles: toCapture },
    (response) => {
      if (!chrome.runtime.lastError && response?.success) {
        // Show badges on captured items
        const checkboxes = document.querySelectorAll<HTMLInputElement>(
          ".ppm-bulk-checkbox:checked",
        );
        const resultItems = document.querySelectorAll(
          SELECTORS.SEARCH_RESULT_ITEMS,
        );
        let count = 0;
        checkboxes.forEach((cb) => {
          if (count >= maxAllowed) return;
          const index = parseInt(cb.dataset.index ?? "-1", 10);
          if (index >= 0 && index < resultItems.length) {
            showCapturedBadge(resultItems[index]);
            cb.checked = false;
            count++;
          }
        });
      }
    },
  );

  // Update rate limiter
  rateLimiterState.profilesThisHour += toCapture.length;
  rateLimiterState.profilesToday += toCapture.length;
  persistRateLimiterState();

  return { success: true, count: toCapture.length };
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    switch (message.type) {
      case "CAPTURE_PROFILE":
        captureProfile().then(
          (result) => sendResponse(result),
          (err) =>
            sendResponse({ success: false, error: (err as Error).message }),
        );
        return true;

      case "CAPTURE_BULK":
        captureBulk().then(
          (result) => sendResponse(result),
          (err) =>
            sendResponse({
              success: false,
              count: 0,
              error: (err as Error).message,
            }),
        );
        return true;

      case "INJECT_CHECKBOXES":
        injectBulkCheckboxes();
        sendResponse({
          injected: true,
          count: document.querySelectorAll(SELECTORS.SEARCH_RESULT_ITEMS).length,
        });
        return false;

      case "CHECK_SELECTORS":
        sendResponse({
          results: checkSelectorsHealth(),
          working: areSelectorsWorking(),
        });
        return false;

      case "GET_SELECTED_COUNT":
        sendResponse({
          count: document.querySelectorAll(".ppm-bulk-checkbox:checked").length,
        });
        return false;

      default:
        return false;
    }
  },
);

// ---------------------------------------------------------------------------
// Auto-detect page type and inject checkboxes on search pages
// ---------------------------------------------------------------------------

function onPageReady(): void {
  // Wait a moment for LinkedIn SPA to render
  setTimeout(() => {
    if (window.location.pathname.startsWith("/search/")) {
      injectBulkCheckboxes();
    }
  }, 2000);
}

// LinkedIn is a SPA — watch for URL changes
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    bulkCheckboxesInjected = false;
    onPageReady();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

onPageReady();
