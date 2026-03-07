const NodeID3 = require("node-id3");
const path = require("path");
const fs = require("fs");
const https = require("https");
require("dotenv").config();

class Processor {
  constructor() {
    this.outputDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
  }

  async process(song, tempFilePath) {
    const tags = {
      title: song.title,
      artist: song.artist,
      album: song.album,
      performerInfo: song.albumArtist,
      year: song.year,
      trackNumber: song.trackNumber ? String(song.trackNumber) : undefined,
      unsynchronisedLyrics: {
          language: "eng",
          text: song.lyrics || ""
      }
    };

    let imageBuffer = null;
    if (song.artwork) {
        try {
            imageBuffer = await this.downloadImage(song.artwork);
            tags.image = {
                mime: "image/jpeg",
                type: { id: 3, name: "front cover" },
                description: "Album Art",
                imageBuffer: imageBuffer
            };
        } catch (err) {}
    }

    NodeID3.write(tags, tempFilePath);

    const finalPath = this.getFinalPath(song);
    const finalDir = path.dirname(finalPath);

    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

    if (imageBuffer && !fs.existsSync(path.join(finalDir, "cover.jpg"))) {
        fs.writeFileSync(path.join(finalDir, "cover.jpg"), imageBuffer);
    }

    fs.renameSync(tempFilePath, finalPath);
    return finalPath;
  }

  createPlaceholder(song) {
    const finalPath = this.getFinalPath(song);
    const finalDir = path.dirname(finalPath);
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
    
    fs.writeFileSync(finalPath, Buffer.alloc(0)); 
    const tags = { title: song.title, artist: song.artist, album: song.album };
    NodeID3.write(tags, finalPath);
    return finalPath;
  }

  downloadImage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
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

    let trackNumStr = "";
    if (song.trackNumber) {
        trackNumStr = String(song.trackNumber).padStart(2, "0") + " - ";
    }

    const albumFolderName = song.year ? `${sanitizedAlbum} (${song.year})` : sanitizedAlbum;
    const songFileName = `${trackNumStr}${sanitizedTitle}.mp3`;

    return path.join(this.outputDir, sanitizedArtist, albumFolderName, songFileName);
  }
  sanitize(str) {
    if (!str) return "Unknown";
    return str.replace(/[\r\n\t]/g, " ").replace(/[<>:"/\\|?*]/g, "_").trim().replace(/\s+/g, " ");
  }
}

module.exports = new Processor();
