const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");

const agent = require("./index");
const state = require("./state");
const settingsManager = require("./settings");
const logger = require("./logger");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// --- Custom Authentication Middleware ---
const UI_TOKEN = process.env.UI_PASSWORD ? crypto.createHash('sha256').update(process.env.UI_PASSWORD).digest('hex') : null;

app.post("/api/login", (req, res) => {
    if (!process.env.UI_PASSWORD) return res.json({ success: true });
    if (req.body.password === process.env.UI_PASSWORD) {
        res.cookie('qr_auth', UI_TOKEN, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Invalid password" });
    }
});

app.use((req, res, next) => {
    if (!process.env.UI_PASSWORD) return next();

    // 1. Allow static assets required for the login page to bypass auth
    if (req.path === '/api/login' || req.path === '/login.html' || req.path === '/icon.ico' || req.path === '/Quimera.png' || req.path === '/Cherry.png') {
        return next();
    }

    // 2. Check for API Key in headers or query (For Bots like quimera-mirror)
    const apiKey = req.headers['x-api-key'] || req.query.apikey;
    if (apiKey) {
        const settings = settingsManager.get();
        if (settings.apiKeys && settings.apiKeys.includes(apiKey)) {
            return next();
        }
    }

    // 3. Check for UI Auth Cookie (For human users)
    if (req.cookies && req.cookies.qr_auth === UI_TOKEN) {
        return next();
    }

    // 4. If neither API Key nor Cookie is present, deny access.
    // If they requested the root dashboard, send them to the login UI.
    if (req.path === '/' || req.path === '/index.html') {
        return res.redirect('/login.html');
    }

    // Otherwise, it's an API call, return a strict 401.
    res.status(401).json({ error: "Unauthorized access." });
});

// Secure WebSocket connections
io.use((socket, next) => {
    if (!process.env.UI_PASSWORD) return next();

    // Parse cookies from the websocket handshake header
    const cookieHeader = socket.request.headers.cookie || '';
    if (cookieHeader.includes(`qr_auth=${UI_TOKEN}`)) return next();

    return next(new Error('Authentication error'));
});

app.use(express.static(path.join(__dirname, "../public")));
// Expose the music directory for Quimera Mirror to download files incrementally
const musicDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
app.use("/music", express.static(musicDir));

app.post("/api/keys", (req, res) => {
    const key = "qr_" + crypto.randomBytes(16).toString("hex");
    const settings = settingsManager.get();
    if (!settings.apiKeys) settings.apiKeys = [];
    settings.apiKeys.push(key);
    settingsManager.save(settings);
    res.json({ key });
});

app.get("/api/settings", (req, res) => res.json(settingsManager.get()));
app.post("/api/settings", (req, res) => res.json(settingsManager.save(req.body)));

// Expose the complete history for Quimera Mirror to compare state
app.get("/api/history", (req, res) => res.json(state.history));

app.post("/api/harvest", (req, res) => {
  agent.syncAll(req.body.targets);
  res.json({ message: "Sync started" });
});

app.post("/api/reap", (req, res) => {
  agent.processQueue();
  res.json({ message: "Harvesting started" });
});

app.post("/api/kill", async (req, res) => {
  agent.stop();
  res.json({ message: "All tasks signaled to abort. Waiting for current operation to finish." });
});

app.post("/api/factory-reset", async (req, res) => {
  try {
    await agent.reset();
    res.json({ message: "System reset complete. App remains active." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/reset", (req, res) => {
  state.reset();
  res.json({ message: "History reset" });
});

app.get("/api/status", (req, res) => {
  const history = Object.values(state.history);
  const reapedCount = history.filter(t => t.status === "reaped").length;
  res.json({
    isSyncing: agent.isSyncing,
    isReaping: agent.isReaping,
    queueLength: state.queue.length,
    totalSongs: reapedCount
  });
});

app.get("/api/graph", (req, res) => {
  const nodes = [{ id: "CORE", label: "REAPER", group: 0 }];
  const links = [];
  const artists = new Set();

  Object.values(state.history).forEach(track => {
    if (!artists.has(track.artist)) {
      artists.add(track.artist);
      nodes.push({ id: track.artist, label: track.artist, group: 1 });
      links.push({ source: "CORE", target: track.artist });
    }
    nodes.push({ id: track.url, label: track.title, group: 2, status: track.status });
    links.push({ source: track.artist, target: track.url });
  });
  res.json({ nodes, links });
});

let exportStatus = { isBuilding: false, progress: 0, total: 0, url: null, error: null };

app.get("/api/export/status", (req, res) => {
    res.json(exportStatus);
});

app.post("/api/export", (req, res) => {
  if (exportStatus.isBuilding) return res.status(400).json({ error: "Export already in progress" });

  const musicDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
  const exportFile = path.join(__dirname, "../public/quimera_export.zip");
  
  const getAllFiles = (dir) => {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(getAllFiles(file));
        } else { 
            results.push(file);
        }
    });
    return results;
  };

  const allFiles = getAllFiles(musicDir);
  if (allFiles.length === 0) return res.status(404).json({ error: "No files to export" });

  exportStatus = { isBuilding: true, progress: 0, total: allFiles.length, url: null, error: null };

  const output = fs.createWriteStream(exportFile);
  const archive = archiver("zip", { zlib: { level: 0 } }); // Store only for speed, MP3s are already compressed

  output.on("close", () => {
      logger.success(`Archive built: ${archive.pointer()} total bytes`);
      exportStatus.isBuilding = false;
      exportStatus.url = "/quimera_export.zip";
  });

  archive.on("error", (err) => {
      logger.error(`Archive Error: ${err.message}`);
      exportStatus.isBuilding = false;
      exportStatus.error = err.message;
  });

  archive.on("entry", () => {
      exportStatus.progress++;
  });

  archive.pipe(output);
  
  allFiles.forEach(file => {
      archive.file(file, { name: path.relative(musicDir, file) });
  });

  archive.finalize();

  res.json({ message: "Export building started" });
});

logger.on("log", (log) => io.emit("log", log));

io.on('connection', (socket) => {
  socket.emit('init_logs', logger.history);
});

agent.on("status", (status) => io.emit("status", status));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.success(`Quimera Reaper Active: http://localhost:${PORT}`);
});
