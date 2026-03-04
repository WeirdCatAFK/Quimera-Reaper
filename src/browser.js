const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const logger = require("./logger");

puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor() {
    this.browser = null;
  }

  get userDataDir() {
    if (process.env.USER_DATA_DIR) return path.resolve(process.env.USER_DATA_DIR);
    
    // On Linux, try to use the actual system Brave profile first for higher reputation
    if (process.platform === "linux") {
        const homeDir = require("os").homedir();
        const systemBravePath = path.join(homeDir, ".config/BraveSoftware/Brave-Browser");
        if (fs.existsSync(systemBravePath)) return systemBravePath;
    }

    // Fallback to local bot profile
    return path.join(__dirname, "..", "bot_profile");
  }

  async init() {
    const isWindows = process.platform === "win32";
    const useBrave = process.env.USE_CHROMIUM !== "true";
    const profile = process.env.BRAVE_PROFILE || "Default";
    const isHeadless = process.env.HEADLESS === "true";
    const useProfile = process.env.NO_PROFILE !== "true" && useBrave;
    
    const activeUserDataDir = this.userDataDir;

    logger.info(`[OS: ${process.platform.toUpperCase()}] Init Browser...`);
    
    const extensionPath = path.join(__dirname, "..", "node_modules", "puppeteer-stream", "extension");
    const launchArgs = [
        "--no-sandbox", 
        "--disable-setuid-sandbox", 
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800",
        `--load-extension=${extensionPath}`,
        `--disable-extensions-except=${extensionPath}`,
        "--whitelisted-extension-id=jjndjgheafjngoipoacpjgeicjeomjli",
        "--password-store=basic"
    ];

    if (isHeadless) launchArgs.push("--headless=old");
    if (useProfile) {
        launchArgs.push(`--profile-directory=${profile}`);
    }

    let executablePath = process.env.BROWSER_EXECUTABLE_PATH;
    if (useBrave && !executablePath) {
        if (!isWindows) executablePath = "/usr/bin/brave-browser";
        else throw new Error("BROWSER_EXECUTABLE_PATH not found in .env");
    }

    logger.info(`Executable: ${executablePath}`);
    if (useProfile) logger.info(`DataDir: ${activeUserDataDir} | Profile: ${profile}`);

    this.browser = await puppeteer.launch({
      executablePath,
      userDataDir: useProfile ? activeUserDataDir : undefined,
      headless: isHeadless ? "old" : false, 
      defaultViewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: launchArgs,
      timeout: 180000, 
      protocolTimeout: 180000 
    });

    // Re-implement puppeteer-stream's internal extension wait with a MUCH longer timeout
    try {
        logger.info("Waiting for streaming extension to stabilize...");
        const extensionTarget = await this.browser.waitForTarget(
            (target) => target.type() === "background_page" &&
            target.url() === "chrome-extension://jjndjgheafjngoipoacpjgeicjeomjli/_generated_background_page.html",
            { timeout: 180000 } // 3 minutes instead of the default 30s
        );
        
        if (extensionTarget) {
            const videoCaptureExtension = await extensionTarget.page();
            if (videoCaptureExtension) {
                this.browser.videoCaptureExtension = videoCaptureExtension;
                // Basic mock for the extension functions if needed
                await videoCaptureExtension.exposeFunction("sendData", () => {});
                await videoCaptureExtension.exposeFunction("log", (...args) => logger.info(`[Ext Log] ${args.join(" ")}`));
                logger.success("Streaming extension linked.");
            }
        }
    } catch (e) {
        logger.warn("Extension target not found in time, but proceeding with browser...");
    }

    logger.info("Browser process established.");
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
        logger.error(`Cookie Export Failed: ${err.message}`);
        throw err;
    } finally {
        if (page) await page.close();
    }
  }

  async newPage() {
    if (!this.browser) await this.init();
    const page = await this.browser.newPage();
    
    // Manual Session Injection
    const isWindows = process.platform === "win32";
    const useProfile = process.env.NO_PROFILE !== "true";
    
    if (!isWindows && useProfile) {
        try {
            // We'll use a safer approach: navigate once then set cookies
            // or use the Netscape export format to set them if possible.
            // For now, let's stick to the clean launch. 
            // If the user is logged into the system browser, 
            // the bridge directory /home/weirdcat/.quimera_reaper_profile
            // should have been fresh.
        } catch (e) {}
    }

    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    return page;
  }

  async close() { if (this.browser) { await this.browser.close(); this.browser = null; } }
}

module.exports = new BrowserManager();
