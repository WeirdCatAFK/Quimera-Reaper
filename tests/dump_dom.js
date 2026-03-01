const browserManager = require("../src/browser");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

async function dumpDom() {
    console.log("--- DOM DIAGNOSTIC START ---");
    const url = "https://music.youtube.com/browse/MPREb_tZC7e1H5mfm"; // One of the albums from your logs
    const page = await browserManager.newPage();

    try {
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: "networkidle2" });
        await new Promise(r => setTimeout(r, 5000)); // Wait for full render

        const data = await page.evaluate(() => {
            const header = document.querySelector("ytmusic-responsive-header-renderer");
            const items = Array.from(document.querySelectorAll("ytmusic-responsive-list-item-renderer")).slice(0, 3);
            
            return {
                headerHtml: header?.outerHTML,
                rows: items.map(item => ({
                    html: item.outerHTML,
                    texts: Array.from(item.querySelectorAll("yt-formatted-string")).map(s => s.innerText),
                    links: Array.from(item.querySelectorAll("a")).map(a => ({ text: a.innerText, href: a.href }))
                }))
            };
        });

        fs.writeFileSync("dom_dump.json", JSON.stringify(data, null, 2));
        console.log("SUCCESS: DOM structure saved to dom_dump.json");

    } catch (err) {
        console.error("FAILED:", err.message);
    } finally {
        await browserManager.close();
    }
}

dumpDom();
