// What's trending in music today: iTunes India top charts (Tamil, Bollywood, English), refreshed twice a day.
// Free, no key. Each song gets a theme guessed from its title (kadhal/ishq/love -> love, amma/maa -> mother ...),
// and songs that clearly match a theme are remembered, so the film-song pool keeps growing by itself.
import { fetchJson, readJson, writeJson, log } from "./util.js";

const FILE = "trend-songs.json";
const LEARNED = "learned-songs.json";
const FEEDS = {
  ta: "https://itunes.apple.com/in/rss/topsongs/limit=60/genre=1264/json",
  hi: "https://itunes.apple.com/in/rss/topsongs/limit=60/genre=1263/json",
  en: "https://itunes.apple.com/us/rss/topsongs/limit=60/json", // global English hits
};
const INDIAN_GENRES = /bollywood|tamil|telugu|indian|punjabi|malayalam|kannada|devotional|sufi|ghazal|marathi|bengali|bhojpuri/i;
// background scores, karaoke etc. don't work as a reel song
// (devotional songs fill the Bollywood chart on festival days but don't fit quote reels)
const SKIP = /\b(theme|bgm|instrumental|karaoke|mashup|lofi|lo-fi|slowed|reverb|ringtone|meme|mantra|stuti|aarti|chalisa|bhajan|stotram|ram|sitaram|shiv|shiva|krishna|govinda|ganesh|ganpati|hanuman|parvati|onkar|mahadev|bhole|mata|devi|murugan|ayyappa|amman|sai)\b|:3/i;

// title words (Tamil / Hindi transliterations + English) -> theme
const WORDS = {
  mother: ["amma", "maa", "mother", "mom", "thaai", "thaye"],
  father: ["appa", "papa", "father", "dad"],
  friendship: ["nanba", "nanban", "nanbane", "dosti", "yaar", "yaara", "yaari", "friend", "friends"],
  heartbreak: ["pirivu", "kanneer", "kaneer", "sogam", "judaai", "dard", "bewafa", "broken", "tears", "goodbye", "alvida", "tujhe bhula", "rona", "sad", "hurt"],
  loneliness: ["thanimai", "tanha", "tanhai", "alone", "lonely", "akela"],
  love: ["kadhal", "kaadhal", "kathal", "anbe", "uyire", "uyir", "kanmani", "kannamma", "nenje", "nenjame", "penne", "kanave", "ishq", "pyaar", "pyar", "mohabbat", "dil", "jaana", "jaan", "sanam", "saiyaan", "saiyara", "love", "heart", "baby", "darling", "romance", "raabta", "humsafar", "tum", "tera", "teri"],
  motivation: ["veera", "veeran", "singam", "simham", "vettai", "porkalam", "thalaivar", "zinda", "jeet", "fateh", "lakshya", "believer", "warrior", "fight", "rise", "power", "champion", "hero"],
  happiness: ["kondattam", "vibe", "party", "happy", "khushi", "dance", "naach", "jalsa", "celebration"],
  hope: ["vaanam", "vidiyal", "suraj", "roshni", "hope", "dream", "sapna", "kanavu", "light"],
  peace: ["amaidhi", "sukoon", "peace", "calm", "rain", "mazhai", "baarish"],
};
export function songTheme(title) {
  const t = ` ${title.toLowerCase().replace(/[^a-z ]/g, " ")} `;
  for (const [theme, words] of Object.entries(WORDS)) if (words.some((w) => t.includes(` ${w} `))) return theme;
  return "";
}

let state = readJson(FILE, { at: 0, ta: [], hi: [], en: [] });
const learned = readJson(LEARNED, {});

function parse(entry, rank) {
  const name = entry["im:name"]?.label || "";
  const fromMovie = name.match(/\(From "([^"]+)"\)/)?.[1] || "";
  const title = name.replace(/\s*\((From|feat\.?|ft\.?)[^)]*\)/gi, "").replace(/\s*\[[^\]]*\]/g, "").trim();
  const collection = entry["im:collection"]?.["im:name"]?.label || "";
  const movie = (fromMovie || collection.replace(/\s*[([].*?(soundtrack|motion picture|original).*?[)\]]/i, "").replace(/\s*-\s*Single$/i, ""))
    .replace(/\s*\[[^\]]*\]/g, "").trim();
  const links = [].concat(entry.link || []);
  const preview = links.find((l) => l.attributes?.["im:assetType"] === "preview")?.attributes?.href || "";
  const url = links.find((l) => l.attributes?.rel === "alternate")?.attributes?.href || "";
  const imgs = entry["im:image"] || [];
  const artwork = (imgs[imgs.length - 1]?.label || "").replace(/\d+x\d+bb/, "400x400bb");
  return { rank, title, movie: movie === title ? "" : movie, artist: entry["im:artist"]?.label || "", genre: entry.category?.attributes?.label || "", preview, artwork, url, theme: songTheme(title) };
}

/** Fetch today's charts (at most every 12 hours). Never throws. */
export async function refreshTrending(force = false) {
  if (!force && Date.now() - state.at < 12 * 3600e3 && state.ta.length) return state;
  const next = { at: Date.now() };
  for (const [lang, url] of Object.entries(FEEDS)) {
    try {
      const d = await fetchJson(url, { timeout: 20000 });
      let list = [].concat(d.feed?.entry || []).map((e, i) => parse(e, i + 1));
      if (lang === "en") list = list.filter((s) => !INDIAN_GENRES.test(s.genre)).map((s, i) => ({ ...s, rank: i + 1 }));
      next[lang] = list.filter((s) => s.title && !SKIP.test(s.title));
    } catch (e) {
      log("trending", `${lang} chart failed:`, e.message);
      next[lang] = state[lang] || [];
    }
  }
  state = next;
  writeJson(FILE, state);
  // remember chart songs that clearly match a theme: the film-song pool grows by itself
  let added = 0;
  for (const lang of ["ta", "hi", "en"]) {
    for (const s of state[lang]) {
      if (!s.theme) continue;
      const list = ((learned[s.theme] ||= {})[lang] ||= []);
      if (!list.some(([t]) => t === s.title)) list.push([s.title, s.movie, s.artist]), added++;
      learned[s.theme][lang] = list.slice(-40);
    }
  }
  writeJson(LEARNED, learned);
  log("trending", `charts: ${state.ta.length} Tamil, ${state.hi.length} Hindi, ${state.en.length} English (+${added} songs learned)`);
  return state;
}

export const learnedSongs = (theme, lang) => learned[theme]?.[lang] || [];

/** Themes that are hot in today's Tamil + Hindi charts (most first). */
export function trendingThemes() {
  const count = {};
  for (const s of [...state.ta.slice(0, 30), ...state.hi.slice(0, 30)]) if (s.theme) count[s.theme] = (count[s.theme] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** A trending song for this theme and language: a same-theme chart song if there is one, else a top-15 hit. */
export function trendingSong(theme, lang, avoid = new Set()) {
  const list = state[lang] || [];
  const ok = (s) => !avoid.has(s.title);
  const same = list.find((s) => s.theme === theme && ok(s));
  const top = list.slice(0, 15).filter(ok);
  const s = same || top[Math.floor(Math.random() * top.length)];
  if (!s) return null;
  const chart = { ta: "Tamil", hi: "Bollywood", en: "English" }[lang];
  return {
    lang, title: s.title, movie: s.movie, artist: s.artist, preview: s.preview, artwork: s.artwork, url: s.url, theme: s.theme || theme,
    trending: true, rank: s.rank,
    why: same ? `🔥 #${s.rank} in today's ${chart} chart, and it matches the feeling of the quote.` : `🔥 #${s.rank} in today's ${chart} chart: trending audio helps reach.`,
  };
}
