const harvester = require("../src/harvester");
const browserManager = require("../src/browser");
const processor = require("../src/processor");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

async function runTest() {
    console.log("--- HARVEST PIPELINE TEST ---");
    
    const testSong = {
        id: "https://music.youtube.com/watch?v=S3kTUULBAt0",
        title: "Test Track",
        artist: "Quimera",
        url: "https://music.youtube.com/watch?v=S3kTUULBAt0"
    };

    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    const outputPath = path.join(outputDir, "test_result.mp3");
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    try {
        await harvester.ensureBinary();
        
        console.log("Exporting cookies...");
        const cookies = await browserManager.getNetscapeCookies();
        const cookiePath = path.join(__dirname, "../temp_cookies.txt");
        fs.writeFileSync(cookiePath, cookies);

        console.log("Executing yt-dlp harvest...");
        await harvester.harvest(testSong, outputPath, cookiePath);

        console.log("Running post-processor...");
        await processor.process(testSong, outputPath);

        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`SUCCESS: Harvested file size: ${Math.round(stats.size/1024)} KB`);
        } else {
            throw new Error("Final MP3 not found.");
        }

        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
        console.log("--- TEST PASSED ---");

    } catch (err) {
        console.error("\n--- TEST FAILED ---");
        console.error(err.message);
        process.exit(1);
    } finally {
        await browserManager.close();
    }
}

runTest();
