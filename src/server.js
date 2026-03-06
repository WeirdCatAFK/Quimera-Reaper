const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");

const agent = require("./index");
const state = require("./state");
const settingsManager = require("./settings");
const logger = require("./logger");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/settings", (req, res) => res.json(settingsManager.get()));
app.post("/api/settings", (req, res) => res.json(settingsManager.save(req.body)));

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

app.get("/api/export", (req, res) => {
  const musicDir = path.resolve(process.env.MUSIC_OUTPUT_DIR || "./music_library");
  const part = parseInt(req.query.part) || 0;
  const chunkSize = parseInt(req.query.chunkSize) || 40; // 40 files per chunk (around 200MB, safely under Cloudflare timeout)

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

  try {
    const allFiles = getAllFiles(musicDir);
    const totalParts = Math.ceil(allFiles.length / chunkSize);

    if (req.query.info === 'true') {
        return res.json({ totalFiles: allFiles.length, totalParts, chunkSize });
    }

    if (allFiles.length === 0) return res.status(404).send("No files found.");
    if (part >= totalParts) return res.status(404).send("Part not found.");

    const chunkFiles = allFiles.slice(part * chunkSize, (part + 1) * chunkSize);

    res.attachment(`quimera_harvest_part${part + 1}_of_${totalParts}.zip`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    
    chunkFiles.forEach(file => {
        archive.file(file, { name: path.relative(musicDir, file) });
    });
    
    archive.finalize();
  } catch (err) {
    logger.error(`Export Error: ${err.message}`);
    res.status(500).send(err.message);
  }
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
