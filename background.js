let activeTabId = null;
let startTime = null;
let timeData = {};

// Load existing data
chrome.storage.local.get(["timeData"], (result) => {
  timeData = result.timeData || {};
  console.log("Loaded timeData:", timeData);
});

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
function updateTime() {
  if (activeTabId && startTime) {
    const timeSpent = (Date.now() - startTime) / 1000; // Seconds
    if (timeSpent <= 0) {
      console.warn("Non-positive time spent, skipping update");
      startTime = Date.now();
      return;
    }

    chrome.tabs.get(activeTabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting tab:", chrome.runtime.lastError);
        startTime = Date.now();
        return;
      }
      if (tab && tab.url) {
        const hostname = new URL(tab.url).hostname;
        const today = new Date().toISOString().split("T")[0];

        if (!timeData[today]) timeData[today] = {};
        if (!timeData[today][hostname]) timeData[today][hostname] = 0;
        timeData[today][hostname] += timeSpent;

        // Save to storage
        chrome.storage.local.set({ timeData }, () => {
          console.log(
            `Saved time for ${hostname}: ${timeSpent}s (Total: ${timeData[today][hostname]}s)`
          );
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

// Periodically save time (every 1 second for testing)
setInterval(updateTime, 1000);
