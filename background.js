// Minimal service worker - only handles export and cleanup
// All tracking is done by content scripts (no service worker dependency)

let MAX_DAYS_TO_KEEP = 30;

// Setup alarm on install/startup
chrome.runtime.onInstalled.addListener(onStartup);
chrome.runtime.onStartup.addListener(onStartup);

function onStartup() {
  setupAlarm();
  injectIntoExistingTabs();
}

function setupAlarm() {
  chrome.alarms.create('autoExport', { periodInMinutes: 60 });
  chrome.storage.local.get(['retentionDays'], (result) => {
    if (result.retentionDays) MAX_DAYS_TO_KEEP = result.retentionDays;
    cleanupOldData();
  });
}

function injectIntoExistingTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      // Skip chrome:// and other restricted URLs
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        continue;
      }
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(() => {}); // Ignore errors for restricted pages
    }
  });
}

// Handle alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoExport') {
    autoExportCSV();
    cleanupOldData();
  }
});

// Handle retention days update from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateRetentionDays') {
    MAX_DAYS_TO_KEEP = message.days;
    chrome.storage.local.set({ retentionDays: message.days }, () => {
      cleanupOldData();
      sendResponse();
    });
    return true;
  }
});

function cleanupOldData() {
  const cutoff = Date.now() - (MAX_DAYS_TO_KEEP * 24 * 60 * 60 * 1000);
  chrome.storage.local.get(['visits'], (result) => {
    const visits = (result.visits || []).filter(v => v.start >= cutoff);
    chrome.storage.local.set({ visits });
  });
}

function autoExportCSV() {
  chrome.storage.local.get(['visits'], (result) => {
    const visits = result.visits || [];

    if (visits.length === 0) return;

    let csv = 'URL,Title,Start,End\n';
    const sortedVisits = [...visits].sort((a, b) => a.start - b.start);

    for (const v of sortedVisits) {
      const url = v.url.includes(',') || v.url.includes('"')
        ? `"${v.url.replace(/"/g, '""')}"` : v.url;
      const title = (v.title || '').includes(',') || (v.title || '').includes('"')
        ? `"${(v.title || '').replace(/"/g, '""')}"` : (v.title || '');
      csv += `${url},${title},${v.start},${v.end}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.downloads.download({
        url: reader.result,
        filename: `time_tracker_${new Date().toISOString().split('T')[0]}.csv`,
        conflictAction: 'overwrite'
      });
    };
    reader.readAsDataURL(blob);
  });
}
