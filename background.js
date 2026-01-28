let activeTabId = null;
let startTime = null;
let timeData = {};

// Constants for data retention
let MAX_DAYS_TO_KEEP = 30; // Keep data for 30 days by default
const STORAGE_QUOTA_BYTES = 5242880; // 5MB storage quota

// Load existing data
chrome.storage.local.get(["timeData", "retentionDays"], (result) => {
  timeData = result.timeData || {};
  if (result.retentionDays) {
    MAX_DAYS_TO_KEEP = result.retentionDays;
  }
  console.log("Loaded timeData:", timeData);
  cleanupOldData();
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "updateRetentionDays") {
    MAX_DAYS_TO_KEEP = message.days;
    chrome.storage.local.set({ retentionDays: message.days }, () => {
      cleanupOldData();
      sendResponse();
    });
    return true; // Will respond asynchronously
  }
});

// Cleanup old data
function cleanupOldData() {
  const now = new Date();
  const cutoffDate = new Date(now.setDate(now.getDate() - MAX_DAYS_TO_KEEP));
  const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

  let modified = false;
  Object.keys(timeData).forEach((date) => {
    if (date < cutoffDateStr) {
      delete timeData[date];
      modified = true;
    }
  });

  if (modified) {
    chrome.storage.local.set({ timeData }, () => {
      console.log("Cleaned up old data");
    });
  }
}

// Check storage quota
function checkStorageQuota() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      const quotaPercentage = (bytesInUse / STORAGE_QUOTA_BYTES) * 100;
      console.log(`Storage usage: ${quotaPercentage.toFixed(2)}%`);
      resolve(quotaPercentage < 90); // Return true if under 90% usage
    });
  });
}

// Track active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  updateTime(); // Save time for previous tab
  activeTabId = activeInfo.tabId;
  startTime = Date.now();
  chrome.tabs.get(activeTabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting tab:", chrome.runtime.lastError);
      return;
    }
    if (tab.url) {
      console.log(`Switched to: ${tab.url}`);
    }
  });
});

// Track tab updates (e.g., URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    updateTime(); // Save time for previous URL
    startTime = Date.now();
    console.log(`URL updated: ${tab.url}`);
  }
});

// Track window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    updateTime(); // Pause tracking when browser loses focus
    activeTabId = null;
    startTime = null;
    console.log("Browser lost focus");
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        updateTime();
        activeTabId = tabs[0].id;
        startTime = Date.now();
        console.log(`Browser regained focus, active tab: ${tabs[0].url}`);
      }
    });
  }
});

// Update time for the active tab
async function updateTime() {
  if (activeTabId && startTime) {
    const timeSpent = (Date.now() - startTime) / 1000; // Seconds
    if (timeSpent <= 0) {
      console.warn("Non-positive time spent, skipping update");
      startTime = Date.now();
      return;
    }

    // Check storage quota before updating
    const hasSpace = await checkStorageQuota();
    if (!hasSpace) {
      console.warn("Storage quota nearly full, cleaning up old data");
      cleanupOldData();
    }

    chrome.tabs.get(activeTabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting tab:", chrome.runtime.lastError);
        startTime = Date.now();
        return;
      }
      if (tab && tab.url) {
        const fullUrl = tab.url;
        const title = tab.title || "";
        const today = new Date().toISOString().split("T")[0];

        if (!timeData[today]) timeData[today] = {};
        if (!timeData[today][fullUrl]) timeData[today][fullUrl] = { time: 0, title: "" };
        // Handle legacy data (plain numbers)
        if (typeof timeData[today][fullUrl] === "number") {
          timeData[today][fullUrl] = { time: timeData[today][fullUrl], title: "" };
        }
        timeData[today][fullUrl].time += timeSpent;
        timeData[today][fullUrl].title = title; // Update to latest title

        // Save to storage
        chrome.storage.local.set({ timeData }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error saving data:", chrome.runtime.lastError);
          } else {
            console.log(
              `Saved time for ${fullUrl} ("${title}"): ${timeSpent}s (Total: ${timeData[today][fullUrl].time}s)`
            );
          }
        });
      } else {
        console.warn("No valid tab or URL");
      }
      startTime = Date.now(); // Reset start time
    });
  } else {
    console.log("No active tab or start time, skipping update");
    startTime = Date.now();
  }
}

// Periodically save time and check data retention (every 1 second)
setInterval(updateTime, 1000);

// Check and cleanup old data daily
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
