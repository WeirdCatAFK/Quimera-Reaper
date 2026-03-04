const browserManager = require("./src/browser");
const logger = require("./src/logger");
require("dotenv").config();

async function runLogin() {
    logger.info("--- QUIMERA REAPER: MANUAL LOGIN ---");
    logger.info("1. A browser window will open shortly.");
    logger.info("2. Please log in to YouTube Music.");
    logger.info("3. You have 10 minutes. When finished, simply close the browser window.");
    logger.info("--------------------------------------\n");

    // Force windowed mode and ensure profile is used
    process.env.HEADLESS = "false";
    process.env.NO_PROFILE = "false";
    
    // CRITICAL for Linux: If running windowed, it MUST have a display.
    if (process.platform !== "win32" && !process.env.DISPLAY) {
        process.env.DISPLAY = ":0";
    }

    try {
        const browser = await browserManager.init();

        // Use the existing page or a new one to avoid detection
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();

        await page.bringToFront();

        logger.info("Navigating to YouTube Music...");
        await page.goto("https://music.youtube.com", { waitUntil: "networkidle2", timeout: 60000 });
        logger.info("Waiting for you to log in...");
        // Wait for 10 minutes or until the browser is disconnected (user closes it)
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                logger.info("\n10 minutes elapsed. Closing browser...");
                resolve();
            }, 10 * 60 * 1000); // 10 minutes

            browser.on('disconnected', () => {
                logger.success("\nBrowser closed by user. Login session saved.");
                clearTimeout(timeout);
                resolve();
            });
        });

    } catch (err) {
        logger.error(`\nError during login session: ${err.message}`);
    } finally {
        logger.info("Login process finished.");
        process.exit(0);
    }
}

runLogin();