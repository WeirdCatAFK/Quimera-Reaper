# True User Session Architecture

This project utilizes a **True User Session** strategy to maintain high-fidelity access to YouTube Music. Unlike standard automation scripts that use temporary or "clean" browser profiles, this agent integrates directly with the user's existing system browser session.

### Core Concept
The agent inherits the user's actual system profile (specifically Brave or Chrome) using `userDataDir` and `executablePath`. This allows the harvester to bypass complex login flows and inherit the user's existing ad-blocking settings, site permissions, and browsing history.

### Implementation Guidelines
1. **Stealth Integration:** Leverages `puppeteer-extra` with the `stealth` plugin to minimize automation detection and ensure site compatibility.
2. **Automation Bypass:** Specifically passes `ignoreDefaultArgs: ["--enable-automation"]` to prevent the browser from triggering the "Controlled by automated software" flag.
3. **Profile Targeting:** Uses the `--profile-directory` argument to target specific system profiles (defaulting to "Default"), ensuring the correct credentials are used.
4. **Cookie Bridging:** For high-performance harvesting, the agent uses `browserManager.getNetscapeCookies()` to export the active session's cookies into a Netscape-formatted file. This allows the `yt-dlp` engine to perform authenticated downloads exactly as if the user were clicking "Download."
5. **Database Synchronization:** Note that because the agent uses the live system profile, the browser must be closed during intensive harvesting tasks to prevent SQLite database locks on the user profile.
