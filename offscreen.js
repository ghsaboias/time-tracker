// Offscreen document: exists purely to mint blob URLs for the hourly CSV export.
// MV3 service workers have no URL.createObjectURL, so background.js hands the CSV
// text here and gets back a short-lived blob: URL to feed chrome.downloads.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return;

  if (message.type === 'csv-to-blob-url') {
    const blob = new Blob([message.csv], { type: 'text/csv' });
    sendResponse({ url: URL.createObjectURL(blob) });
    return;
  }

  if (message.type === 'revoke-blob-url') {
    URL.revokeObjectURL(message.url);
    sendResponse({ ok: true });
  }
});
