# Time Tracker

Brave/Chrome extension (Manifest V3) that records how long you spend on each URL,
as timestamped visit intervals. Captures full URLs and page titles.

## Install

1. Clone repo
2. Go to `chrome://extensions/` (or `brave://extensions/`)
3. Enable "Developer mode"
4. "Load unpacked" → select this directory

## Usage

Runs in the background. Click the popup to see per-URL totals for a selected day,
search, and export. Data also auto-exports hourly (see below).

## Storage Format

Single `chrome.storage.local` key, `visits`, holding a flat array of intervals:

```javascript
{
  "visits": [
    {
      "url": "https://github.com/user/repo",
      "title": "user/repo - GitHub",
      "start": 1782684581701,   // epoch ms
      "end": 1782684584969      // epoch ms
    }
  ]
}
```

There is no per-date nesting and no precomputed duration — duration is
`end - start`. Aggregating time per URL means summing intervals, because a
single continuous visit is written as **multiple rows** (see checkpoints below).

## Tracking Semantics

Tracking lives in `content.js` (per-tab), not the service worker — a dead service
worker doesn't stop tracking. A visit accrues only while:

```javascript
document.visibilityState === 'visible' && windowFocused
```

So tracking pauses both on tab switch *and* when the browser loses focus to
another app. It resumes on refocus as a **new** interval.

- **Visits under 1s are discarded** entirely.
- **30s checkpoints**: a long visit is flushed and restarted every 30 seconds, so
  a 5-minute read becomes ~10 contiguous rows. Consecutive rows share a boundary
  timestamp (`end` of one == `start` of the next).
- `beforeunload` flushes the open interval.
- `chrome://` and `chrome-extension://` pages can't be tracked (content scripts
  are not allowed there).

> **No media tracking.** An earlier version tried to keep counting while audio or
> video played in an unfocused tab. It was unreliable and was removed in
> `d87e708`. Background playback is **not** captured — if the tab isn't focused
> and visible, nothing accrues.

## CSV Export

Both the popup button and the hourly auto-export write the same format, sorted by
`start` ascending:

```
URL,Title,Start,End
https://digg.com/tech,Tech News · Digg,1782684581701,1782684584969
https://digg.com/tech,Tech News · Digg,1782684584969,1782684614969
```

Timestamps are raw epoch milliseconds (not dates). URL and title are quoted only
when they contain a comma or a double quote, with `"` escaped as `""`.

Auto-export runs on a `chrome.alarms` alarm named `autoExport`, every 60 minutes,
to `~/Downloads/time_tracker_latest.csv` with `conflictAction: 'overwrite'`. The
file is a snapshot of everything in storage (the last 30 days), so it stays a
few MB and never accumulates.

### Archive

`~/Documents/browser-activity/time_tracker_archive.csv` is the permanent record:
every row ever exported, once, in the same CSV format. `~/bin/sync_browser_activity.sh`
(cron at :30) runs `tools/append_archive.py` to append the rows of
`time_tracker_latest.csv` that the archive doesn't have yet, then rsyncs the
archive to `pi:~/browser-activity/`. Rows never change after they are written,
so a row is a duplicate when all four fields match.

Each append is sorted by `start`, but rows that arrive late (another tab's
checkpoint flushed after an export) land after later ones, so sort before
relying on order. The archive was seeded on 2026-11-16 from the 298 daily
`time_tracker_2026-*.csv` files the old export wrote. Two quirks from January
2026 builds: early files had a leading `Type` column (`media` rows were
dropped), and 418 rows have `End` = `[object Object]` (bug fixed in `1039dcd`).

### Dashboard

Open `time-tracker-dashboard.html` in a browser and drag-drop an exported CSV.
Standalone, uses Chart.js.

## Files

- `content.js` — all visit tracking; injected into every tab
- `background.js` — service worker; only hourly auto-export + retention cleanup
- `popup.js` — UI, per-day aggregation, search, manual export
- `time-tracker-dashboard.html` — standalone viz tool

## Config

- **Retention**: default 30 days, configurable in the popup (1–365). Persisted as
  `retentionDays`; cleanup drops visits with `start` older than the cutoff.
- **Storage quota**: 5MB; popup shows percentage used.

## Permissions

`tabs`, `storage`, `activeTab`, `alarms`, `downloads`, `scripting`,
plus `<all_urls>` host permissions.
