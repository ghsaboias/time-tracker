// Track media playback on the page
console.log("[TimeTracker] Content script loaded on:", window.location.href);

const trackedMedia = new WeakSet();

function getMediaInfo(element) {
  return {
    type: element.tagName.toLowerCase(), // "video" or "audio"
    duration: element.duration || 0,
    currentTime: element.currentTime || 0,
    src: element.src || element.currentSrc || "",
  };
}

function attachMediaListeners(element) {
  if (trackedMedia.has(element)) return;
  trackedMedia.add(element);
  console.log("[TimeTracker] Attached listeners to:", element.tagName, element.src || element.currentSrc);

  // If already playing, start tracking immediately
  if (!element.paused) {
    console.log("[TimeTracker] Video already playing, starting session");
    chrome.runtime.sendMessage({
      type: "mediaPlay",
      url: window.location.href,
      title: document.title,
      media: getMediaInfo(element),
    });
  }

  element.addEventListener("play", () => {
    console.log("[TimeTracker] Play event fired");
    chrome.runtime.sendMessage({
      type: "mediaPlay",
      url: window.location.href,
      title: document.title,
      media: getMediaInfo(element),
    });
  });

  element.addEventListener("pause", () => {
    chrome.runtime.sendMessage({
      type: "mediaPause",
      url: window.location.href,
      title: document.title,
      media: getMediaInfo(element),
    });
  });

  element.addEventListener("ended", () => {
    chrome.runtime.sendMessage({
      type: "mediaEnded",
      url: window.location.href,
      title: document.title,
      media: getMediaInfo(element),
    });
  });
}

function findAndTrackMedia() {
  const media = document.querySelectorAll("video, audio");
  console.log("[TimeTracker] Found media elements:", media.length);
  media.forEach(attachMediaListeners);
}

// Initial scan
findAndTrackMedia();

// Watch for dynamically added media (SPAs like YouTube, Twitter)
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === "VIDEO" || node.tagName === "AUDIO") {
          attachMediaListeners(node);
        }
        // Check descendants
        node.querySelectorAll?.("video, audio").forEach(attachMediaListeners);
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
