# ADHD Time Tracker Chrome Extension

A Chrome extension designed to help users with ADHD track and manage their time spent on different websites. The extension runs in the background and automatically tracks active tab usage, providing insights into browsing patterns.

## Technical Overview

- **Manifest Version**: 3
- **Chrome APIs Used**:
  - `tabs`
  - `storage`
  - `activeTab`

## Features

- Real-time website tracking
- Per-domain time tracking
- Daily usage statistics
- Background tracking with browser focus awareness
- Persistent storage of tracking data

## Architecture

### Background Service Worker (`background.js`)

- Implements core tracking logic
- Handles tab activation and focus events
- Manages time calculations and storage updates
- Updates tracking data every second

### Popup Interface (`popup.html`, `popup.js`)

- Provides user interface for viewing statistics
- Displays tracked time data
- Implements data visualization

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

## Technical Details

### Storage Format

Time data is stored in Chrome's local storage using the following structure:

```javascript
{
  "YYYY-MM-DD": {
    "domain.com": timeInSeconds,
    // ... other domains
  }
  // ... other dates
}
```

### Event Handling

- `tabs.onActivated`: Tracks tab switches
- `tabs.onUpdated`: Monitors URL changes
- `windows.onFocusChanged`: Handles browser focus state

### Performance Considerations

- Uses efficient time tracking with second precision
- Implements error handling for tab access
- Maintains data persistence across browser sessions

## Dependencies

No external dependencies required. The extension uses native Chrome Extension APIs.

## Browser Compatibility

- Chrome/Chromium-based browsers
- Manifest V3 compatible
