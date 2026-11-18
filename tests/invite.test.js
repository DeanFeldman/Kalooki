import assert from "node:assert/strict";
import { test } from "node:test";
import { runInContext } from "node:vm";
import { openClient } from "./helpers/client.js";

test("invite fills the code before the socket connects, including returning players", () => {
  const client = openClient("?room=%20abc123%20", "OLD123", "saved-player");
  assert.equal(client.elements.get("roomCodeInput").value, "ABC123");
  client.sockets[0].open();
  assert.deepEqual(client.sockets[0].sent, []);
  client.elements.get("joinRoomButton").handlers.click();
  assert.equal(client.sockets[0].sent[0].type, "joinRoom");
  assert.equal(client.sockets[0].sent[0].payload.roomCode, "ABC123");
});

test("fresh visitors receive the invite code", () => {
  const client = openClient("?room=ABC123");
  assert.equal(client.elements.get("roomCodeInput").value, "ABC123");
  client.sockets[0].open();
  assert.deepEqual(client.sockets[0].sent, []);
});

test("an invite to the saved room still resumes the saved seat", () => {
  const client = openClient("?room=ABC123", "ABC123", "saved-player");
  client.sockets[0].open();
  assert.deepEqual(client.sockets[0].sent, [
    { type: "rejoinRoom", payload: { roomCode: "ABC123", playerId: "saved-player" } }
  ]);
});

test("without an invite the previous room is filled and resumed", () => {
  const client = openClient("", "OLD123", "saved-player");
  assert.equal(client.elements.get("roomCodeInput").value, "OLD123");
  client.sockets[0].open();
  assert.equal(client.sockets[0].sent[0].payload.roomCode, "OLD123");
});

test("reconnect resumes the active room even if the original invite is different", () => {
  const client = openClient("?room=ABC123");
  client.sockets[0].open();
  client.sockets[0].message({ type: "roomJoined", roomCode: "NEW123", playerId: "new-player" });
  client.sockets[0].message({ type: "state", state: {
    roomCode: "NEW123", viewerPlayerIndex: 0, game: { players: [{ hand: [] }] }
  } });
  client.sockets[0].handlers.close();
  runInContext("connectSocket()", client.context);
  client.sockets[1].open();
  assert.deepEqual(client.sockets[1].sent, [
    { type: "rejoinRoom", payload: { roomCode: "NEW123", playerId: "new-player" } }
  ]);
});
