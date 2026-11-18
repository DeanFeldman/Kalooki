import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { cardToDisplay, isRedCard } from "../../shared/card.js";
import { canReplaceJoker, formatRule, isValidMeld, ROUND_RULES } from "../../shared/rules.js";

// Keep real startup, actions, and socket handlers; table rendering has separate concerns.
const source = readFileSync(new URL("../../client/ui.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?$/gm, "")
  .replace(/function (render|populateRoundSelect)\(\) \{/g, "function $1() { return;");
const html = readFileSync(new URL("../../client/index.html", import.meta.url), "utf8");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));

export function openClient(search = "", savedRoom, savedPlayerId) {
  const elements = new Map();
  const sockets = [];
  const storage = new Map();
  const timers = new Map();
  let nextTimerId = 0;
  if (savedRoom) storage.set("kalooki_room_code", savedRoom);
  if (savedPlayerId) storage.set("kalooki_player_id", savedPlayerId);
  class Element {
    constructor(tagName = "DIV") {
      this.tagName = tagName.toUpperCase();
      this.value = "";
      this.handlers = {};
      this.children = [];
      this.attributes = {};
      this.dataset = {};
      this.disabled = false;
      const classes = new Set();
      this.classList = {
        add: value => classes.add(value), remove: value => classes.delete(value),
        contains: value => classes.has(value),
        toggle(value, force) {
          const enabled = force ?? !classes.has(value);
          if (enabled) classes.add(value); else classes.delete(value);
          return enabled;
        }
      };
      this.style = { setProperty() {} };
    }
    addEventListener(type, listener) { this.handlers[type] = listener; }
    setAttribute(name, value) { this.attributes[name] = value; }
    appendChild(child) { this.children.push(child); child.parentElement = this; }
    replaceChildren(...children) { this.children = children; }
    set innerHTML(value) { this.markup = value; this.children = []; }
    get innerHTML() { return this.markup ?? ""; }
    click() { if (!this.disabled) this.handlers.click?.(); }
    close() { this.open = false; }
  }
  class Socket {
    static OPEN = 1;
    constructor() { this.handlers = {}; this.sent = []; sockets.push(this); }
    addEventListener(type, listener) { this.handlers[type] = listener; }
    send(data) { this.sent.push(JSON.parse(data)); }
    open() { this.readyState = Socket.OPEN; this.handlers.open(); }
    close() { this.readyState = 3; this.handlers.close(); }
    message(message) { this.handlers.message({ data: JSON.stringify(message) }); }
  }
  const context = createContext({
    document: {
      getElementById(id) {
        if (!ids.has(id)) throw new Error(`Missing element in index.html: ${id}`);
        if (!elements.has(id)) {
          const element = new Element();
          if (id === "roundCelebration") element.classList.add("hidden");
          elements.set(id, element);
        }
        return elements.get(id);
      },
      createElement: tagName => new Element(tagName),
      addEventListener() {}
    },
    window: { addEventListener() {} },
    location: { search, protocol: "http:", host: "localhost:3000" },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    WebSocket: Socket, URLSearchParams,
    cardToDisplay, isRedCard, canReplaceJoker, formatRule, isValidMeld, ROUND_RULES,
    clearTimeout: id => timers.delete(id),
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    }
  });
  runInContext(source, context);
  return { elements, sockets, context, timers };
}
