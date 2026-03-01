const { getStream } = require("puppeteer-stream");
const ffmpeg = require("fluent-ffmpeg");
const browserManager = require("./browser");
const settingsManager = require("./settings");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Set absolute paths for FFmpeg/FFprobe if provided in .env
if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

class Recorder {
  async recordSong(song, outputPath, logger = console.log, agent) {
    const page = await browserManager.newPage();
    logger(`Opening: ${song.title}`, "info");

    try {
      await page.goto(song.url, { waitUntil: "networkidle2" });
      await page.bringToFront();
      
      // 1. Wait for player UI
      await page.waitForSelector("ytmusic-player-bar", { timeout: 30000 });
      
      // 2. Start capturing the stream FIRST
      const stream = await getStream(page, {
        audio: true,
        video: false,
        mimeType: "audio/webm",
      });

      const settings = settingsManager.get();
      const bitrate = settings.audioBitrate || 192;
      const tempWebm = path.join(__dirname, `../temp_harvest_${Date.now()}.webm`);
      
      const webmFile = fs.createWriteStream(tempWebm);
      let chunksReceived = 0;

      stream.on("data", () => { chunksReceived++; });
      webmFile.on("error", (err) => logger(`Writer Error: ${err.message}`, "error"));
      stream.on("error", (err) => logger(`Stream Error: ${err.message}`, "error"));

      stream.pipe(webmFile);

      // 3. NOW prepare player and start playback
      logger(`Checking for ads and triggering playback...`, "info");
      await this.preparePlayer(page, logger);
      
      logger(`Harvesting audio to temp storage...`, "sync");

      // 4. Monitor playback until the end
      await this.monitorPlayback(page, logger, agent);

      // 4. Stop stream and clean up
      logger(`Finalizing stream (Chunks captured: ${chunksReceived})...`, "info");
      
      await new Promise((resolve) => {
          stream.unpipe(webmFile);
          webmFile.end();
          webmFile.on("finish", resolve);
          stream.destroy();
      });

      // Release OS lock
      await new Promise(r => setTimeout(r, 1500));

      const stats = fs.existsSync(tempWebm) ? fs.statSync(tempWebm) : null;
      const finalSize = stats ? stats.size : 0;
      logger(`File flushed to disk: ${Math.round(finalSize/1024)} KB`, "info");

      if (finalSize === 0) {
          if (chunksReceived === 0) {
              throw new Error("No audio data received from browser. Check if Brave is muted or blocking audio.");
          }
          throw new Error("Stream finalized but file is empty on disk.");
      }
      
      logger(`Converting to MP3...`, "sync");

      // 5. Convert to MP3
      await this.convertToMp3(tempWebm, outputPath, bitrate);

      // 6. Delete temp file
      if (fs.existsSync(tempWebm)) {
        fs.unlinkSync(tempWebm);
      }

      // 7. Verify result with FFprobe
      logger(`Verifying file integrity...`, "info");
      await this.verifyAudio(outputPath);

      stats = fs.statSync(outputPath);
      logger(`Harvest Complete: ${song.title}`, "success");
      logger(`Saved to: ${outputPath}`, "info");
      logger(`File Size: ${Math.round(stats.size/1024/1024 * 100)/100} MB`, "info");
    } catch (error) {
      logger(`Harvest Failed [${song.title}]: ${error.message}`, "error");
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size < 1000) {
          fs.unlinkSync(outputPath); // Clean up failed tiny files
      }
      throw error;
    } finally {
      await page.close();
    }
  }

  async verifyAudio(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Corrupt audio file: ${err.message}`));
        } else {
          // Check if there's an actual audio stream
          const hasAudio = metadata.streams.some(s => s.codec_type === 'audio');
          if (!hasAudio) {
            reject(new Error("File contains no audio streams."));
          } else {
            resolve();
          }
        }
      });
    });
  }

  async preparePlayer(page, logger) {
    await page.evaluate(async () => {
      // Force volume to 100% internally
      const player = document.getElementById("movie_player") || document.querySelector("ytmusic-player-bar");
      if (player) {
        if (typeof player.setVolume === "function") {
            player.setVolume(100);
            player.unMute();
        }
        // CRITICAL: Attempt to disable autoplay
        // This is a common YTM internal setting
        if (typeof player.setAutonavState === "function") {
            player.setAutonavState(2); // 2 usually means OFF
        }
      }

      // Ensure song is playing
      const playBtn = document.querySelector("#play-pause-button");
      if (playBtn && playBtn.getAttribute("title") === "Play") {
        playBtn.click();
      }
    });

    // ... (Ad Detection Loop)
    let adDetected = true;
    let attempts = 0;
    while (adDetected && attempts < 30) { 
      adDetected = await page.evaluate(() => {
        const ad = document.querySelector(".ad-showing, .ytmusic-ad-interrupt-renderer");
        const skipBtn = document.querySelector(".ytp-ad-skip-button, .ytmusic-skip-ad-button");
        if (skipBtn) skipBtn.click();
        return !!ad;
      });
      if (adDetected) {
        logger("Ad detected. Attempting to skip...", "wait");
        await new Promise(r => setTimeout(r, 2000));
      }
      attempts++;
    }
  }

  async monitorPlayback(page, logger, agent) {
    return new Promise(async (resolve, reject) => {
      let lastCurrent = -1;
      let lastTotal = -1;
      let stalledCount = 0;
      let startTime = Date.now();

      const checkInterval = setInterval(async () => {
        if (agent && !agent.isReaping) {
            clearInterval(checkInterval);
            reject(new Error("Agent stopped by user."));
            return;
        }

        const progress = await page.evaluate(() => {
          const timeInfo = document.querySelector(".time-info")?.innerText; 
          if (!timeInfo || !timeInfo.includes("/")) return null;
          
          const parts = timeInfo.split("/");
          const toSec = (s) => {
              const p = s.trim().split(":");
              if (p.length === 2) return (parseInt(p[0]) * 60) + parseInt(p[1]);
              if (p.length === 3) return (parseInt(p[0]) * 3600) + (parseInt(p[1]) * 60) + parseInt(p[2]);
              return 0;
          };

          return { 
            current: toSec(parts[0]), 
            total: toSec(parts[1]),
            text: timeInfo.trim()
          };
        });

        if (progress) {
          // 1. Check for mid-song ad interruption
          const isAd = await page.evaluate(() => !!document.querySelector(".ad-showing"));
          if (isAd) {
              logger("Mid-song Ad detected. Waiting...", "wait");
              await page.evaluate(() => document.querySelector(".ytp-ad-skip-button")?.click());
              return; 
          }

          // 2. DETECT SONG JUMP (Autoplay safety)
          // If the total duration changed by more than 5 seconds, the song has switched
          if (lastTotal !== -1 && Math.abs(progress.total - lastTotal) > 5) {
              logger(`Detected song transition (${lastTotal}s -> ${progress.total}s). Saving current harvest.`, "info");
              clearInterval(checkInterval);
              resolve();
              return;
          }
          lastTotal = progress.total;

          if (progress.current === lastCurrent && progress.current !== 0) {
            stalledCount++;
          } else {
            stalledCount = 0;
            logger(`Harvesting: ${progress.text}`, "wait");
          }
          lastCurrent = progress.current;

          if (stalledCount > 10) { // 50 seconds of no movement
            clearInterval(checkInterval);
            reject(new Error("Playback stalled."));
          }

          // 3. Normal Completion
          if (progress.total > 10 && progress.current >= progress.total - 1) {
            logger(`Song reached end: ${progress.text}`, "info");
            clearInterval(checkInterval);
            setTimeout(resolve, 1000); 
          }
        }
      }, 5000);
    });
  }

  async convertToMp3(input, output, bitrate) {
    return new Promise((resolve, reject) => {
      ffmpeg(input)
        .audioBitrate(bitrate)
        .toFormat("mp3")
        .save(output)
        .on("end", resolve)
        .on("error", reject);
    });
  }
}

module.exports = new Recorder();
