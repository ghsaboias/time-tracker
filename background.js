// Minimal service worker - only handles export and cleanup
// All tracking is done by content scripts (no service worker dependency)

let MAX_DAYS_TO_KEEP = 30;

// Setup alarm on install/startup
chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);

function setupAlarm() {
  chrome.alarms.create('autoExport', { periodInMinutes: 60 });
  chrome.storage.local.get(['retentionDays'], (result) => {
    if (result.retentionDays) MAX_DAYS_TO_KEEP = result.retentionDays;
    cleanupOldData();
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
  chrome.storage.local.get(['visits', 'mediaSessions'], (result) => {
    const visits = (result.visits || []).filter(v => v.start >= cutoff);
    const mediaSessions = (result.mediaSessions || []).filter(m => m.start >= cutoff);
    chrome.storage.local.set({ visits, mediaSessions });
  });
}

function autoExportCSV() {
  chrome.storage.local.get(['visits', 'mediaSessions'], (result) => {
    const visits = result.visits || [];
    const mediaSessions = result.mediaSessions || [];

    if (visits.length === 0 && mediaSessions.length === 0) return;

    let csv = 'Type,URL,Title,Start,End\n';
    const allEvents = [
      ...visits.map(v => ({ ...v, type: 'visit' })),
      ...mediaSessions.map(m => ({ ...m, type: 'media' }))
    ].sort((a, b) => a.start - b.start);

    for (const e of allEvents) {
      const url = e.url.includes(',') || e.url.includes('"')
        ? `"${e.url.replace(/"/g, '""')}"` : e.url;
      const title = (e.title || '').includes(',') || (e.title || '').includes('"')
        ? `"${(e.title || '').replace(/"/g, '""')}"` : (e.title || '');
      csv += `${e.type},${url},${title},${e.start},${e.end}\n`;
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
