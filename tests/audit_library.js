const fs = require("fs");
const path = require("path");

function audit() {
    const root = path.join(__dirname, "../music_library");
    console.log(`--- LIBRARY AUDIT START: ${root} ---`);
    
    if (!fs.existsSync(root)) {
        console.error("Library folder does not exist.");
        return;
    }

    const report = {
        totalFiles: 0,
        unknownArtist: 0,
        unknownAlbum: 0,
        misnested: 0, 
        folders: []
    };

    function scan(dir) {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                scan(fullPath);
            } else if (item.endsWith(".mp3")) {
                report.totalFiles++;
                const relative = path.relative(root, fullPath);
                const parts = relative.split(path.sep); 
                
                const artist = parts[0];
                const album = parts[1];

                if (artist === "Unknown Artist") report.unknownArtist++;
                if (album === "Unknown Album") report.unknownAlbum++;
                if (artist === album) report.misnested++;
            }
        });
    }

    scan(root);

    console.log("\n--- AUDIT SUMMARY ---");
    console.log(`Total Files: ${report.totalFiles}`);
    console.log(`Unknown Artists: ${report.unknownArtist}`);
    console.log(`Unknown Albums: ${report.unknownAlbum}`);
    console.log(`Misnested (Artist == Album): ${report.misnested}`);
    console.log("----------------------\n");

    if (report.unknownArtist > 0 || report.unknownAlbum > 0) {
        console.log("CRITICAL: Scraper is still missing data.");
    } else {
        console.log("SUCCESS: Folder structure looks healthy.");
    }
}

audit();
