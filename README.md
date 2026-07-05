# Kalooki Online

Kalooki Online is a browser-based multiplayer Kalooki card game built with Node.js, WebSockets, and JavaScript.

The project started as a local playable prototype and has been upgraded into an online room-based version where players can create rooms, join using room codes, and play together in real time.

## Features

- Online multiplayer rooms
- Room code creation and joining
- Real-time syncing with WebSockets
- Server-side game state
- Player-specific hands
- Hidden opponent cards
- Host-controlled round start
- Turn-based draw and discard system
- Buy discard functionality
- Protection against buying your own discard
- Run and set validation
- Joker support
- Round progression and scoring
- Mobile-friendly card reordering
- Cards can be reorganised at any time during a round
- Deployment-ready Node server

## Tech Stack

- Node.js
- JavaScript
- HTML
- CSS
- WebSockets
- Render-ready deployment configuration

  
## Local Running for Testing Purposes

The app can be run locally before deploying so that changes can be tested safely.
### Go to Root
### Install dependencies

```bash
npm install
```
### Run the local host
```bash
npm start
```

## Project Structure

```text
Kalooki/
  public/
    index.html
    style.css
    ui.js
  server/
    server.js
  shared/
    gamestate.js
  tests/
    gamestate.test.js
  package.json
  README.md
  Procfile
  render.yaml
