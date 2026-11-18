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

test("buy approval controls show first refusal, preserve request IDs, and freeze pickups", () => {
  const client = connectedClient();
  const state = roomState({ pendingBuy: {
    id: 7, buyerIndex: 1, nextApproverIndex: 0, canViewerRespond: true, canViewerCancel: false
  } });
  receive(client, state);
  runInContext("renderBuyRequest()", client.context);
  assert.equal(client.elements.get("buyRequestPanel").classList.contains("hidden"), false);
  assert.equal(client.elements.get("passBuyButton").classList.contains("hidden"), false);
  assert.equal(client.elements.get("cancelBuyButton").classList.contains("hidden"), true);
  assert.equal(client.elements.get("takeBuyButton").textContent, "Take card");
  assert.equal(client.elements.get("drawPileButton").disabled, true);
  assert.equal(client.elements.get("discardPileButton").disabled, true);
  client.elements.get("passBuyButton").click();
  assert.deepEqual(client.sockets[0].sent.at(-1), { type: "respondToBuy", payload: { requestId: 7, decision: "pass" } });
  client.elements.get("takeBuyButton").click();
  assert.equal(client.sockets[0].sent.at(-1).payload.decision, "take");
  receive(client, roomState());
  runInContext("renderBuyRequest()", client.context);
  assert.equal(client.elements.get(".controls").classList.contains("hidden"), false);
});

test("requester can cancel and later approvers see the extra-card price", () => {
  const client = connectedClient();
  receive(client, roomState({ pendingBuy: { id: 8, buyerIndex: 0, nextApproverIndex: 1, canViewerRespond: false, canViewerCancel: true } }));
  runInContext("renderBuyRequest()", client.context);
  assert.equal(client.elements.get("cancelBuyButton").classList.contains("hidden"), false);
  client.elements.get("cancelBuyButton").click();
  assert.equal(client.sockets[0].sent.at(-1).payload.decision, "cancel");
  receive(client, roomState({ currentPlayerIndex: 1, pendingBuy: { id: 9, buyerIndex: 1, nextApproverIndex: 0, canViewerRespond: true } }));
  runInContext("renderBuyRequest()", client.context);
  assert.equal(client.elements.get("takeBuyButton").textContent, "Buy +1");
});

test("player nameplates omit points while keeping names, connection state and card counts", () => {
  const client = connectedClient();
  const state = roomState();
  state.seats = [{ isHost: true }, {}];
  state.game.players.forEach((player, index) => Object.assign(player, {
    connected: true, isViewer: index === 0, handCount: 13, remainingRules: [], melds: []
  }));
  receive(client, state);
  runInContext("renderPlayers()", client.context);
  const occupied = client.elements.get("players").children.filter(child => child.dataset.playerIndex !== undefined);
  assert.equal(occupied.length, 2);
  for (const seat of occupied) {
    assert.doesNotMatch(seat.innerHTML, /\bpts\b|\bpoints\b/);
    assert.match(seat.innerHTML, /13 cards/);
  }
});

test("touch dragging reorders without accidentally selecting a card", () => {
  const client = connectedClient();
  receive(client, roomState());
  const dragged = runInContext('createCardElement({rank:"3",suit:"Clubs"},{cardIndex:0,selectable:true,draggable:true,onClick:()=>toggleSelectedCard(0)})', client.context);
  const target = runInContext('createCardElement({rank:"4",suit:"Clubs"},{cardIndex:1})', client.context);
  client.elements.set("pointerDropTarget", target);
  const pointer = (x, y) => ({ pointerId: 1, pointerType: "touch", clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
  dragged.handlers.pointerdown(pointer(20, 20));
  dragged.handlers.pointermove(pointer(80, 20));
  dragged.handlers.pointerup(pointer(80, 20));
  assert.deepEqual(client.sockets[0].sent.at(-1), { type: "reorderHand", payload: { fromIndex: 0, toIndex: 1 } });
  dragged.click();
  assert.equal(runInContext("selectedCardIndices.length", client.context), 0);
});

test("a touch tap selects while a cancelled drag does not reorder", () => {
  const client = connectedClient();
  receive(client, roomState());
  const card = runInContext('createCardElement({rank:"3",suit:"Clubs"},{cardIndex:0,selectable:true,draggable:true,onClick:()=>toggleSelectedCard(0)})', client.context);
  const pointer = { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 20, preventDefault() {}, stopPropagation() {} };
  card.handlers.pointerdown(pointer);
  card.handlers.pointerup(pointer);
  card.click();
  assert.equal(runInContext("selectedCardIndices[0]", client.context), 0);
  card.handlers.pointerdown(pointer);
  card.handlers.pointermove({ ...pointer, clientX: 90 });
  card.handlers.pointercancel(pointer);
  assert.equal(card.classList.contains("touch-dragging"), false);
  assert.deepEqual(client.sockets[0].sent, []);
});
