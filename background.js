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

    const filename = `time_tracker_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename).catch((err) => {
      console.error('[time-tracker] auto export failed:', err);
    });
  });
}

// --- CSV delivery -----------------------------------------------------------
// Never go back to FileReader/readAsDataURL here. That inlines the whole CSV as
// base64 in the download URL, and Chromium persists every download record --
// URL included -- in Default/shared_proto_db. At 24 exports/day of a multi-MB
// CSV that DB reached 1.5GB and OOM-crashed the browser process at startup.
// An offscreen document gives us URL.createObjectURL (unavailable in MV3
// service workers), so the stored record is a 93-byte blob: URL instead.

let offscreenPending = null;

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenPending) {
    offscreenPending = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Create a blob URL for the hourly CSV export.'
    }).finally(() => { offscreenPending = null; });
  }
  await offscreenPending;
}

async function downloadCSV(csv, filename) {
  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'csv-to-blob-url',
    csv
  });
  if (!response || !response.url) {
    throw new Error('offscreen document returned no blob URL');
  }
  const url = response.url;

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      conflictAction: 'overwrite'
    });
    // Hold the blob URL alive until the write finishes; revoking early can
    // interrupt the download, and closing the document revokes it implicitly.
    await waitForDownload(downloadId);
  } finally {
    await chrome.runtime
      .sendMessage({ target: 'offscreen', type: 'revoke-blob-url', url })
      .catch(() => {});
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }
  }
}

function waitForDownload(downloadId, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      clearTimeout(timer);
      resolve(state);
    };
    const onChanged = (delta) => {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
        finish(delta.state.current);
      }
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    chrome.downloads.onChanged.addListener(onChanged);
    // The download can finish before the listener attaches.
    chrome.downloads.search({ id: downloadId }, (items) => {
      const state = items && items[0] && items[0].state;
      if (state === 'complete' || state === 'interrupted') finish(state);
    });
  });
}
