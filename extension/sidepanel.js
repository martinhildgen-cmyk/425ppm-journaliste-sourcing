"use strict";
(() => {
  // src/api.ts
  var DEFAULT_API_URL = "http://localhost:8000";
  async function getApiUrl() {
    return new Promise((resolve) => {
      chrome.storage.sync.get("apiUrl", (result) => {
        resolve(result.apiUrl ?? DEFAULT_API_URL);
      });
    });
  }
  async function getAuthToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get("authToken", (result) => {
        resolve(result.authToken ?? null);
      });
    });
  }
  async function buildHeaders() {
    const headers = {
      "Content-Type": "application/json"
    };
    const token = await getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }
  async function fetchClients() {
    const apiUrl = await getApiUrl();
    const headers = await buildHeaders();
    try {
      const response = await fetch(`${apiUrl}/clients/`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.items ?? data).map((c) => ({
        id: c.id,
        name: c.name
      }));
    } catch {
      return [];
    }
  }
  async function fetchCampaigns(clientId) {
    const apiUrl = await getApiUrl();
    const headers = await buildHeaders();
    try {
      const response = await fetch(`${apiUrl}/campaigns/?client_id=${clientId}`, {
        headers
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.items ?? data).map(
        (c) => ({
          id: c.id,
          name: c.name,
          client_id: c.client_id
        })
      );
    } catch {
      return [];
    }
  }

  // src/sidepanel.ts
  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var selectorAlert = document.getElementById("selectorAlert");
  var hourCount = document.getElementById("hourCount");
  var dayCount = document.getElementById("dayCount");
  var captureBtn = document.getElementById("captureBtn");
  var bulkSection = document.getElementById("bulkSection");
  var injectCheckboxesBtn = document.getElementById("injectCheckboxesBtn");
  var captureBulkBtn = document.getElementById("captureBulkBtn");
  var bulkSelectedCount = document.getElementById("bulkSelectedCount");
  var urlImportBtn = document.getElementById("urlImportBtn");
  var clientSelect = document.getElementById("clientSelect");
  var campaignSelect = document.getElementById("campaignSelect");
  var tagsInput = document.getElementById("tagsInput");
  var apiUrlInput = document.getElementById("apiUrlInput");
  var authTokenInput = document.getElementById("authTokenInput");
  var saveSettingsBtn = document.getElementById("saveSettingsBtn");
  var feedbackEl = document.getElementById("feedback");
  function showFeedback(message, type) {
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback ${type}`;
    feedbackEl.style.display = "block";
    setTimeout(() => {
      feedbackEl.style.display = "none";
    }, 3e3);
  }
  async function updateConnectionStatus() {
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
  async function checkSelectorHealth() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "CHECK_SELECTORS"
      });
      if (response && !response.working) {
        selectorAlert.style.display = "block";
        selectorAlert.textContent = "Selecteurs LinkedIn casses \u2014 mode degrade actif (import par URL)";
      } else {
        selectorAlert.style.display = "none";
      }
    } catch {
      selectorAlert.style.display = "none";
    }
  }
  async function updateRateLimiterDisplay() {
    try {
      const state = await chrome.runtime.sendMessage({ type: "GET_RATE_LIMITS" });
      if (state) {
        hourCount.textContent = String(state.profilesThisHour ?? 0);
        dayCount.textContent = String(state.profilesToday ?? 0);
      }
    } catch {
    }
  }
  var clients = [];
  var campaigns = [];
  async function loadClients() {
    clients = await fetchClients();
    clientSelect.innerHTML = '<option value="">\u2014 Aucun client \u2014</option>';
    clients.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      clientSelect.appendChild(opt);
    });
  }
  async function loadCampaigns(clientId) {
    campaigns = await fetchCampaigns(clientId);
    campaignSelect.innerHTML = '<option value="">\u2014 Aucune campagne \u2014</option>';
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
      campaignSelect.innerHTML = '<option value="">\u2014 Aucune campagne \u2014</option>';
      campaignSelect.style.display = "none";
    }
  });
  function getSelectedTags() {
    const raw = tagsInput.value.trim();
    if (!raw) return [];
    return raw.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  }
  captureBtn.addEventListener("click", async () => {
    captureBtn.disabled = true;
    captureBtn.textContent = "Capture en cours...";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("Aucun onglet actif");
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "CAPTURE_PROFILE"
      });
      if (response?.success) {
        captureBtn.textContent = "Profil capture !";
        captureBtn.style.background = "#22c55e";
        showFeedback(
          response.degraded ? "Profil importe en mode degrade (URL seule)" : "Profil capture et envoye !",
          "success"
        );
      } else {
        captureBtn.textContent = "Echec \u2014 Reessayer";
        showFeedback("Echec de la capture. Limite atteinte ?", "error");
      }
      await updateRateLimiterDisplay();
    } catch (err) {
      console.error("[425PPM] Capture error:", err);
      captureBtn.textContent = "Erreur \u2014 Reessayer";
      showFeedback("Erreur : verifiez que vous etes sur un profil LinkedIn", "error");
    } finally {
      setTimeout(() => {
        captureBtn.disabled = false;
        captureBtn.textContent = "Capturer ce profil";
        captureBtn.style.background = "";
      }, 2e3);
    }
  });
  injectCheckboxesBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "INJECT_CHECKBOXES"
      });
      if (response?.injected) {
        showFeedback(
          `${response.count} resultats detectes. Cochez ceux a capturer.`,
          "info"
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
        type: "CAPTURE_BULK"
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
      }, 2e3);
    }
  });
  async function updateBulkSelectedCount() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_SELECTED_COUNT"
      });
      if (response) {
        bulkSelectedCount.textContent = String(response.count ?? 0);
      }
    } catch {
      bulkSelectedCount.textContent = "0";
    }
  }
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
        clientId: clientSelect.value || void 0,
        campaignId: campaignSelect.value || void 0,
        tags: getSelectedTags()
      });
      showFeedback("Profil importe par URL (mode degrade)", "success");
    } catch (err) {
      console.error("[425PPM] URL import error:", err);
      showFeedback("Erreur lors de l'import par URL", "error");
    }
  });
  async function loadSettings() {
    const syncData = await chrome.storage.sync.get("apiUrl");
    const localData = await chrome.storage.local.get("authToken");
    if (syncData.apiUrl) {
      apiUrlInput.value = syncData.apiUrl;
    }
    if (localData.authToken) {
      authTokenInput.value = localData.authToken;
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
  async function detectPageType() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;
      const isSearch = tab.url.includes("/search/");
      bulkSection.style.display = isSearch ? "block" : "none";
    } catch {
      bulkSection.style.display = "none";
    }
  }
  async function init() {
    await loadSettings();
    await updateConnectionStatus();
    await updateRateLimiterDisplay();
    await loadClients();
    await detectPageType();
    await checkSelectorHealth();
    setInterval(updateConnectionStatus, 3e4);
    setInterval(updateRateLimiterDisplay, 1e4);
    setInterval(updateBulkSelectedCount, 3e3);
    setInterval(detectPageType, 5e3);
  }
  init();
})();
//# sourceMappingURL=sidepanel.js.map
