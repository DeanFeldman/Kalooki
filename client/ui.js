import { GameState } from "../shared/gamestate.js";

const game = new GameState(["Dean", "Ricci"]);
game.startRound();

const handsP = document.getElementById("hands");
const drawBtn = document.getElementById("drawButton");
const discardBtn = document.getElementById("discardButton");
const turnP = document.getElementById("turn");

let selectedCardIndex = null;

function renderHands() {
    handsP.innerHTML = ""; 

    game.players.forEach(player => {
        const playerP = document.createElement("p"); 
        playerP.className = "player";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = player.name + (game.getCurrP() === player ? " ← Your Turn" : "") + ": ";
        playerP.appendChild(nameSpan);

        player.hand.forEach((card, index) => {
            const cardSpan = document.createElement("span");
            cardSpan.textContent = card.toString();
            cardSpan.className = "card";

            if(index === selectedCardIndex) cardSpan.classList.add("selected");

            cardSpan.addEventListener("click", () => {
                selectedCardIndex = index;
                renderHands();
            });

            playerP.appendChild(cardSpan);
        });

        handsP.appendChild(playerP);
    });

    const discardTop = game.discardPile.length ? game.discardPile[game.discardPile.length - 1].toString() : "empty";
    const discardP = document.createElement("p");
    discardP.textContent = "Discard pile: " + discardTop;
    discardP.style.fontWeight = "bold";
    handsP.appendChild(discardP);

    turnP.textContent = "Current turn: " + game.getCurrP().name;
}

renderHands();

drawBtn.addEventListener("click", () => {
    game.drawfromDeck();
    renderHands();
});

discardBtn.addEventListener("click", () => {
    if(selectedCardIndex !== null){
        game.discardCard(selectedCardIndex);
        game.nextPlayer();
        selectedCardIndex = null;
        renderHands();
    } else {
        alert("Select a card to discard first!");
    }
});
