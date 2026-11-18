import assert from "node:assert/strict";
import { test } from "node:test";
import { Card } from "../shared/card.js";
import { GameState } from "../shared/gamestate.js";

function ready(count = 4) {
  const game = new GameState(["One", "Two", "Three", "Four"].slice(0, count));
  game.startRound();
  game.currentPlayerIndex = count - 1;
  game.discardPile = [new Card("Hearts", "7")];
  game.discardOwnerIndices = [count - 2];
  return game;
}

test("seat 2's buy after seat 3 discards requires seat 4 then seat 1", () => {
  const game = ready();
  const counts = game.players.map(player => player.hand.length);
  const deck = game.deck.size();
  const top = game.discardPile.at(-1);
  assert.deepEqual(game.buyDiscardOutOfTurn(1), { pending: true });
  const id = game.pendingBuy.id;
  assert.deepEqual(game.pendingBuy.approverIndices, [3, 0]);
  assert.deepEqual(game.players.map(player => player.hand.length), counts);
  assert.equal(game.respondToBuy(0, id, "pass"), false);
  assert.equal(game.respondToBuy(3, id - 1, "pass"), false);
  assert.equal(game.respondToBuy(3, id, "pass"), true);
  assert.equal(game.players[1].hand.length, counts[1]);
  assert.equal(game.respondToBuy(0, id, "pass"), true);
  assert.equal(game.pendingBuy, null);
  assert.equal(game.players[1].hand.length, counts[1] + 2);
  assert.equal(game.players[1].hand.at(-2), top);
  assert.equal(game.deck.size(), deck - 1);
  assert.equal(game.currentPlayerIndex, 3);
  assert.equal(game.hasDrawn, false);
});

test("the next player can claim the card as a normal pickup without a penalty", () => {
  const game = ready();
  const count = game.players[3].hand.length;
  const deck = game.deck.size();
  game.buyDiscardOutOfTurn(1);
  assert.equal(game.respondToBuy(3, game.pendingBuy.id, "take"), true);
  assert.equal(game.players[3].hand.length, count + 1);
  assert.equal(game.deck.size(), deck);
  assert.equal(game.hasDrawn, true);
  assert.equal(game.currentPlayerIndex, 3);
  assert.equal(game.pendingBuy, null);
});

test("a later approver can buy only after earlier players have passed", () => {
  const game = ready();
  const counts = game.players.map(player => player.hand.length);
  game.buyDiscardOutOfTurn(1);
  const id = game.pendingBuy.id;
  assert.equal(game.respondToBuy(0, id, "take"), false);
  game.respondToBuy(3, id, "pass");
  assert.equal(game.respondToBuy(0, id, "take"), true);
  assert.equal(game.players[0].hand.length, counts[0] + 2);
  assert.equal(game.players[1].hand.length, counts[1]);
  assert.equal(game.currentPlayerIndex, 3);
  assert.equal(game.hasDrawn, false);
});

test("drawing already passes the current player's pickup priority", () => {
  const game = ready();
  game.drawFromDeck();
  const count = game.players[0].hand.length;
  assert.ok(game.buyDiscardOutOfTurn(0));
  assert.equal(game.pendingBuy, null);
  assert.equal(game.players[0].hand.length, count + 2);
  assert.equal(game.hasDrawn, true);
});

test("a buy freezes the turn until resolved, but hand reordering remains available", () => {
  const game = ready();
  game.buyDiscardOutOfTurn(1);
  assert.equal(game.drawFromDeck(), null);
  assert.equal(game.drawFromDiscard(), null);
  assert.equal(game.discardCard(0), false);
  assert.equal(game.layDownMeld([0, 1, 2]), false);
  assert.equal(game.addCardToMeld(0, 0, 0), false);
  assert.equal(game.replaceJoker(0, 0, 0, 0), false);
  game.nextP();
  assert.equal(game.currentPlayerIndex, 3);
  assert.equal(game.reorderHand(1, 0, 1), true);
  assert.equal(game.respondToBuy(1, game.pendingBuy.id, "cancel"), true);
  assert.equal(game.pendingBuy, null);
  assert.ok(game.drawFromDeck());
});

test("higher-priority buy requests supersede lower-priority requests and reject stale approvals", () => {
  const game = ready();
  game.buyDiscardOutOfTurn(1);
  const oldId = game.pendingBuy.id;
  game.respondToBuy(3, oldId, "pass");
  assert.ok(game.buyDiscardOutOfTurn(0));
  assert.equal(game.pendingBuy, null);
  assert.equal(game.respondToBuy(0, oldId, "pass"), false);
  assert.equal(game.players[0].hand.length, 15);
  assert.equal(game.players[1].hand.length, 13);
});

test("invalid, own-discard, current-player and underfunded buys never transfer cards", () => {
  const game = ready();
  for (const index of [-1, 99, 1.5, 2, 3]) assert.equal(game.buyDiscardOutOfTurn(index), null);
  game.deck.cards = [];
  assert.equal(game.buyDiscardOutOfTurn(1), null);
  assert.equal(game.players.every(player => player.hand.length === 13), true);
});

test("extra buy card can come from recycled discards without taking two discard cards", () => {
  const game = ready();
  const recycled = new Card("Clubs", "2");
  const top = game.discardPile.at(-1);
  game.discardPile.unshift(recycled);
  game.discardOwnerIndices.unshift(0);
  game.deck.cards = [];
  game.hasDrawn = true;
  assert.ok(game.buyDiscardOutOfTurn(0));
  assert.deepEqual(game.players[0].hand.slice(-2), [top, recycled]);
  assert.equal(game.pendingBuy, null);
});

test("reset cancels approvals and ordinary turns keep cycling in seat order", () => {
  const game = ready();
  game.buyDiscardOutOfTurn(1);
  const id = game.pendingBuy.id;
  game.resetGame();
  assert.equal(game.pendingBuy, null);
  assert.equal(game.respondToBuy(3, id, "pass"), false);
  game.startRound();
  const order = [];
  for (let index = 0; index < 9; index++) { order.push(game.currentPlayerIndex); game.nextP(); }
  assert.deepEqual(order, [0, 1, 2, 3, 0, 1, 2, 3, 0]);
});

test("three-player buying checks only the intervening player", () => {
  const game = ready(3);
  game.buyDiscardOutOfTurn(0);
  assert.deepEqual(game.pendingBuy.approverIndices, [2]);
  game.respondToBuy(2, game.pendingBuy.id, "pass");
  assert.equal(game.players[0].hand.length, 15);
  assert.equal(game.currentPlayerIndex, 2);
});
