/**
 * Side panel logic for the 425PPM LinkedIn sourcing extension.
 *
 * Manages connection status display, rate limiter counters,
 * profile capture triggering, and settings persistence.
 */

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------

const statusDot = document.getElementById("statusDot") as HTMLDivElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const hourCount = document.getElementById("hourCount") as HTMLDivElement;
const dayCount = document.getElementById("dayCount") as HTMLDivElement;
const captureBtn = document.getElementById("captureBtn") as HTMLButtonElement;
const apiUrlInput = document.getElementById("apiUrlInput") as HTMLInputElement;
const authTokenInput = document.getElementById("authTokenInput") as HTMLInputElement;
const saveSettingsBtn = document.getElementById("saveSettingsBtn") as HTMLButtonElement;

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

async function updateConnectionStatus(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "CHECK_CONNECTION" });
    const connected = response?.connected === true;
    statusDot.classList.toggle("connected", connected);
    statusText.textContent = connected ? "Connected" : "Disconnected";
  } catch {
    statusDot.classList.remove("connected");
    statusText.textContent = "Disconnected";
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
    // Silently ignore — counters stay at their last known value
  }
}

// ---------------------------------------------------------------------------
// Capture profile
// ---------------------------------------------------------------------------

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = "Capture en cours...";

  try {
    // Get the active tab and send a message to the content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab found");
    }

    await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_PROFILE" });

    captureBtn.textContent = "Profil capture !";
    // Refresh counters after capture
    await updateRateLimiterDisplay();
  } catch (err) {
    console.error("[425PPM] Capture error:", err);
    captureBtn.textContent = "Erreur — Reessayer";
  } finally {
    setTimeout(() => {
      captureBtn.disabled = false;
      captureBtn.textContent = "Capturer ce profil";
    }, 2000);
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

  // Re-check connection with new settings
  await updateConnectionStatus();

  saveSettingsBtn.textContent = "Enregistre !";
  setTimeout(() => {
    saveSettingsBtn.textContent = "Enregistrer";
  }, 1500);
});

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  await loadSettings();
  await updateConnectionStatus();
  await updateRateLimiterDisplay();

  // Periodically refresh status and counters
  setInterval(updateConnectionStatus, 30_000);
  setInterval(updateRateLimiterDisplay, 10_000);
}

init();
