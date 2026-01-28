# Time Tracker

Browser extension that tracks time spent on URLs. Captures full URLs and page titles.

## Install

1. Clone repo
2. Go to `chrome://extensions/` (or `brave://extensions/`)
3. Enable "Developer mode"
4. "Load unpacked" → select this directory

## Usage

Extension runs in background. Click popup to view stats. Export to CSV.

### CSV Export

Format: `Date,URL,Title,Time (seconds)`

```
2026-01-28,https://github.com/user/repo/issues/57,"Fix bug · Issue #57",45
2026-01-28,https://www.youtube.com/watch?v=abc123,"Video Title - YouTube",120
```

### Dashboard

Open `time-tracker-dashboard.html` in browser. Drag & drop exported CSV for visualizations.

## Storage Format

```javascript
{
  "2026-01-28": {
    "https://github.com/user/repo": {
      "time": 120,
      "title": "user/repo - GitHub"
    }
  }
}
```

Legacy format (hostname only, no title) still supported for migration.

## Files

- `background.js` - Tracking logic, runs every 1s
- `popup.js` - UI, search, export
- `time-tracker-dashboard.html` - Standalone viz tool (Chart.js)

## Config

- **Retention**: Default 30 days, configurable in popup
- **Storage quota**: 5MB limit, auto-cleanup when near

## APIs

Chrome Extension Manifest V3: `tabs`, `storage`, `activeTab`

## Events

- `tabs.onActivated` - Tab switch
- `tabs.onUpdated` - URL change
- `windows.onFocusChanged` - Browser focus/blur
