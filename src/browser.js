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
    this.userDataDir = path.resolve(process.env.USER_DATA_DIR || "./user_data");
  }

  async init() {
    if (!this.executablePath) {
      throw new Error("BROWSER_EXECUTABLE_PATH not found in .env");
    }

    const profile = process.env.BRAVE_PROFILE || "Default";
    console.log(`Launching Brave (Stealth Mode)`);
    console.log(`Profile Path: ${this.userDataDir}`);
    console.log(`Profile Name: ${profile}`);
    
    this.browser = await launch({
      launcher: puppeteer, 
      executablePath: this.executablePath,
      userDataDir: this.userDataDir,
      headless: false, 
      defaultViewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1280,800",
        "--disable-infobars",
        "--disable-blink-features=AutomationControlled",
        `--profile-directory=${profile}`,
        "--restore-last-session",
        "--enable-features=NetworkService,NetworkServiceInProcess"
      ],
    });

    console.log("Browser session active.");
    return this.browser;
  }

  async newPage() {
    if (!this.browser) await this.init();
    const page = await this.browser.newPage();
    
    // Use a very common, non-automated user agent
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
