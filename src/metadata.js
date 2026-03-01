const NodeID3 = require("node-id3");
const path = require("path");
const fs = require("fs");
const https = require("https");
require("dotenv").config();

class MetadataManager {
  constructor() {
    this.outputDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
    this.structureTemplate = process.env.FOLDER_STRUCTURE || "{artist}/{album}/{title}.mp3";
  }

  async tagAndOrganize(song, tempFilePath) {
    const tags = {
      title: song.title,
      artist: song.artist,
      album: song.album,
    };

    // Download artwork if available
    if (song.artwork) {
        try {
            console.log(`Downloading artwork for ${song.title}...`);
            const imageBuffer = await this.downloadImage(song.artwork);
            tags.image = {
                mime: "image/jpeg",
                type: { id: 3, name: "front cover" },
                description: "Album Art",
                imageBuffer: imageBuffer
            };
        } catch (err) {
            console.warn(`Failed to download artwork: ${err.message}`);
        }
    }

    console.log(`Tagging song: ${song.title}`);
    const success = NodeID3.write(tags, tempFilePath);
    if (!success) {
      console.warn(`Failed to write tags to ${tempFilePath}`);
    }

    const finalPath = this.getFinalPath(song);
    const finalDir = path.dirname(finalPath);

    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    fs.renameSync(tempFilePath, finalPath);
    console.log(`Organized song into: ${finalPath}`);
    return finalPath;
  }

  downloadImage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to get image: ${res.statusCode}`));
                return;
            }
            const data = [];
            res.on("data", (chunk) => data.push(chunk));
            res.on("end", () => resolve(Buffer.concat(data)));
        }).on("error", reject);
    });
  }

  getFinalPath(song) {
    const sanitizedTitle = this.sanitize(song.title);
    const sanitizedArtist = this.sanitize(song.artist);
    const sanitizedAlbum = this.sanitize(song.album);

    let relativePath = this.structureTemplate
      .replace("{artist}", sanitizedArtist)
      .replace("{album}", sanitizedAlbum)
      .replace("{title}", sanitizedTitle);

    return path.join(this.outputDir, relativePath);
  }

  sanitize(str) {
    if (!str) return "Unknown";
    return str
      .replace(/[\r\n\t]/g, " ") // Replace newlines/tabs with space
      .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid filename chars
      .trim()
      .replace(/\s+/g, " "); // Collapse multiple spaces
  }
}

module.exports = new MetadataManager();
