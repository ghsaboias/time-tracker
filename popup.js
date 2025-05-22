document.addEventListener("DOMContentLoaded", () => {
  const dateSelect = document.getElementById("dateSelect");
  const siteList = document.getElementById("siteList");
  const exportBtn = document.getElementById("exportBtn");
  const ctx = document.getElementById("timeChart").getContext("2d");

  // Load data and populate UI
  function loadData() {
    chrome.storage.local.get(["timeData"], (result) => {
      const timeData = result.timeData || {};
      const today = new Date().toISOString().split("T")[0];
      const data = timeData[today] || {};

      // Populate site list
      siteList.innerHTML = "";
      const sortedSites = Object.entries(data).sort((a, b) => b[1] - a[1]);
      sortedSites.forEach(([site, time]) => {
        const li = document.createElement("li");
        li.textContent = `${site}: ${Math.round(time / 60)}m ${Math.round(
          time % 60
        )}s`;
        siteList.appendChild(li);
      });

      // Render chart
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: sortedSites.map(([site]) => site),
          datasets: [
            {
              label: "Time Spent (minutes)",
              data: sortedSites.map(([, time]) => time / 60),
              backgroundColor: "rgba(75, 192, 192, 0.5)",
            },
          ],
        },
        options: {
          scales: {
            y: { beginAtZero: true },
          },
        },
      });
    });
  }

  // Export to CSV
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
      a.download = "time_tracker.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Initial load
  loadData();

  // Reload data when date changes
  dateSelect.addEventListener("change", loadData);
});
