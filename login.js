const browserManager = require("./src/browser");
require("dotenv").config();

async function runLogin() {
    console.log("--- QUIMERA REAPER: MANUAL LOGIN ---");
    console.log("1. A browser window will open shortly.");
    console.log("2. Please log in to YouTube Music.");
    console.log("3. You have 10 minutes. When finished, simply close the browser window.");
    console.log("--------------------------------------
");

    // Force windowed mode and ensure profile is used
    process.env.HEADLESS = "false";
    process.env.NO_PROFILE = "false";

    try {
        const browser = await browserManager.init();
        const page = (await browser.pages())[0] || await browser.newPage();
        
        await page.goto("https://music.youtube.com", { waitUntil: "networkidle2" });
        console.log("Navigated to YouTube Music. Waiting for you to log in...");

        // Wait for 10 minutes or until the browser is disconnected (user closes it)
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log("
10 minutes elapsed. Closing browser...");
                resolve();
            }, 10 * 60 * 1000); // 10 minutes

            browser.on('disconnected', () => {
                console.log("
Browser closed by user. Login session saved.");
                clearTimeout(timeout);
                resolve();
            });
        });

    } catch (err) {
        console.error("
Error during login session:", err.message);
    } finally {
        console.log("Login process finished.");
        process.exit(0);
    }
}

runLogin();
