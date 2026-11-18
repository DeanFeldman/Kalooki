// Run against an owned local server with Node 22+: node tests/multiplayer.integration.js
import assert from "node:assert/strict";

const base = process.env.KALOOKI_TEST_URL ?? "http://127.0.0.1:3010";
const sessions = [];
async function connect() {
  const ws = new WebSocket(`${base.replace(/^http/, "ws")}/ws`);
  const client = { ws, state: null, messages: [], waiters: [] };
  client.send = (type, payload = {}) => ws.send(JSON.stringify({ type, payload }));
  client.wait = (predicate, description, history = true) => {
    const existing = history ? [...client.messages].reverse().find(predicate) : null;
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 5000);
      client.waiters.push(message => {
        if (!predicate(message)) return false;
        clearTimeout(timer); resolve(message); return true;
      });
    });
  };
  client.stateIs = (predicate, description) => client.state && predicate(client.state)
    ? Promise.resolve({ type: "state", state: client.state })
    : client.wait(message => message.type === "state" && predicate(message.state), description, false);
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    client.messages.push(message);
    if (message.type === "state") client.state = message.state;
    client.waiters = client.waiters.filter(waiter => !waiter(message));
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  sessions.push(client);
  return client;
}

try {
  const host = await connect();
  host.send("createRoom", { playerName: "Test One" });
  const joined = await host.wait(message => message.type === "roomJoined", "create room");
  const roomCode = joined.roomCode;
  const playerIds = [joined.playerId];
  for (let count = 1; count <= 4; count++) {
    if (count > 1) {
      const client = await connect();
      client.send("joinRoom", { roomCode, playerName: `Test ${count}` });
      playerIds.push((await client.wait(message => message.type === "roomJoined", "join lobby")).playerId);
    }
    await Promise.all(sessions.map(client => client.stateIs(state => state.seats.length === count, `${count}-player lobby`)));
    assert.equal(sessions.every(client => client.state.game.players.length === count), true);
    console.log(`PASS ${count}-player live lobby, including mid-lobby join broadcasts`);
  }
  host.send("startRound");
  await Promise.all(sessions.map(client => client.stateIs(state => state.game.roundStarted, "start round")));
  function checkPrivacy() {
    sessions.forEach(client => client.state.game.players.forEach((player, index) => {
      assert.equal(player.hand.length, index === client.state.viewerPlayerIndex ? player.handCount : 0);
    }));
  }
  checkPrivacy();
  for (let index = 0; index < 3; index++) {
    sessions[index].send("drawDeck");
    await sessions[index].stateIs(state => state.game.currentPlayerIndex === index && state.game.hasDrawn, "draw");
    sessions[index].send("discard", { cardIndex: 0 });
    await Promise.all(sessions.map(client => client.stateIs(state => state.game.currentPlayerIndex === index + 1 && !state.game.hasDrawn, "turn advance")));
  }
  console.log("PASS seat 1 → 2 → 3 → 4 turn progression and draw/discard actions");
  const buyerCount = sessions[1].state.game.players[1].handCount;
  sessions[1].send("buyDiscard");
  await Promise.all(sessions.map(client => client.stateIs(state => state.game.pendingBuy?.nextApproverIndex === 3, "first refusal")));
  const requestId = host.state.game.pendingBuy.id;
  assert.deepEqual(host.state.game.pendingBuy.approverIndices, [3, 0]);
  sessions[3].send("respondToBuy", { requestId, decision: "pass" });
  await host.stateIs(state => state.game.pendingBuy?.nextApproverIndex === 0, "second approval");
  host.send("respondToBuy", { requestId, decision: "pass" });
  await Promise.all(sessions.map(client => client.stateIs(state => !state.game.pendingBuy && state.game.players[1].handCount === buyerCount + 2, "approved buy")));
  assert.equal(host.state.game.currentPlayerIndex, 3);
  console.log("PASS queued approvals, exact two-card purchase, and unchanged turn owner");
  sessions[3].send("drawDeck");
  await sessions[3].stateIs(state => state.game.currentPlayerIndex === 3 && state.game.hasDrawn, "seat 4 draw");
  sessions[3].send("discard", { cardIndex: 0 });
  await Promise.all(sessions.map(client => client.stateIs(state => state.game.currentPlayerIndex === 0 && !state.game.hasDrawn && state.game.players[1].handCount === buyerCount + 2, "wrap to seat 1")));
  sessions[2].send("buyDiscard");
  await host.stateIs(state => state.game.pendingBuy?.buyerIndex === 2, "second request");
  const hostCount = host.state.game.players[0].handCount;
  host.send("respondToBuy", { requestId: host.state.game.pendingBuy.id, decision: "take" });
  await host.stateIs(state => !state.game.pendingBuy && state.game.hasDrawn && state.game.players[0].handCount === hostCount + 1, "normal pickup priority");
  console.log("PASS next-in-line normal pickup without an extra-card charge");
  const oldFourth = sessions[3];
  oldFourth.ws.close();
  await host.stateIs(state => state.game.players[3].connected === false, "disconnect presence");
  sessions.pop();
  const rejoined = await connect();
  rejoined.send("rejoinRoom", { roomCode, playerId: playerIds[3] });
  await rejoined.stateIs(state => state.game.players[3].connected && state.viewerPlayerIndex === 3, "rejoin saved seat");
  await host.stateIs(state => state.game.players[3].connected && state.game.hasDrawn, "rejoin broadcast");
  checkPrivacy();
  console.log("PASS live disconnect/rejoin with saved hand and private opponent cards");
} finally {
  sessions.forEach(client => client.ws.close());
}
