export const ROUND_RULES =[
    ["Blitz"],            
    ["Run3"],                
    ["Set3"],                
    ["Run3", "Set3"],       
    ["Run4"],                
    ["Set4"],              
    ["Run5"]  
]

export function isValidSet(cards){
    if(cards.length < 3){
        return false;
    }

    const rank = cards[0].rank;
    return cards.every(c => c.rank === rank);
}

export function isValidRun(cards) {
    if(cards.length < 3){
        return false;
    }

    const sorted = [...cards].sort((a, b) => a.value - b.value);
    const suit = sorted[0].suit;

    for(let i = 0; i < sorted.length; i++){
        if(sorted[i].suit !== suit){
            return false;
        }
        if(i > 0 && sorted[i].value !== sorted[i-1].value + 1){
            return false;
        }
    }

    return true;
}
export function isValidMeld(cards, rule) {
    if (!cards || cards.length === 0){
        return false;
    }
    if (!rule){
        return false;
    }

    rule = rule.toLowerCase();

    if (rule === "blitz") {
        // Blitz rule: either a run of same suit OR set of 3/4 same rank and same suit
        if (cards.length < 3){
            return false;
        }
        return isBlitzSet(cards) || isRun(cards);
    }

    if (rule.startsWith("set")) {
        const requiredLength = parseInt(rule.slice(3));
        if (cards.length !== requiredLength){
            return false;
        }
        return isSet(cards);
    }

    if (rule.startsWith("run")) {
        const requiredLength = parseInt(rule.slice(3));
        if (cards.length !== requiredLength){
            return false;
        }
        return isRun(cards);
    }

    return false;
}

// Blitz set: 3 or 4 cards of same rank, all same suit
function isBlitzSet(cards) {
    if (cards.length < 3 || cards.length > 4){
        return false;
    }
    const rank = cards[0].rank;
    //const suit = cards[0].suit;
    return cards.every(c => c.rank === rank && c.suit === suit);
}

function isRun(cards) {
    if (cards.length < 3){
        return false;
    }
    const suit = cards[0].suit;
    if (!cards.every(c => c.suit === suit)){
        return false;
    }

    const values = cards.map(c => c.value).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i++) {
        if (values[i] !== values[i - 1] + 1){
            return false;
        }
    }
    return true;
}

// Normal set: same value, different suits allowed
function isSet(cards) {
    if (cards.length < 3){
        return false;
    }
    const value = cards[0].value;
    const suits = new Set();
    for (const card of cards) {
        if (card.value !== value) {
            return false;
        }
        if (suits.has(card.suit)){
            return false;
         }
        suits.add(card.suit);
    }
    return true;
}
