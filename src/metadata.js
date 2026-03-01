const NodeID3 = require("node-id3");
const path = require("path");
const fs = require("fs");
const https = require("https");
require("dotenv").config();

class MetadataManager {
  constructor() {
    this.outputDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
  }

  async tagAndOrganize(song, tempFilePath) {
    const trackNum = song.trackNumber ? String(song.trackNumber).padStart(2, "0") : "00";
    
    const tags = {
      title: song.title,
      artist: song.artist,
      album: song.album,
      performerInfo: song.albumArtist, // Album Artist tag
      year: song.year,
      trackNumber: song.trackNumber ? String(song.trackNumber) : undefined,
      unsynchronisedLyrics: {
          language: "eng",
          text: song.lyrics || ""
      }
    };

    let imageBuffer = null;

    // Download artwork if available
    if (song.artwork) {
        try {
            console.log(`Downloading artwork for ${song.title}...`);
            imageBuffer = await this.downloadImage(song.artwork);
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

    // Save cover.jpg in the album folder if it doesn't exist
    if (imageBuffer && !fs.existsSync(path.join(finalDir, "cover.jpg"))) {
        fs.writeFileSync(path.join(finalDir, "cover.jpg"), imageBuffer);
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
    const sanitizedArtist = this.sanitize(song.albumArtist || song.artist);
    const sanitizedAlbum = this.sanitize(song.album);
    const trackNum = song.trackNumber ? String(song.trackNumber).padStart(2, "0") : "00";
    
    // Format: Artist / Album (Year) / 01 - Title.mp3
    const albumFolderName = song.year ? `${sanitizedAlbum} (${song.year})` : sanitizedAlbum;
    const songFileName = `${trackNum} - ${sanitizedTitle}.mp3`;

    return path.join(this.outputDir, sanitizedArtist, albumFolderName, songFileName);
  }

  sanitize(str) {
    if (!str) return "Unknown";
    return str
      .replace(/[\r\n\t]/g, " ")
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim()
      .replace(/\s+/g, " ");
  }
}

module.exports = new MetadataManager();
