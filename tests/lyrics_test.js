const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const scraper = require("../src/scraper");
const path = require('path');

(async () => {
    console.log("Launching test browser...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--window-size=1280,800'],
        defaultViewport: { width: 1280, height: 800 }
    });
    
    const page = await browser.newPage();
    
    const testUrl = "https://music.youtube.com/watch?v=CMgkgZRy9N8&list=RDAMVMbnUZ8HcPKsA";
    console.log(`Navigating to ${testUrl}`);
    
    await page.goto(testUrl, { waitUntil: 'networkidle2' });
    
    try {
        const acceptBtns = await page.$$('button');
        for (const btn of acceptBtns) {
            const text = await page.evaluate(el => el.innerText, btn);
            if (text && (text.includes('Accept all') || text.includes('I agree') || text.includes('Aceptar todo'))) {
                await btn.click();
                await page.waitForNavigation({ waitUntil: 'networkidle2' });
                break;
            }
        }
    } catch(e) {}
    
    try {
        await page.waitForSelector('ytmusic-player-bar', { timeout: 10000 });
        // wait for the bottom sheet to load tabs
        await new Promise(r => setTimeout(r, 3000));
    } catch(e) {
        console.log("Player bar didn't load.");
    }

    console.log("\n--- DEBUG INFO ---");
    const tabs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('tp-yt-paper-tab')).map(t => t.innerText.trim());
    });
    console.log("Available Tabs:", tabs);
    
    await page.screenshot({ path: path.join(__dirname, 'debug_lyrics.png') });
    console.log("Screenshot saved to tests/debug_lyrics.png");
    
    console.log("Attempting to extract lyrics...");
    const result = await scraper.getLyricsAndArtwork(page);
    
    console.log("\n--- RESULTS ---");
    console.log("High-Res Artwork Found:", !!result.highResArtwork);
    console.log("Lyrics Found:", result.lyrics.length > 0 ? `Yes (${result.lyrics.length} chars)` : "No");
    
    if (result.lyrics.length > 0) {
        console.log("\nPreview:\n" + result.lyrics.substring(0, 150) + "...\n");
    } else {
        console.log("\nNo lyrics found.");
        // Dump the html of the lyrics section if possible
        const html = await page.evaluate(() => {
            const el = document.querySelector('ytmusic-description-shelf-renderer');
            return el ? el.innerHTML.substring(0, 500) : "ytmusic-description-shelf-renderer not found";
        });
        console.log("Lyrics section HTML preview:", html);
    }
    
    await browser.close();
})();
