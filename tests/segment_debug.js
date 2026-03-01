const recorder = require("../src/recorder");
const browserManager = require("../src/browser");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

async function runTest() {
    console.log("--- STARTING NETWORK SEGMENT DEBUG TEST ---");
    
    const testSong = {
        title: "Debug Segment",
        artist: "Quimera",
        url: "https://music.youtube.com/watch?v=S3kTUULBAt0" 
    };

    const debugDir = path.join(__dirname, "debug_segments");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
    
    // Clean old debug files
    fs.readdirSync(debugDir).forEach(f => fs.unlinkSync(path.join(debugDir, f)));

    console.log(`Target: ${testSong.url}`);

    try {
        const page = await browserManager.newPage();
        let segmentCount = 0;

        page.on("response", async (response) => {
            const url = response.url();
            if (url.includes("videoplayback") && url.includes("mime=audio")) {
                try {
                    const buffer = await response.buffer();
                    segmentCount++;
                    const segmentPath = path.join(debugDir, `seg_${segmentCount}.raw`);
                    fs.writeFileSync(segmentPath, buffer);
                    console.log(`[DEBUG] Captured segment ${segmentCount}: ${Math.round(buffer.length/1024)} KB`);
                } catch (e) {}
            }
        });

        await page.goto(testSong.url, { waitUntil: "networkidle2" });
        await page.bringToFront();
        
        console.log("Monitoring playback for 30 seconds to capture segments...");
        await new Promise(r => setTimeout(r, 30000));

        console.log(`
Captured ${segmentCount} segments.`);
        console.log(`Check files in: ${debugDir}`);

    } catch (err) {
        console.error("Test failed:", err.message);
    } finally {
        await browserManager.close();
    }
}

runTest();
