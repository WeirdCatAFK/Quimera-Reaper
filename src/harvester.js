const YTDlpWrap = require("yt-dlp-wrap").default;
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const settingsManager = require("./settings");
const logger = require("./logger");
require("dotenv").config();

const ytDlp = new YTDlpWrap();

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

class Harvester {
  constructor() {}

  get binaryName() {
    return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  }

  get binaryPath() {
    return path.join(__dirname, "..", this.binaryName);
  }

  async ensureBinary() {
    if (!fs.existsSync(this.binaryPath)) {
        logger.info(`YT-DLP Engine missing. Downloading ${process.platform} components...`);
        await YTDlpWrap.downloadFromGithub(this.binaryPath);
        if (process.platform !== "win32") {
            fs.chmodSync(this.binaryPath, "755");
        }
        logger.success("Core components ready.");
    }
    ytDlp.setBinaryPath(this.binaryPath);
  }

  async harvest(song, outputPath, cookiePath) {
    const settings = settingsManager.get();
    const bitrate = settings.audioBitrate || 192;

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
