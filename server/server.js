import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = normalize(join(__dirname, ".."));
const port = Number(process.env.PORT) || 3000;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const aliases = {
    "/": "/client/index.html",
    "/style.css": "/client/style.css",
    "/ui.js": "/client/ui.js",
    "/network.js": "/client/network.js"
  };
  const requestedPath = aliases[url.pathname] ?? url.pathname;
  const safePath = normalize(join(projectRoot, requestedPath));

  if (!safePath.startsWith(projectRoot) || !existsSync(safePath) || statSync(safePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("404 - File not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(safePath)] ?? "application/octet-stream"
  });
  createReadStream(safePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Kalooki is running at http://localhost:${port}`);
});
