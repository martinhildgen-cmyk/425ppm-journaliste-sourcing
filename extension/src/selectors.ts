/**
 * Externalized LinkedIn CSS selectors.
 *
 * These selectors target LinkedIn's DOM structure and MUST be updated
 * whenever LinkedIn changes their markup. Check and bump VERSION when
 * updating selectors.
 */

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
} as const;
