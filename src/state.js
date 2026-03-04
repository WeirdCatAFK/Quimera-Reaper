const fs = require("fs");
const path = require("path");

class StateManager {
  constructor() {
    this.SUBS_FILE = path.join(__dirname, "..", "subscriptions.json");
    this.QUEUE_FILE = path.join(__dirname, "..", "reap_queue.json");
    this.HISTORY_FILE = path.join(__dirname, "..", "sync_history.json");

    this.subscriptions = this.load(this.SUBS_FILE, []);
    this.queue = this.load(this.QUEUE_FILE, []);
    this.history = this.load(this.HISTORY_FILE, {});
  }

  load(file, fallback) {
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (e) {
            return fallback;
        }
    }
    return fallback;
  }

  save() {
    fs.writeFileSync(this.SUBS_FILE, JSON.stringify(this.subscriptions, null, 2));
    fs.writeFileSync(this.QUEUE_FILE, JSON.stringify(this.queue, null, 2));
    fs.writeFileSync(this.HISTORY_FILE, JSON.stringify(this.history, null, 2));
  }

  addToHistory(id, data) {
    this.history[id] = { ...data, syncedAt: new Date().toISOString() };
    this.save();
  }

  addToQueue(track) {
    if (!this.queue.some(q => q.url === track.url)) {
        this.queue.push(track);
        this.save();
    }
  }

  popFromQueue() {
    const track = this.queue.shift();
    this.save();
    return track;
  }

  reset() {
    this.history = {};
    this.queue = [];
    this.save();
  }
}

module.exports = new StateManager();
