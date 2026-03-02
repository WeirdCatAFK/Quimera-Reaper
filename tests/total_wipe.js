const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const targets = [
    "music_library",
    "logs",
    "sync_history.json",
    "reap_queue.json",
    "subscriptions.json",
    "settings.json",
    "temp_cookies.txt",
    "yt-dlp.exe",
    "yt-dlp",
    "tests/output"
];

console.log("--- EXECUTING TOTAL DATA WIPE ---");

targets.forEach(target => {
    const fullPath = path.join(root, target);
    if (fs.existsSync(fullPath)) {
        try {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                // For directories, try to empty them first to avoid some lock issues
                const files = fs.readdirSync(fullPath);
                for (const file of files) {
                    try {
                        fs.rmSync(path.join(fullPath, file), { recursive: true, force: true });
                    } catch (e) {
                        console.warn(`Could not delete inner file ${file}: ${e.message}`);
                    }
                }
                // Finally remove the dir itself if it's not music_library (keep root dir structure)
                if (target !== "music_library" && target !== "logs") {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                }
                console.log(`PURGED DIR: ${target}`);
            } else {
                fs.unlinkSync(fullPath);
                console.log(`DELETED FILE: ${target}`);
            }
        } catch (err) {
            console.error(`FAILED TO DELETE ${target}: ${err.message}`);
        }
    }
});

console.log("\nSystem purged. Ready for fresh deployment.");
