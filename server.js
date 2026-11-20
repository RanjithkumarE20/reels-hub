// Reels Hub server: serves the app, the two feeds, stories, and pushes live updates (Server-Sent Events).
// Background jobs keep adding new quote reels and pulling the latest news/trends automatically.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadEnv, ROOT, IMG_DIR, log } from "./lib/util.js";

loadEnv();
const { addQuotes, quoteItems, quoteStories, resumeImages, alternativeSong } = await import("./lib/quotes.js");
const { refreshNews, newsFeed, newsStories } = await import("./lib/news.js");
const { startInstagram, igState, isDryRun } = await import("./lib/instagram/scheduler.js");

const PORT = +process.env.PORT || 4321;
const HOST = process.env.HOST || "127.0.0.1";
const QUOTE_EVERY = (+process.env.QUOTE_INTERVAL_MIN || 15) * 60_000;
const QUOTES_PER_RUN = +process.env.QUOTES_PER_RUN || 5;
const NEWS_EVERY = (+process.env.NEWS_INTERVAL_MIN || 10) * 60_000;
const PUBLIC = path.join(ROOT, "public");

// ---------- live updates ----------
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => broadcast("ping", { t: Date.now() }), 25_000);

const status = { quotes: { lastRun: 0, nextRun: 0 }, news: { lastRun: 0, nextRun: 0 } };

let quotesBusy = false;
async function runQuotes(n = QUOTES_PER_RUN) {
  if (quotesBusy) return;
  quotesBusy = true;
  try {
    const made = await addQuotes(n);
    if (made.length) broadcast("update", { feed: "quotes", items: made, stories: quoteStories() });
  } catch (e) {
    log("quotes", "run failed:", e.message);
  } finally {
    quotesBusy = false;
  }
  status.quotes = { lastRun: Date.now(), nextRun: Date.now() + QUOTE_EVERY };
}
async function runNews() {
  try {
    const added = await refreshNews();
    if (added.length) {
      const ids = new Set(added.map((a) => a.id));
      broadcast("update", { feed: "news", items: newsFeed().filter((x) => ids.has(x.id)).slice(0, 30), stories: newsStories() });
    }
  } catch (e) {
    log("news", "run failed:", e.message);
  }
  status.news = { lastRun: Date.now(), nextRun: Date.now() + NEWS_EVERY };
}

// ---------- http ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function serveFile(res, base, rel, cache = "no-cache") {
  const file = path.join(base, path.normalize(rel).replace(/^([/\\]|\.\.)+/, ""));
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: "not found" });
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": cache });
  fs.createReadStream(file).pipe(res);
}
const page = (list, q) => {
  const offset = Math.max(0, +q.get("offset") || 0);
  const limit = Math.min(30, +q.get("limit") || 10);
  return { items: list.slice(offset, offset + limit), total: list.length, next: offset + limit < list.length ? offset + limit : null };
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(`event: hello\ndata: ${JSON.stringify(status)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (p === "/api/quotes") {
      const items = quoteItems();
      if (items.length - (+url.searchParams.get("offset") || 0) < 15) runQuotes(QUOTES_PER_RUN); // endless scroll: make more
      return send(res, 200, page(items, url.searchParams));
    }
    if (p === "/api/news") return send(res, 200, page(newsFeed(), url.searchParams));
    if (p === "/api/stories") return send(res, 200, url.searchParams.get("feed") === "news" ? newsStories() : quoteStories());
    if (p === "/api/song") return send(res, 200, (await alternativeSong(url.searchParams.get("mood"), url.searchParams.get("lang"))) || {});
    if (p === "/api/status") return send(res, 200, { ...status, clients: clients.size, quotes: { ...status.quotes, total: quoteItems().length }, news: { ...status.news, total: newsFeed().length } });
    if (p === "/api/instagram") {
      const st = igState();
      return send(res, 200, { enabled: process.env.IG_ENABLED === "true", dryRun: isDryRun(), history: st.history.slice(-30).reverse().map(({ file, ...h }) => h) });
    }
    if (p.startsWith("/img/")) return serveFile(res, IMG_DIR, p.slice(5), "public, max-age=604800");
    return serveFile(res, PUBLIC, p === "/" ? "index.html" : p.slice(1));
  } catch (e) {
    log("http", p, e.message);
    send(res, 500, { error: "server error" });
  }
});

server.listen(PORT, HOST, async () => {
  log("server", `Reels Hub running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  resumeImages();
  // first fill, then keep going on a timer - no manual action needed
  const firstQuotes = quoteItems().length < 20 ? runQuotes(12) : runQuotes();
  await Promise.all([firstQuotes, runNews()]);
  setInterval(runQuotes, QUOTE_EVERY);
  setInterval(runNews, NEWS_EVERY);
  startInstagram();
});
