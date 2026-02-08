import { Deck } from "./deck.js";
import { Player } from "./player.js";
import { isValidMeld, ROUND_RULES } from "./rules.js";

export class GameState {
  constructor(playerNames) {
    this.players = playerNames.map(name => ({ name, hand: [], melds: [], hasComeDown: false }));
    this.deck = new Deck();
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.roundStarted = false;
    this.currentRound = 0;
    this.hasDrawn = false;
    this.topDiscardBuyable = false;
  }

    startRound() {
        this.deck.shuffle();
        this.players.forEach(player => {
            player.hand = [];
            player.melds = [];
            player.hasComeDown = false;
        });
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.roundStarted = true;
        this.hasDrawn = false;
               

        for (let i = 0; i < 13; i++) {
            this.players.forEach(player => player.hand.push(this.deck.draw()));
        }

        const firstDiscard = this.deck.draw();
        if (firstDiscard) {
            this.discardPile.push(firstDiscard);
        }
    }
    
    nextRound(){
        this.currentRound ++;
        if(this.currentRound >= ROUND_RULES.length){
            this.currentRound = 0;
        }
    }

    getcurrentRoundRules(){
        return this.requiredMelds;
    }

    getCurrP(){
        return this.players[this.currentPlayerIndex];
    }

    nextP(){
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.hasDrawn = false;
    }

    drawFromDeck() {
        if (this.hasDrawn){
            return null;
        } 
        const card = this.deck.draw();
        if (card) {
            this.getCurrP().hand.push(card);
            this.hasDrawn = true; 
            this.topDiscardBuyable = true;
        }
        return card;
    }

    drawfromDisc(){
        if(this.hasDrawn){
            return null;
        }
        if (this.discardPile.length === 0){
            return null;
        }
        const card = this.discardPile.pop();
        this.getCurrP().hand.push(card);
        this.hasDrawn = true;
        this.topDiscardBuyable = true;
        return card;
    }

    discardCard(index) {
        const player = this.getCurrP();

        const mustComeDown = !player.hasComeDown && this.canPlayerComeDown(player) &&
            !(this.currentRound === 0 && player.hasComeDown);

        if (mustComeDown) {
            return false;
        }

        const [card] = player.hand.splice(index, 1);
        this.discardPile.push(card);
        this.topDiscardBuyable = true;

        return true;
    }


    showHands(){
        return this.players.map(p => ({name: p.name, hand: p.showHand()}));
    }

    layDownMeld(cardIndices) {
         const player = this.getCurrP();
        const meldCards = cardIndices.map(i => player.hand[i]);

        // BLITZ (round 0)
        if (this.currentRound === 0) {
            // Must use ALL cards
            if (cardIndices.length !== player.hand.length) {
                return false;
            }
            // Only once
            if (player.hasComeDown) {
                return false;
            }
        }
        
        // 1. Basic validation
        if (!isValidMeld(meldCards)){
            return false;
        }

        const roundRules = ROUND_RULES[this.currentRound];
        const firstRule = roundRules[0];

        // 2. If player has NOT come down yet, enforce round rule
        if (!player.hasComeDown) {
            if (firstRule.startsWith("run")) {
                const len = parseInt(firstRule.slice(3));
                if (meldCards.length !== len){
                    return false;
                }
            }

            if (firstRule.startsWith("set")) {
                const len = parseInt(firstRule.slice(3));
                if (meldCards.length !== len){
                    return false;
                }
            }
        }

        // 3. Blitz restriction: only one come-down
        if (this.currentRound === 0 && player.hasComeDown) {
            return false;
        }

        // 4. Apply meld
        player.hand = player.hand.filter((_, i) => !cardIndices.includes(i));
        player.melds.push(meldCards);
        player.hasComeDown = true;

        return true;
    }

    canPlayerComeDown(player) {
        if (player.hasComeDown && this.currentRound === 0) {
            return false;
        }

        if (player.hasComeDown) {
            return true;
        }

        const rule = ROUND_RULES[this.currentRound][0];

        const requiredLength =
            rule.startsWith("run") || rule.startsWith("set")
                ? parseInt(rule.slice(3))
                : null;

        if (!requiredLength){
            return false;
        }

        const hand = player.hand;

        for (let i = 0; i < hand.length; i++) {
            for (let j = i + 1; j < hand.length; j++) {
                for (let k = j + 1; k < hand.length; k++) {
                    const combo = [hand[i], hand[j], hand[k]];

                    if (requiredLength === 4) {
                        for (let l = k + 1; l < hand.length; l++) {
                            const four = [...combo, hand[l]];
                            if (isValidMeld(four)){
                                return true;
                            }
                        }
                    } else {
                        if (isValidMeld(combo)){
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }


    buyDiscard(playerIndex) {
        if (this.discardPile.length === 0){
            return null;
        }
        if (this.hasDrawn){
            return null;
        } 
        const card = this.discardPile.pop();
        this.players[playerIndex].hand.push(card);
        
        if (playerIndex === this.currentPlayerIndex){
            this.hasDrawn = true;
        }

        return card;
    }

    buyDiscardOutOfTurn(playerIndex) {
        if (this.discardPile.length === 0){
            return null;
        }

        const topDiscard = this.discardPile.pop();
        this.players[playerIndex].hand.push(topDiscard);

        const penaltyCard = this.deck.draw();
        if (penaltyCard) {
            this.players[playerIndex].hand.push(penaltyCard);
        }

        // this.currentPlayerIndex = playerIndex;
        // this.hasDrawn = true; 

        return { boughtCard: topDiscard, penaltyCard };
    }

}