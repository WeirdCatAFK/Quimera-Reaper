const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const agent = require("./index");
const browserManager = require("./browser");
const settingsManager = require("./settings");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// API Routes
app.get("/api/settings", (req, res) => {
  res.json(settingsManager.get());
});

app.post("/api/settings", (req, res) => {
  const newSettings = req.body;
  const saved = settingsManager.save(newSettings);
  res.json(saved);
});

app.post("/api/harvest", (req, res) => {
  const { targets } = req.body;
  agent.syncAll(targets);
  res.json({ message: "Harvest started" });
});

app.post("/api/login-assistant", async (req, res) => {
  try {
    await browserManager.init();
    res.json({ message: "Browser opened for login" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/export", (req, res) => {
  const musicDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
  if (!fs.existsSync(musicDir)) return res.status(404).send("No music library found");

  res.attachment("quimera_harvest.zip");
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(musicDir, false);
  archive.finalize();
});

app.post("/api/reset", (req, res) => {
  agent.resetHistory();
  res.json({ message: "History reset" });
});

app.post("/api/reap", (req, res) => {
  agent.processQueue();
  res.json({ message: "Recording started" });
});

app.get("/api/status", (req, res) => {
  res.json({
    isSyncing: agent.isSyncing,
    isReaping: agent.isReaping,
    queueLength: agent.queue.length,
    totalSongs: Object.keys(agent.history).length
  });
});

app.post("/api/stop", (req, res) => {
  // We can add a more graceful stop if needed
  res.json({ message: "Stopping agent..." });
});

// Real-time Events
agent.on("log", (log) => io.emit("log", log));
agent.on("status", (status) => io.emit("status", status));

app.get("/api/graph", (req, res) => {
  const history = agent.history;
  const nodes = [{ id: "CORE", label: "REAPER", group: 0 }];
  const links = [];
  const artists = new Set();

  Object.values(history).forEach(track => {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quimera Reaper Active: http://localhost:${PORT}`);
});
