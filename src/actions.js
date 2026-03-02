const fs = require("fs");
const path = require("path");
const state = require("./state");
const scraper = require("./scraper");
const harvester = require("./harvester");
const processor = require("./processor");
const browserManager = require("./browser");
const settingsManager = require("./settings");

class ActionsManager {
  constructor(agent) {
    this.agent = agent;
  }

  async mirrorLibrary(targets) {
    if (this.agent.isSyncing) return;
    this.agent.isSyncing = true;
    this.agent.log("Neural Scan Initiated...");

    try {
      if (targets.likes) await this._mirrorUrl("https://music.youtube.com/playlist?list=LM");
      if (targets.albums) {
        const albumUrls = await scraper.getLibraryAlbums();
        for (let i = 0; i < albumUrls.length; i++) {
          if (!this.agent.isSyncing) break;
          await this._mirrorUrl(albumUrls[i]);
          if ((i + 1) % 5 === 0) await new Promise(r => setTimeout(r, 5000));
        }
      }
      this.agent.log("Mirror Complete.", "success");
    } catch (err) {
      this.agent.log(`Sync Error: ${err.message}`, "error");
    } finally {
      this.agent.isSyncing = false;
      this.agent.emitStatus();
    }
  }

  async _mirrorUrl(url) {
    this.agent.log(`Scanning: ${url.split('/').pop()}...`);
    const tracks = await scraper.getPlaylistSongs(url);
    
    for (const track of tracks) {
      const finalPath = processor.getFinalPath(track);
      const exists = fs.existsSync(finalPath);

      if (!state.history[track.url] || !exists) {
        if (!exists) {
            this.agent.log(`Placing stub: ${track.title}`, "sync");
            processor.createPlaceholder(track);
        }
        state.addToHistory(track.url, { ...track, status: state.history[track.url]?.status || "mirrored" });
        if (state.history[track.url].status !== "reaped") {
            state.addToQueue(track);
        }
      }
    }
  }

  async reapQueue() {
    if (this.agent.isReaping || state.queue.length === 0) return;
    this.agent.isReaping = true;
    this.agent.log(`Harvesting started. Queue: ${state.queue.length}`);
    this.agent.emitStatus();

    try {
      const settings = settingsManager.get();
      let count = 0;

      while (state.queue.length > 0 && count < settings.maxSongsPerSession) {
        if (!this.agent.isReaping) break;

        const track = state.popFromQueue();
        this.agent.log(`Reaping: ${track.title}...`);
        
        const tempPath = path.join(__dirname, "..", `temp_${Date.now()}.mp3`);
        const cookiePath = path.join(__dirname, "..", "temp_cookies.txt");

        try {
          fs.writeFileSync(cookiePath, await browserManager.getNetscapeCookies());
          
          const page = await browserManager.newPage();
          await page.goto(track.url, { waitUntil: "networkidle2" });
          track.lyrics = await scraper.getLyrics(page);
          await page.close();

          await harvester.harvest(track, tempPath, cookiePath, (m, t) => this.agent.log(m, t));
          await processor.process(track, tempPath);
          
          state.history[track.url].status = "reaped";
          state.save();
          count++;
          this.agent.log(`Saved: ${track.title}`, "success");

        } catch (err) {
          this.agent.log(`Failed: ${track.title} (${err.message})`, "error");
          state.queue.unshift(track); 
        } finally {
          if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
          this.agent.emitStatus();
        }

        if (this.agent.isReaping && count < settings.maxSongsPerSession) {
            await new Promise(r => setTimeout(r, 10000));
        }
      }
    } finally {
      this.agent.isReaping = false;
      this.agent.emitStatus();
      await browserManager.close();
    }
  }

  async factoryReset() {
    this.agent.log("Executing Factory Reset...", "warn");
    this.agent.stop();
    await browserManager.close();
    state.reset();

    const musicDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
    const logsDir = path.join(__dirname, "..", "logs");
    
    if (fs.existsSync(musicDir)) {
        fs.rmSync(musicDir, { recursive: true, force: true });
        fs.mkdirSync(musicDir, { recursive: true });
    }
    if (fs.existsSync(logsDir)) {
        fs.rmSync(logsDir, { recursive: true, force: true });
        fs.mkdirSync(logsDir, { recursive: true });
    }
    
    this.agent.log("Factory Reset Complete.", "success");
    this.agent.emitStatus();
  }

  abort() {
    this.agent.isReaping = false;
    this.agent.isSyncing = false;
    this.agent.log("Aborting all active processes.", "warn");
  }
}

module.exports = ActionsManager;
