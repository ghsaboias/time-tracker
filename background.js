let activeTabId = null;
let currentVisit = null; // { url, title, start }
let visits = [];
let mediaSessions = [];
const activeMedia = new Map(); // tabId -> { url, title, start, mediaType }

// Constants for data retention
let MAX_DAYS_TO_KEEP = 30;
const STORAGE_QUOTA_BYTES = 5242880; // 5MB storage quota

// Load existing data
chrome.storage.local.get(["visits", "mediaSessions", "retentionDays"], (result) => {
  visits = result.visits || [];
  mediaSessions = result.mediaSessions || [];
  if (result.retentionDays) {
    MAX_DAYS_TO_KEEP = result.retentionDays;
  }
  console.log(`Loaded ${visits.length} visits, ${mediaSessions.length} media sessions`);
  cleanupOldData();
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "updateRetentionDays") {
    MAX_DAYS_TO_KEEP = message.days;
    chrome.storage.local.set({ retentionDays: message.days }, () => {
      cleanupOldData();
      sendResponse();
    });
    return true;
  }

  // Media tracking
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (message.type === "mediaPlay") {
    // Close any existing media session for this tab
    closeMediaSession(tabId);
    // Start new media session
    activeMedia.set(tabId, {
      url: message.url,
      title: message.title,
      start: Date.now(),
      mediaType: message.media.type,
    });
    console.log(`Media started: ${message.media.type} on ${message.url}`);
  }

  if (message.type === "mediaPause" || message.type === "mediaEnded") {
    closeMediaSession(tabId);
    console.log(`Media ${message.type === "mediaPause" ? "paused" : "ended"}: ${message.url}`);
  }
});

// Close media session for a tab and save it
function closeMediaSession(tabId) {
  const media = activeMedia.get(tabId);
  if (media && media.start) {
    const endTime = Date.now();
    const duration = (endTime - media.start) / 1000;

    // Only save sessions longer than 2 seconds
    if (duration >= 2) {
      mediaSessions.push({
        url: media.url,
        title: media.title,
        start: media.start,
        end: endTime,
        mediaType: media.mediaType,
      });
      console.log(`Saved media session: ${media.url} (${duration.toFixed(1)}s)`);

      chrome.storage.local.set({ mediaSessions }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving media sessions:", chrome.runtime.lastError);
        }
      });
    }
    activeMedia.delete(tabId);
  }
}

// Cleanup old data
function cleanupOldData() {
  const cutoffTime = Date.now() - (MAX_DAYS_TO_KEEP * 24 * 60 * 60 * 1000);
  const originalVisits = visits.length;
  const originalMedia = mediaSessions.length;

  visits = visits.filter(v => v.start >= cutoffTime);
  mediaSessions = mediaSessions.filter(m => m.start >= cutoffTime);

  if (visits.length !== originalVisits || mediaSessions.length !== originalMedia) {
    chrome.storage.local.set({ visits, mediaSessions }, () => {
      console.log(`Cleaned up ${originalVisits - visits.length} visits, ${originalMedia - mediaSessions.length} media sessions`);
    });
  }
}

// Check storage quota
function checkStorageQuota() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      const quotaPercentage = (bytesInUse / STORAGE_QUOTA_BYTES) * 100;
      console.log(`Storage usage: ${quotaPercentage.toFixed(2)}%`);
      resolve(quotaPercentage < 90);
    });
  });
}

// Close current visit and save
function closeCurrentVisit() {
  if (currentVisit && currentVisit.start) {
    const endTime = Date.now();
    const duration = (endTime - currentVisit.start) / 1000;

    // Only save visits longer than 1 second
    if (duration >= 1) {
      visits.push({
        url: currentVisit.url,
        title: currentVisit.title,
        start: currentVisit.start,
        end: endTime
      });
      console.log(`Closed visit: ${currentVisit.url} (${duration.toFixed(1)}s)`);

      // Save to storage
      chrome.storage.local.set({ visits }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving visits:", chrome.runtime.lastError);
        }
      });
    }
  }
  currentVisit = null;
}

// Start a new visit
function startVisit(tab) {
  if (tab && tab.url) {
    currentVisit = {
      url: tab.url,
      title: tab.title || "",
      start: Date.now()
    };
    console.log(`Started visit: ${tab.url}`);
  }
}

// Track active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  closeCurrentVisit();
  activeTabId = activeInfo.tabId;
  chrome.tabs.get(activeTabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting tab:", chrome.runtime.lastError);
      return;
    }
    startVisit(tab);
  });
});

// Track tab updates (e.g., URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    closeCurrentVisit();
    startVisit(tab);
  }
});

// Track window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    closeCurrentVisit();
    activeTabId = null;
    console.log("Browser lost focus");
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        closeCurrentVisit();
        activeTabId = tabs[0].id;
        startVisit(tabs[0]);
        console.log(`Browser regained focus: ${tabs[0].url}`);
      }
    });
  }
});

// Close media session when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  closeMediaSession(tabId);
});

// Periodically check storage quota and cleanup
setInterval(async () => {
  const hasSpace = await checkStorageQuota();
  if (!hasSpace) {
    console.warn("Storage quota nearly full, cleaning up old data");
    cleanupOldData();
  }
}, 60 * 1000); // Check every minute

// Cleanup old data daily
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

// Auto-export setup
chrome.alarms.create("dailyExport", {
  periodInMinutes: 60 // Hourly (aligns with session archive cron)
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyExport") {
    autoExportCSV();
  }
});

// Auto-export CSV to Downloads
function autoExportCSV() {
  chrome.storage.local.get(["visits", "mediaSessions"], (result) => {
    const visits = result.visits || [];
    const mediaSessions = result.mediaSessions || [];

    if (visits.length === 0 && mediaSessions.length === 0) {
      console.log("No data to export");
      return;
    }

    let csv = "Type,URL,Title,Start,End\n";

    const allEvents = [
      ...visits.map(v => ({ ...v, type: "visit" })),
      ...mediaSessions.map(m => ({ ...m, type: "media" }))
    ].sort((a, b) => a.start - b.start);

    for (const event of allEvents) {
      const escapedUrl = event.url.includes(",") || event.url.includes('"')
        ? `"${event.url.replace(/"/g, '""')}"` : event.url;
      const escapedTitle = event.title.includes(",") || event.title.includes('"')
        ? `"${event.title.replace(/"/g, '""')}"` : event.title;
      csv += `${event.type},${escapedUrl},${escapedTitle},${event.start},${event.end}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const reader = new FileReader();
    reader.onload = () => {
      const filename = `time_tracker_${new Date().toISOString().split("T")[0]}.csv`;
      chrome.downloads.download({
        url: reader.result,
        filename: filename,
        conflictAction: "overwrite"
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("Auto-export failed:", chrome.runtime.lastError);
        } else {
          console.log(`Auto-exported to ${filename} (download ID: ${downloadId})`);
        }
      });
    };
    reader.readAsDataURL(blob);
  });
}
