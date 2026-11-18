import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { Card } from "../shared/card.js";
import { GameState } from "../shared/gamestate.js";
import { ROUND_RULES } from "../shared/rules.js";

const c = (suit, rank) => new Card(suit, rank);
const run = () => [c("Clubs", "3"), c("Clubs", "4"), c("Clubs", "5")];
const set = () => [c("Hearts", "8"), c("Clubs", "8"), c("Spades", "8")];

function freshGame(roundIndex = 1, count = 2) {
  const game = new GameState(["Dean", "Alex", "Sam", "Jo"].slice(0, count));
  game.jumpToRound(roundIndex);
  game.startRound();
  game.players.forEach(player => { player.hand = []; });
  game.players[0].hand = [...run(), ...set(), c("Clubs", "6"), c("Hearts", "K")];
  game.hasDrawn = true;
  return game;
}

test("coming down allows only a discard, including no additions to existing melds", () => {
  const game = freshGame();
  assert.equal(game.layDownMeld([0, 1, 2]), true);
  assert.equal(game.players[0].hasComeDown, true);
  const hand = [...game.players[0].hand];
  const melds = JSON.stringify(game.players[0].melds);
  assert.equal(game.layDownMeld([0, 1, 2]), false);
  assert.equal(game.addCardToMeld(0, 0, 3), false);
  assert.deepEqual(game.players[0].hand, hand);
  assert.equal(JSON.stringify(game.players[0].melds), melds);
  assert.equal(game.discardCard(4), true);
  game.nextP();
  assert.equal(game.cameDownThisTurn, false);
  game.nextP();
  assert.notEqual(game.drawFromDeck(), null);
  assert.equal(game.layDownMeld([0, 1, 2]), true);
  assert.equal(game.addCardToMeld(0, 0, 0), true);
});

test("multiple required melds remain playable until the full contract is complete", () => {
  const game = freshGame(3);
  assert.equal(game.layDownMeld([0, 1, 2]), true);
  assert.equal(game.players[0].hasComeDown, false);
  assert.equal(game.cameDownThisTurn, false);
  assert.equal(game.layDownMeld([0, 1, 2]), true);
  assert.equal(game.players[0].hasComeDown, true);
  assert.equal(game.cameDownThisTurn, true);
  assert.equal(game.addCardToMeld(0, 0, 0), false);
});

test("an invalid opening meld does not consume the coming-down opportunity", () => {
  const game = freshGame();
  assert.equal(game.layDownMeld([3, 4, 5]), false);
  assert.equal(game.cameDownThisTurn, false);
  assert.equal(game.layDownMeld([0, 1, 2]), true);
});

test("Blitz also blocks extra board plays on the coming-down turn", () => {
  const game = freshGame(0);
  game.players[0].hand = [...run(), c("Clubs", "6")];
  assert.equal(game.layDownMeld([0, 1, 2]), true);
  assert.equal(game.addCardToMeld(0, 0, 0), false);
  assert.equal(game.discardCard(0), true);
  assert.equal(game.roundStarted, true);
  assert.equal(game.players[0].hand.length, 2);
});

for (const owner of [0, 1]) {
  for (const rank of ["2", "6"]) {
    test(`discard extending player ${owner + 1}'s run at ${rank} is returned with one penalty`, () => {
      const game = freshGame();
      game.players[owner].melds = [run()];
      const attempted = c("Clubs", rank);
      const penalty = c("Diamonds", "Q");
      game.players[0].hand = [attempted];
      game.players[0].hasComeDown = true;
      game.deck.cards = [penalty];
      const pile = [...game.discardPile];
      const owners = [...game.discardOwnerIndices];
      const buyable = game.topDiscardBuyable;
      assert.equal(game.discardCard(0), true);
      assert.deepEqual(game.players[0].hand, [attempted, penalty]);
      assert.deepEqual(game.discardPile, pile);
      assert.deepEqual(game.discardOwnerIndices, owners);
      assert.equal(game.topDiscardBuyable, buyable);
      assert.equal(game.hasDiscarded, true);
      assert.equal(game.discardPenaltyApplied, true);
      assert.equal(game.roundStarted, true);
      assert.equal(game.discardCard(0), false);
      assert.equal(game.drawFromDeck(), null);
      assert.equal(game.players[0].roundScores.length, 0);
    });
  }
}

test("a discard completing a set is penalized even before the player has come down", () => {
  const game = freshGame();
  game.players[1].melds = [set()];
  const attempted = c("Diamonds", "8");
  game.players[0].hand = [attempted];
  assert.equal(game.players[0].hasComeDown, false);
  assert.equal(game.discardCard(0), true);
  assert.equal(game.players[0].hand[0], attempted);
  assert.equal(game.players[0].hand.length, 2);
  assert.equal(game.discardPenaltyApplied, true);
});

test("an unusable duplicate suit in a set can be discarded normally", () => {
  const game = freshGame();
  game.players[1].melds = [set()];
  const attempted = c("Hearts", "8");
  game.players[0].hand = [attempted];
  const deckCount = game.deck.size();
  assert.equal(game.discardCard(0), true);
  assert.equal(game.players[0].hand.length, 0);
  assert.equal(game.discardPile.at(-1), attempted);
  assert.equal(game.discardOwnerIndices.at(-1), 0);
  assert.equal(game.deck.size(), deckCount);
  assert.equal(game.discardPenaltyApplied, false);
});

test("joker discards that extend a meld incur the same penalty", () => {
  const game = freshGame();
  game.players[1].melds = [run()];
  const attempted = new Card(null, null, true);
  game.players[0].hand = [attempted];
  assert.equal(game.discardCard(0), true);
  assert.equal(game.players[0].hand[0], attempted);
  assert.equal(game.players[0].hand.length, 2);
});

test("penalty replenishes an empty deck without taking the top discard", () => {
  const game = freshGame();
  game.players[1].melds = [run()];
  game.players[0].hand = [c("Clubs", "6")];
  game.deck.cards = [];
  const recycled = c("Diamonds", "2");
  const top = c("Hearts", "Q");
  game.discardPile = [recycled, top];
  game.discardOwnerIndices = [1, 1];
  assert.equal(game.discardCard(0), true);
  assert.equal(game.players[0].hand[1], recycled);
  assert.deepEqual(game.discardPile, [top]);
  assert.deepEqual(game.discardOwnerIndices, [1]);
});

test("exhausted stock keeps the attempted discard and reports the missing penalty card", () => {
  const game = freshGame();
  game.players[1].melds = [run()];
  const attempted = c("Clubs", "6");
  game.players[0].hand = [attempted];
  game.deck.cards = [];
  assert.equal(game.discardCard(0), true);
  assert.deepEqual(game.players[0].hand, [attempted]);
  assert.match(game.lastMessage, /no penalty card is available/);
});

test("new games and round jumps clear turn restrictions", () => {
  const game = freshGame();
  game.layDownMeld([0, 1, 2]);
  game.discardCard(4);
  game.resetGame();
  assert.equal(game.cameDownThisTurn, false);
  assert.equal(game.discardPenaltyApplied, false);
  game.jumpToRound(3);
  assert.equal(game.cameDownThisTurn, false);
  assert.equal(game.discardPenaltyApplied, false);
});

// Run the production message handlers without opening a network listener.
const serverHandlers = readFileSync(new URL("../server/server.js", import.meta.url), "utf8")
  .split("function handleClientMessage(ws, rawMessage) {")[1];
function multiplayer(game) {
  const sockets = Array.from({ length: game.players.length }, (_, index) => ({
    session: { roomCode: "TEST", playerId: `p${index}` },
    messages: [], send(message) { this.messages.push(JSON.parse(JSON.stringify(message))); }
  }));
  const room = {
    code: "TEST", game, started: true, hostPlayerId: "p0",
    seats: sockets.map((ws, index) => ({ playerId: ws.session.playerId, name: game.players[index].name, connected: true })),
    sockets: new Map(sockets.map(ws => [ws.session.playerId, ws]))
  };
  const context = createContext({ rooms: new Map([["TEST", room]]), ROUND_RULES, console });
  runInContext(`function handleClientMessage(ws, rawMessage) {${serverHandlers}`, context);
  const send = (index, type, payload) => context.handleClientMessage(sockets[index], JSON.stringify({ type, payload }));
  return { sockets, send, disconnect: index => context.handleDisconnect(sockets[index]) };
}

test("four-player server broadcasts enforce coming down, penalties, and turn advancement", () => {
  const game = freshGame(1, 4);
  const { sockets, send } = multiplayer(game);
  send(0, "layMeld", { cardIndices: [0, 1, 2] });
  assert.equal(sockets[0].messages.at(-1).state.game.cameDownThisTurn, true);
  send(0, "layMeld", { cardIndices: [0, 1, 2] });
  assert.equal(game.players[0].melds.length, 1);
  send(0, "addToMeld", { targetPlayerIndex: 0, targetMeldIndex: 0, cardHandIndex: 3 });
  assert.equal(game.players[0].melds[0].length, 3);
  send(0, "discard", { cardIndex: 3 });
  assert.equal(game.currentPlayerIndex, 1);
  assert.equal(game.players[0].hand.length, 6);
  for (const ws of sockets) {
    const view = ws.messages.at(-1).state;
    assert.equal(view.game.currentPlayerIndex, 1);
    assert.equal(view.game.cameDownThisTurn, false);
    assert.match(view.game.lastMessage, /one penalty card/);
    view.game.players.forEach((player, index) => {
      if (index !== view.viewerPlayerIndex) assert.deepEqual(player.hand, []);
    });
  }
  send(0, "layMeld", { cardIndices: [0, 1, 2] });
  assert.equal(game.players[0].melds.length, 1);
  // The next player can come down, and receives the identical restriction.
  game.players[1].hand = [...run(), ...set(), c("Hearts", "K")];
  send(1, "drawDeck");
  send(1, "layMeld", { cardIndices: [0, 1, 2] });
  send(1, "layMeld", { cardIndices: [0, 1, 2] });
  assert.equal(game.players[1].melds.length, 1);
  assert.equal(game.cameDownThisTurn, true);
});

test("adding the fourth natural suit closes another player's set and preserves other meld IDs", () => {
  const game = freshGame();
  const player = game.players[0];
  player.hasComeDown = true;
  const target = game.players[1];
  game.addMeld(target, set());
  game.addMeld(target, run());
  const remainingId = target.meldIds[1];
  const complete = [...target.melds[0], c("Diamonds", "8")];
  player.hand = [complete[3], c("Hearts", "K")];
  const pileCount = game.discardPile.length;
  assert.equal(game.addCardToMeld(1, 0, 0), true);
  assert.deepEqual(target.melds, [run()]);
  assert.deepEqual(target.meldIds, [remainingId]);
  assert.equal(game.discardPile.length, pileCount + 4);
  assert.deepEqual(new Set(game.discardPile.slice(-4)), new Set(complete));
  assert.deepEqual(game.discardOwnerIndices.slice(-4), [0, 0, 0, 0]);
  assert.equal(game.topDiscardBuyable, true);
  assert.equal(player.hand.length, 1);
  assert.equal(game.currentPlayerIndex, 0);
});

test("a natural Set4 closes on coming down, while a joker set stays on the board", () => {
  const game = freshGame(5);
  game.players[0].hand = [...set(), c("Diamonds", "8"), c("Hearts", "K")];
  assert.equal(game.layDownMeld([0, 1, 2, 3]), true);
  assert.equal(game.players[0].hasComeDown, true);
  assert.equal(game.cameDownThisTurn, true);
  assert.equal(game.players[0].melds.length, 0);
  assert.equal(game.players[0].meldIds.length, 0);
  const withJoker = freshGame(5);
  withJoker.players[0].hand = [...set(), new Card(null, null, true), c("Hearts", "K")];
  assert.equal(withJoker.layDownMeld([0, 1, 2, 3]), true);
  assert.equal(withJoker.players[0].melds.length, 1);
});

test("later turns can extend another player's run at either end", () => {
  const game = freshGame();
  game.players[0].hasComeDown = true;
  game.addMeld(game.players[1], run());
  game.players[0].hand = [c("Clubs", "2"), c("Clubs", "6"), c("Hearts", "K")];
  assert.equal(game.addCardToMeld(1, 0, 0), true);
  assert.equal(game.addCardToMeld(1, 0, 0), true);
  assert.deepEqual(game.players[1].melds[0].map(card => card.rank), ["2", "3", "4", "5", "6"]);
  assert.equal(game.players[0].hand.length, 1);
});

function jokerGame() {
  const game = freshGame(1, 4);
  game.players[0].hasComeDown = true;
  const joker = new Card(null, null, true);
  game.addMeld(game.players[1], [c("Clubs", "3"), joker, c("Clubs", "5")]);
  game.addMeld(game.players[2], set());
  game.players[0].hand = [c("Clubs", "4"), c("Hearts", "K")];
  return { game, joker };
}

function allCards(game) {
  return [...game.deck.cards, ...game.discardPile,
    ...game.players.flatMap(player => [...player.hand, ...player.melds.flat()])];
}

test("a correct joker replacement must be replayed elsewhere and conserves every card", () => {
  const { game, joker } = jokerGame();
  const before = new Set(allCards(game));
  assert.equal(game.replaceJoker(1, 0, 1, 0), true);
  assert.equal(game.players[0].hand[0], joker);
  assert.equal(game.pendingJoker.card, joker);
  assert.deepEqual(game.players[1].melds[0].map(card => card.rank), ["3", "4", "5"]);
  assert.equal(game.discardCard(1), false);
  assert.equal(game.discardCard(0), false);
  game.nextP();
  assert.equal(game.currentPlayerIndex, 0);
  assert.equal(game.addCardToMeld(1, 0, 0), false);
  assert.equal(game.addCardToMeld(2, 0, 1), false);
  assert.equal(game.addCardToMeld(2, 0, 0), true);
  assert.equal(game.pendingJoker, null);
  assert.equal(game.players[2].melds[0].includes(joker), true);
  assert.equal(allCards(game).length, before.size);
  assert.deepEqual(new Set(allCards(game)), before);
  assert.equal(game.discardCard(0), true);
});

test("wrong rank, wrong suit, and another joker cannot replace a board joker", () => {
  for (const replacement of [c("Clubs", "6"), c("Hearts", "4"), new Card(null, null, true)]) {
    const { game, joker } = jokerGame();
    game.players[0].hand[0] = replacement;
    const hand = [...game.players[0].hand];
    assert.equal(game.replaceJoker(1, 0, 1, 0), false);
    assert.deepEqual(game.players[0].hand, hand);
    assert.equal(game.players[1].melds[0][1], joker);
    assert.equal(game.pendingJoker, null);
  }
});

test("reclaiming a joker is rejected if it has no legal new home", () => {
  const { game, joker } = jokerGame();
  game.players[2].melds = [];
  game.players[2].meldIds = [];
  assert.equal(game.replaceJoker(1, 0, 1, 0), false);
  assert.equal(game.players[1].melds[0][1], joker);
  assert.equal(game.players[0].hand[0].rank, "4");
  assert.equal(game.pendingJoker, null);
});

test("the reclaimed joker can be used in a new meld and can legally finish a round", () => {
  const { game, joker } = jokerGame();
  game.players[2].melds = [];
  game.players[2].meldIds = [];
  game.players[0].hand = [c("Clubs", "4"), c("Hearts", "8"), c("Clubs", "8")];
  assert.equal(game.replaceJoker(1, 0, 1, 0), true);
  assert.equal(game.layDownMeld([0, 1, 2]), true);
  assert.equal(game.pendingJoker, null);
  assert.equal(game.roundStarted, false);
  assert.equal(game.players[0].melds[0].includes(joker), true);
});

test("pending joker must be included before any other new meld is played", () => {
  const { game } = jokerGame();
  game.players[0].hand.push(...set(), c("Diamonds", "8"));
  assert.equal(game.replaceJoker(1, 0, 1, 0), true);
  const hand = [...game.players[0].hand];
  assert.equal(game.layDownMeld([2, 3, 4, 5]), false);
  assert.deepEqual(game.players[0].hand, hand);
  assert.equal(game.pendingJoker !== null, true);
});

test("replacing a joker in a four-card set closes it without releasing the replay obligation", () => {
  const { game, joker } = jokerGame();
  game.players[1].melds[0] = [...set(), joker];
  game.players[0].hand[0] = c("Diamonds", "8");
  const before = new Set(allCards(game));
  assert.equal(game.replaceJoker(1, 0, 3, 0), true);
  assert.equal(game.players[1].melds.length, 0);
  assert.equal(game.pendingJoker.card, joker);
  assert.equal(game.discardCard(0), false);
  assert.equal(game.addCardToMeld(2, 0, 0), true);
  assert.deepEqual(new Set(allCards(game)), before);
});

test("joker replacement respects coming-down and draw requirements", () => {
  for (const restriction of ["cameDownThisTurn", "hasComeDown", "hasDrawn"]) {
    const { game } = jokerGame();
    if (restriction === "hasComeDown") game.players[0].hasComeDown = false;
    else game[restriction] = restriction === "cameDownThisTurn";
    assert.equal(game.replaceJoker(1, 0, 1, 0), false);
    assert.equal(game.pendingJoker, null);
  }
});

test("a card replacing a board joker cannot be freely discarded", () => {
  const { game } = jokerGame();
  assert.equal(game.discardCard(0), true);
  assert.equal(game.discardPenaltyApplied, true);
  assert.equal(game.players[0].hand[0].rank, "4");
});

test("four-player joker swap state survives rejoin and keeps opponents' hands hidden", () => {
  const { game, joker } = jokerGame();
  game.players[0].hand.push(c("Diamonds", "2"));
  const { sockets, send } = multiplayer(game);
  const swap = { targetPlayerIndex: 1, targetMeldIndex: 0, jokerIndex: 1, cardHandIndex: 0 };
  send(1, "replaceJoker", swap);
  assert.equal(game.pendingJoker, null);
  send(0, "replaceJoker", swap);
  for (const ws of sockets) {
    const view = ws.messages.at(-1).state;
    assert.equal(view.game.mustReplayJoker, true);
    assert.equal(view.game.requiredJokerIndex, view.viewerPlayerIndex === 0 ? 0 : null);
    assert.deepEqual(view.game.jokerReplaySource, { playerIndex: 1, meldIndex: 0 });
    view.game.players.forEach((player, index) => {
      if (index !== view.viewerPlayerIndex) assert.deepEqual(player.hand, []);
    });
  }
  send(0, "discard", { cardIndex: 1 });
  assert.equal(game.currentPlayerIndex, 0);
  send(0, "reorderHand", { fromIndex: 0, toIndex: 1 });
  assert.equal(sockets[0].messages.at(-1).state.game.requiredJokerIndex, 1);
  send(0, "rejoinRoom", { roomCode: "TEST", playerId: "p0" });
  assert.equal(sockets[0].messages.at(-1).state.game.requiredJokerIndex, 1);
  send(0, "addToMeld", { targetPlayerIndex: 2, targetMeldIndex: 0, cardHandIndex: 1 });
  assert.equal(game.pendingJoker, null);
  assert.equal(game.players[2].melds[0].includes(joker), true);
  send(0, "discard", { cardIndex: 0 });
  assert.equal(game.currentPlayerIndex, 1);
});

test("buy approval broadcasts are scoped to the next player and cancel on disconnect", () => {
  const game = freshGame(1, 4);
  const { sockets, send, disconnect } = multiplayer(game);
  send(3, "buyDiscard");
  const id = game.pendingBuy.id;
  assert.equal(sockets[1].messages.at(-1).state.game.pendingBuy.canViewerRespond, true);
  assert.equal(sockets[2].messages.at(-1).state.game.pendingBuy.canViewerRespond, false);
  send(2, "respondToBuy", { requestId: id, decision: "pass" });
  assert.deepEqual(game.pendingBuy.approvedIndices, []);
  send(1, "respondToBuy", { requestId: id, decision: "pass" });
  assert.equal(sockets[2].messages.at(-1).state.game.pendingBuy.canViewerRespond, true);
  const count = game.players[3].hand.length;
  disconnect(2);
  assert.equal(game.pendingBuy, null);
  assert.equal(game.players[3].hand.length, count);
  assert.equal(game.players[2].connected, undefined);
  assert.equal(sockets[0].messages.at(-1).state.game.players[2].connected, false);
});
