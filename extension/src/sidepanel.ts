/**
 * Side panel logic for the 425PPM LinkedIn sourcing extension.
 *
 * Manages connection status, rate limiter counters, capture triggers,
 * client/campaign selectors, tags, bulk actions, and settings.
 */

import { fetchClients, fetchCampaigns } from "./api.js";
import type { ClientOption, CampaignOption } from "./types.js";

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------

const statusDot = document.getElementById("statusDot") as HTMLDivElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const selectorAlert = document.getElementById("selectorAlert") as HTMLDivElement;
const hourCount = document.getElementById("hourCount") as HTMLDivElement;
const dayCount = document.getElementById("dayCount") as HTMLDivElement;
const captureBtn = document.getElementById("captureBtn") as HTMLButtonElement;
const bulkSection = document.getElementById("bulkSection") as HTMLDivElement;
const injectCheckboxesBtn = document.getElementById("injectCheckboxesBtn") as HTMLButtonElement;
const captureBulkBtn = document.getElementById("captureBulkBtn") as HTMLButtonElement;
const bulkSelectedCount = document.getElementById("bulkSelectedCount") as HTMLSpanElement;
const urlImportBtn = document.getElementById("urlImportBtn") as HTMLButtonElement;
const clientSelect = document.getElementById("clientSelect") as HTMLSelectElement;
const campaignSelect = document.getElementById("campaignSelect") as HTMLSelectElement;
const tagsInput = document.getElementById("tagsInput") as HTMLInputElement;
const apiUrlInput = document.getElementById("apiUrlInput") as HTMLInputElement;
const authTokenInput = document.getElementById("authTokenInput") as HTMLInputElement;
const saveSettingsBtn = document.getElementById("saveSettingsBtn") as HTMLButtonElement;
const feedbackEl = document.getElementById("feedback") as HTMLDivElement;

// ---------------------------------------------------------------------------
// Feedback display
// ---------------------------------------------------------------------------

function showFeedback(message: string, type: "success" | "error" | "info"): void {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback ${type}`;
  feedbackEl.style.display = "block";
  setTimeout(() => {
    feedbackEl.style.display = "none";
  }, 3000);
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

async function updateConnectionStatus(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "CHECK_CONNECTION" });
    const connected = response?.connected === true;
    statusDot.classList.toggle("connected", connected);
    statusText.textContent = connected ? "Connecte" : "Deconnecte";
  } catch {
    statusDot.classList.remove("connected");
    statusText.textContent = "Deconnecte";
  }
}

// ---------------------------------------------------------------------------
// Selector health check
// ---------------------------------------------------------------------------

async function checkSelectorHealth(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CHECK_SELECTORS",
    });
    if (response && !response.working) {
      selectorAlert.style.display = "block";
      selectorAlert.textContent =
        "Selecteurs LinkedIn casses — mode degrade actif (import par URL)";
    } else {
      selectorAlert.style.display = "none";
    }
  } catch {
    // Content script not loaded on this page
    selectorAlert.style.display = "none";
  }
}

// ---------------------------------------------------------------------------
// Rate limiter display
// ---------------------------------------------------------------------------

async function updateRateLimiterDisplay(): Promise<void> {
  try {
    const state = await chrome.runtime.sendMessage({ type: "GET_RATE_LIMITS" });
    if (state) {
      hourCount.textContent = String(state.profilesThisHour ?? 0);
      dayCount.textContent = String(state.profilesToday ?? 0);
    }
  } catch {
    // Silently ignore
  }
}

// ---------------------------------------------------------------------------
// Client / Campaign selectors
// ---------------------------------------------------------------------------

let clients: ClientOption[] = [];
let campaigns: CampaignOption[] = [];

async function loadClients(): Promise<void> {
  clients = await fetchClients();
  clientSelect.innerHTML = '<option value="">— Aucun client —</option>';
  clients.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    clientSelect.appendChild(opt);
  });
}

async function loadCampaigns(clientId: string): Promise<void> {
  campaigns = await fetchCampaigns(clientId);
  campaignSelect.innerHTML = '<option value="">— Aucune campagne —</option>';
  campaigns.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    campaignSelect.appendChild(opt);
  });
  campaignSelect.style.display = campaigns.length > 0 ? "block" : "none";
}

clientSelect.addEventListener("change", async () => {
  const clientId = clientSelect.value;
  if (clientId) {
    await loadCampaigns(clientId);
  } else {
    campaignSelect.innerHTML = '<option value="">— Aucune campagne —</option>';
    campaignSelect.style.display = "none";
  }
});

function getSelectedTags(): string[] {
  const raw = tagsInput.value.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// Capture profile (single)
// ---------------------------------------------------------------------------

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = "Capture en cours...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Aucun onglet actif");

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CAPTURE_PROFILE",
    });

    if (response?.success) {
      captureBtn.textContent = "Profil capture !";
      captureBtn.style.background = "#22c55e";
      showFeedback(
        response.degraded
          ? "Profil importe en mode degrade (URL seule)"
          : "Profil capture et envoye !",
        "success",
      );
    } else {
      captureBtn.textContent = "Echec — Reessayer";
      showFeedback("Echec de la capture. Limite atteinte ?", "error");
    }
    await updateRateLimiterDisplay();
  } catch (err) {
    console.error("[425PPM] Capture error:", err);
    captureBtn.textContent = "Erreur — Reessayer";
    showFeedback("Erreur : verifiez que vous etes sur un profil LinkedIn", "error");
  } finally {
    setTimeout(() => {
      captureBtn.disabled = false;
      captureBtn.textContent = "Capturer ce profil";
      captureBtn.style.background = "";
    }, 2000);
  }
});

// ---------------------------------------------------------------------------
// Bulk mode
// ---------------------------------------------------------------------------

injectCheckboxesBtn.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "INJECT_CHECKBOXES",
    });
    if (response?.injected) {
      showFeedback(
        `${response.count} resultats detectes. Cochez ceux a capturer.`,
        "info",
      );
    }
  } catch {
    showFeedback("Erreur : pas sur une page de recherche LinkedIn", "error");
  }
});

captureBulkBtn.addEventListener("click", async () => {
  captureBulkBtn.disabled = true;
  captureBulkBtn.textContent = "Capture en cours...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Aucun onglet actif");

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CAPTURE_BULK",
    });

    if (response?.success) {
      showFeedback(`${response.count} profil(s) capture(s) !`, "success");
    } else {
      showFeedback("Aucun profil selectionne ou limite atteinte", "error");
    }
    await updateRateLimiterDisplay();
  } catch (err) {
    console.error("[425PPM] Bulk capture error:", err);
    showFeedback("Erreur lors de la capture en masse", "error");
  } finally {
    setTimeout(() => {
      captureBulkBtn.disabled = false;
      captureBulkBtn.textContent = "Capturer la selection";
    }, 2000);
  }
});

// Poll selected count
async function updateBulkSelectedCount(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_SELECTED_COUNT",
    });
    if (response) {
      bulkSelectedCount.textContent = String(response.count ?? 0);
    }
  } catch {
    bulkSelectedCount.textContent = "0";
  }
}

// ---------------------------------------------------------------------------
// URL Import (degraded mode)
// ---------------------------------------------------------------------------

urlImportBtn.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab.url.includes("linkedin.com/in/")) {
      showFeedback("Ouvrez un profil LinkedIn d'abord", "error");
      return;
    }

    await chrome.runtime.sendMessage({
      type: "URL_IMPORT",
      url: tab.url,
      clientId: clientSelect.value || undefined,
      campaignId: campaignSelect.value || undefined,
      tags: getSelectedTags(),
    });

    showFeedback("Profil importe par URL (mode degrade)", "success");
  } catch (err) {
    console.error("[425PPM] URL import error:", err);
    showFeedback("Erreur lors de l'import par URL", "error");
  }
});

// ---------------------------------------------------------------------------
// Settings management
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<void> {
  const syncData = await chrome.storage.sync.get("apiUrl");
  const localData = await chrome.storage.local.get("authToken");

  if (syncData.apiUrl) {
    apiUrlInput.value = syncData.apiUrl as string;
  }
  if (localData.authToken) {
    authTokenInput.value = localData.authToken as string;
  }
}

saveSettingsBtn.addEventListener("click", async () => {
  const apiUrl = apiUrlInput.value.trim();
  const authToken = authTokenInput.value.trim();

  if (apiUrl) {
    await chrome.storage.sync.set({ apiUrl });
  }
  if (authToken) {
    await chrome.storage.local.set({ authToken });
  }

  await updateConnectionStatus();
  await loadClients();

  saveSettingsBtn.textContent = "Enregistre !";
  setTimeout(() => {
    saveSettingsBtn.textContent = "Enregistrer";
  }, 1500);
});

// ---------------------------------------------------------------------------
// Detect current page type — show/hide bulk section
// ---------------------------------------------------------------------------

async function detectPageType(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const isSearch = tab.url.includes("/search/");
    bulkSection.style.display = isSearch ? "block" : "none";
  } catch {
    bulkSection.style.display = "none";
  }
}

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  await loadSettings();
  await updateConnectionStatus();
  await updateRateLimiterDisplay();
  await loadClients();
  await detectPageType();
  await checkSelectorHealth();

  setInterval(updateConnectionStatus, 30_000);
  setInterval(updateRateLimiterDisplay, 10_000);
  setInterval(updateBulkSelectedCount, 3_000);
  setInterval(detectPageType, 5_000);
}

init();
