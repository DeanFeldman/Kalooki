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

    this.hasDrawn = false;
    this.topDiscardBuyable = false;

    

    // Deal 13 cards to each player
    for (let i = 0; i < 13; i++) {
      this.players.forEach(player => player.hand.push(this.deck.draw()));
    }

    const firstDiscard = this.deck.draw();
    if (firstDiscard) this.discardPile.push(firstDiscard);
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
    const [card] = player.hand.splice(index, 1);
    this.discardPile.push(card);
    this.topDiscardBuyable = true;
    return true;
}



canComeDown() {
   return true;
}

layDownMeld(cardIndices) {
    const player = this.getCurrP();
    const meldCards = cardIndices.map(i => player.hand[i]);
    const currentRule = ROUND_RULES[this.currentRound][0];

    if (currentRule.toLowerCase() === "blitz") {
        // Try to split into multiple valid melds
        const possibleMelds = splitIntoMelds(meldCards); 
        if (!possibleMelds || possibleMelds.length === 0) {
            return false; 
        }

        // Remove all cards from hand
        player.hand = player.hand.filter((_, i) => !cardIndices.includes(i));
        player.melds.push(...possibleMelds);
        player.hasComeDown = true;

        // If hand empty, blitz is complete
        if (player.hand.length === 0) {
            this.roundOver = true;
            this.winnerIndex = this.currentPlayerIndex;
        }

        return true;
    } else {
        // Normal meld rules
        if (!isValidMeld(meldCards, currentRule)){
          return false;
        }
        player.hand = player.hand.filter((_, i) => !cardIndices.includes(i));
        player.melds.push(meldCards);
        player.hasComeDown = true;
        return true;
    }
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
    // Calculate scores: winner gets 0, everyone else counts remaining cards
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

    // Auto-start next round after short delay
    setTimeout(() => this.startRound(), 1500);
}




}


