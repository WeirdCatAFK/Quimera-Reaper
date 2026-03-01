const { getStream } = require("puppeteer-stream");
const ffmpeg = require("fluent-ffmpeg");
const browserManager = require("./browser");
const settingsManager = require("./settings");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

class Recorder {
  async recordSong(song, outputPath, logger = console.log, agent) {
    const page = await browserManager.newPage();
    logger(`Opening: ${song.title}`, "info");

    try {
      await page.goto(song.url, { waitUntil: "networkidle2" });
      
      // 1. Wait for player and handle Ads
      await page.waitForSelector("ytmusic-player-bar", { timeout: 30000 });
      
      logger(`Checking for ads and preparing player...`, "info");
      await this.preparePlayer(page, logger);

      // 2. Start capturing the stream
      const stream = await getStream(page, {
        audio: true,
        video: false,
        mimeType: "audio/webm",
      });

      const settings = settingsManager.get();
      const bitrate = settings.audioBitrate || 192;
      const tempWebm = path.join(path.dirname(outputPath), `temp_${Date.now()}.webm`);
      const webmFile = fs.createWriteStream(tempWebm);
      
      stream.pipe(webmFile);
      logger(`Harvesting audio stream...`, "sync");

      // 3. Monitor playback until the end
      await this.monitorPlayback(page, logger, agent);

      // 4. Stop stream and clean up
      stream.destroy();
      webmFile.end();
      
      logger(`Finalizing harvest (${bitrate}kbps)...`, "sync");

      // 5. Convert to MP3
      await this.convertToMp3(tempWebm, outputPath, bitrate);

      // 6. Delete temp file
      if (fs.existsSync(tempWebm)) {
        fs.unlinkSync(tempWebm);
      }

      // 7. Verify result with FFprobe
      logger(`Verifying file integrity...`, "info");
      await this.verifyAudio(outputPath);

      const stats = fs.statSync(outputPath);
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
      if (player && typeof player.setVolume === "function") {
        player.setVolume(100);
        player.unMute();
      }

      // Ensure song is playing
      const playBtn = document.querySelector("#play-pause-button");
      if (playBtn && playBtn.getAttribute("title") === "Play") {
        playBtn.click();
      }
    });

    // Ad Detection Loop
    let adDetected = true;
    while (adDetected) {
      adDetected = await page.evaluate(() => {
        const ad = document.querySelector(".ad-showing, .ytmusic-ad-interrupt-renderer");
        return !!ad;
      });
      if (adDetected) {
        logger("Ad detected. Waiting for it to finish...", "wait");
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  async monitorPlayback(page, logger, agent) {
    return new Promise(async (resolve, reject) => {
      let lastCurrent = -1;
      let stalledCount = 0;

      const checkInterval = setInterval(async () => {
        // CRITICAL: Check if agent was stopped
        if (agent && !agent.isReaping) {
            clearInterval(checkInterval);
            reject(new Error("Agent stopped by user."));
            return;
        }

        const progress = await page.evaluate(() => {
          const timeInfo = document.querySelector(".time-info")?.innerText; 
          if (!timeInfo) return null;
          const [currentStr, totalStr] = timeInfo.split("/").map(t => t.trim());
          
          const toSec = (s) => s.split(":").reduce((acc, t) => (60 * acc) + +t, 0);
          return { 
            current: toSec(currentStr), 
            total: toSec(totalStr),
            text: timeInfo 
          };
        });

        if (progress) {
          if (progress.current === lastCurrent && progress.current !== 0) {
            stalledCount++;
          } else {
            stalledCount = 0;
            logger(`Harvesting: ${progress.text}`, "wait");
          }
          lastCurrent = progress.current;

          // If playback stalls for 15 seconds, something is wrong
          if (stalledCount > 3) {
            clearInterval(checkInterval);
            reject(new Error("Playback stalled."));
          }

          if (progress.current >= progress.total && progress.total > 0) {
            clearInterval(checkInterval);
            resolve();
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
