import assert from "node:assert/strict";
import { test } from "node:test";
import { runInContext } from "node:vm";
import { openClient } from "./helpers/client.js";

function roomState(overrides = {}) {
  return { roomCode: "TEST", viewerPlayerIndex: 0, isHost: true, seats: [{}, {}], game: {
    roundStarted: true, betweenRounds: false, gameFinished: false, currentRound: 0,
    currentPlayerIndex: 0, winnerIndex: null, hasDrawn: false, hasDiscarded: false,
    discardTop: { rank: "5", suit: "Hearts" },
    players: [{ name: "Dean", hand: [], score: 0 }, { name: "Alex", hand: [], score: 25 }],
    ...overrides
  } };
}

function connectedClient() {
  const client = openClient();
  client.sockets[0].open();
  return client;
}

function receive(client, state) {
  client.sockets[0].message({ type: "state", state });
  runInContext("updateButtons()", client.context);
}

test("clicking either pile picks up using the existing draw action", () => {
  for (const [id, type] of [["drawPileButton", "drawDeck"], ["discardPileButton", "drawDiscard"]]) {
    const client = connectedClient();
    receive(client, roomState());
    runInContext("selectedCardIndices = [0]", client.context);
    client.elements.get(id).click();
    assert.deepEqual(client.sockets[0].sent, [{ type, payload: {} }]);
    assert.equal(runInContext("selectedCardIndices.length", client.context), 0);
    assert.equal(client.sockets[0].sent.some(message => message.type === "discard"), false);
  }
});

test("pile pickups obey turn, draw, discard availability, and connection restrictions", () => {
  const client = connectedClient();
  for (const restriction of [
    { currentPlayerIndex: 1 }, { hasDrawn: true }, { hasDiscarded: true }, { roundStarted: false }
  ]) {
    receive(client, roomState(restriction));
    for (const id of ["drawPileButton", "discardPileButton"]) {
      assert.equal(client.elements.get(id).disabled, true);
      client.elements.get(id).click();
    }
  }
  receive(client, roomState({ discardTop: null }));
  assert.equal(client.elements.get("discardPileButton").disabled, true);
  assert.equal(client.elements.get("drawPileButton").disabled, false);
  client.sockets[0].close();
  runInContext("updateButtons()", client.context);
  assert.equal(client.elements.get("drawPileButton").disabled, true);
  assert.equal(client.elements.get("discardPileButton").disabled, true);
  assert.deepEqual(client.sockets[0].sent, []);
});

test("discard pile renders a decorative card rather than a nested button", () => {
  const client = connectedClient();
  receive(client, roomState());
  runInContext("renderDiscardPile()", client.context);
  assert.equal(client.elements.get("discardPile").children[0].tagName, "SPAN");
  assert.equal(client.elements.get("discardPileButton").attributes["aria-label"], "Pick up 5 of Hearts from the discard pile");
});

test("a round-ending state shows the actual winner once and automatically dismisses", () => {
  const client = connectedClient();
  receive(client, roomState());
  const ended = roomState({ roundStarted: false, betweenRounds: true, currentRound: 1, winnerIndex: 1 });
  receive(client, ended);
  const banner = client.elements.get("roundCelebration");
  assert.equal(banner.classList.contains("hidden"), false);
  assert.equal(client.elements.get("roundWinnerName").textContent, "Alex");
  assert.equal(client.elements.get("winnerRound").textContent, "Round 1 winner");
  assert.equal(client.elements.get("winnerConfetti").children.length, 18);
  const timerId = [...client.timers.keys()][0];
  receive(client, ended);
  assert.equal([...client.timers.keys()][0], timerId);
  assert.equal(client.timers.get(timerId).delay, 4000);
  client.timers.get(timerId).callback();
  assert.equal(banner.classList.contains("hidden"), true);
  receive(client, ended);
  assert.equal(banner.classList.contains("hidden"), true);
});

test("winner banner dismisses manually, hides for the next round, and celebrates that round too", () => {
  const client = connectedClient();
  receive(client, roomState({ roundStarted: false, betweenRounds: true, currentRound: 1, winnerIndex: 0 }));
  client.elements.get("dismissWinnerButton").click();
  assert.equal(client.elements.get("roundCelebration").classList.contains("hidden"), true);
  receive(client, roomState({ currentRound: 1 }));
  receive(client, roomState({ roundStarted: false, betweenRounds: true, currentRound: 2, winnerIndex: 1 }));
  assert.equal(client.elements.get("roundCelebration").classList.contains("hidden"), false);
  assert.equal(client.elements.get("winnerRound").textContent, "Round 2 winner");
  receive(client, roomState({ currentRound: 2 }));
  assert.equal(client.elements.get("roundCelebration").classList.contains("hidden"), true);
  assert.equal(client.timers.size, 0);
});

test("final-round animation honours the round winner rather than the lowest total", () => {
  const client = connectedClient();
  receive(client, roomState({ currentRound: 6 }));
  receive(client, roomState({ roundStarted: false, gameFinished: true, currentRound: 7, winnerIndex: 1 }));
  assert.equal(client.elements.get("roundWinnerName").textContent, "Alex");
  assert.equal(client.elements.get("winnerRound").textContent, "Round 7 winner");
  assert.equal(client.elements.get("roundCelebration").classList.contains("hidden"), false);
});
