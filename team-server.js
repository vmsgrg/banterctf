// Simple in-memory CTF tracker.
// Run with: `node team-server.js`
// Endpoints:
//   GET  /state              -> { counts, assignments, scores, flags }
//   POST /assign             -> { userId, team }
//   POST /score              -> { team, delta } (delta defaults to 1)
//   POST /flag               -> { flag, state, carrier } state: home|taken|dropped|captured
// This is intentionally minimal and non-persistent.

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "ctf-state.json");
let persistPending = false;

const state = {
  assignments: {}, // userId -> "red" | "blue"
  scores: { red: 0, blue: 0 },
  flags: {
    red: { state: "home", carrier: "" }, // red flag owned by red team
    blue: { state: "home", carrier: "" },
  },
  flagTransforms: {}, // flagName -> { pos?, rot? }
};

function loadStateFromDisk() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw || "{}");
    if (data.assignments && typeof data.assignments === "object") state.assignments = data.assignments;
    if (data.scores && typeof data.scores === "object") state.scores = data.scores;
    if (data.flags && typeof data.flags === "object") state.flags = data.flags;
    if (data.flagTransforms && typeof data.flagTransforms === "object") state.flagTransforms = data.flagTransforms;
    console.log(`[state] loaded from ${STATE_FILE}`);
  } catch (e) {
    console.warn(`[state] failed to load ${STATE_FILE}`, e);
  }
}

function persistStateToDisk() {
  if (persistPending) return;
  persistPending = true;
  setTimeout(() => {
    persistPending = false;
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    } catch (e) {
      console.warn(`[state] failed to persist to ${STATE_FILE}`, e);
    }
  }, 50);
}

function counts() {
  let red = 0;
  let blue = 0;
  Object.values(state.assignments).forEach((t) => {
    if (t === "red") red += 1;
    if (t === "blue") blue += 1;
  });
  return { red, blue };
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/state") {
    return send(res, 200, {
      counts: counts(),
      assignments: state.assignments,
      scores: state.scores,
      flags: state.flags,
      flagTransforms: state.flagTransforms,
    });
  }

  if (req.method === "POST" && req.url === "/state") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.connection.destroy();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(raw || "{}");
        if (data.assignments && typeof data.assignments === "object") {
          Object.entries(data.assignments).forEach(([uid, team]) => {
            if (team === "red" || team === "blue") {
              state.assignments[uid] = team;
            }
          });
        }
        if (data.scores && typeof data.scores === "object") {
          if (Number.isFinite(data.scores.red)) state.scores.red = Math.max(state.scores.red || 0, Number(data.scores.red));
          if (Number.isFinite(data.scores.blue))
            state.scores.blue = Math.max(state.scores.blue || 0, Number(data.scores.blue));
        }
        if (data.flags && typeof data.flags === "object") {
          ["red", "blue"].forEach((flag) => {
            const f = data.flags[flag];
            if (!f || typeof f !== "object") return;
            const stateVal = f.state;
            const carrier = typeof f.carrier === "string" ? f.carrier : "";
            if (["home", "taken", "dropped", "captured"].includes(stateVal)) {
              state.flags[flag] = { state: stateVal, carrier };
            }
          });
        }
        if (data.flagTransforms && typeof data.flagTransforms === "object") {
          state.flagTransforms = data.flagTransforms;
        }
        persistStateToDisk();
        return send(res, 200, {
          ok: true,
          counts: counts(),
          assignments: state.assignments,
          scores: state.scores,
          flags: state.flags,
          flagTransforms: state.flagTransforms,
        });
      } catch (e) {
        return send(res, 400, { error: "bad json" });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/assign") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.connection.destroy();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(raw || "{}");
        const { userId, team } = data;
        if (!userId || (team !== "red" && team !== "blue")) {
          return send(res, 400, { error: "invalid payload" });
        }
        state.assignments[userId] = team;
        persistStateToDisk();
        return send(res, 200, { ok: true, counts: counts(), assignments: state.assignments });
      } catch (e) {
        return send(res, 400, { error: "bad json" });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/score") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.connection.destroy();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(raw || "{}");
        const { team, delta = 1 } = data;
        if (team !== "red" && team !== "blue") {
          return send(res, 400, { error: "invalid team" });
        }
        const d = Number(delta) || 0;
        state.scores[team] = (state.scores[team] || 0) + d;
        persistStateToDisk();
        return send(res, 200, { ok: true, scores: state.scores });
      } catch (e) {
        return send(res, 400, { error: "bad json" });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/flag") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.connection.destroy();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(raw || "{}");
        const { flag, state: flagState, carrier = "" } = data;
        if (flag !== "red" && flag !== "blue") {
          return send(res, 400, { error: "invalid flag" });
        }
        if (!["home", "taken", "dropped", "captured"].includes(flagState)) {
          return send(res, 400, { error: "invalid state" });
        }
        // If a flag was captured, award a point to the capturing team and reset the flag home.
        if (flagState === "captured") {
          const carrierTeam = carrier && state.assignments[carrier];
          const scoringTeam =
            carrierTeam === "red" || carrierTeam === "blue"
              ? carrierTeam
              : flag === "red"
              ? "blue"
              : "red";
          state.scores[scoringTeam] = (state.scores[scoringTeam] || 0) + 1;
          state.flags[flag] = { state: "home", carrier: "" };
          persistStateToDisk();
          return send(res, 200, { ok: true, flags: state.flags, scores: state.scores });
        }
        state.flags[flag] = { state: flagState, carrier: carrier || "" };
        persistStateToDisk();
        return send(res, 200, { ok: true, flags: state.flags });
      } catch (e) {
        return send(res, 400, { error: "bad json" });
      }
    });
    return;
  }

  send(res, 404, { error: "not found" });
});

const PORT = process.env.PORT || 3000;
loadStateFromDisk();
server.listen(PORT, () => {
  console.log(`Team server listening on http://localhost:${PORT}`);
});
