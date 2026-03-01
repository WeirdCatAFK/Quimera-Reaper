# Quimera Reaper 🎵

A YouTube Music to MusicBee sync tool that simulates a natural listening session to record and organize your library.

## Features
- **Real-time Recording:** Uses `puppeteer-stream` to capture audio as it plays, avoiding direct download detection.
- **MusicBee Ready:** Automatically tags files (ID3v2) and organizes them into an `{Artist}/{Album}/{Title}.mp3` structure.
- **Natural Simulation:** Adds random delays between songs and limits session size to mimic human behavior.
- **Session Persistence:** Saves your browser profile so you only need to log into YouTube Music once.

## Prerequisites
1. **Node.js:** v16 or higher.
2. **FFmpeg:** Must be installed and added to your system's PATH.
3. **Chrome/Edge/Brave:** A Chromium-based browser.

## Setup
1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and fill in your details:
   - `BROWSER_EXECUTABLE_PATH`: Path to your browser's `.exe` (e.g., `C:\Program Files\Google\Chrome\Application\chrome.exe`).
   - `MUSIC_OUTPUT_DIR`: Where you want your MusicBee library to live.

3. **Initial Login:**
   Run the tool once with any URL. The browser will open in **non-headless** mode. Log into your YouTube Music account. Your session will be saved in the `./user_data` folder for future use.

## Usage
Run the script followed by a YouTube Music playlist or album URL:
```bash
node src/index.js "https://music.youtube.com/playlist?list=..."
```

## How it Works
1. **Scraper:** Navigates to the playlist and extracts song metadata.
2. **Recorder:** Navigates to each song, starts a live audio stream, and monitors the player until the song ends.
3. **Processor:** Uses FFmpeg to convert the stream to MP3 and `node-id3` to apply metadata.
4. **Organizer:** Moves the file to your library folder using the template defined in your `.env`.

## MusicBee Formatting
- **Tags:** ID3v2 (Title, Artist, Album).
- **Structure:** `Music_Library/Artist/Album/Song.mp3`.
- **Sync History:** Tracked in `sync_history.json` to prevent re-recording songs you already have.
