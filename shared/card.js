//export key word allows other files to access this file

export const SUITS = ["Hearts", "Diamonds", "Clubs", "Spades"];
export const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

export class card{
    constructor(suit, rank, isJoker = false){
        this.isJoker = isJoker;


        if(isJoker){
            this.suit = null;
            this.rank = "JOKER";
            this.value = 25;
        }
        else{
            this.suit = suit;
            this.rank = rank;
            this.value = this.computeValue(rank);
        }
    }

    computeValue(rank){
        if(rank === "A"){
            return 11;
        }
        if(rank === "K" || rank === "J" || rank === "Q"){
            return 10
        }
        return Number(rank);
    }

    toString(){
        if(this.isJoker){
            return "JOKER";
        }

        return this.rank + " of " + this.suit;
    }

}

export function cardToDisplay(card) {
    if(card.isJoker){
        return "JOKER";
    }

    let suitSymbols = {
        "Hearts": "♥",
        "Diamonds": "♦",
        "Clubs": "♣",
        "Spades": "♠"
    };

    return card.rank + suitSymbols[card.suit];
}