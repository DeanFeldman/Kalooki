import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { GameState } from "../shared/gamestate.js";
import { ROUND_RULES } from "../shared/rules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = normalize(join(__dirname, ".."));
const port = Number(process.env.PORT) || 3000;
const rooms = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true, rooms: rooms.size });
    return;
  }

  const aliases = {
    "/": "/client/index.html",
    "/style.css": "/client/style.css",
    "/ui.js": "/client/ui.js",
    "/network.js": "/client/network.js"
  };

  const requestedPath = aliases[url.pathname] ?? url.pathname;
  const safePath = normalize(join(projectRoot, requestedPath));

  if (!safePath.startsWith(projectRoot) || !existsSync(safePath) || statSync(safePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("404 - File not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(safePath)] ?? "application/octet-stream"
  });
  createReadStream(safePath).pipe(response);
});

server.on("upgrade", (request, socket) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "",
    ""
  ].join("\r\n"));

  const ws = createWebSocketConnection(socket);
  ws.session = { roomCode: null, playerId: null };

  ws.send({ type: "connected", message: "Connected to Kalooki server." });

  ws.onMessage = message => handleClientMessage(ws, message);
  ws.onClose = () => handleDisconnect(ws);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Kalooki Phase 2 server running on port ${port}`);
});

function handleClientMessage(ws, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    ws.send({ type: "error", message: "Invalid message format." });
    return;
  }

  const payload = message.payload ?? {};

  try {
    switch (message.type) {
      case "createRoom":
        createRoom(ws, payload);
        break;
      case "joinRoom":
        joinRoom(ws, payload);
        break;
      case "rejoinRoom":
        rejoinRoom(ws, payload);
        break;
      case "startRound":
        applyHostAction(ws, room => startRound(room));
        break;
      case "resetGame":
        applyHostAction(ws, room => resetGame(room));
        break;
      case "jumpRound":
        applyHostAction(ws, room => jumpRound(room, payload));
        break;
      case "drawDeck":
        applyTurnAction(ws, room => Boolean(room.game.drawFromDeck()));
        break;
      case "drawDiscard":
        applyTurnAction(ws, room => Boolean(room.game.drawFromDiscard()));
        break;
      case "discard":
        applyTurnAction(ws, room => {
          const ok = room.game.discardCard(Number(payload.cardIndex));
          if (ok && room.game.roundStarted) room.game.nextP();
          return ok;
        });
        break;
      case "layMeld":
        applyTurnAction(ws, room => room.game.layDownMeld(toIntegerArray(payload.cardIndices)));
        break;
      case "addToMeld":
        applyTurnAction(ws, room => room.game.addCardToMeld(
          Number(payload.targetPlayerIndex),
          Number(payload.targetMeldIndex),
          Number(payload.cardHandIndex)
        ));
        break;
      case "buyDiscard":
        applyRoomAction(ws, room => {
          const playerIndex = getPlayerIndex(room, ws.session.playerId);
          if (playerIndex < 0) return false;
          return Boolean(room.game.buyDiscardOutOfTurn(playerIndex));
        });
        break;
      case "reorderHand":
        applyTurnAction(ws, room => {
          const playerIndex = getPlayerIndex(room, ws.session.playerId);
          return room.game.reorderHand(playerIndex, Number(payload.fromIndex), Number(payload.toIndex));
        }, { quiet: true });
        break;
      default:
        ws.send({ type: "error", message: `Unknown action: ${message.type}` });
    }
  } catch (error) {
    console.error(error);
    ws.send({ type: "error", message: "Server error while processing that action." });
  }
}

function createRoom(ws, payload) {
  const name = cleanName(payload.playerName, "Player 1");
  const playerId = randomId("player");
  const roomCode = createRoomCode();

  const room = {
    code: roomCode,
    hostPlayerId: playerId,
    seats: [{ playerId, name, connected: true }],
    sockets: new Map([[playerId, ws]]),
    game: new GameState([name, "Waiting for player 2"]),
    createdAt: Date.now(),
    started: false
  };

  room.game.lastMessage = "Room created. Share the code and wait for another player.";
  rooms.set(roomCode, room);
  ws.session = { roomCode, playerId };

  ws.send({ type: "roomJoined", roomCode, playerId, playerIndex: 0, isHost: true });
  broadcastRoom(room);
}

function joinRoom(ws, payload) {
  const roomCode = cleanRoomCode(payload.roomCode);
  const room = rooms.get(roomCode);

  if (!room) {
    ws.send({ type: "error", message: "Room not found. Check the code and try again." });
    return;
  }

  if (room.started || room.game.roundStarted || room.game.betweenRounds || room.game.gameFinished) {
    ws.send({ type: "error", message: "That game has already started. Rejoin with your saved seat instead." });
    return;
  }

  if (room.seats.length >= 4) {
    ws.send({ type: "error", message: "This room is full." });
    return;
  }

  const playerId = randomId("player");
  const name = cleanName(payload.playerName, `Player ${room.seats.length + 1}`);
  room.seats.push({ playerId, name, connected: true });
  room.sockets.set(playerId, ws);
  room.game.setPlayers(room.seats.map(seat => seat.name), { keepScores: false });
  room.game.lastMessage = `${name} joined the room.`;

  ws.session = { roomCode, playerId };
  ws.send({
    type: "roomJoined",
    roomCode,
    playerId,
    playerIndex: room.seats.length - 1,
    isHost: playerId === room.hostPlayerId
  });
  broadcastRoom(room);
}

function rejoinRoom(ws, payload) {
  const roomCode = cleanRoomCode(payload.roomCode);
  const room = rooms.get(roomCode);
  const playerId = String(payload.playerId ?? "");

  if (!room || !playerId) {
    ws.send({ type: "error", message: "Could not rejoin the previous room." });
    return;
  }

  const seat = room.seats.find(candidate => candidate.playerId === playerId);
  if (!seat) {
    ws.send({ type: "error", message: "Saved player seat was not found in this room." });
    return;
  }

  seat.connected = true;
  room.sockets.set(playerId, ws);
  ws.session = { roomCode, playerId };
  ws.send({
    type: "roomJoined",
    roomCode,
    playerId,
    playerIndex: getPlayerIndex(room, playerId),
    isHost: playerId === room.hostPlayerId
  });
  broadcastRoom(room);
}

function startRound(room) {
  if (room.seats.length < 2) {
    room.game.lastMessage = "You need at least 2 players before starting.";
    return false;
  }

  room.game.setPlayers(room.seats.map(seat => seat.name), { keepScores: true });
  const ok = room.game.startRound();
  if (ok) room.started = true;
  return ok;
}

function resetGame(room) {
  room.game.resetGame(room.seats.map(seat => seat.name));
  room.started = false;
  return true;
}

function jumpRound(room, payload) {
  room.game.setPlayers(room.seats.map(seat => seat.name), { keepScores: true });
  return room.game.jumpToRound(Number(payload.roundIndex));
}

function applyHostAction(ws, action) {
  applyRoomAction(ws, room => {
    if (ws.session.playerId !== room.hostPlayerId) {
      room.game.lastMessage = "Only the host can do that.";
      return false;
    }
    return action(room);
  });
}

function applyTurnAction(ws, action, options = {}) {
  applyRoomAction(ws, room => {
    const playerIndex = getPlayerIndex(room, ws.session.playerId);
    if (playerIndex !== room.game.currentPlayerIndex) {
      if (!options.quiet) room.game.lastMessage = "It is not your turn.";
      return false;
    }
    return action(room);
  });
}

function applyRoomAction(ws, action) {
  const room = getRoomForSocket(ws);
  if (!room) {
    ws.send({ type: "error", message: "Join a room first." });
    return;
  }

  const ok = action(room);
  if (!ok && !room.game.lastMessage) {
    room.game.lastMessage = "That move is not allowed right now.";
  }
  broadcastRoom(room);
}

function getRoomForSocket(ws) {
  if (!ws.session?.roomCode) return null;
  return rooms.get(ws.session.roomCode) ?? null;
}

function handleDisconnect(ws) {
  const room = getRoomForSocket(ws);
  if (!room || !ws.session?.playerId) return;

  const seat = room.seats.find(candidate => candidate.playerId === ws.session.playerId);
  if (seat) seat.connected = false;
  if (room.sockets.get(ws.session.playerId) === ws) {
    room.sockets.delete(ws.session.playerId);
  }

  room.game.lastMessage = seat ? `${seat.name} disconnected. They can rejoin with the same browser.` : "A player disconnected.";
  broadcastRoom(room);

  if (room.sockets.size === 0) {
    setTimeout(() => {
      const latestRoom = rooms.get(room.code);
      if (latestRoom && latestRoom.sockets.size === 0 && Date.now() - latestRoom.createdAt > 30_000) {
        rooms.delete(room.code);
      }
    }, 30 * 60 * 1000);
  }
}

function broadcastRoom(room) {
  for (const [playerId, ws] of room.sockets.entries()) {
    ws.send({ type: "state", state: buildRoomView(room, playerId) });
  }
}

function buildRoomView(room, viewerPlayerId) {
  const viewerPlayerIndex = getPlayerIndex(room, viewerPlayerId);
  const game = room.game;
  const gamePlayers = game.players.map((player, index) => {
    const isViewer = index === viewerPlayerIndex;
    const seat = room.seats[index];
    return {
      name: player.name,
      score: player.score,
      hasComeDown: player.hasComeDown,
      remainingRules: player.remainingRules,
      melds: player.melds,
      hand: isViewer ? player.hand : [],
      handCount: player.hand.length,
      isViewer,
      connected: seat?.connected ?? false
    };
  });

  const lobbyPlayers = room.seats.map((seat, index) => {
    const player = game.players[index];
    return {
      name: seat.name,
      score: player?.score ?? 0,
      hasComeDown: false,
      remainingRules: [],
      melds: [],
      hand: [],
      handCount: 0,
      isViewer: seat.playerId === viewerPlayerId,
      connected: seat.connected
    };
  });

  return {
    roomCode: room.code,
    playerId: viewerPlayerId,
    viewerPlayerIndex,
    isHost: viewerPlayerId === room.hostPlayerId,
    seats: room.seats.map((seat, index) => ({
      index,
      name: seat.name,
      connected: seat.connected,
      isHost: seat.playerId === room.hostPlayerId,
      isViewer: seat.playerId === viewerPlayerId
    })),
    maxPlayers: 4,
    game: {
      currentRound: game.currentRound,
      currentRules: game.currentRules,
      roundRules: ROUND_RULES,
      roundStarted: game.roundStarted,
      betweenRounds: game.betweenRounds,
      gameFinished: game.gameFinished,
      currentPlayerIndex: game.currentPlayerIndex,
      hasDrawn: game.hasDrawn,
      hasDiscarded: game.hasDiscarded,
      topDiscardBuyable: game.topDiscardBuyable,
      lastMessage: game.lastMessage,
      winnerIndex: game.winnerIndex,
      deckCount: game.deck.size(),
      discardTop: game.discardPile.at(-1) ?? null,
      discardCount: game.discardPile.length,
      players: room.started || game.roundStarted || game.betweenRounds || game.gameFinished ? gamePlayers : lobbyPlayers
    }
  };
}

function getPlayerIndex(room, playerId) {
  return room.seats.findIndex(seat => seat.playerId === playerId);
}

function createRoomCode() {
  let code;
  do {
    code = randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function cleanName(value, fallback) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return name || fallback;
}

function cleanRoomCode(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function toIntegerArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isInteger);
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function createWebSocketConnection(socket) {
  const connection = {
    socket,
    buffer: Buffer.alloc(0),
    closed: false,
    onMessage: null,
    onClose: null,
    send(data) {
      if (this.closed || this.socket.destroyed) return;
      const text = typeof data === "string" ? data : JSON.stringify(data);
      this.socket.write(encodeWebSocketFrame(text));
    },
    close() {
      if (this.closed) return;
      this.closed = true;
      try {
        this.socket.end(Buffer.from([0x88, 0x00]));
      } catch {
        this.socket.destroy();
      }
    }
  };

  socket.on("data", chunk => {
    connection.buffer = Buffer.concat([connection.buffer, chunk]);
    readWebSocketFrames(connection);
  });

  socket.on("close", () => {
    if (!connection.closed) {
      connection.closed = true;
      connection.onClose?.();
    }
  });

  socket.on("error", () => {
    if (!connection.closed) {
      connection.closed = true;
      connection.onClose?.();
    }
  });

  return connection;
}

function readWebSocketFrames(connection) {
  while (connection.buffer.length >= 2) {
    const firstByte = connection.buffer[0];
    const secondByte = connection.buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = Boolean(secondByte & 0x80);
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (connection.buffer.length < offset + 2) return;
      payloadLength = connection.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (connection.buffer.length < offset + 8) return;
      const lengthBig = connection.buffer.readBigUInt64BE(offset);
      if (lengthBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        connection.close();
        return;
      }
      payloadLength = Number(lengthBig);
      offset += 8;
    }

    const maskOffset = masked ? 4 : 0;
    const frameEnd = offset + maskOffset + payloadLength;
    if (connection.buffer.length < frameEnd) return;

    const mask = masked ? connection.buffer.subarray(offset, offset + 4) : null;
    offset += maskOffset;

    const payload = Buffer.from(connection.buffer.subarray(offset, offset + payloadLength));
    connection.buffer = connection.buffer.subarray(frameEnd);

    if (masked && mask) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }

    if (opcode === 0x8) {
      connection.close();
      connection.onClose?.();
      return;
    }

    if (opcode === 0x9) {
      connection.socket.write(encodeControlFrame(0xA, payload));
      continue;
    }

    if (opcode === 0x1) {
      connection.onMessage?.(payload.toString("utf8"));
    }
  }
}

function encodeWebSocketFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}

function encodeControlFrame(opcode, payload) {
  const header = Buffer.from([0x80 | opcode, payload.length]);
  return Buffer.concat([header, payload]);
}
