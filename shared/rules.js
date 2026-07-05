export const ROUND_RULES = [
  ["Blitz"],
  ["Run3"],
  ["Set3"],
  ["Run3", "Set3"],
  ["Run4"],
  ["Set4"],
  ["Run5"]
];

export function formatRule(rule) {
  if (!rule) return "";
  const lower = rule.toLowerCase();
  if (lower === "blitz") return "Blitz: come down with all cards, or all except one discard";
  if (lower.startsWith("run")) return `Run of ${lower.slice(3)}`;
  if (lower.startsWith("set")) return `Set of ${lower.slice(3)}`;
  return rule;
}

export function isValidMeld(cards, rule = "any") {
  if (!Array.isArray(cards) || cards.length === 0 || !rule) return false;

  const normalizedRule = rule.toLowerCase();

  if (normalizedRule === "blitz") {
    return isRun(cards) || isSet(cards);
  }

  if (normalizedRule === "any") {
    return isRun(cards) || isSet(cards);
  }

  if (normalizedRule.startsWith("run")) {
    const requiredLength = Number(normalizedRule.slice(3));
    return cards.length === requiredLength && isRun(cards);
  }

  if (normalizedRule.startsWith("set")) {
    const requiredLength = Number(normalizedRule.slice(3));
    return cards.length === requiredLength && isSet(cards);
  }

  return false;
}

export function isRun(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return false;

  const jokers = cards.filter(isJoker);
  const normalCards = cards.filter(card => !isJoker(card));

  if (normalCards.length === 0) return false;

  const suit = normalCards[0].suit;
  if (!normalCards.every(card => card.suit === suit)) return false;

  // Ace can be used low (A,2,3) or high (Q,K,A).
  const possibleValueSets = buildRunValueOptions(normalCards);

  return possibleValueSets.some(values => canCompleteConsecutiveValues(values, jokers.length));
}

export function isSet(cards) {
  if (!Array.isArray(cards) || cards.length < 3 || cards.length > 4) return false;

  const normalCards = cards.filter(card => !isJoker(card));
  if (normalCards.length === 0) return false;

  const rank = normalCards[0].rank;
  if (!normalCards.every(card => card.rank === rank)) return false;

  // Prevent impossible duplicated suits in one set.
  const suits = new Set();
  for (const card of normalCards) {
    if (suits.has(card.suit)) return false;
    suits.add(card.suit);
  }

  return true;
}

function isJoker(card) {
  return card?.isJoker || card?.rank === "JOKER";
}

function rankToRunValues(rank) {
  if (rank === "A") return [1, 14];
  if (rank === "J") return [11];
  if (rank === "Q") return [12];
  if (rank === "K") return [13];
  return [Number(rank)];
}

function buildRunValueOptions(cards) {
  let options = [[]];

  for (const card of cards) {
    const cardValues = rankToRunValues(card.rank);
    const nextOptions = [];

    for (const option of options) {
      for (const value of cardValues) {
        nextOptions.push([...option, value]);
      }
    }

    options = nextOptions;
  }

  return options;
}

function canCompleteConsecutiveValues(values, jokerCount) {
  const uniqueValues = new Set(values);
  if (uniqueValues.size !== values.length) return false;

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const gaps = max - min + 1 - sorted.length;

  return gaps <= jokerCount;
}
