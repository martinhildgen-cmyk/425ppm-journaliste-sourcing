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
async function sendProfile(data) {
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
      tags: data.tags ?? []
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return response.json();
}
async function sendBulkProfiles(data) {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();
  const response = await fetch(`${apiUrl}/extension/journalists/from-bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return response.json();
}
async function sendUrlImport(linkedinUrl, clientId, campaignId, tags) {
  const apiUrl = await getApiUrl();
  const headers = await buildHeaders();
  const response = await fetch(`${apiUrl}/extension/journalists/from-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      linkedin_url: linkedinUrl,
      clientId: clientId ?? null,
      campaignId: campaignId ?? null,
      tags: tags ?? []
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return response.json();
}
async function checkHealth() {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5e3)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// src/background.ts
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== void 0) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});
chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    switch (message.type) {
      case "PROFILE_EXTRACTED":
        handleProfileExtracted(message.data).then(
          (result) => sendResponse({ success: true, result }),
          (error) => sendResponse({
            success: false,
            error: error.message
          })
        );
        return true;
      case "BULK_EXTRACTED":
        handleBulkExtracted(
          message.profiles ?? [],
          message.clientId,
          message.campaignId,
          message.tags
        ).then(
          (result) => sendResponse({ success: true, result }),
          (error) => sendResponse({
            success: false,
            error: error.message
          })
        );
        return true;
      case "URL_IMPORT":
        handleUrlImport(
          message.url ?? "",
          message.clientId,
          message.campaignId,
          message.tags
        ).then(
          (result) => sendResponse({ success: true, result }),
          (error) => sendResponse({
            success: false,
            error: error.message
          })
        );
        return true;
      case "CHECK_CONNECTION":
        handleCheckConnection().then(
          (connected) => sendResponse({ connected }),
          () => sendResponse({ connected: false })
        );
        return true;
      case "GET_RATE_LIMITS":
        chrome.storage.local.get("rateLimiter", (result) => {
          sendResponse(result.rateLimiter ?? null);
        });
        return true;
      default:
        sendResponse({ error: "Unknown message type" });
        return false;
    }
  }
);
async function handleProfileExtracted(data) {
  try {
    const result = await sendProfile(data);
    console.log("[425PPM] Profile saved:", data.profile.name);
    return { saved: true, id: result.id };
  } catch (error) {
    console.error("[425PPM] Failed to save profile:", error);
    throw error;
  }
}
async function handleBulkExtracted(profiles, clientId, campaignId, tags) {
  try {
    const result = await sendBulkProfiles({
      profiles,
      clientId,
      campaignId,
      tags
    });
    console.log(`[425PPM] Bulk save: ${result.created} profiles created`);
    return { created: result.created };
  } catch (error) {
    console.error("[425PPM] Failed to bulk save:", error);
    throw error;
  }
}
async function handleUrlImport(url, clientId, campaignId, tags) {
  try {
    const result = await sendUrlImport(url, clientId, campaignId, tags);
    console.log("[425PPM] URL import saved:", url);
    return { saved: true, id: result.id };
  } catch (error) {
    console.error("[425PPM] Failed URL import:", error);
    throw error;
  }
}
async function handleCheckConnection() {
  return checkHealth();
}
//# sourceMappingURL=background.js.map
