/**
 * Externalized LinkedIn CSS selectors.
 *
 * These selectors target LinkedIn's DOM structure and MUST be updated
 * whenever LinkedIn changes their markup. Check and bump VERSION when
 * updating selectors.
 */

import type { SelectorCheckResult } from "./types.js";

export const SELECTORS = {
  /** Selector version — bump when selectors are updated. */
  VERSION: "2026.03",

  /** Profile page selectors */
  PROFILE_NAME: ".text-heading-xlarge",
  PROFILE_TITLE: ".text-body-medium",
  PROFILE_LOCATION: ".text-body-small:nth-child(1)",
  PROFILE_ABOUT: "#about ~ .display-flex .inline-show-more-text",

  /** Experience section */
  EXPERIENCE_ITEMS: "#experience ~ .pvs-list__outer-container li",

  /** Search results page */
  SEARCH_RESULT_ITEMS: ".reusable-search__result-container",
  SEARCH_RESULT_NAME: ".entity-result__title-text a span[aria-hidden='true']",
  SEARCH_RESULT_HEADLINE: ".entity-result__primary-subtitle",
  SEARCH_RESULT_LOCATION: ".entity-result__secondary-subtitle",
  SEARCH_RESULT_LINK: ".entity-result__title-text a",
} as const;

/**
 * Check if critical selectors match any elements on the current page.
 * Returns a list of selector check results. If critical selectors fail,
 * the extension should switch to degraded URL mode.
 */
export function checkSelectorsHealth(): SelectorCheckResult[] {
  const isProfilePage = window.location.pathname.startsWith("/in/");
  const isSearchPage = window.location.pathname.startsWith("/search/");

  const results: SelectorCheckResult[] = [];

  if (isProfilePage) {
    results.push({
      selector: SELECTORS.PROFILE_NAME,
      name: "PROFILE_NAME",
      found: !!document.querySelector(SELECTORS.PROFILE_NAME),
    });
    results.push({
      selector: SELECTORS.PROFILE_TITLE,
      name: "PROFILE_TITLE",
      found: !!document.querySelector(SELECTORS.PROFILE_TITLE),
    });
  }

  if (isSearchPage) {
    results.push({
      selector: SELECTORS.SEARCH_RESULT_ITEMS,
      name: "SEARCH_RESULT_ITEMS",
      found: !!document.querySelector(SELECTORS.SEARCH_RESULT_ITEMS),
    });
  }

  return results;
}

/**
 * Determine if selectors are broken (critical selectors not matching).
 * Waits for the page to load before checking.
 */
export function areSelectorsWorking(): boolean {
  const results = checkSelectorsHealth();
  if (results.length === 0) return true; // not on a relevant page

  const criticalFailures = results.filter((r) => !r.found);
  if (criticalFailures.length > 0) {
    console.warn(
      "[425PPM] Selector breaking change detected! Failed selectors:",
      criticalFailures.map((r) => r.name).join(", "),
    );
    return false;
  }
  return true;
}
