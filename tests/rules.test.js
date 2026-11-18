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

// Finish through the normal discard action, with known remaining penalties.
const scoredGame = new GameState(["Dean", "Alex", "Sam", "Jo"]);
function completeScoringRound(hands) {
  assert.equal(scoredGame.startRound(), true);
  scoredGame.players[0].hand = [c("Clubs", "2")];
  scoredGame.players[0].hasComeDown = true;
  hands.forEach((hand, index) => { scoredGame.players[index + 1].hand = hand; });
  scoredGame.hasDrawn = true;
  assert.equal(scoredGame.discardCard(0), true);
}

completeScoringRound([[c("Hearts", "5"), c("Clubs", "Q")], [c("Spades", "A"), joker()], [c("Diamonds", "3")]]);
assert.deepEqual(scoredGame.players.map(player => player.roundScores), [[0], [15], [36], [3]]);
assert.deepEqual(scoredGame.players.map(player => player.score), [0, 15, 36, 3]);

// The server rebuilds players between rounds; earlier results must survive.
assert.equal(scoredGame.setPlayers(["Dean", "Alex", "Sam", "Jo"], { keepScores: true }), true);
completeScoringRound([[c("Hearts", "2")], [c("Spades", "4")], [c("Diamonds", "K")]]);
assert.deepEqual(scoredGame.players.map(player => player.roundScores), [[0, 0], [15, 2], [36, 4], [3, 10]]);

// Skipped rounds stay blank, including after WebSocket JSON serialization.
assert.equal(scoredGame.jumpToRound(4), true);
completeScoringRound([[c("Hearts", "3")], [], []]);
assert.deepEqual(JSON.parse(JSON.stringify(scoredGame.players[1].roundScores)), [15, 2, null, null, 3]);

// Replaying a round keeps the row sums consistent with existing total scoring.
assert.equal(scoredGame.jumpToRound(0), true);
completeScoringRound([[c("Hearts", "4")], [], []]);
assert.deepEqual(JSON.parse(JSON.stringify(scoredGame.players[1].roundScores)), [19, 2, null, null, 3]);

assert.equal(scoredGame.jumpToRound(6), true);
completeScoringRound([[c("Hearts", "5")], [], []]);
assert.equal(scoredGame.gameFinished, true);
for (const player of scoredGame.players) {
  assert.equal(player.roundScores.reduce((sum, points) => sum + points, 0), player.score);
}

scoredGame.resetGame();
assert.equal(scoredGame.players.every(player => player.score === 0 && player.roundScores.length === 0), true);
completeScoringRound([[c("Hearts", "2")], [], []]);
assert.equal(scoredGame.setPlayers(["Dean", "Alex", "Sam", "Jo"], { keepScores: false }), true);
assert.equal(scoredGame.players.every(player => player.score === 0 && player.roundScores.length === 0), true);

console.log("All Kalooki tests passed.");
