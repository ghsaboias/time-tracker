# Time Tracker

Read `README.md` first — it is the source of truth for the storage shape, CSV
format, and tracking semantics. Keep it updated when you change either.

## Gotchas

- **Tracking is in `content.js`, not the service worker.** `background.js` only
  does the hourly auto-export and retention cleanup. Don't move tracking back
  into the worker — it was moved out in `4ba0e07` because MV3 kills the worker.
- **One visit = many rows.** The 30s checkpoint splits long visits, so anything
  that reports "time on site" must sum `end - start` across rows per URL.
  See `loadData()` in `popup.js` for the reference aggregation.
- **Two CSV writers must stay in sync**: `autoExportCSV()` in `background.js` and
  the export handler in `popup.js` duplicate the same serialization logic. Change
  one, change both — downstream consumers assume identical output.
- **Media tracking is gone on purpose** (`d87e708`). Don't reintroduce it without
  solving the reliability problem that killed it.
- **The auto-export must never use `readAsDataURL`.** MV3 service workers have no
  `URL.createObjectURL`, so the obvious workaround is a `data:` URL — but that
  inlines the entire CSV as base64 into the download URL, and Chromium persists
  every download record (URL included) in `Default/shared_proto_db`. At 24
  exports/day of a multi-MB CSV that DB hit 1.5GB and OOM-crashed the browser
  process ~20s into startup, every launch. `background.js` now routes the CSV
  through `offscreen.html`/`offscreen.js` to get a real blob URL, so the stored
  record is 93 bytes. `popup.js` was never affected — page contexts can call
  `createObjectURL` directly.
  - Canary if it ever regresses: `du -sh "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/Default/shared_proto_db"`.
    Healthy is single-digit MB.

## Downstream consumers

Exports overwrite `~/Downloads/time_tracker_latest.csv`. Hourly,
`~/bin/sync_browser_activity.sh` (cron at :30) appends its new rows to
`~/Documents/browser-activity/time_tracker_archive.csv` via
`tools/append_archive.py` and rsyncs the archive to `pi:~/browser-activity/`.
Changing the CSV header or column order breaks `append_archive.py`, which
refuses unknown headers. Don't go back to dated filenames: one 30-day snapshot
per day is what grew `~/Downloads` to 1.1 GB of repeated rows.

- **The sync log is `/tmp/browser-activity-sync.log`**, written by the script
  itself. The crontab also redirects to `/tmp/sync-browser.log`, but that file
  stays 0 bytes because the script redirects everything internally — don't debug
  against it.
- **The archive CSV is the only record past 30 days.** `MAX_DAYS_TO_KEEP = 30`
  prunes `chrome.storage`, and the popup and dashboard both read from storage,
  not the CSVs. If the cron stops for more than 30 days, rows are lost. Nothing on the Pi consumes `~/browser-activity` — it is purely the
  offsite copy. Don't prune it as "cache".
