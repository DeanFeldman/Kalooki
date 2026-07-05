# Kalooki

A browser-based Kalooki card game built with vanilla JavaScript modules.

## What was fixed

- Added a working Node server so ES module imports load correctly.
- Added `package.json` with `npm start` and `npm test` scripts.
- Rebuilt the UI so player areas, scores, current round, deck count, discard pile, and turn status are clear.
- Fixed reset so it actually starts a fresh game.
- Fixed round setup so a new deck is created each round.
- Fixed multi-rule rounds so players must complete the required melds before playing freely.
- Fixed end-of-round scoring and final winner display.
- Added simple rule tests for runs, sets, jokers, and round flow.

## How to run

1. Open a terminal in this folder.
2. Run:

```bash
npm start
```

3. Open this address in your browser:

```text
http://localhost:3000
```

Do not open `client/index.html` directly by double-clicking it. Browser security blocks JavaScript module imports from local files, so the project needs the included local server.

## How to test

```bash
npm test
```

## How to play

- Enter 2 to 4 player names separated by commas.
- Click **Start Round**.
- On your turn, draw from the deck or pick up the discard pile.
- Select cards by clicking them.
- Click **Come Down / Lay Meld** to play the selected meld.
- Click **Discard Selected** after selecting exactly one card.
- Once you have come down, you may add one selected card to an existing meld by clicking that meld.
- Non-current players can buy the top discard when buying is available. They receive the discard and one penalty card.

## Rounds

1. Blitz
2. Run of 3
3. Set of 3
4. Run of 3 + Set of 3
5. Run of 4
6. Set of 4
7. Run of 5

Lowest score wins after the final round.
