import { cardToDisplay, isRedCard } from "../shared/card.js";
import { canReplaceJoker, formatRule, isValidMeld, ROUND_RULES } from "../shared/rules.js";

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
  connectionText: document.getElementById("connectionText"),
  players: document.getElementById("players"),
  drawBtn: document.getElementById("drawButton"),
  discardBtn: document.getElementById("discardButton"),
  startRoundBtn: document.getElementById("startRoundButton"),
  pickDiscardBtn: document.getElementById("pickDiscardButton"),
  resetBtn: document.getElementById("resetButton"),
  roundSelect: document.getElementById("roundSelect"),
  jumpRoundBtn: document.getElementById("jumpRoundButton"),
  comeDownBtn: document.getElementById("comeDownButton"),
  discardPile: document.getElementById("discardPile"),
  drawPileBtn: document.getElementById("drawPileButton"),
  discardPileBtn: document.getElementById("discardPileButton"),
  roundCelebration: document.getElementById("roundCelebration"),
  winnerRound: document.getElementById("winnerRound"),
  roundWinnerName: document.getElementById("roundWinnerName"),
  winnerConfetti: document.getElementById("winnerConfetti"),
  roundText: document.getElementById("roundText"),
  statusText: document.getElementById("statusText"),
  deckCount: document.getElementById("deckCount"),
  tableCenter: document.getElementById("tableCenter"),
  tableMelds: document.getElementById("tableMelds"),
  localHand: document.getElementById("localHand"),
  handTitle: document.getElementById("handTitle"),
  selectionText: document.getElementById("selectionText"),
  scoreboard: document.getElementById("scoreboard"),
  pointsBtn: document.getElementById("pointsButton"),
  pointsDialog: document.getElementById("pointsDialog"),
  settingsBtn: document.getElementById("settingsButton"),
  settingsDialog: document.getElementById("settingsDialog"),
  buyBtn: document.getElementById("buyButton"),
  buyRequestPanel: document.getElementById("buyRequestPanel"),
  buyRequestText: document.getElementById("buyRequestText"),
  passBuyBtn: document.getElementById("passBuyButton"),
  takeBuyBtn: document.getElementById("takeBuyButton"),
  cancelBuyBtn: document.getElementById("cancelBuyButton")
};

let socket = null;
let state = null;
let joinedRoom = false;

let selectedCardIndices = [];
let draggedCardIndex = null;
let pointerReorder = null;
let suppressNextCardClick = false;
const POINTER_REORDER_THRESHOLD = 8;
let reconnectTimer = null;

let manualLeave = false;
const meldPositions = new Map();
let meldLayoutKey = null;
let celebrationTimer = null;

const savedName = localStorage.getItem("kalooki_player_name");
const savedRoom = localStorage.getItem("kalooki_room_code");
const inviteRoom = new URLSearchParams(location.search).get("room")?.trim().toUpperCase() || "";

if (savedName) els.playerNameInput.value = savedName;
els.roomCodeInput.value = inviteRoom || savedRoom || "";

populateRoundSelect();
connectSocket();
render();

els.pointsBtn.addEventListener("click", () => {
  if (state) els.pointsDialog.showModal();
});
els.settingsBtn.addEventListener("click", () => {
  if (state?.isHost) els.settingsDialog.showModal();
});
document.getElementById("closePointsButton").addEventListener("click", () => els.pointsDialog.close());
document.getElementById("closeSettingsButton").addEventListener("click", () => els.settingsDialog.close());
els.buyBtn.addEventListener("click", () => send("buyDiscard"));
for (const [button, decision] of [[els.passBuyBtn, "pass"], [els.takeBuyBtn, "take"], [els.cancelBuyBtn, "cancel"]]) {
  button.addEventListener("click", () => {
    if (state?.game?.pendingBuy) send("respondToBuy", { requestId: state.game.pendingBuy.id, decision });
  });
}
document.getElementById("dismissWinnerButton").addEventListener("click", hideRoundCelebration);
const fullscreenButton = document.getElementById("fullscreenButton");
fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    showMessage("Fullscreen is unavailable. You can still play in landscape.");
  }
});
document.addEventListener("fullscreenchange", () => {
  const label = document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.title = label;
});

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
  els.pointsDialog.close();
  els.settingsDialog.close();
  hideRoundCelebration();
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

for (const button of [els.drawBtn, els.drawPileBtn]) {
  button.addEventListener("click", () => requestPickup("drawDeck"));
}
for (const button of [els.pickDiscardBtn, els.discardPileBtn]) {
  button.addEventListener("click", () => requestPickup("drawDiscard"));
}

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
  const currentSocket = socket;

  socket.addEventListener("open", () => {
    if (socket !== currentSocket) return;
    manualLeave = false;
    updateConnectionText("Online");
    showMessage("Connected. Create a room, or enter a room code and join.");

    const roomCode = localStorage.getItem("kalooki_room_code");
    const playerId = localStorage.getItem("kalooki_player_id");
    const canResumeRoom = !inviteRoom || inviteRoom === roomCode?.toUpperCase() || state?.roomCode === roomCode;
    if (roomCode && playerId && !joinedRoom && canResumeRoom) {
      showMessage("Rejoining your previous room...");
      send("rejoinRoom", { roomCode, playerId });
    }

    render();
  });

  socket.addEventListener("message", event => {
    if (socket !== currentSocket) return;
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
      const previousState = state;
      // A buy can add cards while this player is inspecting their hand.
      const previousHand = state?.game?.players?.[state.viewerPlayerIndex]?.hand;
      const nextHand = message.state.game.players[message.state.viewerPlayerIndex]?.hand;
      if (JSON.stringify(previousHand) !== JSON.stringify(nextHand)) selectedCardIndices = [];
      if (message.state.game.requiredJokerIndex != null && (!state?.game?.mustReplayJoker || selectedCardIndices.length === 0)) {
        selectedCardIndices = [message.state.game.requiredJokerIndex];
      }
      state = message.state;
      joinedRoom = true;
      render();
      updateRoundCelebration(previousState, state);
      return;
    }

    if (message.type === "error") {
      showMessage(message.message);
    }
  });

  socket.addEventListener("close", () => {
    if (socket !== currentSocket) return;
    joinedRoom = false;
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

function requestPickup(type) {
  const button = type === "drawDeck" ? els.drawBtn : els.pickDiscardBtn;
  if (button.disabled) return;
  selectedCardIndices = [];
  send(type);
}

function hideRoundCelebration() {
  clearTimeout(celebrationTimer);
  celebrationTimer = null;
  els.roundCelebration.classList.add("hidden");
}

function updateRoundCelebration(previousState, nextState) {
  const game = nextState?.game;
  const winner = Number.isInteger(game?.winnerIndex) ? game.players[game.winnerIndex] : null;
  if (!game || game.roundStarted || (!game.betweenRounds && !game.gameFinished) || !winner) {
    hideRoundCelebration();
    return;
  }
  const previous = previousState?.game;
  if (previousState?.roomCode === nextState.roomCode &&
      (previous?.betweenRounds || previous?.gameFinished) &&
      previous.currentRound === game.currentRound && previous.winnerIndex === game.winnerIndex) return;

  hideRoundCelebration();
  els.winnerRound.textContent = `Round ${game.currentRound} winner`;
  els.roundWinnerName.textContent = winner.name;
  els.winnerConfetti.replaceChildren();
  const colours = ["#eac889", "#81d8a0", "#8bc6ee", "#f3eee3"];
  for (let index = 0; index < 18; index++) {
    const piece = document.createElement("span");
    piece.style.setProperty("--confetti-x", `${5 + (index * 37) % 90}%`);
    piece.style.setProperty("--confetti-delay", `${(index % 6) * 80}ms`);
    piece.style.setProperty("--confetti-colour", colours[index % colours.length]);
    piece.style.setProperty("--confetti-drift", `${index % 2 ? 35 : -35}px`);
    els.winnerConfetti.appendChild(piece);
  }
  els.roundCelebration.classList.remove("hidden");
  celebrationTimer = setTimeout(hideRoundCelebration, 4000);
}

function render() {
  renderRoomPanels();
  renderGameStatus();
  renderDiscardPile();
  renderPlayers();
  renderScoreboard();
  renderBuyRequest();
  updateButtons();
}

function renderRoomPanels() {
  els.pointsBtn.classList.toggle("hidden", !state);
  els.settingsBtn.classList.toggle("hidden", !state?.isHost);
  els.leaveRoomBtn.classList.toggle("hidden", !state);
  if (!state?.isHost && els.settingsDialog.open) els.settingsDialog.close();
  if (!state && els.pointsDialog.open) els.pointsDialog.close();
  els.lobbyPanel.classList.toggle("hidden", joinedRoom && Boolean(state));
  els.roomPanel.classList.toggle("hidden", !state);
  els.tableCenter.classList.toggle("hidden", !state);

  if (!state) {
    els.roomCodeText.textContent = "—";
    return;
  }

  els.roomCodeText.textContent = state.roomCode;
}

function renderGameStatus() {
  const game = state?.game;
  const rules = game?.roundRules?.[game.currentRound] ?? ROUND_RULES[0];

  els.deckCount.textContent = String(game?.deckCount ?? 0);
  els.roundSelect.value = String(Math.min(game?.currentRound ?? 0, ROUND_RULES.length - 1));

  if (!state) {
    els.roundText.textContent = "Create or join a room to begin.";
    els.statusText.textContent = socket?.readyState === WebSocket.OPEN ? "Connected. Create or join a room." : "Connecting to server...";
    return;
  }

  if (game.gameFinished) {
    els.roundText.textContent = `Game complete · Winner: ${getOverallWinnerText()}`;
  } else if (game.roundStarted) {
    els.roundText.textContent = `Round ${game.currentRound + 1}: ${rules.map(formatRule).join(" + ")}`;
  } else if (game.betweenRounds) {
    const nextRules = game.roundRules[game.currentRound] ?? [];
    els.roundText.textContent = `Next round: ${nextRules.map(formatRule).join(" + ")}`;
  } else {
    els.roundText.textContent = `Room ${state.roomCode}: waiting to start`;
  }

  if (!game.lastMessage && state.isHost && state.seats.length < 2) {
    els.statusText.textContent = "Share the invite link or room code. You need at least 2 players before the round can start.";
  } else {
    const message = game.lastMessage ?? "";
    els.statusText.textContent = /^Round \d+ started:/.test(message) ? "" : message;
  }
}

function renderDiscardPile() {
  els.discardPile.innerHTML = "";

  const topCard = state?.game?.discardTop;
  if (!topCard) {
    els.discardPile.textContent = "Empty";
    els.discardPile.className = "discard-card empty";
    return;
  }

  const cardEl = createCardElement(topCard, { selectable: false, decorative: true });
  els.discardPile.className = "discard-card";
  els.discardPile.appendChild(cardEl);
}

function renderPlayers() {
  const scrollLeft = els.localHand.scrollLeft;
  const meldScroll = els.tableMelds.scrollTop;
  const focusedCard = document.activeElement?.dataset.cardIndex;
  els.players.replaceChildren();
  els.localHand.replaceChildren();
  els.tableMelds.replaceChildren();
  const players = state?.game?.players ?? [];
  const viewerIndex = state?.viewerPlayerIndex ?? 0;
  const positions = players.length === 2 ? ["bottom", "top"]
    : players.length === 3 ? ["bottom", "left", "right"]
    : ["bottom", "left", "top", "right"];
  const occupied = new Set();

  for (let offset = 0; offset < players.length; offset++) {
    const playerIndex = (viewerIndex + offset) % players.length;
    const player = players[playerIndex];
    const seat = state.seats[playerIndex];
    const position = positions[offset];
    occupied.add(position);
    const active = playerIndex === state.game.currentPlayerIndex && state.game.roundStarted;
    const article = document.createElement("article");
    article.className = `player-seat seat-${position}${active ? " active" : ""}${player.isViewer ? " viewer" : ""}${!player.connected ? " disconnected" : ""}`;
    article.dataset.playerIndex = playerIndex;
    const presenceText = !player.connected ? "Offline, seat saved" : state.game.roundStarted ? "Online" : "Online, ready";
    const details = `${player.name}${player.isViewer ? ", you" : ""}${seat?.isHost ? ", host" : ""}. ${presenceText}${active ? ". Current turn" : ""}. ${player.handCount} cards. ${playerStatusText(player)}`;
    article.tabIndex = 0;
    article.setAttribute("aria-label", details);
    article.innerHTML = `<h3><span class="presence" aria-hidden="true"></span>${escapeHtml(player.name)}</h3>
      <p class="seat-meta">${[seat?.isHost ? "Host" : "", state.game.roundStarted ? `${player.handCount} cards` : ""].filter(Boolean).join(" · ")}</p>`;
    if (!player.isViewer && player.handCount > 0) {
      const backs = document.createElement("div");
      backs.className = "opponent-hand";
      backs.setAttribute("aria-label", `${player.handCount} hidden cards`);
      // The exact count is text; a short stack keeps large hands inside the seat.
      for (let i = 0; i < Math.min(7, player.handCount); i++) {
        const back = document.createElement("span");
        back.className = "card back";
        back.setAttribute("aria-hidden", "true");
        backs.appendChild(back);
      }
      article.appendChild(backs);
    }
    article.title = details;
    els.players.appendChild(article);

    player.melds.forEach((meld, meldIndex) => {
      const group = document.createElement("div");
      group.className = "meld-group";
      group.dataset.meldKey = `${playerIndex}:${player.meldIds?.[meldIndex] ?? `index-${meldIndex}`}`;
      const owner = document.createElement("p");
      owner.className = "meld-owner";
      owner.textContent = player.name;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meld";
      button.title = `Add selected card to ${player.name}'s meld`;
      button.setAttribute("aria-label", `${player.name}'s meld: ${meld.map(cardTitle).join(", ")}. Select one card from your hand to add.`);
      button.innerHTML = meld.map(card => `<span class="mini-card${isRedCard(card) ? " red" : ""}">${escapeHtml(cardToDisplay(card))}</span>`).join("");
      const handIndex = selectedCardIndices.length === 1 ? selectedCardIndices[0] : null;
      const selectedCard = handIndex !== null ? state.game.players[state.viewerPlayerIndex]?.hand[handIndex] : null;
      const canAdjust = canPlayMeld() && state.game.players[state.viewerPlayerIndex]?.hasComeDown;
      const source = state.game.jokerReplaySource;
      const returningJoker = handIndex === state.game.requiredJokerIndex && source?.playerIndex === playerIndex && source?.meldIndex === meldIndex;
      const mustPlayOtherCard = state.game.mustReplayJoker && handIndex !== state.game.requiredJokerIndex;
      button.disabled = !canAdjust || !selectedCard || mustPlayOtherCard || returningJoker || !isValidMeld([...meld, selectedCard], "any");
      button.addEventListener("click", () => addSelectedCardToMeld(playerIndex, meldIndex));
      group.append(owner, button);
      const jokerIndex = selectedCard ? meld.findIndex((_, index) => canReplaceJoker(meld, index, selectedCard)) : -1;
      if (canAdjust && !state.game.mustReplayJoker && jokerIndex >= 0) {
        const swap = document.createElement("button");
        swap.type = "button";
        swap.className = "swap-joker";
        swap.textContent = "Swap ★";
        swap.setAttribute("aria-label", `Replace ${player.name}'s joker with ${cardTitle(selectedCard)}`);
        swap.addEventListener("click", () => {
          send("replaceJoker", { targetPlayerIndex: playerIndex, targetMeldIndex: meldIndex, jokerIndex, cardHandIndex: handIndex });
          selectedCardIndices = [];
        });
        group.appendChild(swap);
      }
      els.tableMelds.appendChild(group);
    });
  }

  for (const position of ["bottom", "left", "top", "right"]) {
    if (occupied.has(position)) continue;
    const empty = document.createElement("article");
    empty.className = `player-seat empty-seat seat-${position}`;
    empty.innerHTML = "<h3>Open seat</h3>";
    els.players.appendChild(empty);
  }

  const viewer = players[viewerIndex];
  els.localHand.classList.toggle("reorderable", canReorderHand(viewerIndex));
  els.handTitle.textContent = viewer ? `Your hand · ${viewer.handCount} cards` : "Your hand";
  els.selectionText.textContent = state?.game?.requiredJokerIndex != null
    ? "Play the reclaimed joker in a different meld before discarding"
    : selectedCardIndices.length
    ? `${selectedCardIndices.length} selected`
    : "";
  if (viewer?.hand?.length) {
    viewer.hand.forEach((card, cardIndex) => {
      els.localHand.appendChild(createCardElement(card, {
        selectable: canReorderHand(viewerIndex),
        selected: selectedCardIndices.includes(cardIndex),
        draggable: canReorderHand(viewerIndex),
        required: state.game.requiredJokerIndex === cardIndex,
        cardIndex,
        onClick: () => toggleSelectedCard(cardIndex),
        onDragStart: () => { draggedCardIndex = cardIndex; },
        onDrop: () => reorderCurrentPlayerHand(cardIndex)
      }));
    });
  } else {
    const none = document.createElement("p");
    none.className = "no-cards";
    none.textContent = state ? "Your cards will appear when the host starts the round." : "A fresh deck. A table for four. Invite your favourite people.";
    els.localHand.appendChild(none);
  }
  els.tableMelds.parentElement.classList.toggle("hidden", !els.tableMelds.children.length);
  layoutTableMelds();
  els.localHand.scrollLeft = scrollLeft;
  els.tableMelds.scrollTop = meldScroll;
  if (focusedCard !== undefined) {
    els.localHand.querySelector(`[data-card-index="${focusedCard}"]`)?.focus({ preventScroll: true });
  }
}

function layoutTableMelds() {
  const key = `${state?.roomCode}:${state?.game?.currentRound}`;
  if (meldLayoutKey !== key) {
    meldPositions.clear();
    meldLayoutKey = key;
  }
  const angles = [-3, 2, 3, -2, 1, -1];
  const visibleKeys = new Set(Array.from(els.tableMelds.children, group => group.dataset.meldKey));
  for (const meldKey of meldPositions.keys()) {
    if (!visibleKeys.has(meldKey)) meldPositions.delete(meldKey);
  }
  for (const group of els.tableMelds.children) {
    const meldKey = group.dataset.meldKey;
    if (!meldPositions.has(meldKey)) {
      const used = new Set(meldPositions.values());
      let freePosition = 0;
      while (used.has(freePosition)) freePosition++;
      meldPositions.set(meldKey, freePosition);
    }
    const position = meldPositions.get(meldKey);
    // Keep the centre column clear for the piles and retain each meld's slot.
    group.style.gridColumn = position % 2 === 0 ? "1" : "3";
    group.style.gridRow = String(Math.floor(position / 2) + 1);
    group.style.setProperty("--meld-angle", `${angles[position % angles.length]}deg`);
    group.style.setProperty("--meld-nudge", `${position % 3 === 0 ? -5 : 5}px`);
  }
}

function renderScoreboard() {
  const game = state?.game;
  const players = game?.players ?? [];
  const columns = Array.from({ length: 4 }, (_, index) => players[index]);
  const rounds = game?.roundRules ?? ROUND_RULES;
  const headers = columns.map((player, index) =>
    `<th scope="col"${player?.isViewer ? ' class="viewer-score" aria-label="' + escapeHtml(player.name) + ', you"' : ""}>${escapeHtml(player?.name ?? `Player ${index + 1}`)}</th>`
  ).join("");
  const rows = rounds.map((_, index) => {
    const isCurrentRound = game?.roundStarted && game.currentRound === index;
    const points = columns.map(player => `<td${player?.isViewer ? ' class="viewer-score"' : ""}>${player?.roundScores?.[index] ?? "—"}</td>`).join("");
    return `<tr${isCurrentRound ? ' class="current-round"' : ""}><th scope="row">Round ${index + 1}${isCurrentRound ? "<small>In progress</small>" : ""}</th>${points}</tr>`;
  }).join("");
  const totals = columns.map(player => `<td${player?.isViewer ? ' class="viewer-score"' : ""}>${player?.score ?? "—"}</td>`).join("");
  els.scoreboard.innerHTML = `<table class="points-table" aria-label="Player points by round">
    <thead><tr><th scope="col">Round</th>${headers}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th scope="row">Total</th>${totals}</tr></tfoot>
  </table>`;
}

function createCardElement(card, options = {}) {
  const cardEl = document.createElement(options.decorative ? "span" : "button");
  if (!options.decorative) cardEl.type = "button";
  else cardEl.setAttribute("aria-hidden", "true");
  cardEl.className = `card${isRedCard(card) ? " red" : ""}${options.selected ? " selected" : ""}${options.required ? " required-joker" : ""}`;
  cardEl.textContent = cardToDisplay(card);
  cardEl.dataset.label = cardToDisplay(card);
  cardEl.setAttribute("aria-label", `${cardTitle(card)}${options.required ? ", must be played in a different meld this turn" : ""}`);
  if (options.selectable) cardEl.setAttribute("aria-pressed", String(Boolean(options.selected)));
  cardEl.title = cardTitle(card);
  cardEl.disabled = options.selectable === false && options.draggable !== true;

  if (Number.isInteger(options.cardIndex)) {
    cardEl.dataset.cardIndex = String(options.cardIndex);
  }

  if (options.selectable) {
    cardEl.addEventListener("click", event => {
      if (suppressNextCardClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      options.onClick?.(event);
    });
  }

  if (options.draggable) {
    // Desktop drag/drop.
    cardEl.draggable = true;
    cardEl.addEventListener("dragstart", options.onDragStart);
    cardEl.addEventListener("dragover", event => event.preventDefault());
    cardEl.addEventListener("drop", event => {
      event.preventDefault();
      options.onDrop();
    });

    // Mobile/tablet drag/drop.
    cardEl.addEventListener("pointerdown", event => beginPointerReorder(event, cardEl, options.cardIndex));
    cardEl.addEventListener("pointermove", event => movePointerReorder(event, cardEl));
    cardEl.addEventListener("pointerup", event => finishPointerReorder(event, cardEl));
    cardEl.addEventListener("pointercancel", event => cancelPointerReorder(event, cardEl));
  }

  return cardEl;
}


function beginPointerReorder(event, cardEl, fromIndex) {
  if (!Number.isInteger(fromIndex)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  pointerReorder = {
    pointerId: event.pointerId,
    fromIndex,
    startX: event.clientX,
    startY: event.clientY,
    moved: false
  };

  cardEl.setPointerCapture?.(event.pointerId);
}

function movePointerReorder(event, cardEl) {
  if (!pointerReorder || pointerReorder.pointerId !== event.pointerId) return;

  const dx = event.clientX - pointerReorder.startX;
  const dy = event.clientY - pointerReorder.startY;

  if (!pointerReorder.moved && Math.hypot(dx, dy) < POINTER_REORDER_THRESHOLD) return;

  pointerReorder.moved = true;
  event.preventDefault();

  cardEl.classList.add("touch-dragging");
  cardEl.style.transform = `translate(${dx}px, ${dy}px) rotate(3deg)`;
}

function finishPointerReorder(event, cardEl) {
  if (!pointerReorder || pointerReorder.pointerId !== event.pointerId) return;

  const drag = pointerReorder;
  pointerReorder = null;
  cardEl.releasePointerCapture?.(event.pointerId);

  if (!drag.moved) return;

  event.preventDefault();
  event.stopPropagation();

  suppressNextCardClick = true;
  setTimeout(() => {
    suppressNextCardClick = false;
  }, 250);

  const dropIndex = findCardIndexAtPoint(event.clientX, event.clientY, cardEl);
  resetPointerDragStyles(cardEl);

  if (dropIndex !== null && dropIndex !== drag.fromIndex) {
    draggedCardIndex = drag.fromIndex;
    reorderCurrentPlayerHand(dropIndex);
  }
}

function cancelPointerReorder(event, cardEl) {
  if (!pointerReorder || pointerReorder.pointerId !== event.pointerId) return;

  pointerReorder = null;
  cardEl.releasePointerCapture?.(event.pointerId);
  resetPointerDragStyles(cardEl);
}

function findCardIndexAtPoint(clientX, clientY, draggedElement) {
  const previousPointerEvents = draggedElement.style.pointerEvents;
  draggedElement.style.pointerEvents = "none";

  const targetCard = document
    .elementFromPoint(clientX, clientY)
    ?.closest(".hand.reorderable .card[data-card-index]");

  draggedElement.style.pointerEvents = previousPointerEvents;

  if (targetCard) return Number(targetCard.dataset.cardIndex);

  const hand = document.querySelector(".hand.reorderable");
  if (!hand) return null;

  const handRect = hand.getBoundingClientRect();
  const isInsideHand =
    clientX >= handRect.left &&
    clientX <= handRect.right &&
    clientY >= handRect.top &&
    clientY <= handRect.bottom;

  if (!isInsideHand) return null;

  const viewer = state?.game?.players?.[state.viewerPlayerIndex];
  return viewer?.hand?.length ? viewer.hand.length - 1 : null;
}

function resetPointerDragStyles(cardEl) {
  cardEl.classList.remove("touch-dragging");
  cardEl.style.transform = "";
}


function canUseHand(playerIndex) {
  return state?.game?.roundStarted && playerIndex === state.viewerPlayerIndex && playerIndex === state.game.currentPlayerIndex;
}

function canReorderHand(playerIndex) {
  const game = state?.game;
  return Boolean(
    game?.roundStarted &&
    !game.betweenRounds &&
    !game.gameFinished &&
    playerIndex === state.viewerPlayerIndex
  );
}

function canActAfterDraw() {
  const game = state?.game;
  return Boolean(game?.roundStarted && game.currentPlayerIndex === state.viewerPlayerIndex && game.hasDrawn && !game.hasDiscarded && !game.pendingBuy);
}

function canPlayMeld() {
  return canActAfterDraw() && !state.game.cameDownThisTurn;
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
  const canDraw = roundActive && isViewerTurn && !game.hasDrawn && !game.hasDiscarded && !game.pendingBuy;
  const canAct = canActAfterDraw();

  els.createRoomBtn.disabled = socket?.readyState !== WebSocket.OPEN;
  els.joinRoomBtn.disabled = socket?.readyState !== WebSocket.OPEN;
  // Keep this clickable for the host, even with one player, so the server can explain why it cannot start yet.
  els.startRoundBtn.disabled = !inRoom || !isHost || game?.roundStarted || game?.gameFinished;
  els.startRoundBtn.classList.toggle("hidden", !inRoom || !isHost || roundActive || Boolean(game?.gameFinished));
  els.startRoundBtn.textContent = game?.betweenRounds ? "Next Round" : "Start Round";
  for (const button of [els.drawBtn, els.pickDiscardBtn, els.buyBtn, els.comeDownBtn, els.discardBtn]) {
    button.classList.toggle("hidden", !roundActive);
  }
  els.buyBtn.disabled = !game?.canViewerBuyDiscard;
  els.buyBtn.classList.toggle("hidden", !roundActive || isViewerTurn);
  els.drawBtn.disabled = !canDraw;
  els.pickDiscardBtn.disabled = !canDraw || !game?.discardTop;
  els.comeDownBtn.disabled = !canPlayMeld() || selectedCardIndices.length === 0 ||
    (game?.mustReplayJoker && !selectedCardIndices.includes(game.requiredJokerIndex));
  els.discardBtn.disabled = !canAct || Boolean(game?.mustReplayJoker) || selectedCardIndices.length !== 1;
  els.jumpRoundBtn.disabled = !inRoom || !isHost || game?.roundStarted;
  els.resetBtn.disabled = !inRoom || !isHost;
  els.roundSelect.disabled = !inRoom || !isHost || game?.roundStarted;
  if (socket?.readyState !== WebSocket.OPEN) {
    for (const button of [els.startRoundBtn, els.drawBtn, els.pickDiscardBtn, els.buyBtn, els.comeDownBtn, els.discardBtn, els.jumpRoundBtn, els.resetBtn, els.passBuyBtn, els.takeBuyBtn, els.cancelBuyBtn]) button.disabled = true;
  }
  els.drawPileBtn.disabled = els.drawBtn.disabled;
  els.discardPileBtn.disabled = els.pickDiscardBtn.disabled;
  els.discardPileBtn.setAttribute("aria-label", game?.discardTop
    ? `Pick up ${cardTitle(game.discardTop)} from the discard pile` : "Discard pile is empty");
}

function renderBuyRequest() {
  const request = state?.game?.pendingBuy;
  els.buyRequestPanel.classList.toggle("hidden", !request);
  document.querySelector(".controls").classList.toggle("hidden", Boolean(request));
  document.querySelector(".action-feedback").classList.toggle("hidden", Boolean(request));
  if (!request) return;
  const players = state.game.players;
  const buyer = players[request.buyerIndex]?.name ?? "A player";
  const next = players[request.nextApproverIndex]?.name ?? "a player";
  els.buyRequestText.textContent = request.canViewerRespond
    ? `${buyer} wants the discard. You have first refusal.`
    : `${buyer} wants the discard. Waiting for ${next}.`;
  els.passBuyBtn.classList.toggle("hidden", !request.canViewerRespond);
  els.takeBuyBtn.classList.toggle("hidden", !request.canViewerRespond);
  els.cancelBuyBtn.classList.toggle("hidden", !request.canViewerCancel);
  els.takeBuyBtn.textContent = state.viewerPlayerIndex === state.game.currentPlayerIndex && !state.game.hasDrawn
    ? "Take card" : "Buy +1";
  for (const button of [els.passBuyBtn, els.takeBuyBtn, els.cancelBuyBtn]) button.disabled = socket?.readyState !== WebSocket.OPEN;
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
  return winners.join(" & ");
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
