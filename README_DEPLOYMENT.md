# Deploying Kalooki Online

This version is ready for deployment on Node-friendly hosting platforms such as Render or Railway.

## Render settings

- Service type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Root directory: leave blank if this folder is the repository root; otherwise set it to this folder name.

## Railway settings

- Deploy from GitHub
- Start command: `npm start`
- The app reads `process.env.PORT` and binds to `0.0.0.0`.

## Important limitation

The game state is currently stored in server memory. If the host restarts or sleeps, active rooms reset.
A later production version should add persistent storage such as Redis/Postgres.
