import { Deck } from "./deck.js";
import { cardValueFromRank } from "./card.js";
import { isValidMeld, ROUND_RULES } from "./rules.js";

export class GameState {
  constructor(playerNames = ["Player 1", "Player 2"]) {
    this.playerNames = normalisePlayerNames(playerNames);
    this.players = this.playerNames.map(createPlayer);
    this.deck = new Deck();
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.currentRound = 0;
    this.roundStarted = false;
    this.betweenRounds = false;
    this.gameFinished = false;
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.topDiscardBuyable = false;
    this.lastMessage = "Click Start Round to begin.";
    this.winnerIndex = null;
  }

  get currentRules() {
    return ROUND_RULES[this.currentRound] ?? [];
  }

  getCurrP() {
    return this.players[this.currentPlayerIndex];
  }

  startRound() {
    if (this.currentRound >= ROUND_RULES.length) {
      this.gameFinished = true;
      this.roundStarted = false;
      this.lastMessage = "Game complete.";
      return false;
    }

    this.deck = new Deck();
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.roundStarted = true;
    this.betweenRounds = false;
    this.gameFinished = false;
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.topDiscardBuyable = true;
    this.winnerIndex = null;

    for (const player of this.players) {
      player.hand = [];
      player.melds = [];
      player.hasComeDown = false;
      player.remainingRules = [...this.currentRules];
    }

    for (let i = 0; i < 13; i++) {
      for (const player of this.players) {
        const card = this.deck.draw();
        if (card) player.hand.push(card);
      }
    }

    const firstDiscard = this.deck.draw();
    if (firstDiscard) this.discardPile.push(firstDiscard);

    this.lastMessage = `Round ${this.currentRound + 1} started: ${this.currentRules.join(" + ")}.`;
    return true;
  }

  resetGame(playerNames = this.players.map(player => player.name)) {
    this.playerNames = normalisePlayerNames(playerNames);
    this.players = this.playerNames.map(createPlayer);
    this.deck = new Deck();
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.currentRound = 0;
    this.roundStarted = false;
    this.betweenRounds = false;
    this.gameFinished = false;
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.topDiscardBuyable = false;
    this.winnerIndex = null;
    this.lastMessage = "New game created. Click Start Round to begin.";
  }

  jumpToRound(roundIndex) {
    if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= ROUND_RULES.length) return false;
    this.currentRound = roundIndex;
    this.roundStarted = false;
    this.betweenRounds = false;
    this.gameFinished = false;
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.topDiscardBuyable = false;
    this.winnerIndex = null;

    for (const player of this.players) {
      player.hand = [];
      player.melds = [];
      player.hasComeDown = false;
      player.remainingRules = [...this.currentRules];
    }

    this.discardPile = [];
    this.deck = new Deck();
    this.lastMessage = `Jumped to round ${this.currentRound + 1}. Click Start Round.`;
    return true;
  }

  drawFromDeck() {
    if (!this.canDraw()) return null;
    this.refillDeckIfNeeded();

    const card = this.deck.draw();
    if (!card) return null;

    this.getCurrP().hand.push(card);
    this.hasDrawn = true;
    this.topDiscardBuyable = true;
    this.lastMessage = `${this.getCurrP().name} drew from the deck.`;
    return card;
  }

  drawfromDisc() {
    return this.drawFromDiscard();
  }

  drawFromDiscard() {
    if (!this.canDraw() || this.discardPile.length === 0) return null;

    const card = this.discardPile.pop();
    this.getCurrP().hand.push(card);
    this.hasDrawn = true;
    this.topDiscardBuyable = false;
    this.lastMessage = `${this.getCurrP().name} picked up the top discard.`;
    return card;
  }

  canDraw() {
    return this.roundStarted && !this.gameFinished && !this.hasDrawn && !this.hasDiscarded;
  }

  discardCard(index) {
    if (!this.roundStarted || !this.hasDrawn || this.hasDiscarded) return false;

    const player = this.getCurrP();
    if (!Number.isInteger(index) || index < 0 || index >= player.hand.length) return false;

    const [card] = player.hand.splice(index, 1);
    this.discardPile.push(card);
    this.hasDiscarded = true;
    this.topDiscardBuyable = true;
    this.lastMessage = `${player.name} discarded a card.`;

    if (player.hasComeDown && player.hand.length === 0) {
      this.finishRound(this.currentPlayerIndex);
    }

    return true;
  }

  canComeDown(cardIndices) {
    if (!this.roundStarted || !this.hasDrawn || this.hasDiscarded) return false;

    const currentRule = this.currentRules[0]?.toLowerCase();
    if (currentRule !== "blitz") return true;

    const selectedCount = Array.isArray(cardIndices) ? new Set(cardIndices).size : 0;
    const handCount = this.getCurrP().hand.length;
    return selectedCount === handCount || selectedCount === handCount - 1;
  }

  layDownMeld(cardIndices) {
    if (!this.roundStarted || !this.hasDrawn || this.hasDiscarded) return false;
    if (!Array.isArray(cardIndices) || cardIndices.length === 0) return false;

    const player = this.getCurrP();
    const cleanIndices = normaliseIndices(cardIndices, player.hand.length);
    if (cleanIndices.length === 0) return false;

    const selectedCards = cleanIndices.map(index => player.hand[index]);
    const currentRule = this.currentRules[0]?.toLowerCase();

    if (currentRule === "blitz") {
      if (!this.canComeDown(cleanIndices)) return false;

      const possibleMelds = splitIntoMelds(selectedCards);
      if (!possibleMelds) return false;

      removeCardsAtIndices(player.hand, cleanIndices);
      player.melds.push(...possibleMelds);
      player.hasComeDown = true;
      player.remainingRules = [];
      this.lastMessage = `${player.name} came down in Blitz.`;

      if (player.hand.length === 0) this.finishRound(this.currentPlayerIndex);
      return true;
    }

    const ruleToCheck = player.hasComeDown || player.remainingRules.length === 0
      ? "any"
      : player.remainingRules[0];

    if (!isValidMeld(selectedCards, ruleToCheck)) return false;

    removeCardsAtIndices(player.hand, cleanIndices);
    player.melds.push(sortMeldForDisplay(selectedCards));

    if (!player.hasComeDown && player.remainingRules.length > 0) {
      player.remainingRules.shift();
      if (player.remainingRules.length === 0) player.hasComeDown = true;
    }

    this.lastMessage = `${player.name} laid down a valid ${ruleToCheck} meld.`;
    if (player.hasComeDown && player.hand.length === 0) this.finishRound(this.currentPlayerIndex);
    return true;
  }

  addCardToMeld(targetPlayerIndex, targetMeldIndex, cardHandIndex) {
    if (!this.roundStarted || !this.hasDrawn || this.hasDiscarded) return false;

    const currentPlayer = this.getCurrP();
    if (!currentPlayer.hasComeDown) return false;

    const targetPlayer = this.players[targetPlayerIndex];
    const targetMeld = targetPlayer?.melds?.[targetMeldIndex];
    const card = currentPlayer.hand[cardHandIndex];
    if (!targetPlayer || !targetMeld || !card) return false;

    const frontTry = [card, ...targetMeld];
    const backTry = [...targetMeld, card];
    const sortedTry = sortMeldForDisplay([...targetMeld, card]);

    if (isValidMeld(frontTry, "any")) {
      targetPlayer.melds[targetMeldIndex] = sortMeldForDisplay(frontTry);
    } else if (isValidMeld(backTry, "any")) {
      targetPlayer.melds[targetMeldIndex] = sortMeldForDisplay(backTry);
    } else if (isValidMeld(sortedTry, "any")) {
      targetPlayer.melds[targetMeldIndex] = sortedTry;
    } else {
      return false;
    }

    currentPlayer.hand.splice(cardHandIndex, 1);
    this.lastMessage = `${currentPlayer.name} added a card to a meld.`;

    if (currentPlayer.hand.length === 0) this.finishRound(this.currentPlayerIndex);
    return true;
  }

  buyDiscardOutOfTurn(playerIndex) {
    if (!this.roundStarted || !this.topDiscardBuyable || this.discardPile.length === 0) return null;
    if (playerIndex === this.currentPlayerIndex) return null;

    const player = this.players[playerIndex];
    if (!player) return null;

    const boughtCard = this.discardPile.pop();
    player.hand.push(boughtCard);

    this.refillDeckIfNeeded();
    const penaltyCard = this.deck.draw();
    if (penaltyCard) player.hand.push(penaltyCard);

    this.topDiscardBuyable = false;
    this.lastMessage = `${player.name} bought the discard and took a penalty card.`;
    return { boughtCard, penaltyCard };
  }

  nextP() {
    if (!this.roundStarted || this.betweenRounds || this.gameFinished) return;

    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.lastMessage = `${this.getCurrP().name}'s turn.`;
  }

  cardValue(card) {
    return cardValueFromRank(card?.rank);
  }

  finishRound(winnerIndex) {
    this.winnerIndex = winnerIndex;
    const winnerName = this.players[winnerIndex]?.name ?? "Unknown";

    for (let i = 0; i < this.players.length; i++) {
      if (i === winnerIndex) continue;
      this.players[i].score += this.players[i].hand.reduce((sum, card) => sum + this.cardValue(card), 0);
    }

    this.roundStarted = false;
    this.betweenRounds = true;
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.topDiscardBuyable = false;
    this.currentRound += 1;

    if (this.currentRound >= ROUND_RULES.length) {
      this.gameFinished = true;
      this.betweenRounds = false;
      this.lastMessage = `${winnerName} finished the final round. Game complete.`;
    } else {
      this.lastMessage = `${winnerName} won the round. Start the next round when ready.`;
    }
  }

  refillDeckIfNeeded() {
    if (this.deck.size() > 0 || this.discardPile.length <= 1) return;

    const topDiscard = this.discardPile.pop();
    this.deck.addCards(this.discardPile.splice(0));
    this.discardPile.push(topDiscard);
  }
}

function createPlayer(name) {
  return {
    name,
    hand: [],
    melds: [],
    hasComeDown: false,
    remainingRules: [],
    score: 0
  };
}

function normalisePlayerNames(playerNames) {
  const names = playerNames
    .map(name => String(name).trim())
    .filter(Boolean)
    .slice(0, 4);

  while (names.length < 2) names.push(`Player ${names.length + 1}`);
  return names;
}

function normaliseIndices(indices, handLength) {
  return [...new Set(indices)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < handLength)
    .sort((a, b) => a - b);
}

function removeCardsAtIndices(hand, indices) {
  for (const index of [...indices].sort((a, b) => b - a)) {
    hand.splice(index, 1);
  }
}

function splitIntoMelds(cards) {
  const remaining = [...cards];
  const result = solveMeldSplit(remaining);
  return result && result.length > 0 ? result.map(sortMeldForDisplay) : null;
}

function solveMeldSplit(remaining) {
  if (remaining.length === 0) return [];

  const candidates = findCandidateMeldsContainingFirstCard(remaining);

  for (const candidate of candidates) {
    const rest = removeCardReferences(remaining, candidate);
    const tail = solveMeldSplit(rest);
    if (tail) return [candidate, ...tail];
  }

  return null;
}

function findCandidateMeldsContainingFirstCard(cards) {
  const [anchor, ...rest] = cards;
  const candidates = [];

  for (let size = Math.min(cards.length, 13); size >= 3; size--) {
    for (const combo of combinations(rest, size - 1)) {
      const candidate = [anchor, ...combo];
      if (isValidMeld(candidate, "any")) candidates.push(candidate);
    }
  }

  return candidates.sort((a, b) => b.length - a.length);
}

function combinations(arr, k, start = 0, prefix = [], output = []) {
  if (prefix.length === k) {
    output.push([...prefix]);
    return output;
  }

  for (let i = start; i < arr.length; i++) {
    prefix.push(arr[i]);
    combinations(arr, k, i + 1, prefix, output);
    prefix.pop();
  }

  return output;
}

function removeCardReferences(cards, cardsToRemove) {
  const removeSet = new Set(cardsToRemove);
  return cards.filter(card => !removeSet.has(card));
}

function sortMeldForDisplay(cards) {
  const rankOrder = { A: 1, J: 11, Q: 12, K: 13, JOKER: 99 };
  return [...cards].sort((a, b) => {
    const aRank = rankOrder[a.rank] ?? Number(a.rank);
    const bRank = rankOrder[b.rank] ?? Number(b.rank);
    if (a.suit === b.suit) return aRank - bRank;
    return String(a.suit).localeCompare(String(b.suit));
  });
}
