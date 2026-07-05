import { cardToDisplay, isRedCard } from "../shared/card.js";
import { GameState } from "../shared/gamestate.js";
import { formatRule, ROUND_RULES } from "../shared/rules.js";

const els = {
  players: document.getElementById("players"),
  drawBtn: document.getElementById("drawButton"),
  discardBtn: document.getElementById("discardButton"),
  turn: document.getElementById("turn"),
  startRoundBtn: document.getElementById("startRoundButton"),
  pickDiscardBtn: document.getElementById("pickDiscardButton"),
  resetBtn: document.getElementById("resetButton"),
  roundSelect: document.getElementById("roundSelect"),
  jumpRoundBtn: document.getElementById("jumpRoundButton"),
  comeDownBtn: document.getElementById("comeDownButton"),
  discardPile: document.getElementById("discardPile"),
  roundText: document.getElementById("roundText"),
  statusText: document.getElementById("statusText"),
  deckCount: document.getElementById("deckCount"),
  playerNamesInput: document.getElementById("playerNamesInput"),
  buyHint: document.getElementById("buyHint")
};

let game = new GameState(getNamesFromInput());
let selectedCardIndices = [];
let draggedCardIndex = null;

populateRoundSelect();
render();

els.startRoundBtn.addEventListener("click", () => {
  if (!game.startRound()) return;
  selectedCardIndices = [];
  render();
});

els.drawBtn.addEventListener("click", () => {
  if (!game.drawFromDeck()) {
    showMessage("You can only draw once per turn, and the round must be started.");
  }
  selectedCardIndices = [];
  render();
});

els.pickDiscardBtn.addEventListener("click", () => {
  if (!game.drawFromDiscard()) {
    showMessage("You cannot pick up the discard right now.");
  }
  selectedCardIndices = [];
  render();
});

els.comeDownBtn.addEventListener("click", () => {
  if (selectedCardIndices.length === 0) {
    showMessage("Select the cards you want to lay down first.");
    return;
  }

  if (!game.canComeDown(selectedCardIndices)) {
    showMessage("Blitz rule: select every card, or all except one card to discard.");
    return;
  }

  if (!game.layDownMeld(selectedCardIndices)) {
    showMessage("That selection is not a valid meld for this round.");
    return;
  }

  selectedCardIndices = [];
  render();
});

els.discardBtn.addEventListener("click", () => {
  if (selectedCardIndices.length !== 1) {
    showMessage("Select exactly one card to discard.");
    return;
  }

  const didDiscard = game.discardCard(selectedCardIndices[0]);
  if (!didDiscard) {
    showMessage("You must draw first, then discard exactly once.");
    return;
  }

  selectedCardIndices = [];
  if (game.roundStarted) game.nextP();
  render();
});

els.jumpRoundBtn.addEventListener("click", () => {
  const roundIndex = Number(els.roundSelect.value);
  if (!game.jumpToRound(roundIndex)) {
    showMessage("Choose a valid round.");
  }
  selectedCardIndices = [];
  render();
});

els.resetBtn.addEventListener("click", () => {
  game.resetGame(getNamesFromInput());
  selectedCardIndices = [];
  populateRoundSelect();
  render();
});

els.playerNamesInput.addEventListener("change", () => {
  if (!game.roundStarted) {
    game.resetGame(getNamesFromInput());
    selectedCardIndices = [];
    render();
  }
});

function render() {
  renderGameStatus();
  renderDiscardPile();
  renderPlayers();
  updateButtons();
}

function renderGameStatus() {
  const rules = ROUND_RULES[game.currentRound];
  const currentPlayer = game.getCurrP();

  els.deckCount.textContent = String(game.deck.size());
  els.roundSelect.value = String(Math.min(game.currentRound, ROUND_RULES.length - 1));

  if (game.gameFinished) {
    els.roundText.textContent = "Game complete";
    els.turn.textContent = `Winner: ${getOverallWinnerText()}`;
  } else if (game.roundStarted) {
    els.roundText.textContent = `Round ${game.currentRound + 1}: ${rules.map(formatRule).join(" + ")}`;
    els.turn.textContent = `Current turn: ${currentPlayer.name}`;
  } else if (game.betweenRounds) {
    els.roundText.textContent = `Next round: ${ROUND_RULES[game.currentRound].map(formatRule).join(" + ")}`;
    els.turn.textContent = "Round finished";
  } else {
    els.roundText.textContent = `Current Game Mode: ${rules ? rules.map(formatRule).join(" + ") : "Not started"}`;
    els.turn.textContent = "Current turn: Not started";
  }

  els.statusText.textContent = game.lastMessage;
  els.buyHint.textContent = game.topDiscardBuyable
    ? "Buying is available for non-current players."
    : "Buying is not available right now.";
}

function renderDiscardPile() {
  els.discardPile.innerHTML = "";

  const topCard = game.discardPile.at(-1);
  if (!topCard) {
    els.discardPile.textContent = "Empty";
    els.discardPile.className = "discard-card empty";
    return;
  }

  const cardEl = createCardElement(topCard, { selectable: false });
  els.discardPile.className = "discard-card";
  els.discardPile.appendChild(cardEl);
}

function renderPlayers() {
  els.players.innerHTML = "";

  for (let playerIndex = 0; playerIndex < game.players.length; playerIndex++) {
    const player = game.players[playerIndex];
    const isCurrentPlayer = playerIndex === game.currentPlayerIndex && game.roundStarted;
    const card = document.createElement("article");
    card.className = `player-card${isCurrentPlayer ? " active" : ""}`;

    const header = document.createElement("header");
    header.className = "player-header";
    header.innerHTML = `
      <div>
        <h3>${escapeHtml(player.name)}</h3>
        <p>${player.hasComeDown ? "Came down" : remainingRuleText(player)}</p>
      </div>
      <strong>${player.score}</strong>
    `;
    card.appendChild(header);

    const hand = document.createElement("div");
    hand.className = "hand";
    hand.ariaLabel = `${player.name}'s hand`;

    player.hand.forEach((playerCard, cardIndex) => {
      hand.appendChild(createCardElement(playerCard, {
        selectable: isCurrentPlayer,
        selected: isCurrentPlayer && selectedCardIndices.includes(cardIndex),
        draggable: isCurrentPlayer,
        onClick: () => toggleSelectedCard(cardIndex),
        onDragStart: () => { draggedCardIndex = cardIndex; },
        onDrop: () => reorderCurrentPlayerHand(cardIndex)
      }));
    });

    card.appendChild(hand);

    if (player.melds.length > 0) {
      const melds = document.createElement("div");
      melds.className = "melds";
      const title = document.createElement("p");
      title.textContent = "Melds on table";
      melds.appendChild(title);

      player.melds.forEach((meld, meldIndex) => {
        const meldEl = document.createElement("button");
        meldEl.type = "button";
        meldEl.className = "meld";
        meldEl.title = "Select one card from your hand, then click a meld to add it.";
        meldEl.innerHTML = meld.map(cardItem => `<span class="mini-card${isRedCard(cardItem) ? " red" : ""}">${cardToDisplay(cardItem)}</span>`).join("");
        meldEl.addEventListener("click", () => addSelectedCardToMeld(playerIndex, meldIndex));
        melds.appendChild(meldEl);
      });

      card.appendChild(melds);
    }

    if (game.roundStarted && playerIndex !== game.currentPlayerIndex) {
      const buyButton = document.createElement("button");
      buyButton.type = "button";
      buyButton.className = "buy-button";
      buyButton.textContent = "Buy Top Discard";
      buyButton.disabled = !game.topDiscardBuyable || game.discardPile.length === 0;
      buyButton.addEventListener("click", () => buyTopDiscardForPlayer(playerIndex));
      card.appendChild(buyButton);
    }

    els.players.appendChild(card);
  }
}

function createCardElement(card, options = {}) {
  const cardEl = document.createElement("button");
  cardEl.type = "button";
  cardEl.className = `card${isRedCard(card) ? " red" : ""}${options.selected ? " selected" : ""}`;
  cardEl.textContent = cardToDisplay(card);
  cardEl.title = card?.toString?.() ?? cardToDisplay(card);
  cardEl.disabled = options.selectable === false;

  if (options.selectable) {
    cardEl.addEventListener("click", options.onClick);
  }

  if (options.draggable) {
    cardEl.draggable = true;
    cardEl.addEventListener("dragstart", options.onDragStart);
    cardEl.addEventListener("dragover", event => event.preventDefault());
    cardEl.addEventListener("drop", event => {
      event.preventDefault();
      options.onDrop();
    });
  }

  return cardEl;
}

function toggleSelectedCard(cardIndex) {
  const existingIndex = selectedCardIndices.indexOf(cardIndex);
  if (existingIndex >= 0) selectedCardIndices.splice(existingIndex, 1);
  else selectedCardIndices.push(cardIndex);
  selectedCardIndices.sort((a, b) => a - b);
  render();
}

function reorderCurrentPlayerHand(dropIndex) {
  if (draggedCardIndex === null || draggedCardIndex === dropIndex) return;

  const hand = game.getCurrP().hand;
  const [movedCard] = hand.splice(draggedCardIndex, 1);
  hand.splice(dropIndex, 0, movedCard);

  draggedCardIndex = null;
  selectedCardIndices = [];
  render();
}

function addSelectedCardToMeld(playerIndex, meldIndex) {
  if (selectedCardIndices.length !== 1) {
    showMessage("Select exactly one card from the current player's hand first.");
    return;
  }

  const didAdd = game.addCardToMeld(playerIndex, meldIndex, selectedCardIndices[0]);
  if (!didAdd) {
    showMessage("That card cannot be added to this meld. You must have come down first.");
    return;
  }

  selectedCardIndices = [];
  render();
}

function buyTopDiscardForPlayer(playerIndex) {
  const result = game.buyDiscardOutOfTurn(playerIndex);
  if (!result) {
    showMessage("That player cannot buy the discard right now.");
    return;
  }

  selectedCardIndices = [];
  render();
}

function updateButtons() {
  const roundActive = game.roundStarted && !game.gameFinished;
  const canDraw = roundActive && !game.hasDrawn && !game.hasDiscarded;
  const canActAfterDraw = roundActive && game.hasDrawn && !game.hasDiscarded;

  els.startRoundBtn.disabled = game.roundStarted || game.gameFinished;
  els.drawBtn.disabled = !canDraw;
  els.pickDiscardBtn.disabled = !canDraw || game.discardPile.length === 0;
  els.comeDownBtn.disabled = !canActAfterDraw || selectedCardIndices.length === 0;
  els.discardBtn.disabled = !canActAfterDraw || selectedCardIndices.length !== 1;
  els.jumpRoundBtn.disabled = game.roundStarted;
  els.playerNamesInput.disabled = game.roundStarted;
}

function populateRoundSelect() {
  els.roundSelect.innerHTML = "";
  ROUND_RULES.forEach((rules, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${rules.map(formatRule).join(" + ")}`;
    els.roundSelect.appendChild(option);
  });
}

function getNamesFromInput() {
  return els.playerNamesInput.value
    .split(",")
    .map(name => name.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function remainingRuleText(player) {
  if (game.roundStarted && player.remainingRules.length > 0) {
    return `Needs: ${player.remainingRules.map(formatRule).join(" + ")}`;
  }
  return `${player.hand.length} cards`;
}

function getOverallWinnerText() {
  const orderedPlayers = [...game.players].sort((a, b) => a.score - b.score);
  const bestScore = orderedPlayers[0]?.score ?? 0;
  const winners = orderedPlayers.filter(player => player.score === bestScore).map(player => player.name);
  return `${winners.join(" & ")} (${bestScore} points)`;
}

function showMessage(message) {
  game.lastMessage = message;
  els.statusText.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
