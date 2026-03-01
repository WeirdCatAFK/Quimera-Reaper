const EventEmitter = require("events");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const browserManager = require("./browser");
const scraper = require("./scraper");
const recorder = require("./recorder");
const metadata = require("./metadata");
const settingsManager = require("./settings");
require("dotenv").config();

const SUBS_FILE = "./subscriptions.json";
const QUEUE_FILE = "./reap_queue.json";
const HISTORY_FILE = "./sync_history.json";

class QuimeraAgent extends EventEmitter {
  constructor() {
    super();
    this.subscriptions = this.loadJSON(SUBS_FILE, []);
    this.queue = this.loadJSON(QUEUE_FILE, []);
    this.history = this.loadJSON(HISTORY_FILE, {});
    this.isSyncing = false;
    this.isReaping = false;
    this.currentLogFile = null;
    
    // Auto-sync schedule (every 4 hours)
    cron.schedule("0 */4 * * *", () => this.syncAll());
    
    // Auto-reap schedule (every hour if queue has items)
    cron.schedule("0 * * * *", () => this.processQueue());
  }

  // ... (loadJSON, saveJSON, etc.)
  loadJSON(file, fallback) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    return fallback;
  }

  saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    if (!this.currentLogFile) {
        this.currentLogFile = path.join(__dirname, `../logs/session_${Date.now()}.log`);
    }
    fs.appendFileSync(this.currentLogFile, logLine);

    this.emit("log", { message, type, timestamp });
  }

  async addSubscription(target, mode) {
    const sub = { target, mode, addedAt: new Date().toISOString() };
    this.subscriptions.push(sub);
    this.saveJSON(SUBS_FILE, this.subscriptions);
    this.log(`Subscription added: ${mode} - ${target || "My Likes"}`);
    this.syncAll(); // Initial sync
  }

  async syncAll(targets = { likes: true, albums: true, playlists: false }) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.log("Harvesting targets: " + Object.keys(targets).filter(k => targets[k]).join(", "));

    try {
      if (targets.likes) {
        this.log("Mirroring Liked Songs...");
        await this.syncPlaylistOrAlbum("https://music.youtube.com/playlist?list=LM");
      }
      if (targets.albums) {
        this.log("Mirroring Library Albums...");
        const albumUrls = await scraper.getLibraryAlbums();
        for (const albumUrl of albumUrls) {
          await this.syncPlaylistOrAlbum(albumUrl);
        }
      }
      // Add Playlists/Videos logic here if needed
      
      this.log("Library mirroring complete.", "success");
    } catch (err) {
      this.log(`Sync Error: ${err.message}`, "error");
    } finally {
      this.isSyncing = false;
      this.emit("status", { isSyncing: false, queueLength: this.queue.length, totalSongs: Object.keys(this.history).length });
    }
  }

  async syncPlaylistOrAlbum(url, mode = "playlist") {
    this.log(`Scanning ${url || "Likes"}...`);
    const tracks = await scraper.getPlaylistSongs(url);
    
    for (const track of tracks) {
      const id = track.url;
      const finalPath = metadata.getFinalPath(track);
      const fileExists = fs.existsSync(finalPath);

      if (!this.history[id] || !fileExists) {
        if (!fileExists) {
          this.log(`Mirroring missing track: ${track.title}`, "sync");
          this.createPlaceholder(track, finalPath);
        }
        
        // Add to queue if not reaped yet
        if (!this.history[id] || this.history[id].status !== "reaped") {
          const inQueue = this.queue.some(q => q.id === id);
          if (!inQueue) {
            this.queue.push({ ...track, id, addedAt: new Date().toISOString() });
          }
        }
        
        if (!this.history[id]) {
          this.history[id] = { ...track, status: "mirrored" };
        }
      }
    }
    this.saveJSON(QUEUE_FILE, this.queue);
    this.saveJSON(HISTORY_FILE, this.history);
  }

  resetHistory() {
    this.history = {};
    this.queue = [];
    this.saveJSON(HISTORY_FILE, {});
    this.saveJSON(QUEUE_FILE, []);
    this.log("System history reset.", "warn");
  }

  createPlaceholder(track, finalPath) {
    const finalDir = path.dirname(finalPath);
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
    
    // Create a 1-second silent MP3 as placeholder
    // (In a real scenario, we could use a pre-made tiny silent mp3)
    fs.writeFileSync(finalPath, Buffer.alloc(0)); 
    metadata.tagAndOrganize(track, finalPath);
  }

  async processQueue() {
    if (this.isReaping) return;
    if (this.queue.length === 0) {
        this.log("Reap Queue is empty. Mirror your library first!", "warn");
        return;
    }
    this.isReaping = true;
    
    this.log(`Reaping started. Queue length: ${this.queue.length}`);
    this.emit("status", { isReaping: true });

    try {
      const settings = settingsManager.get();
      const maxPerSession = settings.maxSongsPerSession;
      let reapedThisSession = 0;

      while (this.queue.length > 0 && reapedThisSession < maxPerSession) {
        if (!this.isReaping) {
            this.log("Reaping process halted by user.", "warn");
            break;
        }

        const track = this.queue.shift();
        this.log(`Processing: ${track.title} by ${track.artist}...`);
        
        const finalPath = metadata.getFinalPath(track);
        const tempPath = path.join(__dirname, `../temp_${Date.now()}.mp3`);

        try {
          // Pass 'this' so recorder can check this.isReaping
          await recorder.recordSong(track, tempPath, (msg, type) => this.log(msg, type), this);
          
          // Verify we are still supposed to be reaping before marking complete
          if (!this.isReaping) {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              this.queue.unshift(track); // Put back in queue
              throw new Error("Recording cancelled mid-process.");
          }

          await metadata.tagAndOrganize(track, tempPath);
          
          this.history[track.id].status = "reaped";
          this.history[track.id].reapedAt = new Date().toISOString();
          reapedThisSession++;
          
          this.log(`Successfully reaped: ${track.title}`, "success");
        } catch (err) {
          this.log(`Reap Failed for ${track.title}: ${err.message}`, "error");
          // If it wasn't a manual stop, the song is already removed from queue. 
          // You might want to re-add it if it was a transient error.
        }

        this.saveJSON(QUEUE_FILE, this.queue);
        this.saveJSON(HISTORY_FILE, this.history);
        this.emit("status", { queueLength: this.queue.length });

        if (this.isReaping && reapedThisSession < maxPerSession && this.queue.length > 0) {
          const minDelay = settings.minDelaySeconds * 1000;
          const maxDelay = settings.maxDelaySeconds * 1000;
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          this.log(`Waiting ${Math.round(delay/1000)}s...`, "wait");
          await new Promise(r => setTimeout(r, delay));
        }
      }
    } finally {
      this.isReaping = false;
      this.emit("status", { isReaping: false });
      await browserManager.close();
    }
  }

  stop() {
    this.isReaping = false;
    this.log("Stop signal received. Aborting current harvest...", "warn");
  }

  removeSubscription(index) {
    this.subscriptions.splice(index, 1);
    this.saveJSON(SUBS_FILE, this.subscriptions);
  }
}

module.exports = new QuimeraAgent();
