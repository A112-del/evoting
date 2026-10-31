// Accessible E-Voting Portal - school prototype server
// No Firebase, no npm install. Needs only Node.js (v14 or newer).
// Run:  node server.js      Reset all votes:  node server.js --reset

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "votes.json");
const CODE = "PWD-DEMO-2026";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ADMIN-2026"; // change this line to your own admin password
const CANDIDATES = ["c1", "c2", "c3", "nota"];

function freshDb() {
  return { counts: { c1: 0, c2: 0, c3: 0, nota: 0 }, voted: {} };
}
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch (e) { return freshDb(); }
}
function saveDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

if (process.argv.includes("--reset")) {
  saveDb(freshDb());
  console.log("All votes cleared.");
  process.exit(0);
}

function validVoter(id, code) {
  const m = /^DEMO-PWD-(\d{3})$/.exec(String(id || "").trim().toUpperCase());
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 100 && String(code || "").trim() === CODE;
}

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 10000) req.destroy(); });
  req.on("end", () => { try { cb(JSON.parse(body || "{}")); } catch (e) { cb({}); } });
}

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  // Only the admin can see the counts
  if (req.method === "POST" && url === "/api/results") {
    return readBody(req, (b) => {
      if (b.password !== ADMIN_PASSWORD) return send(res, 401, { error: "Wrong admin password." });
      const db = loadDb();
      const total = CANDIDATES.reduce((s, k) => s + db.counts[k], 0);
      send(res, 200, { counts: db.counts, total, voters: Object.keys(db.voted).length });
    });
  }

  if (req.method === "POST" && url === "/api/login") {
    return readBody(req, (b) => {
      if (!validVoter(b.id, b.code))
        return send(res, 401, { error: "Voter ID or certificate code is not correct." });
      const db = loadDb();
      send(res, 200, { ok: true, alreadyVoted: !!db.voted[b.id.trim().toUpperCase()] });
    });
  }

  if (req.method === "POST" && url === "/api/vote") {
    return readBody(req, (b) => {
      if (!validVoter(b.id, b.code)) return send(res, 401, { error: "Please log in again." });
      if (!CANDIDATES.includes(b.choice)) return send(res, 400, { error: "Please choose one option." });
      const db = loadDb();
      const id = b.id.trim().toUpperCase();
      if (db.voted[id]) return send(res, 409, { error: "This account has already voted." });
      db.voted[id] = true;          // we store only THAT this ID voted, never what it chose
      db.counts[b.choice] += 1;
      saveDb(db);
      send(res, 200, { ok: true });
    });
  }

  // Optional: lets your Arduino/Python bridge add EVM votes. POST {"choice":"c1","password":"<admin password>"}
  if (req.method === "POST" && url === "/api/evm-vote") {
    return readBody(req, (b) => {
      if (b.password !== ADMIN_PASSWORD) return send(res, 401, { error: "Admin password needed." });
      if (!CANDIDATES.includes(b.choice)) return send(res, 400, { error: "bad choice" });
      const db = loadDb();
      db.counts[b.choice] += 1;
      saveDb(db);
      send(res, 200, { ok: true });
    });
  }

  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    return fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
      if (err) { res.writeHead(500); return res.end("index.html missing"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("\nE-Voting portal is running.\n");
  console.log("  On this computer:  http://localhost:" + PORT);
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((n) => nets[n].forEach((i) => {
    if (i.family === "IPv4" && !i.internal)
      console.log("  On other devices (same Wi-Fi):  http://" + i.address + ":" + PORT);
  }));
  console.log("\nPress Ctrl+C to stop.\n");
});
