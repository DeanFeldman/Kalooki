export const SUITS = ["Hearts", "Diamonds", "Clubs", "Spades"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export class Card {
  constructor(suit, rank, isJoker = false) {
    this.isJoker = isJoker;

    if (isJoker) {
      this.suit = null;
      this.rank = "JOKER";
      this.value = 25;
    } else {
      this.suit = suit;
      this.rank = rank;
      this.value = cardValueFromRank(rank);
    }
  }

  toString() {
    return this.isJoker ? "JOKER" : `${this.rank} of ${this.suit}`;
  }
}

// Backwards-compatible export for the original code style.
export const card = Card;

export function cardValueFromRank(rank) {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  if (rank === "JOKER") return 25;
  return Number(rank);
}

export function cardToDisplay(card) {
  if (!card) return "";
  if (card.isJoker || card.rank === "JOKER") return "★";

  const suitSymbols = {
    Hearts: "♥",
    Diamonds: "♦",
    Clubs: "♣",
    Spades: "♠"
  };

  return `${card.rank}${suitSymbols[card.suit] ?? ""}`;
}

export function isRedCard(card) {
  return card && (card.suit === "Hearts" || card.suit === "Diamonds");
}
