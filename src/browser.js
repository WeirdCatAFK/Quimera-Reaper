const { launch } = require("puppeteer-stream");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();
const path = require("path");

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
    
    let userDataDir = this.userDataDir;

    // --- SESSION BRIDGING (Linux Only) ---
    // Create a conflict-free profile by linking essential auth data
    if (!isWindows && useProfile) {
        const tempProfile = path.join(process.env.HOME || "", ".quimera_reaper_profile");
        if (!fs.existsSync(tempProfile)) fs.mkdirSync(tempProfile, { recursive: true });
        
        const sourceDefault = path.join(userDataDir, profile);
        const targetDefault = path.join(tempProfile, profile);
        if (!fs.existsSync(targetDefault)) fs.mkdirSync(targetDefault, { recursive: true });

        // Essential files for Auth
        const essentials = ["Cookies", "Network", "Local Storage", "Extension State"];
        essentials.forEach(file => {
            const src = path.join(sourceDefault, file);
            const dst = path.join(targetDefault, file);
            try {
                if (fs.existsSync(src)) {
                    if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
                    // On Linux, a symlink is the best way to bypass locks while keeping live cookies
                    fs.symlinkSync(src, dst);
                }
            } catch (e) {
                // Fallback to copy if symlink fails
                try { fs.cpSync(src, dst, { recursive: true }); } catch(err) {}
            }
        });
        userDataDir = tempProfile;
        console.log(`[BRIDGE] Using isolated profile at: ${userDataDir}`);
    }
    // --------------------------------------

    console.log(`[OS: ${process.platform.toUpperCase()}] Init Browser...`);
    
    const launchArgs = [
        "--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required",
        "--window-size=1280,800", "--disable-infobars", "--disable-blink-features=AutomationControlled",
        "--enable-features=NetworkService,NetworkServiceInProcess", "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream", "--allow-http-screen-capture", "--no-user-gesture-required",
        "--disable-features=AudioServiceOutOfProcess", "--disable-gpu", "--disable-dev-shm-usage",
        "--disable-software-rasterizer", "--no-first-run", "--no-default-browser-check", "--password-store=basic",
        "--remote-debugging-port=9222", "--disable-session-crashed-bubble", "--disable-breakpad"
    ];

    if (isHeadless) launchArgs.push(isWindows ? "--headless=old" : "--headless=new");
    if (useProfile) {
        launchArgs.push(`--profile-directory=${profile}`);
        launchArgs.push("--restore-last-session");
    }

    let executablePath = process.env.BROWSER_EXECUTABLE_PATH;
    if (useBrave && !executablePath) {
        if (!isWindows) executablePath = "/usr/bin/brave-browser";
        else throw new Error("BROWSER_EXECUTABLE_PATH not found in .env");
    }

    console.log(`Executable: ${executablePath}`);
    if (useProfile) console.log(`DataDir: ${userDataDir} | Profile: ${profile}`);

    this.browser = await launch({
      launcher: puppeteer, 
      executablePath,
      userDataDir: useProfile ? userDataDir : undefined,
      headless: isHeadless ? (isWindows ? "old" : "new") : false, 
      defaultViewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: launchArgs,
      protocolTimeout: 180000 // 3 minute extreme timeout
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
