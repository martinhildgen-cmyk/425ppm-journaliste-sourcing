"use strict";
(() => {
  // src/selectors.ts
  var SELECTORS = {
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
    SEARCH_RESULT_LINK: ".entity-result__title-text a"
  };
  function checkSelectorsHealth() {
    const isProfilePage = window.location.pathname.startsWith("/in/");
    const isSearchPage = window.location.pathname.startsWith("/search/");
    const results = [];
    if (isProfilePage) {
      results.push({
        selector: SELECTORS.PROFILE_NAME,
        name: "PROFILE_NAME",
        found: !!document.querySelector(SELECTORS.PROFILE_NAME)
      });
      results.push({
        selector: SELECTORS.PROFILE_TITLE,
        name: "PROFILE_TITLE",
        found: !!document.querySelector(SELECTORS.PROFILE_TITLE)
      });
    }
    if (isSearchPage) {
      results.push({
        selector: SELECTORS.SEARCH_RESULT_ITEMS,
        name: "SEARCH_RESULT_ITEMS",
        found: !!document.querySelector(SELECTORS.SEARCH_RESULT_ITEMS)
      });
    }
    return results;
  }
  function areSelectorsWorking() {
    const results = checkSelectorsHealth();
    if (results.length === 0) return true;
    const criticalFailures = results.filter((r) => !r.found);
    if (criticalFailures.length > 0) {
      console.warn(
        "[425PPM] Selector breaking change detected! Failed selectors:",
        criticalFailures.map((r) => r.name).join(", ")
      );
      return false;
    }
    return true;
  }

  // src/content.ts
  var RATE_LIMITS = {
    MAX_PER_HOUR: 30,
    MAX_PER_DAY: 100
  };
  var rateLimiterState = {
    profilesThisHour: 0,
    profilesToday: 0,
    lastHourReset: Date.now(),
    lastDayReset: Date.now()
  };
  chrome.storage.local.get("rateLimiter", (result) => {
    if (result.rateLimiter) {
      rateLimiterState = result.rateLimiter;
    }
  });
  function persistRateLimiterState() {
    chrome.storage.local.set({ rateLimiter: rateLimiterState });
  }
  function checkRateLimit() {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1e3;
    const ONE_DAY = 24 * 60 * 60 * 1e3;
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
  function humanDelay() {
    return Math.floor(Math.random() * 3e3) + 2e3;
  }
  function incrementRateCounter() {
    rateLimiterState.profilesThisHour++;
    rateLimiterState.profilesToday++;
    persistRateLimiterState();
  }
  function textFromSelector(selector) {
    const el = document.querySelector(selector);
    return el?.textContent?.trim() ?? "";
  }
  function extractExperiences() {
    const items = document.querySelectorAll(SELECTORS.EXPERIENCE_ITEMS);
    const experiences = [];
    items.forEach((item) => {
      const title = item.querySelector(".t-bold span[aria-hidden='true']")?.textContent?.trim() ?? "";
      const company = item.querySelector(".t-normal span[aria-hidden='true']")?.textContent?.trim() ?? "";
      const dateRange = item.querySelector(".t-black--light span[aria-hidden='true']")?.textContent?.trim() ?? "";
      const location = item.querySelectorAll(".t-black--light span[aria-hidden='true']")[1]?.textContent?.trim() ?? "";
      if (title || company) {
        experiences.push({ title, company, dateRange, location });
      }
    });
    return experiences;
  }
  function extractProfileData() {
    const name = textFromSelector(SELECTORS.PROFILE_NAME);
    const headline = textFromSelector(SELECTORS.PROFILE_TITLE);
    const location = textFromSelector(SELECTORS.PROFILE_LOCATION);
    const about = textFromSelector(SELECTORS.PROFILE_ABOUT);
    const experiences = extractExperiences();
    const currentCompany = experiences.length > 0 ? experiences[0].company : "";
    return {
      name,
      headline,
      location,
      about,
      currentCompany,
      linkedinUrl: window.location.href,
      experiences
    };
  }
  var bulkCheckboxesInjected = false;
  function extractSearchResultProfile(item) {
    const nameEl = item.querySelector(SELECTORS.SEARCH_RESULT_NAME);
    const headlineEl = item.querySelector(SELECTORS.SEARCH_RESULT_HEADLINE);
    const locationEl = item.querySelector(SELECTORS.SEARCH_RESULT_LOCATION);
    const linkEl = item.querySelector(SELECTORS.SEARCH_RESULT_LINK);
    const name = nameEl?.textContent?.trim() ?? "";
    if (!name) return null;
    return {
      name,
      headline: headlineEl?.textContent?.trim() ?? "",
      location: locationEl?.textContent?.trim() ?? "",
      about: "",
      currentCompany: "",
      linkedinUrl: linkEl?.href ?? "",
      experiences: []
    };
  }
  function injectBulkCheckboxes() {
    if (bulkCheckboxesInjected) return;
    const results = document.querySelectorAll(SELECTORS.SEARCH_RESULT_ITEMS);
    if (results.length === 0) return;
    results.forEach((item, index) => {
      if (item.querySelector(".ppm-bulk-checkbox")) return;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "ppm-bulk-checkbox";
      checkbox.dataset.index = String(index);
      checkbox.style.cssText = "position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; z-index: 10; cursor: pointer; accent-color: #22c55e;";
      const container = item;
      if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
      }
      container.prepend(checkbox);
    });
    bulkCheckboxesInjected = true;
  }
  function getSelectedBulkProfiles() {
    const checkboxes = document.querySelectorAll(
      ".ppm-bulk-checkbox:checked"
    );
    const profiles = [];
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
  function showCapturedBadge(element) {
    if (!element) {
      const nameEl = document.querySelector(SELECTORS.PROFILE_NAME);
      if (nameEl && !nameEl.querySelector(".ppm-captured-badge")) {
        const badge = document.createElement("span");
        badge.className = "ppm-captured-badge";
        nameEl.appendChild(badge);
      }
      return;
    }
    if (!element.querySelector(".ppm-captured-badge")) {
      const badge = document.createElement("span");
      badge.className = "ppm-captured-badge";
      const nameEl = element.querySelector(SELECTORS.SEARCH_RESULT_NAME);
      if (nameEl) {
        nameEl.appendChild(badge);
      }
    }
  }
  async function captureProfile() {
    if (!checkRateLimit()) {
      return { success: false };
    }
    const selectorsOk = areSelectorsWorking();
    if (!selectorsOk) {
      const linkedinUrl = window.location.href;
      if (linkedinUrl.includes("linkedin.com/in/")) {
        chrome.runtime.sendMessage(
          { type: "URL_IMPORT", url: linkedinUrl },
          () => {
            if (!chrome.runtime.lastError) {
              showCapturedBadge();
              incrementRateCounter();
            }
          }
        );
        return { success: true, degraded: true };
      }
      return { success: false };
    }
    await new Promise((resolve) => setTimeout(resolve, humanDelay()));
    const profile = extractProfileData();
    if (!profile.name) {
      console.warn("[425PPM] Could not extract profile name \u2014 aborting.");
      return { success: false };
    }
    const data = {
      profile,
      extractedAt: (/* @__PURE__ */ new Date()).toISOString()
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
      }
    );
    return { success: true };
  }
  async function captureBulk() {
    const profiles = getSelectedBulkProfiles();
    if (profiles.length === 0) {
      return { success: false, count: 0 };
    }
    const remaining = RATE_LIMITS.MAX_PER_HOUR - rateLimiterState.profilesThisHour;
    const dailyRemaining = RATE_LIMITS.MAX_PER_DAY - rateLimiterState.profilesToday;
    const maxAllowed = Math.min(remaining, dailyRemaining, 25);
    if (maxAllowed <= 0) {
      console.warn("[425PPM] Rate limit reached for bulk capture.");
      return { success: false, count: 0 };
    }
    const toCapture = profiles.slice(0, maxAllowed);
    chrome.runtime.sendMessage(
      { type: "BULK_EXTRACTED", profiles: toCapture },
      (response) => {
        if (!chrome.runtime.lastError && response?.success) {
          const checkboxes = document.querySelectorAll(
            ".ppm-bulk-checkbox:checked"
          );
          const resultItems = document.querySelectorAll(
            SELECTORS.SEARCH_RESULT_ITEMS
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
      }
    );
    rateLimiterState.profilesThisHour += toCapture.length;
    rateLimiterState.profilesToday += toCapture.length;
    persistRateLimiterState();
    return { success: true, count: toCapture.length };
  }
  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      switch (message.type) {
        case "CAPTURE_PROFILE":
          captureProfile().then(
            (result) => sendResponse(result),
            (err) => sendResponse({ success: false, error: err.message })
          );
          return true;
        case "CAPTURE_BULK":
          captureBulk().then(
            (result) => sendResponse(result),
            (err) => sendResponse({
              success: false,
              count: 0,
              error: err.message
            })
          );
          return true;
        case "INJECT_CHECKBOXES":
          injectBulkCheckboxes();
          sendResponse({
            injected: true,
            count: document.querySelectorAll(SELECTORS.SEARCH_RESULT_ITEMS).length
          });
          return false;
        case "CHECK_SELECTORS":
          sendResponse({
            results: checkSelectorsHealth(),
            working: areSelectorsWorking()
          });
          return false;
        case "GET_SELECTED_COUNT":
          sendResponse({
            count: document.querySelectorAll(".ppm-bulk-checkbox:checked").length
          });
          return false;
        default:
          return false;
      }
    }
  );
  function onPageReady() {
    setTimeout(() => {
      if (window.location.pathname.startsWith("/search/")) {
        injectBulkCheckboxes();
      }
    }, 2e3);
  }
  var lastUrl = window.location.href;
  var urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      bulkCheckboxesInjected = false;
      onPageReady();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });
  onPageReady();
})();
//# sourceMappingURL=content.js.map
