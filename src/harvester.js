const YTDlpWrap = require("yt-dlp-wrap").default;
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const ytDlp = new YTDlpWrap();

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

class Harvester {
  constructor() {
    this.binaryPath = path.join(__dirname, "..", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  }

  async ensureBinary(logger = console.log) {
    if (!fs.existsSync(this.binaryPath)) {
        logger("YT-DLP Engine missing. Downloading core components...", "info");
        await YTDlpWrap.downloadFromGithub(this.binaryPath);
        if (process.platform !== "win32") fs.chmodSync(this.binaryPath, "755");
        logger("Core components ready.", "success");
    }
    ytDlp.setBinaryPath(this.binaryPath);
  }

  async harvest(song, outputPath, cookiePath, logger = console.log) {
    const bitrate = 192; // Default or from settings

    await ytDlp.execPromise([
      song.url, "-x", "--audio-format", "mp3", "--audio-quality", `${bitrate}k`,
      "--cookies", cookiePath, "-o", outputPath, "--no-playlist",
      "--ffmpeg-location", process.env.FFMPEG_PATH || "ffmpeg", "--no-warnings"
    ]);

    await this.verify(outputPath);
  }

  async verify(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(new Error(`Corrupt file: ${err.message}`));
        else if (!metadata.streams.some(s => s.codec_type === 'audio')) reject(new Error("No audio stream."));
        else resolve();
      });
    });
  }
}

module.exports = new Harvester();
