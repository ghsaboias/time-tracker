// Prevent duplicate injection
if (window.__timeTrackerInjected) throw new Error('Already injected');
window.__timeTrackerInjected = true;

// Self-contained tracking - no service worker dependency
let visitStart = null;
let windowFocused = document.hasFocus();

const pageUrl = window.location.href;
const getTitle = () => document.title || pageUrl;

// === VISIT TRACKING ===

function shouldTrack() {
  return document.visibilityState === 'visible' && windowFocused;
}

function startVisit(timestamp) {
  if (visitStart) return; // Already tracking
  visitStart = timestamp || Date.now();
}

function endVisit(timestamp) {
  if (!visitStart) return;

  const start = visitStart;
  const end = timestamp || Date.now();
  const duration = (end - start) / 1000;
  visitStart = null;

  if (duration < 1) return; // Ignore < 1s visits

  const visit = {
    url: pageUrl,
    title: getTitle(),
    start: start,
    end: end
  };

  // Write directly to storage
  chrome.storage.local.get(['visits'], (result) => {
    const visits = result.visits || [];
    visits.push(visit);
    chrome.storage.local.set({ visits });
  });
}

function updateTracking() {
  if (shouldTrack()) {
    startVisit();
  } else {
    endVisit();
  }
}

// Track visibility changes (tab switches, minimize)
document.addEventListener('visibilitychange', updateTracking);

// Track window focus (switching to other apps)
window.addEventListener('focus', () => {
  windowFocused = true;
  updateTracking();
});

window.addEventListener('blur', () => {
  windowFocused = false;
  updateTracking();
});

// Start tracking if conditions met
if (shouldTrack()) {
  startVisit();
}

// Periodic checkpoint every 30s (saves progress, restarts tracking)
setInterval(() => {
  if (visitStart && shouldTrack()) {
    const now = Date.now();
    endVisit(now);
    startVisit(now);
  }
}, 30000);

// End visit on page unload
window.addEventListener('beforeunload', () => endVisit());
