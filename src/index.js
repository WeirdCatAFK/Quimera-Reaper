const EventEmitter = require("events");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

// Managers
const state = require("./state");
const browserManager = require("./browser");
const harvester = require("./harvester");
const ActionsManager = require("./actions");

class QuimeraAgent extends EventEmitter {
  constructor() {
    super();
    this.isSyncing = false;
    this.isReaping = false;
    this.currentLogFile = null;
    
    this.actions = new ActionsManager(this);

    // Auto-setup
    harvester.ensureBinary((msg, type) => this.log(msg, type));

    // Schedule: Configurable via .env
    // Default Mirror: Once a week at 2 AM on Sunday ("0 2 * * 0")
    const mirrorCron = process.env.CRON_MIRROR || "0 2 * * 0";
    // Default Reap: Every hour from 8 AM to 10 PM ("0 8-22 * * *")
    const reapCron = process.env.CRON_REAP || "0 8-22 * * *";

    this.log(`CRON: Mirror scheduled for [${mirrorCron}]`, "info");
    this.log(`CRON: Reap scheduled for [${reapCron}]`, "info");

    cron.schedule(mirrorCron, () => {
      this.log("CRON: Initiating scheduled mirror task...", "info");
      this.actions.mirrorLibrary({ likes: true, albums: true });
    });

    cron.schedule(reapCron, () => {
      this.log("CRON: Initiating scheduled reap task...", "info");
      this.actions.reapQueue();
    });

    // Graceful Shutdown
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  async shutdown() {
    this.log("Agent shutdown sequence initiated...", "warn");
    this.actions.abort();
    await browserManager.close();
    this.log("Shutdown complete. Farewell.", "success");
    process.exit(0);
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    if (!this.currentLogFile) {
        this.currentLogFile = path.join(__dirname, "..", "logs", `session_${Date.now()}.log`);
        if (!fs.existsSync(path.dirname(this.currentLogFile))) fs.mkdirSync(path.dirname(this.currentLogFile), { recursive: true });
    }
    fs.appendFileSync(this.currentLogFile, logLine);
    this.emit("log", { message, type, timestamp });
  }

  emitStatus() {
    this.emit("status", {
      isSyncing: this.isSyncing,
      isReaping: this.isReaping,
      queueLength: state.queue.length,
      totalSongs: Object.keys(state.history).length
    });
  }

  // Bridging methods for backward compatibility with server.js
  syncAll(targets) { return this.actions.mirrorLibrary(targets); }
  processQueue() { return this.actions.reapQueue(); }
  stop() { return this.actions.abort(); }
  reset() { return this.actions.factoryReset(); }
}

module.exports = new QuimeraAgent();
