// Cloud runner (GitHub Actions, PC can be off). One job per run:
//   node cloud/run.js pick         -> make a silent quote reel + 3 matching film songs for the phone app
//   node cloud/run.js quote-story  -> post a quote story to Instagram automatically
//   node cloud/run.js news-story   -> post a news/trend story to Instagram automatically
// Everything it produces lives in SITE_DIR (the gh-pages branch = your free GitHub Pages website).
import fs from "node:fs";
import path from "node:path";
import { loadEnv, ROOT, log } from "../lib/util.js";

loadEnv();
const SITE = path.resolve(process.env.SITE_DIR || path.join(ROOT, "site"));
const PICKS_DIR = path.join(SITE, "picks");
const PICKS_FILE = path.join(SITE, "picks.json");
const KEEP = +process.env.PICKS_KEEP || 21; // a week of 3-a-day
fs.mkdirSync(PICKS_DIR, { recursive: true });
// files that must never be published
fs.writeFileSync(path.join(SITE, ".gitignore"), "data/ig-out/\ndata/ig-work/\ndata/fonts/\ndata/images/\ndata/ig-token.json\n");
fs.writeFileSync(path.join(SITE, ".nojekyll"), "");

const job = process.argv[2] || "pick";
const { addQuotes } = await import("../lib/quotes.js");
const { pickQuote, markUsed, runJob } = await import("../lib/instagram/scheduler.js");

const istNow = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const readPicks = () => { try { return JSON.parse(fs.readFileSync(PICKS_FILE, "utf8")); } catch { return { picks: [] }; } };

const MOOD_TAGS = { love: "#lovequotes #love", motivation: "#motivation #nevergiveup", success: "#success #motivation", sad: "#feelings #emotional", friendship: "#friendship #friends", hope: "#hope #inspiration", peace: "#peace #calm", life: "#lifequotes #life" };
function captionTemplate(q) {
  const brand = (process.env.IG_HASHTAGS || "#englishquotes #tamilvibes #quoteoftheday").split(/\s+/).filter(Boolean);
  const tags = [...new Set([...(MOOD_TAGS[q.mood] || MOOD_TAGS.life).split(" "), ...brand])].slice(0, +(process.env.IG_MAX_HASHTAGS || 5));
  return [`“${q.text}”`, `— ${q.author}`, "", "🎵 {song}", q.credit ? `📷 ${q.credit}` : "", "", "Save this & share it with someone who needs it today ❤️", "", tags.join(" ")]
    .filter((l, i, a) => l || a[i - 1]).join("\n");
}

async function makePick() {
  const { renderQuoteVideo, videoFrame } = await import("../lib/instagram/render.js");
  const { suggestFilmSongs } = await import("../lib/filmsongs.js");
  await addQuotes(4).catch((e) => log("pick", "new quotes failed, using saved ones:", e.message));
  const data = readPicks();
  const used = new Set(data.picks.map((p) => p.quoteId));
  let q = pickQuote();
  for (let i = 0; q && used.has(q.id) && i < 20; i++) { markUsed(q.id, "pick-skip"); q = pickQuote(); }
  if (!q) throw new Error("no fresh quote available");
  markUsed(q.id, "pick");

  const media = await renderQuoteVideo(q, { seconds: 20, handle: process.env.IG_HANDLE ? `@${process.env.IG_HANDLE.replace(/^@+/, "")}` : "", music: "none" });
  const id = `${new Date().toISOString().slice(0, 10)}-${media.name.slice(0, 8)}`;
  fs.copyFileSync(media.file, path.join(PICKS_DIR, `${id}.mp4`));
  await videoFrame(media.file, path.join(PICKS_DIR, `${id}.jpg`));
  fs.unlinkSync(media.file);
  const songs = await suggestFilmSongs(q);

  const pick = {
    id,
    createdAt: Date.now(),
    slot: istNow(),
    video: `picks/${id}.mp4`,
    thumb: `picks/${id}.jpg`,
    quote: { id: q.id, text: q.text, author: q.author, mood: q.mood, moodLabel: q.moodLabel },
    quoteId: q.id,
    theme: songs.themeLabel,
    songs: songs.songs,
    caption: captionTemplate(q),
  };
  data.picks = [pick, ...data.picks].slice(0, KEEP);
  data.updatedAt = Date.now();
  // remove videos that dropped out of the list
  const keep = new Set(data.picks.flatMap((p) => [path.basename(p.video), path.basename(p.thumb)]));
  for (const f of fs.readdirSync(PICKS_DIR)) if (!keep.has(f)) fs.unlinkSync(path.join(PICKS_DIR, f));
  fs.writeFileSync(PICKS_FILE, JSON.stringify(data, null, 1));
  log("pick", `ready: "${q.text.slice(0, 50)}" -> ${songs.songs.map((s) => s.title).join(" / ")}`);
}

try {
  if (job === "pick") await makePick();
  else if (job === "quote-story" || job === "news-story") {
    if (job === "news-story") await (await import("../lib/news.js")).refreshNews();
    const r = await runJob(job, { dryRun: process.env.IG_DRY_RUN === "true" });
    if (!r.ok) throw new Error(r.error);
  } else throw new Error(`unknown job "${job}"`);
} catch (e) {
  log("cloud", `${job} failed:`, e.message);
  process.exitCode = 1;
}
