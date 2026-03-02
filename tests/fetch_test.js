const scraper = require("../src/scraper");
const browserManager = require("../src/browser");
require("dotenv").config();

async function testFetch() {
    console.log("--- SCRAPER FETCH TEST ---");
    // Use a simpler library URL that is more likely to load
    const targetUrl = "https://music.youtube.com/explore/new_releases"; 
    
    try {
        console.log(`Fetching: ${targetUrl}`);
        // Modify scraper to handle non-playlist pages briefly for the test
        const songs = await scraper.getPlaylistSongs(targetUrl);
        
        if (songs && songs.length > 0) {
            console.log(`SUCCESS: Scraped ${songs.length} tracks.`);
            console.log("Sample Metadata:", JSON.stringify(songs[0], null, 2));
            console.log("--- TEST PASSED ---");
        } else {
            throw new Error("No songs found in playlist.");
        }
    } catch (err) {
        console.error("\n--- TEST FAILED ---");
        console.error(err.message);
        process.exit(1);
    } finally {
        await browserManager.close();
    }
}

testFetch();
