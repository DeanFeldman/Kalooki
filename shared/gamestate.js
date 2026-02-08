import { Deck } from "./deck.js";
import { Player } from "./player.js";

export class GameState {
    constructor(Playernames){
        this.players = Playernames.map(name => new Player(name));
        this.deck = new Deck();
        this.discardPile = [];
        this.currentPlayerIndex = 0;
    }

    startRound(initialHandsize = 13){
        for (let i = 0; i < initialHandsize; i++){
            for(let p = 0; p <this.players.length; p++){
                this.players[p].drawCard(this.deck);
            }
        }

        const FirstDisc = this.deck.draw();
        if(FirstDisc){
            this.discardPile.push(FirstDisc);
        }
    }

    getCurrP(){
        return this.players[this.currentPlayerIndex];
    }

    nextP(){
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }

    drawfromDeck(){
        const P = this.getCurrP();
        return P.drawCard(this.deck);
    }

    drawfromDisc(){
        const P = this.getCurrP();
        const C = this.discardPile.pop();
        if(C){
            P.hand.push(C);
        }
        return card;
    }

    discardCard(index){
        const P = this.getCurrP();
        return P.discardCard(index, this.discardPile);
    }

    showHands(){
        return this.players.map(p => ({name: p.name, hand: p.showHand()}));
    }

}