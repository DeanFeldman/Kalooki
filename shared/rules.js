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

export function isValidMeld(cards) {
    return isValidSet(cards) || isValidRun(cards);
}