const harvester = require("../src/harvester");
const state = require("../src/state");
const processor = require("../src/processor");
const browserManager = require("../src/browser");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

async function runTest() {
    console.log("--- MODULAR HARVEST INTEGRITY TEST ---");
    
    // Ensure headless is false for visual debug if needed, 
    // but default to .env for the test.
    
    const testSong = {
        id: "https://music.youtube.com/watch?v=S3kTUULBAt0",
        title: "Test Harvest",
        artist: "Quimera Reaper",
        url: "https://music.youtube.com/watch?v=S3kTUULBAt0" 
    };

    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    
    const outputPath = path.join(outputDir, "modular_test.mp3");
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    try {
        await harvester.ensureBinary();
        
        const cookiePath = path.join(__dirname, "../temp_cookies.txt");
        console.log("Syncing session credentials...");
        const cookies = await browserManager.getNetscapeCookies();
        fs.writeFileSync(cookiePath, cookies);

        console.log(`Starting harvest for: ${testSong.title}`);
        await harvester.harvest(testSong, outputPath, cookiePath);
        
        console.log("Processing and tagging...");
        await processor.process(testSong, outputPath);

        console.log("SUCCESS: Modular harvest complete.");
        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);

    } catch (err) {
        console.error("\n--- TEST FAILED ---");
        console.error(err.message);
        process.exit(1);
    } finally {
        await browserManager.close();
    }
}

runTest();
