export const ROUND_RULES = [
    ["Blitz"],
    ["Run3"],
    ["Set3"],
    ["Run3", "Set3"],
    ["Run4"],
    ["Set4"],
    ["Run5"]
];



export function isValidMeld(cards, rule) {
    if (!cards || cards.length === 0 || !rule){
        return false;
    }

    rule = rule.toLowerCase();

    if (rule === "blitz") {
        return isRun(cards) || isBlitzSet(cards);
    }

    if (rule.startsWith("run")) {
        const len = Number(rule.slice(3));
        return cards.length === len && isRun(cards);
    }

    if (rule.startsWith("set")) {
        const len = Number(rule.slice(3));
        return cards.length === len && isSet(cards);
    }

    return false;
}



function isRun(cards) {
    if (cards.length < 3){
        return false;
    }

    const jokers = cards.filter(c => c.rank === "JOKER");
    const normal = cards.filter(c => c.rank !== "JOKER");

    if (normal.length === 0){
        return false;
    }

    const suit = normal[0].suit;
    if (!normal.every(c => c.suit === suit)){
        return false;
    }

    const rankMap = {
        A: 1,
        J: 11,
        Q: 12,
        K: 13
    };

    const values = normal
        .map(c => rankMap[c.rank] ?? Number(c.rank))
        .sort((a, b) => a - b);

    const min = values[0];
    const max = values[values.length - 1];

    const needed = max - min + 1;
    const gaps = needed - values.length;

    return gaps <= jokers.length;
}



function isSet(cards) {
    if (cards.length < 3){
        return false;
    }

    const rank = cards[0].rank;
    const suits = new Set();

    for (const card of cards) {
        if (card.rank !== rank){
            return false;
        }
        if (suits.has(card.suit)){
            return false;
        }
        suits.add(card.suit);
    }

    return true;
}



function isBlitzSet(cards) {
    if (cards.length < 3 || cards.length > 4){
        return false;
    }

    const rank = cards[0].rank;
    return cards.every(c => c.rank === rank);
}
