const { launch } = require("puppeteer-stream");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();
const path = require("path");
const fs = require("fs");

puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor() {
    this.browser = null;
  }

  get userDataDir() {
    if (process.env.USER_DATA_DIR) return path.resolve(process.env.USER_DATA_DIR);
    if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA || "", "BraveSoftware", "Brave-Browser", "User Data");
    } else {
        return path.join(process.env.HOME || "", ".config", "BraveSoftware", "Brave-Browser");
    }
  }

  async init() {
    const isWindows = process.platform === "win32";
    const useBrave = process.env.USE_CHROMIUM !== "true";
    const profile = process.env.BRAVE_PROFILE || "Default";
    const isHeadless = process.env.HEADLESS === "true";
    const useProfile = process.env.NO_PROFILE !== "true" && useBrave;
    
    let activeUserDataDir = this.userDataDir;

    // --- FLAWLESS SESSION BRIDGING ---
    // We NEVER use the user's real profile directory in Puppeteer.
    // This prevents profile locks and prevents Puppeteer from erasing cookies.
    if (useProfile) {
        const tempProfile = path.join(process.env.HOME || process.env.LOCALAPPDATA || "", ".quimera_reaper_profile");
        if (!fs.existsSync(tempProfile)) fs.mkdirSync(tempProfile, { recursive: true });
        
        // 1. Copy 'Local State' (CRITICAL for Cookie Decryption on Linux/Windows)
        const srcLocalState = path.join(activeUserDataDir, "Local State");
        const dstLocalState = path.join(tempProfile, "Local State");
        if (fs.existsSync(srcLocalState)) {
            try { fs.cpSync(srcLocalState, dstLocalState); } catch(e) {}
        }

        // 2. Copy Profile Data
        const sourceDefault = path.join(activeUserDataDir, profile);
        const targetDefault = path.join(tempProfile, profile);
        if (!fs.existsSync(targetDefault)) fs.mkdirSync(targetDefault, { recursive: true });

        const essentials = ["Cookies", "Network", "Local Storage", "Web Data"];
        essentials.forEach(file => {
            const src = path.join(sourceDefault, file);
            const dst = path.join(targetDefault, file);
            try {
                if (fs.existsSync(src)) {
                    if (fs.existsSync(dst)) {
                        try { fs.rmSync(dst, { recursive: true, force: true }); } catch(e) {}
                    }
                    fs.cpSync(src, dst, { recursive: true });
                }
            } catch (e) {}
        });
        
        activeUserDataDir = tempProfile;
        console.log(`[BRIDGE] Isolated Profile Active.`);
    }

    console.log(`[OS: ${process.platform.toUpperCase()}] Init Browser...`);
    
    const launchArgs = [
        "--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required",
        "--window-size=1280,800", "--disable-infobars", "--disable-blink-features=AutomationControlled",
        "--enable-features=NetworkService,NetworkServiceInProcess", "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream", "--allow-http-screen-capture", "--no-user-gesture-required",
        "--disable-features=AudioServiceOutOfProcess", "--disable-gpu", "--disable-dev-shm-usage",
        "--disable-software-rasterizer", "--remote-debugging-port=9222", 
        "--disable-session-crashed-bubble", "--disable-breakpad"
    ];

    if (isHeadless) launchArgs.push(isWindows ? "--headless=old" : "--headless=new");
    if (useProfile) {
        launchArgs.push(`--profile-directory=${profile}`);
    }

    let executablePath = process.env.BROWSER_EXECUTABLE_PATH;
    if (useBrave && !executablePath) {
        if (!isWindows) executablePath = "/usr/bin/brave-browser";
        else throw new Error("BROWSER_EXECUTABLE_PATH not found in .env");
    }

    console.log(`Executable: ${executablePath}`);
    if (useProfile) console.log(`DataDir: ${activeUserDataDir} | Profile: ${profile}`);

    this.browser = await launch({
      launcher: puppeteer, 
      executablePath,
      userDataDir: useProfile ? activeUserDataDir : undefined,
      headless: isHeadless ? (isWindows ? "old" : "new") : false, 
      defaultViewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: launchArgs,
      protocolTimeout: 180000
    });

    console.log("Browser process established.");
    return this.browser;
  }

  async getNetscapeCookies() {
    let page;
    try {
        if (!this.browser) await this.init();
        page = await this.browser.newPage();
        const cookies = await page.cookies();
        let netscape = "# Netscape HTTP Cookie File\n";
        for (const cookie of cookies) {
            const domain = cookie.domain.startsWith(".") ? cookie.domain : "." + cookie.domain;
            const hostOnly = cookie.domain.startsWith(".") ? "FALSE" : "TRUE";
            const secure = cookie.secure ? "TRUE" : "FALSE";
            const expires = cookie.expires ? Math.floor(cookie.expires) : 0;
            netscape += `${domain}\t${hostOnly}\t${cookie.path}\t${secure}\t${expires}\t${cookie.name}\t${cookie.value}\n`;
        }
        return netscape;
    } catch (err) {
        console.error(`Cookie Export Failed: ${err.message}`);
        throw err;
    } finally {
        if (page) await page.close();
    }
  }

  async newPage() {
    if (!this.browser) await this.init();
    const page = await this.browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    return page;
  }

  async close() { if (this.browser) { await this.browser.close(); this.browser = null; } }
}

module.exports = new BrowserManager();
