const recorder = require("../src/recorder");
const browserManager = require("../src/browser");
const path = require("path");
const fs = require("fs");
const YTDlpWrap = require("yt-dlp-wrap").default;
require("dotenv").config();

async function runTest() {
    console.log("--- STARTING HARVEST INTEGRITY TEST ---");
    
    // Ensure yt-dlp binary is present
    const binaryPath = path.join(__dirname, "../yt-dlp.exe");
    if (!fs.existsSync(binaryPath)) {
        console.log("Downloading yt-dlp binary...");
        await YTDlpWrap.downloadFromGithub(binaryPath);
    }

    const testSong = {
        title: "Test Harvest",
        artist: "Quimera Reaper",
        url: "https://music.youtube.com/watch?v=S3kTUULBAt0" 
    };

    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    
    const outputPath = path.join(outputDir, "test_result.mp3");
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    console.log(`Target: ${testSong.title} by ${testSong.artist}`);
    console.log(`Output Path: ${outputPath}`);

    try {
        await recorder.recordSong(testSong, outputPath, (msg, type) => {
            console.log(`[${type?.toUpperCase() || 'INFO'}] ${msg}`);
        }, { isReaping: true }); 

        console.log("\n--- VERIFYING RESULTS ---");
        
        if (!fs.existsSync(outputPath)) {
            throw new Error("FAIL: Final MP3 file was not created.");
        }

        const stats = fs.statSync(outputPath);
        console.log(`SUCCESS: File created. Size: ${Math.round(stats.size/1024)} KB`);

        if (stats.size < 50000) { 
            throw new Error(`FAIL: File size is unexpectedly small (${stats.size} bytes).`);
        }

        console.log("SUCCESS: Integrity check passed.");
        console.log("--- TEST COMPLETE ---");

    } catch (err) {
        console.error("\n--- TEST FAILED ---");
        console.error(err.message);
        process.exit(1);
    } finally {
        await browserManager.close();
    }
}

runTest();
