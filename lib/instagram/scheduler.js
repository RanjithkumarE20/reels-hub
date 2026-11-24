// Automatic Instagram posting: picks fresh content at set times, renders it, uploads it.
// Independent of the YouTube Shorts pipeline: own folder, own files, low CPU priority, and it stays
// quiet during the Shorts task windows (IG_QUIET, default 07:45-09:15 and 17:45-19:15).
import { readJson, writeJson, log } from "../util.js";
import { quoteItems, BAD } from "../quotes.js";
import { newsFeed } from "../news.js";
import { renderQuoteVideo, renderNewsStory, cleanOutput } from "./render.js";
import { publish, publishingQuota, refreshTokenIfNeeded, hasToken } from "./api.js";
import { withPublicUrl } from "./tunnel.js";

const STATE_FILE = "ig-state.json";
const state = readJson(STATE_FILE, { posted: {}, slots: {}, history: [] });
const save = () => {
  state.history = state.history.slice(-300);
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(state.slots)) if (k < cutoff) delete state.slots[k];
  writeJson(STATE_FILE, state);
};
export const igState = () => state;
/** Record a quote used elsewhere (e.g. a film-song pick) so stories don't reuse it. */
export function markUsed(itemId, job) {
  state.history.push({ job, at: Date.now(), itemId, ok: true, dryRun: true });
  save();
}

const env = (k, d) => (process.env[k] ?? d).toString().trim();
const times = (k, d) => env(k, d).split(",").map((s) => s.trim()).filter((s) => /^\d{1,2}:\d{2}$/.test(s));
export const isDryRun = () => env("IG_DRY_RUN", "true").toLowerCase() !== "false";
const handle = () => { const h = env("IG_HANDLE", "").replace(/^@+/, ""); return h ? `@${h}` : ""; };

const JOBS = {
  reel: () => times("IG_REEL_TIMES", "10:30,14:00,20:30"),
  "quote-story": () => times("IG_STORY_TIMES", "12:00,16:30,22:00"),
  "news-story": () => times("IG_NEWS_STORY_TIMES", "09:30,13:00,17:15,21:15"),
};

const minutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
function inQuiet(d = new Date()) {
  const now = d.getHours() * 60 + d.getMinutes();
  return env("IG_QUIET", "07:45-09:15,17:45-19:15").split(",").some((w) => {
    const [a, b] = w.split("-").map((s) => s.trim());
    return a && b && now >= minutes(a) && now < minutes(b);
  });
}
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const postedToday = () => state.history.filter((h) => h.ok && !h.dryRun && h.at > Date.now() - 86400000).length;

// ---------- content picking ----------
const MOOD_TAGS = {
  love: "#lovequotes #love #tamillove #romanticquotes",
  motivation: "#motivation #motivationalquotes #success #nevergiveup",
  success: "#success #motivation #goals #successquotes",
  sad: "#feelings #emotional #sadquotes #lifelessons",
  friendship: "#friendship #friends #friendshipquotes #bestfriends",
  hope: "#hope #positivevibes #dreambig #inspiration",
  peace: "#peace #calm #mindfulness #gratitude",
  life: "#lifequotes #life #wisdom #thoughts",
};
// skip anything posted, or used in the last 40 runs (dry runs included) so reels and stories differ
const recentIds = () => new Set(state.history.slice(-40).map((h) => h.itemId));
export function pickQuote() {
  const recent = recentIds();
  const items = quoteItems().filter((q) => !state.posted[q.id] && !recent.has(q.id) && q.text.length <= 190 && !BAD.test(q.text));
  return items.find((q) => q.imageSource === "mood") || items[0] || null;
}
function quoteCaption(q) {
  // Instagram favours (and is moving to limit posts to) a few relevant hashtags: 2 for the mood + 3 brand tags
  const moodTags = (MOOD_TAGS[q.mood] || MOOD_TAGS.life).split(" ").slice(0, 2);
  const brandTags = env("IG_HASHTAGS", "#englishquotes #tamilvibes #quoteoftheday").split(/\s+/).filter(Boolean);
  const tags = [...new Set([...moodTags, ...brandTags])].slice(0, +env("IG_MAX_HASHTAGS", "5")).join(" ");
  return [
    `“${q.text}”`,
    `— ${q.author}`,
    "",
    q.song ? `🎧 Mood song: ${q.song.title} · ${q.song.artist} (listen on your music app)` : "",
    "🎵 Background music: original",
    q.credit ? `📷 ${q.credit}` : "",
    "",
    "Save this & share it with someone who needs it today ❤️",
    "",
    tags,
  ].filter((l, i, a) => l || a[i - 1]).join("\n").slice(0, 2200);
}
function domainOf(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\./, "");
    const seg = x.pathname.split("/")[1];
    return /bbc\./.test(host) && ["tamil", "hindi"].includes(seg) ? `${host}/${seg}` : host;
  } catch { return ""; }
}
function pickNews() {
  const langs = env("IG_NEWS_LANGS", "ta,en,hi").split(",").map((s) => s.trim());
  const recent = recentIds();
  const feed = newsFeed().filter((x) => !state.posted[x.id] && !recent.has(x.id));
  const wantTrend = state.history.filter((h) => h.job === "news-story").length % 3 === 2; // every 3rd news story is a trend
  const trend = feed.find((x) => x.type === "trend" && x.news?.length);
  const article = feed.find((x) => x.type === "article" && langs.includes(x.lang));
  const it = (wantTrend && trend) || article || trend;
  if (!it) return null;
  if (it.type === "trend") {
    const n = it.news[0];
    return { id: it.id, kind: "trend", title: it.topic, sub: n?.title, source: `Google Trends · ${it.geo === "IN-TN" ? "Tamil Nadu" : "India"}${it.traffic ? ` · ${it.traffic} searches` : ""}`, domain: domainOf(n?.url) };
  }
  return { id: it.id, kind: "news", title: it.title, sub: it.summary, source: it.source, domain: domainOf(it.url) };
}

// ---------- run one job ----------
let busy = false;
export async function runJob(job, { force = false, dryRun = isDryRun() } = {}) {
  if (busy) return { ok: false, error: "another upload is running" };
  busy = true;
  const rec = { job, at: Date.now(), dryRun };
  try {
    let media, kind, caption = "", itemId;
    if (job === "reel" || job === "quote-story") {
      const q = pickQuote();
      if (!q) throw new Error("no unposted quote available yet");
      itemId = q.id;
      media = await renderQuoteVideo(q, { seconds: job === "reel" ? +env("IG_REEL_SECONDS", "20") : +env("IG_STORY_SECONDS", "15"), handle: handle() });
      kind = job === "reel" ? "reel" : "story-video";
      caption = quoteCaption(q);
      Object.assign(rec, { title: q.text.slice(0, 80), music: media.music });
    } else {
      const n = pickNews();
      if (!n) throw new Error("no unposted news available yet");
      itemId = n.id;
      media = await renderNewsStory(n, { handle: handle() });
      kind = "story-image";
      rec.title = n.title.slice(0, 80);
    }
    rec.file = media.file;
    rec.itemId = itemId;
    if (dryRun) {
      log("instagram", `[dry run] made ${job}: ${media.file} (not uploaded; set IG_DRY_RUN=false to post)`);
      return Object.assign(rec, { ok: true });
    }
    if (!hasToken()) throw new Error("IG_ACCESS_TOKEN is not set");
    await refreshTokenIfNeeded();
    const q = await publishingQuota().catch(() => null);
    if (q && q.used >= q.max - 1 && !force) throw new Error(`publishing limit reached (${q.used}/${q.max} in 24 h)`);
    const res = await withPublicUrl((baseUrl) => publish({ kind, url: `${baseUrl}/${media.name}`, caption }));
    state.posted[itemId] = { job, at: Date.now(), mediaId: res.id, permalink: res.permalink };
    log("instagram", `posted ${job}: ${res.permalink || res.id}`);
    return Object.assign(rec, { ok: true, mediaId: res.id, permalink: res.permalink });
  } catch (e) {
    log("instagram", `${job} failed:`, e.message);
    return Object.assign(rec, { ok: false, error: e.message });
  } finally {
    busy = false;
    state.history.push(rec);
    save();
  }
}

// ---------- the clock ----------
async function tick() {
  const now = new Date();
  if (inQuiet(now) || busy) return;
  if (postedToday() >= +env("IG_MAX_PER_DAY", "12")) return;
  const day = localDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const [job, getTimes] of Object.entries(JOBS)) {
    for (const t of getTimes()) {
      const key = `${day} ${t} ${job}`;
      const late = nowMin - minutes(t);
      const s = state.slots[key];
      // due, not older than 3 h (e.g. PC was off), and max 2 attempts 20 min apart
      if (late < 0 || late > 180 || s?.done || (s?.tries >= 2) || (s && Date.now() - s.last < 20 * 60000)) continue;
      const r = await runJob(job);
      state.slots[key] = { done: r.ok, tries: (s?.tries || 0) + 1, last: Date.now() };
      save();
      return; // one job per tick
    }
  }
}

export function startInstagram() {
  if (env("IG_ENABLED", "false").toLowerCase() !== "true") {
    log("instagram", "auto-posting is off (set IG_ENABLED=true in .env)");
    return;
  }
  log("instagram", `auto-posting on${isDryRun() ? " in DRY RUN mode (renders only)" : ""}. Reels ${JOBS.reel().join(", ")} · quote stories ${JOBS["quote-story"]().join(", ")} · news stories ${JOBS["news-story"]().join(", ")} · quiet ${env("IG_QUIET", "07:45-09:15,17:45-19:15")}`);
  setInterval(() => tick().catch((e) => log("instagram", "tick error:", e.message)), 60000);
  setInterval(() => cleanOutput(3), 6 * 3600000);
  if (!isDryRun()) refreshTokenIfNeeded().catch(() => {});
}
