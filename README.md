# Kalooki Phase 2 - Online Room Prototype

This version moves the game from a single-browser prototype to a server-owned online room prototype.

## What is new in Phase 2

- A real Node server controls the rooms and game state.
- Browsers connect to the server with WebSockets.
- Players can create a room, share a room code, and join from another browser/device.
- Each player only sees their own hand.
- Other players' hands are shown as card backs.
- The host can start rounds, reset the game, and jump rounds.
- The server validates turns so non-current players cannot draw/discard/lay melds.
- Out-of-turn buying is supported for the player who clicks the buy button.
- Rejoin support works from the same browser using localStorage.

## How to run locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

To test with two players on one laptop:

1. Open `http://localhost:3000` in one browser.
2. Create a room.
3. Copy the invite link or room code.
4. Open a different browser/incognito window.
5. Join using the room code.
6. Start the round from the host browser.

## Test command

```bash
npm test
```

## Current limitations

This is still a prototype.

- Rooms are stored in server memory only.
- If the server restarts, all rooms disappear.
- There are no accounts or passwords yet.
- There is no database yet.
- Joining after a game has already started is blocked unless the player is rejoining their saved seat.
- The WebSocket server is a minimal built-in implementation so the project has no install dependencies.

## Next recommended step

Deploy this server to a public host. After that, add persistent storage so rooms and scores survive server restarts.

## Why Start Round may not work

For Phase 2, a round can only start after you are inside a room and at least two players have joined.

Correct test flow:

1. Open `http://localhost:3000`.
2. Click **Create Room**. Do not type your own room code for this step; the app generates one.
3. Copy the room code or invite link.
4. Open a second browser/incognito window.
5. Join using that generated room code.
6. In the host window, click **Start Round**.

If the page says it is still connecting, refresh once and make sure the terminal running `npm start` is still open.
