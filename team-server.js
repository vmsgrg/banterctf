// Simple in-memory team tracker.
// Run with: `node team-server.js`
// Endpoints:
//   GET  /teams            -> { red, blue, assignments }
//   POST /teams/assign     -> body: { userId, team }
// This is intentionally minimal and non-persistent.

const http = require("http");

const state = {
  assignments: {}, // userId -> "red" | "blue"
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

  if (req.method === "GET" && req.url === "/teams") {
    return send(res, 200, { ...counts(), assignments: state.assignments });
  }

  if (req.method === "POST" && req.url === "/teams/assign") {
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
        return send(res, 200, { ok: true, ...counts(), assignments: state.assignments });
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
