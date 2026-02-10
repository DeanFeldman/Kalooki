import { cardToDisplay } from "../shared/card.js";
import { GameState } from "../shared/gamestate.js";
import { ROUND_RULES } from "../shared/rules.js";

//let game = new GameState(["Player1", "Player2", "Player3", "Player4"]);
let game = new GameState(["Player1", "Player2"]);


const handsP = document.getElementById("hands");
const drawBtn = document.getElementById("drawButton");
const discardBtn = document.getElementById("discardButton");
const turnP = document.getElementById("turn");
const startRoundBtn = document.getElementById("startRoundButton");
const pickDiscardBtn = document.getElementById("pickDiscardButton");
const resetBtn = document.getElementById("resetButton");

let selectedCardIndex = null;
let selectedCardIndices = []; 

let draggedCardIndex = null;
let draggedFromPlayerIndex = null;


const playerElements = [
  document.getElementById("player1"),
  document.getElementById("player2"),
  document.getElementById("player3"),
  document.getElementById("player4")
];

function renderHands() {
    game.players.forEach((player, i) => {
        const playerP = playerElements[i];
        playerP.innerHTML = "";

        // Player name
        const nameSpan = document.createElement("span");
        //nameSpan.textContent = player.name + (i === game.currentPlayerIndex ? " ← Your Turn" : "") + ": ";
        playerP.appendChild(nameSpan);

        // Player hand
        player.hand.forEach((card, index) => {
        const cardSpan = document.createElement("span");
        cardSpan.textContent = cardToDisplay(card);
        cardSpan.className = "card";
        if (card.suit === "Hearts" || card.suit === "Diamonds"){
            cardSpan.classList.add("red");
        }
        if (selectedCardIndices.includes(index)){
            cardSpan.classList.add("selected");
        }

        if (i === game.currentPlayerIndex) {
            
            cardSpan.addEventListener("click", () => {
                const idx = selectedCardIndices.indexOf(index);
                if (idx > -1){
                    selectedCardIndices.splice(idx, 1);
                }
                else{
                    selectedCardIndices.push(index);
                }
                renderHands();
            });

            
            cardSpan.draggable = true;
            cardSpan.addEventListener("dragstart", () => {
                draggedCardIndex = index;
                draggedFromPlayerIndex = i;
            });

            
            cardSpan.addEventListener("dragover", (e) => {
                e.preventDefault(); 
            });

            // Drop to reorder
            cardSpan.addEventListener("drop", () => {
                if (draggedCardIndex === null || draggedFromPlayerIndex !== i){
                    return;
                }

                const hand = player.hand;
                const draggedCard = hand[draggedCardIndex];

                hand.splice(draggedCardIndex, 1);

                hand.splice(index, 0, draggedCard);

                draggedCardIndex = null;
                draggedFromPlayerIndex = null;

                renderHands();
            });
        }

        playerP.appendChild(cardSpan);
    });


        // Player melds (on table)
        if (player.melds.length > 0) {
            const meldDiv = document.createElement("div");
            meldDiv.textContent = "Melds: ";

            player.melds.forEach(meld => {
                const meldSpan = document.createElement("span");
                meldSpan.textContent = "[" + meld.map(cardToDisplay).join(" ") + "]";
                meldSpan.style.marginRight = "8px";
                meldDiv.appendChild(meldSpan);
            });

            playerP.appendChild(document.createElement("br"));
            playerP.appendChild(meldDiv);
        }


        // Come Down button for current player
        if (i === game.currentPlayerIndex) {
            const comeDownBtn = document.createElement("button");
            comeDownBtn.textContent = "Come Down";
            
            comeDownBtn.addEventListener("click", () => {
                if (selectedCardIndices.length === 0) { 
                    alert("Select cards to come down!");
                    return;
                }

                if (!game.canComeDown()) {
                    alert("You cannot come down yet! Use all cards first (Blitz rule).");
                    return;
                }

                const success = game.layDownMeld(selectedCardIndices);
                if (success) {
                    alert("Meld laid down!");
                    selectedCardIndices = [];
                    renderHands();
                } else {
                    alert("Invalid meld.");
                }
            });

            playerP.appendChild(document.createElement("br"));
            playerP.appendChild(comeDownBtn);
        }


        // Buy Top Discard button for other players
        if (i !== game.currentPlayerIndex) {
            playerP.appendChild(document.createElement("br"));

            const buyBtn = document.createElement("button");
            buyBtn.textContent = "Buy Top Discard";
            buyBtn.disabled = !(game.topDiscardBuyable && i !== game.currentPlayerIndex);
            buyBtn.addEventListener("click", () => {
                buyTopDiscardForPlayer(i);
            });

            playerP.appendChild(buyBtn);
        }


    });
    if (game.roundOver) {
        turnP.textContent =`Blitz finished! Winner: ${game.players[game.winnerIndex].name}`;
        setActionButtons(false);
    } else {
        turnP.textContent = `Current turn: ${game.getCurrP().name}`;
        setActionButtons(true);
    }
    
    // Show scores along with player names
    game.players.forEach((player, i) => {
        const playerP = playerElements[i];

        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${player.name} (Score: ${player.score || 0})`;
        playerP.appendChild(nameSpan);

        playerP.appendChild(document.createElement("br")); // line break before hand
    });




    // Discard pile
    const discardP = document.getElementById("discardPile");
    discardP.innerHTML = "Discard pile: ";
    if (game.discardPile.length > 0) {
        const topCard = game.discardPile[game.discardPile.length - 1];
        const cardSpan = document.createElement("span");
        cardSpan.textContent = cardToDisplay(topCard);
        cardSpan.className = "card";
        if (topCard.suit === "Hearts" || topCard.suit === "Diamonds") cardSpan.style.color = "red";
        discardP.appendChild(cardSpan);
    }

    if (!game.roundOver) {
        turnP.textContent = `Current turn: ${game.getCurrP().name}`;
    }

    const roundTextP = document.getElementById("roundText");
    if(roundTextP){
        roundTextP.textContent = game.roundStarted
            ? "Current Game Mode: " + ROUND_RULES[game.currentRound].join(", ")
            : "Current Game Mode: Not started";
    }
}



function attemptComeDown(playerIndex) {
    const player = game.players[playerIndex];
    
    if (selectedCardIndex === null) {
        alert("Select card(s) to lay down as a meld.");
        return;
    }

    const cardIndices = [selectedCardIndex]; 
    const success = game.layDownMeld(cardIndices);

    if (success) {
        selectedCardIndices = [];

        if (game.roundOver) {
            renderHands();
            return;
        }

        game.nextP();
        renderHands();
    }
    else {
        alert("Invalid meld! Check the rules for this round.");
    }
}



function buyDiscardForPlayer(playerIndex) {
  if (game.currentPlayerIndex === playerIndex) {
    alert("It's already your turn! Use Draw instead.");
    return;
  }

  const result = game.buyDiscardOutOfTurn(playerIndex);
  if (result) {
    alert(`${game.players[playerIndex].name} bought ${cardToDisplay(result.boughtCard)} and drew a penalty card!`);
    renderHands();
  } else {
    alert("Cannot buy discard!");
  }
}

function setActionButtons(enabled) {
    drawBtn.disabled = !enabled;
    pickDiscardBtn.disabled = !enabled;
    discardBtn.disabled = !enabled;
}


function buyTopDiscardForPlayer(playerIndex) {
    const player = game.players[playerIndex];

    
    if (!game.topDiscardBuyable) {
        alert("Cannot buy the discard yet!");
        return;
    }

    if (playerIndex === game.currentPlayerIndex) {
        alert("It's your turn! Draw instead.");
        return;
    }

    if (game.discardPile.length === 0){
        return;
    }

    const topCard = game.discardPile.pop();
    player.hand.push(topCard);

    const extraCard = game.deck.draw();
    if (extraCard){
        player.hand.push(extraCard);
    }

    game.topDiscardBuyable = false; 

    renderHands();
}

drawBtn.addEventListener("click", () => {
  if (game.hasDrawn) {
    alert("You can only draw once per turn!");
    return;
  }
  game.drawFromDeck();
  renderHands();
});

pickDiscardBtn.addEventListener("click", () => {
  const currIndex = game.currentPlayerIndex;
  if (game.hasDrawn) {
    alert("You can only draw once per turn!");
    return;
  }

  const boughtCard = game.buyDiscard(currIndex);
  if (boughtCard) {
    renderHands();
  } else {
    alert("Cannot buy the discard pile!");
  }
});


discardBtn.addEventListener("click", () => {
    if (selectedCardIndices.length === 0) {
        alert("Select card(s) to discard first!");
        return;
    }

    // Discard all selected cards
    // Sort indices descending to avoid messing up indices when splicing
    selectedCardIndices.sort((a, b) => b - a);
    for (const index of selectedCardIndices) {
        const success = game.discardCard(index);
        if (!success) {
            alert("You cannot discard yet! Finish your Blitz first.");
            return;
        }
    }

    selectedCardIndices = [];
    game.nextP();
    renderHands();
});


startRoundBtn.addEventListener("click", () => {
  game.startRound();
  startRoundBtn.disabled = true;
  drawBtn.disabled = false;
  pickDiscardBtn.disabled = false;
  discardBtn.disabled = false;
  setActionButtons(true);

  renderHands();
  
});

resetBtn.addEventListener("click", () => {
  game = new GameState(["Player1", "Player2", "Player3", "Player4"]);
  game.deck.shuffle();
  selectedCardIndex = null;
  startRoundBtn.disabled = false;
  drawBtn.disabled = true;
  pickDiscardBtn.disabled = true;
  discardBtn.disabled = true;
  renderHands();
});

renderHands();
