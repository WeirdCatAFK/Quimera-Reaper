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
        return path.join(process.env.HOME || "", ".config", "brave-browser");
    }
  }

  async init() {
    const isWindows = process.platform === "win32";
    const useBrave = process.env.USE_CHROMIUM !== "true";
    const profile = process.env.BRAVE_PROFILE || "Default";
    const isHeadless = process.env.HEADLESS === "true";
    const useProfile = process.env.NO_PROFILE !== "true" && useBrave;

    const launchArgs = [
        "--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required",
        "--window-size=1280,800", "--disable-infobars", "--disable-blink-features=AutomationControlled",
        "--enable-features=NetworkService,NetworkServiceInProcess", "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream", "--allow-http-screen-capture", "--no-user-gesture-required",
        "--disable-features=AudioServiceOutOfProcess", "--disable-gpu", "--disable-dev-shm-usage",
        "--disable-software-rasterizer", "--no-first-run", "--no-default-browser-check", "--password-store=basic"
    ];

    if (isHeadless) launchArgs.push("--headless=old");
    if (useProfile) {
        launchArgs.push(`--profile-directory=${profile}`);
        launchArgs.push("--restore-last-session");
    }

    let executablePath = process.env.BROWSER_EXECUTABLE_PATH;
    if (useBrave && !executablePath) {
        if (!isWindows) executablePath = "/usr/bin/brave-browser";
        else throw new Error("BROWSER_EXECUTABLE_PATH not found in .env");
    }

    this.browser = await launch({
      launcher: puppeteer, 
      executablePath,
      userDataDir: useProfile ? this.userDataDir : undefined,
      headless: isHeadless ? "old" : false, 
      defaultViewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: launchArgs,
      protocolTimeout: 60000
    });
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
        netscape += `${domain}\t${hostOnly}\t${path}\t${secure}\t${expires}\t${cookie.name}\t${cookie.value}\n`;
    }
    return netscape;
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
