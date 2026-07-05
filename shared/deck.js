import { Card, SUITS, RANKS } from "./card.js";

export class Deck {
  constructor(deckCount = 2, jokerCount = 4) {
    this.deckCount = deckCount;
    this.jokerCount = jokerCount;
    this.cards = [];
    this.buildDeck();
    this.shuffle();
  }

  buildDeck() {
    this.cards = [];

    for (let d = 0; d < this.deckCount; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push(new Card(suit, rank));
        }
      }
    }

    for (let j = 0; j < this.jokerCount; j++) {
      this.cards.push(new Card(null, null, true));
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    return this.cards.pop() ?? null;
  }

  addCards(cards) {
    this.cards.push(...cards);
    this.shuffle();
  }

  size() {
    return this.cards.length;
  }
}
