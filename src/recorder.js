const YTDlpWrap = require("yt-dlp-wrap").default;
const ffmpeg = require("fluent-ffmpeg");
const browserManager = require("./browser");
const settingsManager = require("./settings");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const ytDlp = new YTDlpWrap(path.join(__dirname, "../yt-dlp.exe"));

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

class Recorder {
  async recordSong(song, outputPath, logger = console.log, agent) {
    logger(`Harvesting: ${song.title}`, "info");

    const cookiePath = path.join(__dirname, "../temp_cookies.txt");

    try {
      const settings = settingsManager.get();
      const bitrate = settings.audioBitrate || 192;
      
      // 1. Export cookies from Puppeteer session
      logger("Syncing session credentials...", "sync");
      const cookieData = await browserManager.getNetscapeCookies();
      fs.writeFileSync(cookiePath, cookieData);

      logger(`Initializing YT-DLP Engine...`, "sync");
      ytDlp.setBinaryPath(path.join(__dirname, "../yt-dlp.exe"));

      // 2. Download via YT-DLP with exported cookies
      await ytDlp.execPromise([
        song.url,
        "-x", 
        "--audio-format", "mp3",
        "--audio-quality", `${bitrate}k`,
        "--cookies", cookiePath,
        "-o", outputPath,
        "--no-playlist",
        "--ffmpeg-location", process.env.FFMPEG_PATH || "ffmpeg",
        "--no-warnings"
      ]);

      // 3. Verify result
      logger(`Verifying file integrity...`, "info");
      await this.verifyAudio(outputPath);

      const finalStats = fs.statSync(outputPath);
      logger(`Harvest Complete: ${song.title}`, "success");
      logger(`Saved to: ${outputPath} (${Math.round(finalStats.size/1024/1024 * 100)/100} MB)`, "info");

    } catch (error) {
      logger(`Harvest Failed [${song.title}]: ${error.message}`, "error");
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw error;
    } finally {
        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
    }
  }

  async verifyAudio(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(new Error(`Corrupt audio file: ${err.message}`));
        else {
          const hasAudio = metadata.streams.some(s => s.codec_type === 'audio');
          if (!hasAudio) reject(new Error("File contains no audio streams."));
          else resolve();
        }
      });
    });
  }
}

module.exports = new Recorder();
