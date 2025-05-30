document.addEventListener("DOMContentLoaded", () => {
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

  // Populate date selector with available dates
  function populateDateSelect() {
    chrome.storage.local.get(["timeData"], (result) => {
      const timeData = result.timeData || {};
      const dates = Object.keys(timeData).sort().reverse();

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
      ? currentSites.filter(([site]) =>
          site.toLowerCase().includes(searchTerm.toLowerCase())
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
      sites.forEach(([site, time]) => {
        const li = document.createElement("li");
        const minutes = Math.floor(time / 60);
        const seconds = Math.round(time % 60);
        const timeText =
          minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        li.innerHTML = `
          <span class="site-name">${site}</span>
          <span class="time-spent">${timeText}</span>
        `;
        siteList.appendChild(li);
      });
    }
  }

  // Load data and populate UI
  function loadData() {
    chrome.storage.local.get(["timeData"], (result) => {
      const timeData = result.timeData || {};
      const selectedDate = dateSelect.value;
      const data = timeData[selectedDate] || {};

      // Store current sites and sort them
      currentSites = Object.entries(data).sort((a, b) => b[1] - a[1]);

      // Apply current search filter
      filterSites(searchInput.value);
    });
  }

  // Export to CSV with date range selection
  exportBtn.addEventListener("click", () => {
    chrome.storage.local.get(["timeData"], (result) => {
      const timeData = result.timeData || {};
      let csv = "Date,Site,Time (seconds)\n";
      for (const [date, sites] of Object.entries(timeData)) {
        for (const [site, time] of Object.entries(sites)) {
          csv += `${date},${site},${Math.round(time)}\n`;
        }
      }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `time_tracker_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
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
