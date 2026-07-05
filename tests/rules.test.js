import assert from "node:assert/strict";
import { Card } from "../shared/card.js";
import { GameState } from "../shared/gamestate.js";
import { isValidMeld } from "../shared/rules.js";

const c = (suit, rank) => new Card(suit, rank);
const joker = () => new Card(null, null, true);

assert.equal(isValidMeld([c("Hearts", "2"), c("Hearts", "3"), c("Hearts", "4")], "run3"), true);
assert.equal(isValidMeld([c("Hearts", "Q"), c("Hearts", "K"), c("Hearts", "A")], "run3"), true);
assert.equal(isValidMeld([c("Hearts", "2"), joker(), c("Hearts", "4")], "run3"), true);
assert.equal(isValidMeld([c("Hearts", "2"), c("Clubs", "3"), c("Hearts", "4")], "run3"), false);
assert.equal(isValidMeld([c("Hearts", "9"), c("Clubs", "9"), c("Spades", "9")], "set3"), true);
assert.equal(isValidMeld([c("Hearts", "9"), c("Hearts", "9"), c("Spades", "9")], "set3"), false);
assert.equal(isValidMeld([c("Hearts", "9"), c("Clubs", "9"), joker()], "set3"), true);

const game = new GameState(["Dean", "Alex"]);
assert.equal(game.startRound(), true);
assert.equal(game.players.length, 2);
assert.equal(game.players[0].hand.length, 13);
assert.equal(game.players[1].hand.length, 13);
assert.equal(game.discardPile.length, 1);
assert.equal(game.drawFromDeck() !== null, true);
assert.equal(game.hasDrawn, true);

console.log("All Kalooki tests passed.");
