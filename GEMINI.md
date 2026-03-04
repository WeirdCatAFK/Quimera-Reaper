# GEMINI.md - Quimera Reaper Agent

## 🐉 Project Overview
**Quimera Reaper** is an autonomous music harvesting agent designed to mirror a YouTube Music library to a local file system, specifically structured for **MusicBee**. It operates through a dual-phase process: **Mirroring** (creating metadata-rich placeholders) and **Reaping** (downloading high-quality audio and embedding metadata).

### Core Technologies
- **Runtime:** Node.js (Express, Socket.io for the dashboard)
- **Browser Automation:** Puppeteer with `puppeteer-extra-plugin-stealth` and `puppeteer-stream`.
- **Audio Capture:** `yt-dlp` (wrapped via `yt-dlp-wrap`) with browser-cookie injection.
- **Audio Processing:** `fluent-ffmpeg` for verification and format handling.
- **Metadata:** `node-id3` for ID3v2 tagging, including high-res (600x600) covers and lyrics.
- **Scheduling:** `node-cron` for automated periodic library scans and reaping.

---

## 🛠️ Building and Running

### Environment Configuration
The project relies on a `.env` file. Essential variables include:
- `BROWSER_EXECUTABLE_PATH`: Path to Brave or Chrome executable.
- `BRAVE_PROFILE`: Target browser profile (default: `Default`).
- `HEADLESS`: `true` for server/background mode, `false` for desktop/interactive mode.
- `FFMPEG_PATH`: Path to the FFmpeg binary.
- `MUSIC_OUTPUT_DIR`: Directory where the music library will be harvested.

### Key Commands
- `npm start` / `npm run dev`: Launches the Reaper agent and the web dashboard (default: `http://localhost:3000`).
- `npm test`: Executes a harvesting test to verify `yt-dlp` and `ffmpeg` integration.
- `npm run test:browser`: Verifies the Puppeteer/Brave profile connection.
- `npm run wipe`: Resets the sync history and reaper queue (caution: destructive).

---

## 🏗️ System Architecture & Conventions

### 1. "True User Session" Strategy
Located in `src/browser.js`, this core concept allows the agent to inherit the user's actual browser profile.
- **Mandate:** Always use `browserManager.newPage()` to ensure stealth settings and profile inheritance are applied.
- **Cookie Bridging:** Uses `browserManager.getNetscapeCookies()` to export active sessions for `yt-dlp` authentication.

### 2. The Harvesting Pipeline
- **Scraper (`src/scraper.js`):** Navigates YouTube Music to extract track metadata (title, artist, album, year, artwork URL, lyrics).
- **Actions (`src/actions.js`):** Coordinates the high-level workflow. `mirrorLibrary` creates 0-byte placeholders via the `processor`, while `reapQueue` handles the actual downloads.
- **Processor (`src/processor.js`):** Handles filesystem sanitization, directory structure (`Artist/Album (Year)/Track - Title.mp3`), and ID3 tagging.
- **Harvester (`src/harvester.js`):** Manages the `yt-dlp` binary and executes the proxy-based recording.

### 3. State & Persistence
- `sync_history.json`: Tracks all discovered and processed URLs.
- `reap_queue.json`: Persistent queue of tracks waiting to be harvested.
- `subscriptions.json`: Tracks library sections to be monitored.

### 4. Development Standards
- **Logging:** Use `agent.log(message, type)` to ensure logs are visible in the terminal, saved to session files, and broadcasted to the dashboard.
- **Error Handling:** Always close browser pages in `finally` blocks to prevent memory leaks and zombie processes.
- **Stealth:** Avoid modifying `launchArgs` in `src/browser.js` unless addressing specific detection issues; the current flags are tuned for bypass.

---

## 📁 Key Directories
- `src/`: Core logic and managers.
- `public/`: Dashboard frontend (HTML/CSS/JS).
- `music_library/`: Default output for harvested music.
- `bot_profile/`: Local isolated browser profile (used if system profile targeting is disabled).
- `tests/`: Specialized diagnostic and maintenance scripts.
