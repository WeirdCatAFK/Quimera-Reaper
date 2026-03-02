const browserManager = require("../src/browser");
require("dotenv").config();

async function testLaunch() {
    console.log("--- BROWSER LAUNCH DIAGNOSTIC ---");
    console.log(`Executable: ${process.env.BROWSER_EXECUTABLE_PATH}`);
    console.log(`Headless: ${process.env.HEADLESS}`);
    
    try {
        const browser = await browserManager.init();
        console.log("SUCCESS: Browser initialized successfully.");
        
        const page = await browser.newPage();
        await page.goto("https://music.youtube.com", { waitUntil: "networkidle2" });
        const title = await page.title();
        console.log(`SUCCESS: Page loaded. Title: ${title}`);
        
        await browserManager.close();
        console.log("SUCCESS: Browser closed cleanly.");
        process.exit(0);
    } catch (err) {
        console.error("\n--- LAUNCH FAILED ---");
        console.error(err.message || err);
        process.exit(1);
    }
}

testLaunch();
