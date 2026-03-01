const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = path.join(__dirname, "../settings.json");

const defaultSettings = {
  audioBitrate: 192,
  maxSongsPerSession: 20,
  minDelaySeconds: 30,
  maxDelaySeconds: 120
};

class SettingsManager {
  constructor() {
    this.settings = this.load();
  }

  load() {
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        return { ...defaultSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) };
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  }

  save(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
    return this.settings;
  }

  get() {
    return this.settings;
  }
}

module.exports = new SettingsManager();
