import { Deck } from "./deck.js";
import { isValidMeld, ROUND_RULES } from "./rules.js";
import { RANKS, SUITS } from "./card.js";

export class GameState {
  constructor(playerNames) {
    this.players = playerNames.map(name => ({
      name,
      hand: [],
      melds: [],
      hasComeDown: false,
      remainingRules: [...ROUND_RULES] 
    }));
    this.deck = new Deck();
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.roundStarted = false;
    this.currentRound = 0;
    this.hasDrawn = false;
    this.topDiscardBuyable = false;
    this.roundOver = false;
    this.winnerIndex = null;
    this.scores = new Array(playerNames.length).fill(0);
    this.roundOver = false;
    this.winnerIndex = null;
    this.playersPlayedAfterBlitz = new Set();
    this.hasDiscarded = false;


  }

  startRound() {
    this.deck.shuffle();
    this.players.forEach(player => {
      player.hand = [];
      player.melds = [];
      player.hasComeDown = false;
      player.remainingRules = [...ROUND_RULES];
      
      
      ///
      player.hasPlayedAfterBlitz = false;

    });
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.roundStarted = true;
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.topDiscardBuyable = false;
    this.betweenRounds = false;


    

    // Deal 13 cards to each player
    for (let i = 0; i < 13; i++) {
      this.players.forEach(player => player.hand.push(this.deck.draw()));
    }

    const firstDiscard = this.deck.draw();
    if (firstDiscard){
      this.discardPile.push(firstDiscard);
    }
  }

  getCurrP() {
    return this.players[this.currentPlayerIndex];
  }

  nextP() {
    // If Blitz has happened, track which players have played after Blitz
    if (this.roundOver) {
        this.playersPlayedAfterBlitz.add(this.currentPlayerIndex);

        const allDone = this.players.every((_, i) =>
            i === this.winnerIndex || this.playersPlayedAfterBlitz.has(i)
        );

        if (allDone) {
            this.endRound(); // calculate scores and start next round
            return;
        }
    }

    // Normal turn progression
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.hasDiscarded = false;

    this.hasDrawn = false;
  }




  drawFromDeck() {
    if (this.hasDrawn){
        return null;
    }
    const card = this.deck.draw();
    if (card) {
      this.getCurrP().hand.push(card);
      this.hasDrawn = true;
      this.topDiscardBuyable = true; 
    }
    return card;
  }

  drawfromDisc() {
    if (this.hasDrawn || this.discardPile.length === 0){
        return null;
    }
    const card = this.discardPile.pop();
    this.getCurrP().hand.push(card);
    this.hasDrawn = true;
    this.topDiscardBuyable = true;
    return card;
  }

discardCard(index) {
  const player = this.getCurrP();
  const currentRule = ROUND_RULES[this.currentRound][0];

  if (!this.hasDrawn){
    return false;
  }

  if (this.hasDiscarded){
    return false;
  }

  if (index < 0 || index >= player.hand.length){
    return false;
  }

  const [card] = player.hand.splice(index, 1);
  this.discardPile.push(card);
  this.topDiscardBuyable = true;

  this.hasDiscarded = true;

  if (currentRule.toLowerCase() === "blitz" && player.hasComeDown && player.hand.length === 0) {
    this.roundOver = true;
    this.winnerIndex = this.currentPlayerIndex;
  }

  return true;
}




canComeDown(cardIndices) {
  const player = this.getCurrP();

  //blitz
  const n = player.hand.length;
  const k = Array.isArray(cardIndices) ? cardIndices.length : 0;

  return (k === n) || (k === n - 1);
}

layDownMeld(cardIndices) {
    const player = this.getCurrP();
    const meldCards = cardIndices.map(i => player.hand[i]);
    const currentRule = ROUND_RULES[this.currentRound][0];

    
    if (currentRule.toLowerCase() === "blitz") {
      const possibleMelds = splitIntoMelds(meldCards, isValidMeld);
      if (!possibleMelds || possibleMelds.length === 0) return false;

      // Remove selected cards + add melds
      player.hand = player.hand.filter((_, i) => !cardIndices.includes(i));
      player.melds.push(...possibleMelds);
      player.hasComeDown = true;

      // ONLY the winner triggers Blitz end when they empty their hand during normal play
      if (!this.roundOver && player.hand.length === 0) {
        this.roundOver = true;
        this.winnerIndex = this.currentPlayerIndex;
      }

      return true;
    }
    else {
      // Normal meld rules
      let ruleToCheck = currentRule;

      if (currentRule.toLowerCase() === "run3") {
        ruleToCheck = player.hasComeDown ? "any" : "run3";
      }

      if (!isValidMeld(meldCards, ruleToCheck)) {
        return false;
      }

      player.hand = player.hand.filter((_, i) => !cardIndices.includes(i));
      player.melds.push(meldCards);
      player.hasComeDown = true;
      return true;
  }
}

addCardToMeld(targetPlayerIndex, targetMeldIndex, cardHandIndex) {
  const curr = this.getCurrP();
  const targetPlayer = this.players[targetPlayerIndex];
  if (!targetPlayer) return false;

  const currentRule = ROUND_RULES[this.currentRound][0];
  if (currentRule.toLowerCase() === "run3" && !curr.hasComeDown) return false;

  const meld = targetPlayer.melds[targetMeldIndex];
  if (!meld){
    return false;
  }

  const card = curr.hand[cardHandIndex];
  if (!card) {
    return false;
  }

  const frontTry = [card, ...meld];
  const backTry = [...meld, card];

  if (isValidMeld(frontTry, "any")) {
    targetPlayer.melds[targetMeldIndex] = frontTry;
  } else if (isValidMeld(backTry, "any")) {
    targetPlayer.melds[targetMeldIndex] = backTry;
  } else {
    return false;
  }

  curr.hand.splice(cardHandIndex, 1);
  return true;
}



  buyDiscard(playerIndex) {
    if (this.discardPile.length === 0 || this.hasDrawn){
        return null;
    }

    const card = this.discardPile.pop();
    this.players[playerIndex].hand.push(card);

    if (playerIndex === this.currentPlayerIndex){
        this.hasDrawn = true;
    }

    return card;
  }

  buyDiscardOutOfTurn(playerIndex) {
    if (this.discardPile.length === 0){
        return null;
    }

    const topDiscard = this.discardPile.pop();
    this.players[playerIndex].hand.push(topDiscard);

    // Draw penalty card
    const penaltyCard = this.deck.draw();
    if (penaltyCard){
        this.players[playerIndex].hand.push(penaltyCard);
    }

    return { boughtCard: topDiscard, penaltyCard };
  }

  cardValue(card) {
    if (card.rank === "A"){
      return 11;
    }
    if (["K", "Q", "J"].includes(card.rank)){
      return 10;
    }
    if(["JOKER"].includes(card.rank)){
      return 25;
    }
    return Number(card.rank);
  }


  endRound() {

    this.players.forEach((player, i) => {
      if (i === this.winnerIndex) return;

      const points = player.hand.reduce((sum, card) => {
        if (card.rank === "A") return sum + 11;
        if (["K", "Q", "J"].includes(card.rank)) return sum + 10;
        if (card.rank === "JOKER") return sum + 25;
        return sum + Number(card.rank);
      }, 0);

      player.score = (player.score || 0) + points;
    });

    this.currentRound++;

    this.roundOver = false;
    this.winnerIndex = null;
    this.playersPlayedAfterBlitz.clear();

    this.roundStarted = false;     
    this.hasDrawn = false;
    this.hasDiscarded = false;
    this.topDiscardBuyable = false;

    this.betweenRounds = true;      
  }

}


function isBlitzSetWithJokers(cards) {
  if (cards.length < 3){
    return false;
  }

  const jokers = cards.filter(c => c.rank === "JOKER" || c.isJoker);
  const normal = cards.filter(c => !(c.rank === "JOKER" || c.isJoker));

  if (normal.length === 0){
    return false;
  }

  const rank = normal[0].rank;
  if (!normal.every(c => c.rank === rank)){
    return false;
  }

  const suits = new Set();
  for (const c of normal) {
    if (suits.has(c.suit)){
      return false;
    }
    suits.add(c.suit);
  }

  return true;
}

function isValidBlitzMeld(cards, isValidMeldFn) {
  
  return isValidMeldFn(cards, "blitz") || isBlitzSetWithJokers(cards);
}

function combinations(arr, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) {
    out.push(prefix.slice());
    return out;
  }
  for (let i = start; i < arr.length; i++) {
    prefix.push(arr[i]);
    combinations(arr, k, i + 1, prefix, out);
    prefix.pop();
  }
  return out;
  
}


function splitIntoMelds(cards, isValidMeldFn) {
  const pool = cards.slice();

  pool.sort((a, b) => {
    const aj = (a.rank === "JOKER" || a.isJoker) ? 1 : 0;
    const bj = (b.rank === "JOKER" || b.isJoker) ? 1 : 0;
    return aj - bj;
  });

  const startTime = performance.now();
  const MAX_MS = 80;          // keep UI responsive
  const MAX_CANDIDATES = 300; // cap branching

  function timedOut() {
    return (performance.now() - startTime) > MAX_MS;
  }

  function solve(remaining) {
    if (timedOut()) return null;
    if (remaining.length === 0) return [];

    const anchor = remaining[0];
    const rest = remaining.slice(1);

    const candidates = [];

    // Sets (3-4) first
    for (const size of [3, 4]) {
      if (remaining.length >= size) {
        const combs = combinations(rest, size - 1);
        for (const c of combs) {
          if (timedOut()) return null;
          const meld = [anchor, ...c];
          if (isValidBlitzMeld(meld, isValidMeldFn)) candidates.push(meld);
          if (candidates.length >= MAX_CANDIDATES) break;
        }
      }
      if (candidates.length >= MAX_CANDIDATES) break;
    }

    // Runs (3..remaining.length) but cap hard
    for (let size = 3; size <= remaining.length && candidates.length < MAX_CANDIDATES; size++) {
      const combs = combinations(rest, size - 1);
      for (const c of combs) {
        if (timedOut()) return null;
        const meld = [anchor, ...c];
        if (isValidBlitzMeld(meld, isValidMeldFn)) candidates.push(meld);
        if (candidates.length >= MAX_CANDIDATES) break;
      }
    }

    candidates.sort((a, b) => b.length - a.length);

    for (const meld of candidates) {
      if (timedOut()) return null;
      const nextRemaining = remaining.filter(card => !meld.includes(card));
      const tail = solve(nextRemaining);
      if (tail) return [meld, ...tail];
    }

    return null;
  }

  return solve(pool);
}


