const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");

class Logger extends EventEmitter {
  constructor() {
    super();
    this.currentLogFile = null;
    this.history = [];
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const logData = { message, type, timestamp };
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    if (!this.currentLogFile) {
        this.currentLogFile = path.join(__dirname, "..", "logs", `session_${Date.now()}.log`);
        if (!fs.existsSync(path.dirname(this.currentLogFile))) fs.mkdirSync(path.dirname(this.currentLogFile), { recursive: true });
    }
    fs.appendFileSync(this.currentLogFile, logLine);
    
    this.history.push(logData);
    if (this.history.length > 100) this.history.shift();
    
    this.emit("log", logData);
  }

  info(message) {
    this.log(message, "info");
  }

  error(message) {
    this.log(message, "error");
  }

  warn(message) {
    this.log(message, "warn");
  }

  success(message) {
    this.log(message, "success");
  }
}

module.exports = new Logger();
