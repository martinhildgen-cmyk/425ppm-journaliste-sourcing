/**
 * Background service worker for the 425PPM LinkedIn sourcing extension.
 *
 * Handles side panel lifecycle, message routing between content script
 * and side panel, and API communication.
 */

import type { ExtractedData } from "./types.js";

// Open side panel when the extension action icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== undefined) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; data?: ExtractedData },
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
        // Return true to indicate we will send a response asynchronously
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
 * Handle a profile extracted by the content script.
 * Placeholder for forwarding data to the 425PPM backend API.
 */
async function handleProfileExtracted(
  data: ExtractedData,
): Promise<{ saved: boolean }> {
  // TODO: Forward to API via api.ts sendProfile()
  console.log("[425PPM] Profile extracted:", data.profile.name);
  return { saved: true };
}

/**
 * Check whether the backend API is reachable.
 * Placeholder for health check logic.
 */
async function handleCheckConnection(): Promise<boolean> {
  // TODO: Use api.ts checkHealth()
  return false;
}
