# Quimera Reaper Agent 🐉🌸

An autonomous music harvesting agent that mirrors your YouTube Music library to a local folder structured for MusicBee.

## 🚀 Key Features
- **Proxy Harvesting:** Uses `yt-dlp` with browser-cookie injection for 100% reliable, high-quality audio capture.
- **Library Mirroring:** Instantly creates tagged placeholders so MusicBee sees your library immediately.
- **Smart Metadata:** Automatically embeds high-resolution covers (600x600) and full ID3v2 tags.
- **Stealth Mode:** Mimics human listening behavior with random delays and session caps.
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

---

## 📦 Installation

1. **Clone & Install:**
   ```bash
   npm install
   2. **Configure Environment:**
      Copy `.env.example` to `.env` and fill in:
      - `BROWSER_EXECUTABLE_PATH`: Usually `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`
      - `BRAVE_PROFILE`: Check `brave://version`. If your profile isn't "Default", put the name here (e.g., `Profile 1`).
      - `HEADLESS`: Set to `true` for background operation (Server) or `false` for visible windows (Desktop).
      - `FFMPEG_PATH`: The agent will try to find it, but you can set the absolute path to `ffmpeg.exe` if it fails.

   ---

   ## 🛠️ Server vs Desktop Mode

   ### Desktop Mode (`HEADLESS=false`)
   Recommended for initial setup and logging in. You can see the browser open, handle CAPTCHAs, and verify that YouTube Music is logged into your account.

   ### Server Mode (`HEADLESS=true`)
   Recommended for long-term background operation on servers (Debian, Ubuntu, etc.). The agent will launch Brave in a special "silent" engine (`--headless=old`) that requires no physical display or window manager. Ensure all other Brave instances using the same profile are closed to avoid database locks.

   ---

   ## 🚜 The Harvesting Workflow
   Run the agent once:
   ```bash
   npm start
   ```
   Open `http://localhost:3000`. If you need to log in or handle a captcha, ensure no other Brave windows are open, and the agent will use your existing system profile. You can also manually open Brave, log into YouTube Music, and then close it before starting the agent.

---

## 🚜 The Harvesting Workflow

1. **Mirror Library:** Select your targets (Likes/Albums) and click **Mirror Library**.
   - This creates the folders and 0-byte MP3 "placeholders."
   - MusicBee can now see your entire library structure.
2. **Start Recording:** Click **Start Recording**.
   - The agent will process the "Pending Records" queue one by one.
   - It exports cookies from your browser to authenticate the download.
   - It overwrites placeholders with real, high-quality MP3s.
3. **Resetting:** If you delete your music folder or want a fresh start, click **"Wipe Memory"** to clear the sync history.

---

## 📁 Project Structure
- `music_library/`: Your final collection.
- `logs/`: Detailed session logs for debugging.
- `settings.json`: Persisted dashboard preferences.
- `sync_history.json`: Database of mirrored/harvested tracks.

---

## 🔐 System Architecture
Technical details regarding browser integration and session persistence can be found in `TRUESESSION.md` for those who might be interested.
