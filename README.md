# Quimera Reaper Agent 🐉🌸

An autonomous music harvesting agent that mirrors your YouTube Music library to a local folder structured for MusicBee.

## 🚀 Key Features
- **Proxy Harvesting:** Uses `yt-dlp` with browser-cookie injection for 100% reliable, high-quality audio capture.
- **Library Mirroring:** Instantly creates tagged placeholders so MusicBee sees your library immediately.
- **Smart Metadata:** Automatically embeds absolute maximum resolution covers and full ID3v2 tags.
- **Autonomous Crons:** Automatically mirrors weekly and reaps hourly during daytime hours.
- **Cloudflare-Safe Exports:** Zip your entire library directly from the dashboard using background write streams to bypass reverse-proxy timeouts.
- **Modern Dashboard:** High-contrast console for real-time monitoring and control.

---

## 🛠️ Prerequisites

### 1. FFmpeg (MANDATORY)
The agent uses FFmpeg for audio conversion and integrity verification.
- **Windows (PowerShell as Admin):**
  ```powershell
  winget install "FFmpeg (Essentials Build)"
  ```
  *Note: You MUST restart your terminal after this command.*
- **Verify:** Run `ffmpeg -version` in a new terminal.

### 2. Brave or Chrome Browser
A Chromium-based browser is required. We highly recommend **Brave** for its native ad-blocking which helps keep the harvest clean.

#### 🐧 Linux (Debian/Ubuntu) Dependencies
If running on a Linux server, you must install the following libraries for the headless browser to function:
```bash
sudo apt-get update
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libpangocairo-1.0-0
```

---

## 📦 Installation & Setup

1. **Clone & Install:**
   ```bash
   git clone https://github.com/WeirdCatAFK/Quimera-Reaper.git
   cd Quimera-Reaper
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env`. Critical variables:
   - `BROWSER_EXECUTABLE_PATH`: Path to your Brave browser (e.g., `/usr/bin/brave-browser` or `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`).
   - `CRON_REAP`: Custom cron schedule for background recording (Default: `0 8-22 * * *` - Hourly from 8am to 10pm).
   - `CRON_MIRROR`: Custom cron schedule for library syncing (Default: `0 2 * * 0` - 2 AM every Sunday).

---

## 🔑 Authentication (The Bot Profile)

To ensure maximum stability and prevent Linux Keyrings from wiping your cookies, Quimera Reaper uses a dedicated `bot_profile` folder located inside the project directory. It does not touch your main desktop profile.

**You must authenticate this profile once before starting the agent:**

1. If you are on a Linux server, ensure your terminal has display access (or run this via VNC/local desktop):
   ```bash
   npm run login
   ```
2. A Brave window will open. Navigate to YouTube Music and log in.
3. You have 10 minutes. Once you are logged in and see your library, simply **close the browser window**.
4. The agent is now permanently authenticated.

---

## 🚜 The Harvesting Workflow

1. **Start the Server:**
   ```bash
   npm start
   ```
2. Open `http://localhost:3000` (or your server's IP) in your browser.
3. **Mirror Library:** Select your targets (Likes/Albums) and click **Mirror Library**.
   - This creates the folders and 0-byte MP3 "placeholders."
4. **Record Queue:** Click **Record Queue**.
   - The agent will process the pending tracks in batches (configurable in the UI parameters).
   - It will automatically pause and resume based on the background cron schedule.
5. **Export ZIP:** Click **Export ZIP** to pack your finished music library into a single, downloadable archive. The server builds this via a local write stream, making it immune to Cloudflare/Nginx proxy timeouts.
6. **Factory Reset:** If you delete your music folder or want a fresh start, click **Factory Reset** to completely purge the queue, history, and library directories.

---

## 📁 Project Structure
- `music_library/`: Your final collection.
- `bot_profile/`: The isolated browser database used by the agent.
- `logs/`: Detailed session logs for debugging.
- `settings.json`: Persisted dashboard preferences.
- `sync_history.json`: Database of mirrored/harvested tracks.
- `subscriptions.json`: Queue of tracks waiting to be recorded.

---

## 🔐 System Architecture
Technical details regarding browser integration and session persistence can be found in `TRUESESSION.md`.
