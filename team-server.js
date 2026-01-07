// Simple in-memory CTF tracker.
// Run with: `node team-server.js`
// Endpoints:
//   GET  /state              -> { counts, assignments, scores, flags }
//   POST /assign             -> { userId, team }
//   POST /score              -> { team, delta } (delta defaults to 1)
//   POST /flag               -> { flag, state, carrier } state: home|taken|dropped|captured
// This is intentionally minimal and non-persistent.

const http = require("http");

const state = {
  assignments: {}, // userId -> "red" | "blue"
  scores: { red: 0, blue: 0 },
  flags: {
    red: { state: "home", carrier: "" }, // red flag owned by red team
    blue: { state: "home", carrier: "" },
  },
};

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
    });
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
        state.flags[flag] = { state: flagState, carrier: carrier || "" };
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
server.listen(PORT, () => {
  console.log(`Team server listening on http://localhost:${PORT}`);
});
