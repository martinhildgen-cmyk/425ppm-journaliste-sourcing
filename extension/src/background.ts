/**
 * Background service worker for the 425PPM LinkedIn sourcing extension.
 *
 * Handles side panel lifecycle, message routing between content script
 * and side panel, and API communication.
 */

import type { ExtractedData, LinkedInProfile } from "./types.js";
import { sendProfile, sendBulkProfiles, sendUrlImport, checkHealth } from "./api.js";

// Open side panel when the extension action icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== undefined) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener(
  (
    message: {
      type: string;
      data?: ExtractedData;
      profiles?: LinkedInProfile[];
      url?: string;
      clientId?: string;
      campaignId?: string;
      tags?: string[];
    },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    switch (message.type) {
      case "PROFILE_EXTRACTED":
        handleProfileExtracted(message.data!).then(
          (result) => sendResponse({ success: true, result }),
          (error) =>
            sendResponse({
              success: false,
              error: (error as Error).message,
            }),
        );
        return true;

      case "BULK_EXTRACTED":
        handleBulkExtracted(
          message.profiles ?? [],
          message.clientId,
          message.campaignId,
          message.tags,
        ).then(
          (result) => sendResponse({ success: true, result }),
          (error) =>
            sendResponse({
              success: false,
              error: (error as Error).message,
            }),
        );
        return true;

      case "URL_IMPORT":
        handleUrlImport(
          message.url ?? "",
          message.clientId,
          message.campaignId,
          message.tags,
        ).then(
          (result) => sendResponse({ success: true, result }),
          (error) =>
            sendResponse({
              success: false,
              error: (error as Error).message,
            }),
        );
        return true;

      case "CHECK_CONNECTION":
        handleCheckConnection().then(
          (connected) => sendResponse({ connected }),
          () => sendResponse({ connected: false }),
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
  },
);

/**
 * Handle a single profile extracted by the content script.
 */
async function handleProfileExtracted(
  data: ExtractedData,
): Promise<{ saved: boolean; id?: string }> {
  try {
    const result = await sendProfile(data);
    console.log("[425PPM] Profile saved:", data.profile.name);
    return { saved: true, id: result.id };
  } catch (error) {
    console.error("[425PPM] Failed to save profile:", error);
    throw error;
  }
}

/**
 * Handle bulk profiles extracted from search results.
 */
async function handleBulkExtracted(
  profiles: LinkedInProfile[],
  clientId?: string,
  campaignId?: string,
  tags?: string[],
): Promise<{ created: number }> {
  try {
    const result = await sendBulkProfiles({
      profiles,
      clientId,
      campaignId,
      tags,
    });
    console.log(`[425PPM] Bulk save: ${result.created} profiles created`);
    return { created: result.created };
  } catch (error) {
    console.error("[425PPM] Failed to bulk save:", error);
    throw error;
  }
}

/**
 * Handle degraded mode — URL import only.
 */
async function handleUrlImport(
  url: string,
  clientId?: string,
  campaignId?: string,
  tags?: string[],
): Promise<{ saved: boolean; id?: string }> {
  try {
    const result = await sendUrlImport(url, clientId, campaignId, tags);
    console.log("[425PPM] URL import saved:", url);
    return { saved: true, id: result.id };
  } catch (error) {
    console.error("[425PPM] Failed URL import:", error);
    throw error;
  }
}

/**
 * Check whether the backend API is reachable.
 */
async function handleCheckConnection(): Promise<boolean> {
  return checkHealth();
}
