import {card, SUITS,RANKS} from "./card.js";

export class Deck {
    constructor(){
        this.cards = [];
        this.buildDeck();
        this.shuffle();
    }

    buildDeck(){
        //standard deck
        for(let d = 0; d < 2; d++){                     //d = deck
            for(let s = 0; s <SUITS.length; s++){       //s = suit
                for(let r = 0; r < RANKS.length; r++){  //r = rank
                    const suit = SUITS[s];
                    const rank = RANKS[r];

                    this.cards.push(new card(suit ,rank));

                }
            }
        }

        //add 4 jokers
        for(let j = 0; j < 4; j++){
            this.cards.push(new card(null, null ,true));
        }
    }

    shuffle(){
        for(let i = this.cards.length -1; i>0; i--){
            const j = Math.floor(Math.random()*(i+1));
            const temp = this.cards[i];
            this.cards[i] = this.cards[j];
            this.cards[j] = temp;
        }
    }

    draw(){
        return this.cards.pop();
    }

    size(){
        return this.cards.length;
    }


}