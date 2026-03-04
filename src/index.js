const EventEmitter = require("events");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

// Managers
const state = require("./state");
const browserManager = require("./browser");
const harvester = require("./harvester");
const ActionsManager = require("./actions");
const logger = require("./logger");

class QuimeraAgent extends EventEmitter {
  constructor() {
    super();
    this.isSyncing = false;
    this.isReaping = false;
    
    this.actions = new ActionsManager(this);

    // Auto-setup
    harvester.ensureBinary((msg, type) => logger.log(msg, type));

    // Schedule: Configurable via .env
    // Default Mirror: Once a week at 2 AM on Sunday ("0 2 * * 0")
    const mirrorCron = process.env.CRON_MIRROR || "0 2 * * 0";
    // Default Reap: Every hour from 8 AM to 10 PM ("0 8-22 * * *")
    const reapCron = process.env.CRON_REAP || "0 8-22 * * *";

    logger.info(`CRON: Mirror scheduled for [${mirrorCron}]`);
    logger.info(`CRON: Reap scheduled for [${reapCron}]`);

    cron.schedule(mirrorCron, () => {
      logger.info("CRON: Initiating scheduled mirror task...");
      this.actions.mirrorLibrary({ likes: true, albums: true });
    });

    cron.schedule(reapCron, () => {
      logger.info("CRON: Initiating scheduled reap task...");
      this.actions.reapQueue();
    });

    // Graceful Shutdown
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  async shutdown() {
    logger.warn("Agent shutdown sequence initiated...");
    this.actions.abort();
    await browserManager.close();
    logger.success("Shutdown complete. Farewell.");
    process.exit(0);
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
