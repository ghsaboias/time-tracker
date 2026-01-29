document.addEventListener("DOMContentLoaded", () => {
  // Ensure export alarm exists (survives service worker death)
  chrome.alarms.get('autoExport', (alarm) => {
    if (!alarm) chrome.alarms.create('autoExport', { periodInMinutes: 60 });
  });

  const dateSelect = document.getElementById("dateSelect");
  const siteList = document.getElementById("siteList");
  const exportBtn = document.getElementById("exportBtn");
  const retentionDays = document.getElementById("retentionDays");
  const storageUsage = document.getElementById("storageUsage");
  const searchInput = document.getElementById("searchInput");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsSection = document.getElementById("settingsSection");

  let currentSites = []; // Store current sites data

  // Toggle settings visibility
  settingsToggle.addEventListener("click", () => {
    settingsSection.classList.toggle("hidden");
    // Save settings state
    chrome.storage.local.set({
      settingsVisible: !settingsSection.classList.contains("hidden"),
    });
  });

  // Restore settings visibility state
  chrome.storage.local.get(["settingsVisible"], (result) => {
    if (result.settingsVisible) {
      settingsSection.classList.remove("hidden");
    }
  });

  // Update storage usage display
  function updateStorageUsage() {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      const quotaPercentage = (bytesInUse / 5242880) * 100; // 5MB quota
      storageUsage.textContent = `${quotaPercentage.toFixed(1)}%`;
    });
  }

  // Get date string from timestamp
  function getDateStr(timestamp) {
    return new Date(timestamp).toISOString().split("T")[0];
  }

  // Populate date selector with available dates
  function populateDateSelect() {
    chrome.storage.local.get(["visits", "mediaSessions"], (result) => {
      const visits = result.visits || [];
      const mediaSessions = result.mediaSessions || [];
      const allDates = [...visits, ...mediaSessions].map(v => getDateStr(v.start));
      const dates = [...new Set(allDates)].sort().reverse();

      // Clear existing options
      dateSelect.innerHTML = "";

      // Add "Today" option
      const today = new Date().toISOString().split("T")[0];
      const todayOption = document.createElement("option");
      todayOption.value = today;
      todayOption.textContent = "Today";
      dateSelect.appendChild(todayOption);

      // Add all available dates
      dates.forEach((date) => {
        if (date !== today) {
          const option = document.createElement("option");
          option.value = date;
          option.textContent = new Date(date).toLocaleDateString();
          dateSelect.appendChild(option);
        }
      });
    });
  }

  // Filter and display sites based on search
  function filterSites(searchTerm) {
    const filteredSites = searchTerm
      ? currentSites.filter(([url, time, title, isMedia]) =>
          url.toLowerCase().includes(searchTerm.toLowerCase()) ||
          title.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : currentSites;

    displaySites(filteredSites);
  }

  // Display sites in the list
  function displaySites(sites) {
    siteList.innerHTML = "";

    if (sites.length === 0) {
      const emptyMessage = document.createElement("li");
      emptyMessage.className = "empty-message";
      emptyMessage.textContent = searchInput.value
        ? "No matching sites found"
        : "No data for this date";
      siteList.appendChild(emptyMessage);
    } else {
      // [url, time, title, isMedia]
      sites.forEach(([url, time, title, isMedia]) => {
        const li = document.createElement("li");
        const minutes = Math.floor(time / 60);
        const seconds = Math.round(time % 60);
        const timeText =
          minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        // Show title if available, otherwise show URL
        const displayText = title || url;
        const mediaIcon = isMedia ? "▶ " : "";
        li.innerHTML = `
          <span class="site-name" title="${url}">${mediaIcon}${displayText}</span>
          <span class="time-spent">${timeText}</span>
        `;
        siteList.appendChild(li);
      });
    }
  }

  // Load data and populate UI
  function loadData() {
    chrome.storage.local.get(["visits", "mediaSessions"], (result) => {
      const visits = result.visits || [];
      const mediaSessions = result.mediaSessions || [];
      const selectedDate = dateSelect.value;

      // Filter visits for selected date
      const dayVisits = visits.filter(v => getDateStr(v.start) === selectedDate);
      const dayMedia = mediaSessions.filter(m => getDateStr(m.start) === selectedDate);

      // Aggregate visits by URL
      const aggregated = {};
      dayVisits.forEach(v => {
        const duration = (v.end - v.start) / 1000;
        if (!aggregated[v.url]) {
          aggregated[v.url] = { time: 0, title: v.title, isMedia: false };
        }
        aggregated[v.url].time += duration;
        if (v.title) aggregated[v.url].title = v.title;
      });

      // Aggregate media by URL (separate from visits)
      const mediaAggregated = {};
      dayMedia.forEach(m => {
        const duration = (m.end - m.start) / 1000;
        const key = m.url + "_media";
        if (!mediaAggregated[key]) {
          mediaAggregated[key] = { time: 0, title: m.title, isMedia: true, url: m.url };
        }
        mediaAggregated[key].time += duration;
        if (m.title) mediaAggregated[key].title = m.title;
      });

      // Convert to array format: [url, time, title, isMedia]
      const visitSites = Object.entries(aggregated)
        .map(([url, data]) => [url, data.time, data.title, false]);
      const mediaSites = Object.values(mediaAggregated)
        .map(data => [data.url, data.time, data.title, true]);

      currentSites = [...visitSites, ...mediaSites]
        .sort((a, b) => b[1] - a[1]);

      // Apply current search filter
      filterSites(searchInput.value);
    });
  }

  // Export to CSV with timestamps
  exportBtn.addEventListener("click", () => {
    chrome.storage.local.get(["visits", "mediaSessions"], (result) => {
      const visits = result.visits || [];
      const mediaSessions = result.mediaSessions || [];
      let csv = "Type,URL,Title,Start,End\n";

      // Combine and sort by start time
      const allEvents = [
        ...visits.map(v => ({ ...v, type: "visit" })),
        ...mediaSessions.map(m => ({ ...m, type: "media" }))
      ].sort((a, b) => a.start - b.start);

      for (const event of allEvents) {
        // Escape quotes in title and URL for CSV
        const escapedUrl = event.url.includes(",") || event.url.includes('"')
          ? `"${event.url.replace(/"/g, '""')}"` : event.url;
        const escapedTitle = event.title.includes(",") || event.title.includes('"')
          ? `"${event.title.replace(/"/g, '""')}"` : event.title;
        csv += `${event.type},${escapedUrl},${escapedTitle},${event.start},${event.end}\n`;
      }

      const blob = new Blob([csv], { type: "text/csv" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `time_tracker_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    });
  });

  // Handle retention days change
  retentionDays.addEventListener("change", () => {
    const days = parseInt(retentionDays.value, 10);
    if (days >= 1 && days <= 365) {
      chrome.runtime.sendMessage(
        {
          type: "updateRetentionDays",
          days: days,
        },
        () => {
          console.log("Updated retention days to:", days);
        }
      );
    }
  });

  // Handle search input
  searchInput.addEventListener("input", (e) => {
    filterSites(e.target.value);
  });

  // Initial load
  populateDateSelect();
  loadData();
  updateStorageUsage();

  // Reload data when date changes
  dateSelect.addEventListener("change", loadData);

  // Update storage usage periodically
  setInterval(updateStorageUsage, 5000);
});
