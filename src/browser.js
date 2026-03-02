const { launch } = require("puppeteer-stream");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
require("dotenv").config();
const path = require("path");

// Use the stealth plugin
puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor() {
    this.browser = null;
    this.executablePath = process.env.BROWSER_EXECUTABLE_PATH;
    this.userDataDir = path.resolve(process.env.USER_DATA_DIR || "C:\\Users\\Pined\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data");
  }

  async init() {
    if (!this.executablePath) {
      throw new Error("BROWSER_EXECUTABLE_PATH not found in .env");
    }

    const useBrave = process.env.USE_CHROMIUM !== "true";
    const profile = process.env.BRAVE_PROFILE || "Default";
    const useProfile = process.env.NO_PROFILE !== "true" && useBrave;
    const isHeadless = process.env.HEADLESS === "true";

    console.log(`Launching ${useBrave ? 'Brave' : 'Chromium'} (Stealth Mode)`);
    console.log(`State: ${isHeadless ? 'HEADLESS (Background)' : 'WINDOWED (Visible)'}`);
    
    const launchArgs = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1280,800",
        "--disable-infobars",
        "--disable-blink-features=AutomationControlled",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--allow-http-screen-capture",
        "--no-user-gesture-required",
        "--disable-features=AudioServiceOutOfProcess",
        // Linux/Server background flags
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        "--no-first-run",
        "--no-default-browser-check",
        "--password-store=basic"
    ];

    if (isHeadless) {
        launchArgs.push("--headless=old"); // The most stable headless engine
    }

    if (useProfile) {
        launchArgs.push(`--profile-directory=${profile}`);
        launchArgs.push("--restore-last-session");
    }

    const launchOptions = {
      launcher: puppeteer, 
      userDataDir: useProfile ? this.userDataDir : undefined,
      headless: isHeadless ? "old" : false, 
      defaultViewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: launchArgs,
      protocolTimeout: 60000
    };

    if (useBrave) {
        if (!this.executablePath) throw new Error("BROWSER_EXECUTABLE_PATH not found in .env");
        launchOptions.executablePath = this.executablePath;
    }

    this.browser = await launch(launchOptions);

    console.log("Browser session active.");
    return this.browser;
  }

  async getNetscapeCookies() {
    const page = await this.newPage();
    const cookies = await page.cookies();
    await page.close();

    let netscape = "# Netscape HTTP Cookie File\n";
    for (const cookie of cookies) {
        const domain = cookie.domain.startsWith(".") ? cookie.domain : "." + cookie.domain;
        const hostOnly = cookie.domain.startsWith(".") ? "FALSE" : "TRUE";
        const path = cookie.path;
        const secure = cookie.secure ? "TRUE" : "FALSE";
        const expires = cookie.expires ? Math.floor(cookie.expires) : 0;
        const name = cookie.name;
        const value = cookie.value;
        netscape += `${domain}\t${hostOnly}\t${path}\t${secure}\t${expires}\t${name}\t${value}\n`;
    }
    return netscape;
  }

  async newPage() {
    if (!this.browser) await this.init();
    const page = await this.browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    return page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new BrowserManager();
