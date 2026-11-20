// Small shared helpers: env loading, HTTP with timeouts, JSON persistence, XML/RSS parsing.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// REELS_DATA_DIR lets the cloud runner keep its state elsewhere (e.g. the gh-pages checkout)
export const DATA_DIR = process.env.REELS_DATA_DIR ? path.resolve(process.env.REELS_DATA_DIR) : path.join(ROOT, "data");
export const IMG_DIR = path.join(DATA_DIR, "images");
fs.mkdirSync(IMG_DIR, { recursive: true });

export function loadEnv(file = path.join(ROOT, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export async function fetchRaw(url, { timeout = 20000, headers = {}, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}
export const fetchText = async (url, o) => (await fetchRaw(url, o)).text();
export const fetchJson = async (url, o) => (await fetchRaw(url, o)).json();

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 12);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function log(scope, ...msg) {
  console.log(`[${new Date().toLocaleTimeString()}] [${scope}]`, ...msg);
}

// ---------- JSON store (survives restarts) ----------
export function readJson(name, fallback) {
  const f = path.join(DATA_DIR, name);
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return fallback;
  }
}
export function writeJson(name, value) {
  const f = path.join(DATA_DIR, name);
  fs.writeFileSync(f + ".tmp", JSON.stringify(value));
  fs.renameSync(f + ".tmp", f);
}

// ---------- tiny RSS/Atom parsing (feeds are well-formed enough for this) ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
export const stripTags = (s = "") => decode(decode(s)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const esc = (n) => n.replace(/[:.]/g, "\\$&");

export function items(xml, tag = "item") {
  const re = new RegExp(`<${esc(tag)}[\\s>][\\s\\S]*?</${esc(tag)}>`, "g");
  return xml.match(re) || [];
}
export function tag(xml, name) {
  const m = xml.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`));
  return m ? decode(m[1]).trim() : "";
}
export function attr(xml, name, a) {
  const m = xml.match(new RegExp(`<${esc(name)}\\s[^>]*?${a}="([^"]*)"`));
  return m ? decode(m[1]) : "";
}
export const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
