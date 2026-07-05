import { cardToDisplay, isRedCard } from "../shared/card.js";
import { formatRule, ROUND_RULES } from "../shared/rules.js";

const els = {
  lobbyPanel: document.getElementById("lobbyPanel"),
  roomPanel: document.getElementById("roomPanel"),
  createRoomBtn: document.getElementById("createRoomButton"),
  joinRoomBtn: document.getElementById("joinRoomButton"),
  copyRoomBtn: document.getElementById("copyRoomButton"),
  leaveRoomBtn: document.getElementById("leaveRoomButton"),
  playerNameInput: document.getElementById("playerNameInput"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  roomCodeText: document.getElementById("roomCodeText"),
  viewerText: document.getElementById("viewerText"),
  connectionText: document.getElementById("connectionText"),
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
  buyHint: document.getElementById("buyHint"),
  hostHint: document.getElementById("hostHint")
};

let socket = null;
let state = null;
let joinedRoom = false;
let selectedCardIndices = [];
let draggedCardIndex = null;
let reconnectTimer = null;
let manualLeave = false;

const savedName = localStorage.getItem("kalooki_player_name");
const savedRoom = localStorage.getItem("kalooki_room_code");
const savedPlayerId = localStorage.getItem("kalooki_player_id");

if (savedName) els.playerNameInput.value = savedName;
if (savedRoom) els.roomCodeInput.value = savedRoom;

populateRoundSelect();
connectSocket();
render();

els.createRoomBtn.addEventListener("click", () => {
  manualLeave = false;
  localStorage.setItem("kalooki_player_name", cleanNameInput());
  send("createRoom", { playerName: cleanNameInput() });
});

els.joinRoomBtn.addEventListener("click", () => {
  manualLeave = false;
  localStorage.setItem("kalooki_player_name", cleanNameInput());
  send("joinRoom", { playerName: cleanNameInput(), roomCode: els.roomCodeInput.value });
});

els.copyRoomBtn.addEventListener("click", async () => {
  if (!state?.roomCode) return;
  const inviteUrl = `${location.origin}?room=${state.roomCode}`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showMessage("Invite link copied.");
  } catch {
    showMessage(`Room code: ${state.roomCode}`);
  }
});

els.leaveRoomBtn.addEventListener("click", () => {
  manualLeave = true;
  joinedRoom = false;
  state = null;
  selectedCardIndices = [];
  localStorage.removeItem("kalooki_room_code");
  localStorage.removeItem("kalooki_player_id");
  if (socket) socket.close();
  connectSocket();
  render();
});

els.startRoundBtn.addEventListener("click", () => {
  selectedCardIndices = [];
  send("startRound");
});

els.drawBtn.addEventListener("click", () => {
  selectedCardIndices = [];
  send("drawDeck");
});

els.pickDiscardBtn.addEventListener("click", () => {
  selectedCardIndices = [];
  send("drawDiscard");
});

els.comeDownBtn.addEventListener("click", () => {
  if (selectedCardIndices.length === 0) {
    showMessage("Select the cards you want to lay down first.");
    return;
  }

  send("layMeld", { cardIndices: selectedCardIndices });
  selectedCardIndices = [];
});

els.discardBtn.addEventListener("click", () => {
  if (selectedCardIndices.length !== 1) {
    showMessage("Select exactly one card to discard.");
    return;
  }

  send("discard", { cardIndex: selectedCardIndices[0] });
  selectedCardIndices = [];
});

els.jumpRoundBtn.addEventListener("click", () => {
  selectedCardIndices = [];
  send("jumpRound", { roundIndex: Number(els.roundSelect.value) });
});

els.resetBtn.addEventListener("click", () => {
  selectedCardIndices = [];
  send("resetGame");
});

window.addEventListener("beforeunload", () => {
  localStorage.setItem("kalooki_player_name", cleanNameInput());
});

function connectSocket() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);

  socket.addEventListener("open", () => {
    manualLeave = false;
    updateConnectionText("Online");
    showMessage("Connected. Create a room, or enter a room code and join.");

    const params = new URLSearchParams(location.search);
    const urlRoom = params.get("room");
    const currentSavedPlayerId = localStorage.getItem("kalooki_player_id");
    if (urlRoom && !currentSavedPlayerId && !joinedRoom) {
      els.roomCodeInput.value = urlRoom;
    }

    const roomCode = localStorage.getItem("kalooki_room_code");
    const playerId = localStorage.getItem("kalooki_player_id");
    if (roomCode && playerId && !joinedRoom) {
      showMessage("Rejoining your previous room...");
      send("rejoinRoom", { roomCode, playerId });
    }

    render();
  });

  socket.addEventListener("message", event => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "connected") {
      updateConnectionText("Online");
      if (!state) showMessage("Connected. Create a room, or enter a room code and join.");
      render();
      return;
    }

    if (message.type === "roomJoined") {
      joinedRoom = true;
      localStorage.setItem("kalooki_room_code", message.roomCode);
      localStorage.setItem("kalooki_player_id", message.playerId);
      els.roomCodeInput.value = message.roomCode;
      showMessage("Room joined. Waiting for the room state...");
      render();
      return;
    }

    if (message.type === "state") {
      state = message.state;
      joinedRoom = true;
      render();
      return;
    }

    if (message.type === "error") {
      showMessage(message.message);
    }
  });

  socket.addEventListener("close", () => {
    updateConnectionText("Offline");
    showMessage(manualLeave ? "Left room." : "Disconnected. Trying to reconnect...");
    render();
    if (!manualLeave) {
      reconnectTimer = setTimeout(connectSocket, 1200);
    }
  });
}

function send(type, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showMessage("Not connected to the server yet.");
    return;
  }
  socket.send(JSON.stringify({ type, payload }));
}

function render() {
  renderRoomPanels();
  renderGameStatus();
  renderDiscardPile();
  renderPlayers();
  updateButtons();
}

function renderRoomPanels() {
  els.lobbyPanel.classList.toggle("hidden", joinedRoom && Boolean(state));
  els.roomPanel.classList.toggle("hidden", !state);

  if (!state) {
    els.roomCodeText.textContent = "—";
    els.viewerText.textContent = "—";
    return;
  }

  const viewer = state.game.players[state.viewerPlayerIndex];
  els.roomCodeText.textContent = state.roomCode;
  els.viewerText.textContent = viewer ? `${viewer.name}${state.isHost ? " · Host" : ""}` : "Spectator";
}

function renderGameStatus() {
  const game = state?.game;
  const rules = game?.roundRules?.[game.currentRound] ?? ROUND_RULES[0];
  const currentPlayer = game?.players?.[game.currentPlayerIndex];

  els.deckCount.textContent = String(game?.deckCount ?? 0);
  els.roundSelect.value = String(Math.min(game?.currentRound ?? 0, ROUND_RULES.length - 1));

  if (!state) {
    els.roundText.textContent = "Create or join a room to begin.";
    els.turn.textContent = "Current turn: Not started";
    els.statusText.textContent = socket?.readyState === WebSocket.OPEN ? "Connected. Create or join a room." : "Connecting to server...";
    els.buyHint.textContent = "Buying is not available yet.";
    els.hostHint.textContent = "Host controls unlock after you create a room.";
    return;
  }

  if (game.gameFinished) {
    els.roundText.textContent = "Game complete";
    els.turn.textContent = `Winner: ${getOverallWinnerText()}`;
  } else if (game.roundStarted) {
    els.roundText.textContent = `Round ${game.currentRound + 1}: ${rules.map(formatRule).join(" + ")}`;
    els.turn.textContent = `Current turn: ${currentPlayer?.name ?? "Unknown"}`;
  } else if (game.betweenRounds) {
    const nextRules = game.roundRules[game.currentRound] ?? [];
    els.roundText.textContent = `Next round: ${nextRules.map(formatRule).join(" + ")}`;
    els.turn.textContent = "Round finished";
  } else {
    els.roundText.textContent = `Room ${state.roomCode}: waiting to start`;
    els.turn.textContent = state.seats.length < 2 ? "Waiting for another player" : "Ready to start";
  }

  if (!game.lastMessage && state.isHost && state.seats.length < 2) {
    els.statusText.textContent = "Share the invite link or room code. You need at least 2 players before the round can start.";
  } else {
    els.statusText.textContent = game.lastMessage;
  }
  els.buyHint.textContent = game.topDiscardBuyable
    ? "Non-current players can buy the top discard."
    : "Buying is not available right now.";
  els.hostHint.textContent = state.isHost
    ? "You are the host. You can start rounds, reset, and jump rounds."
    : "Only the host can start rounds, reset, or jump rounds.";
}

function renderDiscardPile() {
  els.discardPile.innerHTML = "";

  const topCard = state?.game?.discardTop;
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

  const players = state?.game?.players ?? [];
  if (!players.length) {
    const empty = document.createElement("article");
    empty.className = "player-card empty-player";
    empty.innerHTML = `<h3>No room yet</h3><p>Create a room, then share the invite link.</p>`;
    els.players.appendChild(empty);
    return;
  }

  for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
    const player = players[playerIndex];
    const isCurrentPlayer = playerIndex === state.game.currentPlayerIndex && state.game.roundStarted;
    const isViewer = player.isViewer;
    const card = document.createElement("article");
    card.className = `player-card${isCurrentPlayer ? " active" : ""}${isViewer ? " viewer" : ""}${!player.connected ? " disconnected" : ""}`;

    const header = document.createElement("header");
    header.className = "player-header";
    header.innerHTML = `
      <div>
        <h3>${escapeHtml(player.name)}${isViewer ? " <span>You</span>" : ""}</h3>
        <p>${playerStatusText(player)}</p>
      </div>
      <strong>${player.score}</strong>
    `;
    card.appendChild(header);

    const hand = document.createElement("div");
    hand.className = "hand";
    hand.ariaLabel = `${player.name}'s hand`;

    if (isViewer && player.hand.length > 0) {
      player.hand.forEach((playerCard, cardIndex) => {
        hand.appendChild(createCardElement(playerCard, {
          selectable: canUseHand(playerIndex),
          selected: selectedCardIndices.includes(cardIndex),
          draggable: canUseHand(playerIndex),
          onClick: () => toggleSelectedCard(cardIndex),
          onDragStart: () => { draggedCardIndex = cardIndex; },
          onDrop: () => reorderCurrentPlayerHand(cardIndex)
        }));
      });
    } else if (player.handCount > 0) {
      for (let i = 0; i < player.handCount; i++) {
        const back = document.createElement("div");
        back.className = "card back";
        back.textContent = "◆";
        hand.appendChild(back);
      }
    } else {
      const none = document.createElement("p");
      none.className = "no-cards";
      none.textContent = state.game.roundStarted ? "No cards" : "Waiting in lobby";
      hand.appendChild(none);
    }

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
        meldEl.innerHTML = meld.map(cardItem => `<span class="mini-card${isRedCard(cardItem) ? " red" : ""}">${escapeHtml(cardToDisplay(cardItem))}</span>`).join("");
        meldEl.disabled = !canActAfterDraw() || selectedCardIndices.length !== 1;
        meldEl.addEventListener("click", () => addSelectedCardToMeld(playerIndex, meldIndex));
        melds.appendChild(meldEl);
      });

      card.appendChild(melds);
    }

    if (state.game.roundStarted && isViewer && playerIndex !== state.game.currentPlayerIndex) {
      const buyButton = document.createElement("button");
      buyButton.type = "button";
      buyButton.className = "buy-button";
      buyButton.textContent = "Buy Top Discard";
      buyButton.disabled = !state.game.topDiscardBuyable || !state.game.discardTop;
      buyButton.addEventListener("click", () => send("buyDiscard"));
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
  cardEl.title = cardTitle(card);
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

function canUseHand(playerIndex) {
  return state?.game?.roundStarted && playerIndex === state.viewerPlayerIndex && playerIndex === state.game.currentPlayerIndex;
}

function canActAfterDraw() {
  const game = state?.game;
  return Boolean(game?.roundStarted && game.currentPlayerIndex === state.viewerPlayerIndex && game.hasDrawn && !game.hasDiscarded);
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
  send("reorderHand", { fromIndex: draggedCardIndex, toIndex: dropIndex });
  draggedCardIndex = null;
  selectedCardIndices = [];
}

function addSelectedCardToMeld(playerIndex, meldIndex) {
  if (selectedCardIndices.length !== 1) {
    showMessage("Select exactly one card from your hand first.");
    return;
  }

  send("addToMeld", {
    targetPlayerIndex: playerIndex,
    targetMeldIndex: meldIndex,
    cardHandIndex: selectedCardIndices[0]
  });
  selectedCardIndices = [];
}

function updateButtons() {
  const game = state?.game;
  const inRoom = Boolean(state);
  const isHost = Boolean(state?.isHost);
  const isViewerTurn = game?.currentPlayerIndex === state?.viewerPlayerIndex;
  const roundActive = Boolean(game?.roundStarted && !game.gameFinished);
  const canDraw = roundActive && isViewerTurn && !game.hasDrawn && !game.hasDiscarded;
  const canAct = canActAfterDraw();

  els.createRoomBtn.disabled = socket?.readyState !== WebSocket.OPEN;
  els.joinRoomBtn.disabled = socket?.readyState !== WebSocket.OPEN;
  // Keep this clickable for the host, even with one player, so the server can explain why it cannot start yet.
  els.startRoundBtn.disabled = !inRoom || !isHost || game?.roundStarted || game?.gameFinished;
  els.startRoundBtn.textContent = inRoom && isHost && !game?.roundStarted && state.seats.length < 2
    ? "Start Round (need 2 players)"
    : "Start Round";
  els.drawBtn.disabled = !canDraw;
  els.pickDiscardBtn.disabled = !canDraw || !game?.discardTop;
  els.comeDownBtn.disabled = !canAct || selectedCardIndices.length === 0;
  els.discardBtn.disabled = !canAct || selectedCardIndices.length !== 1;
  els.jumpRoundBtn.disabled = !inRoom || !isHost || game?.roundStarted;
  els.resetBtn.disabled = !inRoom || !isHost;
  els.roundSelect.disabled = !inRoom || !isHost || game?.roundStarted;
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

function playerStatusText(player) {
  if (!player.connected) return "Disconnected";
  if (state?.game?.roundStarted && player.remainingRules.length > 0) {
    return `Needs: ${player.remainingRules.map(formatRule).join(" + ")}`;
  }
  if (player.hasComeDown) return `Came down · ${player.handCount} cards`;
  if (state?.game?.roundStarted) return `${player.handCount} cards`;
  return "Waiting in lobby";
}

function getOverallWinnerText() {
  const players = state?.game?.players ?? [];
  const orderedPlayers = [...players].sort((a, b) => a.score - b.score);
  const bestScore = orderedPlayers[0]?.score ?? 0;
  const winners = orderedPlayers.filter(player => player.score === bestScore).map(player => player.name);
  return `${winners.join(" & ")} (${bestScore} points)`;
}

function showMessage(message) {
  els.statusText.textContent = message;
}

function updateConnectionText(text) {
  els.connectionText.textContent = text;
}

function cleanNameInput() {
  return els.playerNameInput.value.trim() || "Player";
}

function cardTitle(card) {
  if (!card) return "";
  if (card.isJoker || card.rank === "JOKER") return "Joker";
  return `${card.rank} of ${card.suit}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
