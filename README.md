# Quimera Reaper 🎵

A YouTube Music to MusicBee sync tool that replicates your library folder structure and harvests high-quality recordings.

## Features
- **Library Mirroring:** Instantly replicates your YTM Likes and Albums as tagged placeholders for MusicBee.
- **High-Quality Harvesting:** Records audio in real-time, bypassing direct download detection.
- **Smart Metadata:** Automatically embeds high-resolution album covers and tags (ID3v2).
- **Ad & Volume Management:** Detects and skips ads, and forces 100% internal volume for consistent recordings.
- **Dashboard Console:** Modern dark-themed control panel with real-time logging and queue management.

## Prerequisites

### 1. FFmpeg (MANDATORY)
The agent requires FFmpeg to convert recordings to MP3 and verify file integrity.
- **Windows:** `winget install "FFmpeg (Essentials Build)"`
- **macOS:** `brew install ffmpeg`
- **Linux:** `sudo apt install ffmpeg`
*Note: Restart your terminal after installation.*

### 2. Brave/Chrome Browser
A Chromium-based browser is required. We recommend Brave for its built-in ad-blocking.

## Setup
1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and set:
   - `BROWSER_EXECUTABLE_PATH`: Path to your browser's `.exe`.
   - `BRAVE_PROFILE`: Your profile name (e.g., `Default` or `Profile 1`).
   - `MUSIC_OUTPUT_DIR`: Where your library should be saved.

3. **Start the Agent:**
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser.

## How to Harvest
1. **Mirror:** Select your targets (Likes/Albums) and click **Mirror Library**. This creates the folders and placeholders.
2. **Record:** Click **Start Recording** to begin filling those placeholders with real audio.
3. **Enjoy:** Once a song logs as `Harvest Complete`, it is a fully tagged, playable MP3 in your library.

## Project Structure
- `music_library/`: Your harvested music.
- `logs/`: Detailed session logs for debugging.
- `user_data/`: (Optional) Local browser session data.
- `sync_history.json`: Tracks mirrored/reaped status.
