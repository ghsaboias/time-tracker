// Self-contained tracking - no service worker dependency
let visitStart = null;
let activeMediaStart = null;
let activeMediaType = null;

const pageUrl = window.location.href;
const getTitle = () => document.title || pageUrl;

// === VISIT TRACKING ===

function startVisit() {
  if (visitStart) return; // Already tracking
  visitStart = Date.now();
}

function endVisit() {
  if (!visitStart) return;

  const start = visitStart;
  const end = Date.now();
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

// Track visibility changes (handles tab switches, window blur, etc.)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    startVisit();
  } else {
    endVisit();
  }
});

// Start tracking if page is already visible
if (document.visibilityState === 'visible') {
  startVisit();
}

// End visit on page unload
window.addEventListener('beforeunload', endVisit);

// === MEDIA TRACKING ===

const trackedMedia = new WeakSet();

function startMediaSession(element) {
  if (activeMediaStart) return; // Already tracking media
  activeMediaStart = Date.now();
  activeMediaType = element.tagName.toLowerCase();
}

function endMediaSession() {
  if (!activeMediaStart) return;

  const duration = (Date.now() - activeMediaStart) / 1000;
  const start = activeMediaStart;
  activeMediaStart = null;

  if (duration < 2) return; // Ignore < 2s sessions

  const session = {
    url: pageUrl,
    title: getTitle(),
    start: start,
    end: Date.now(),
    mediaType: activeMediaType
  };
  activeMediaType = null;

  chrome.storage.local.get(['mediaSessions'], (result) => {
    const mediaSessions = result.mediaSessions || [];
    mediaSessions.push(session);
    chrome.storage.local.set({ mediaSessions });
  });
}

function attachMediaListeners(element) {
  if (trackedMedia.has(element)) return;
  trackedMedia.add(element);

  if (!element.paused) {
    startMediaSession(element);
  }

  element.addEventListener('play', () => startMediaSession(element));
  element.addEventListener('pause', endMediaSession);
  element.addEventListener('ended', endMediaSession);
}

function findAndTrackMedia() {
  document.querySelectorAll('video, audio').forEach(attachMediaListeners);
}

// Initial scan
findAndTrackMedia();

// Watch for dynamically added media
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
          attachMediaListeners(node);
        }
        node.querySelectorAll?.('video, audio').forEach(attachMediaListeners);
      }
    }
  }
});

observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

// End media on page unload
window.addEventListener('beforeunload', endMediaSession);
