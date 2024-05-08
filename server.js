const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./chat.db");

db.run(
  "CREATE TABLE IF NOT EXISTS messages (ip TEXT, content TEXT, sender TEXT)",
  (err) => {
    if (err) console.error(err.message);
  }
);

const wss = new WebSocket.Server({ port: 8080 });
const clients = new Map();

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  const isAdmin = req.url.includes("admin");
  clients.set(ip, { ws, isAdmin });

  ws.on("message", (message) => {
    try {
      const messageData = JSON.parse(message);
      console.log("Received message:", messageData);
      if (messageData.type !== "message") {
        return;
      }

      if (!messageData.message) {
        throw new Error("Message is missing");
      }

      db.run(
        "INSERT INTO messages (ip, content, sender) VALUES (?, ?, ?)",
        [ip, messageData.message, messageData.sender],
        (err) => {
          if (err)
            console.error("Error inserting message into database", err.message);
        }
      );
      broadcastMessage(ip, messageData.message, "customer");
    } catch (error) {
      console.error("Failed to parse message:", error);
    }
  });

  ws.on("close", () => {
    clients.delete(ip);
  });

  sendHistory(ws, ip);
  if (isAdmin) {
    sendActiveChats();
  }

  ws.send(
    JSON.stringify({
      type: "welcome",
      ip: ip,
    })
  );
});

function broadcastMessage(ip, message, sender) {
  const data = JSON.stringify({ type: "message", message, ip, sender });
  clients.forEach(({ ws, isAdmin }) => {
    ws.send(data);
  });
}

function sendHistory(ws, ip) {
  db.all(
    "SELECT content, sender FROM messages WHERE ip = ?",
    [ip],
    (err, rows) => {
      if (err) {
        console.error("Error fetching messages", err.message);
        return;
      }
      ws.send(JSON.stringify({ type: "history", messages: rows }));
    }
  );
}

function sendActiveChats() {
  const activeChats = Array.from(clients.keys());
  const data = JSON.stringify({ type: "activeChats", activeChats });
  clients.forEach(({ ws, isAdmin }) => {
    if (isAdmin) {
      ws.send(data);
    }
  });
}

console.log("WebSocket server is running on port 8080");
