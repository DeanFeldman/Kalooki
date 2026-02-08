export class Player{
    constructor(name){
        this.name = name;
        this.hand = [];
        this.melds = [];
    }

    drawCard(deck){
        const card = deck.draw();
        if(card){
            this.hand.push(card);
        }
        return card;
    }

    discardCard(index, discardPile){
        if(index <0 || index >= this.hand.length){
            return null;
        }
        
        const card = this.hand.splice(index,1)[0];
        discardPile.push(card);
        return card;
    }

    showHand(){
        return this.hand.map(card => card.toString());
    }
}