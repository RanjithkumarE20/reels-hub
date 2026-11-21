// Feed 1: English quote reels with an aesthetic image and a related Tamil / Hindi / English song.
import { fetchJson, readJson, writeJson, hash, pick, shuffle, log } from "./util.js";
import { findPhoto } from "./images.js";
import { findSong, nextLang, LANGS } from "./songs.js";
import { suggestSongs, geminiEnabled } from "./gemini.js";

export const MOODS = {
  love: { label: "Love", emoji: "💖", words: ["love", "heart", "kiss", "romance", "beloved", "soulmate", "lover", "together", "adore", "affection"] },
  motivation: { label: "Motivation", emoji: "🔥", words: ["work", "effort", "goal", "never give up", "try", "action", "start", "discipline", "hard", "strong", "strength", "courage", "brave", "fear", "push", "fight"] },
  success: { label: "Success", emoji: "🏆", words: ["success", "succeed", "win", "achieve", "victory", "champion", "excellence", "greatness", "ambition", "leader"] },
  sad: { label: "Feelings", emoji: "🌧️", words: ["pain", "tears", "cry", "alone", "lonely", "loss", "hurt", "broken", "sorrow", "sad", "grief", "regret", "miss"] },
  friendship: { label: "Friendship", emoji: "🤝", words: ["friend", "friendship", "companion", "loyal", "brother", "sister", "trust"] },
  hope: { label: "Hope", emoji: "🌅", words: ["hope", "dream", "future", "believe", "faith", "tomorrow", "light", "possible", "imagine", "wish"] },
  peace: { label: "Peace", emoji: "🍃", words: ["peace", "calm", "happy", "happiness", "joy", "smile", "gratitude", "grateful", "present", "moment", "simple", "quiet", "nature"] },
  life: { label: "Life", emoji: "🌿", words: ["life", "live", "time", "world", "change", "truth", "wisdom", "know", "learn", "mind", "experience", "wise"] },
};

// Photo search phrases per mood (Wikimedia Commons / Pexels). The quote is drawn on top.
const SCENES = {
  love: ["sunset silhouette couple", "red roses", "bokeh lights night", "beach sunset", "heart shaped", "candle light"],
  motivation: ["mountain summit sunrise", "runner silhouette", "mountain climbing", "athlete training", "city skyline dawn", "lion"],
  success: ["mountain peak clouds", "eagle flying", "skyscraper sky", "chess pieces", "sunrise over mountains"],
  sad: ["rain drops window", "foggy forest", "empty bench fog", "rainy street night", "lonely tree mist"],
  friendship: ["friends sunset", "campfire night", "road trip", "friends beach", "two dogs"],
  hope: ["sun rays clouds", "seedling sprout", "lighthouse", "hot air balloon sunrise", "sunrise field"],
  peace: ["tea plantation munnar", "calm lake reflection", "lotus flower", "zen garden", "misty hills morning", "waterfall forest"],
  life: ["autumn forest road", "milky way night sky", "old books", "train hills", "kerala backwaters", "desert dunes"],
};

const BUILTIN = [
  ["The best way to predict the future is to create it.", "Peter Drucker"],
  ["Whatever you are, be a good one.", "Abraham Lincoln"],
  ["Love is composed of a single soul inhabiting two bodies.", "Aristotle"],
  ["Dream, dream, dream. Dreams transform into thoughts and thoughts result in action.", "A. P. J. Abdul Kalam"],
  ["If you want to shine like a sun, first burn like a sun.", "A. P. J. Abdul Kalam"],
  ["Strength does not come from physical capacity. It comes from an indomitable will.", "Mahatma Gandhi"],
  ["Arise, awake, and stop not till the goal is reached.", "Swami Vivekananda"],
  ["A friend is someone who knows all about you and still loves you.", "Elbert Hubbard"],
  ["Tears come from the heart and not from the brain.", "Leonardo da Vinci"],
  ["Peace comes from within. Do not seek it without.", "Buddha"],
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Hope is being able to see that there is light despite all of the darkness.", "Desmond Tutu"],
  ["In the end, it's not the years in your life that count. It's the life in your years.", "Abraham Lincoln"],
  ["Success is not final, failure is not fatal: it is the courage to continue that counts.", "Winston Churchill"],
  ["You are never too old to set another goal or to dream a new dream.", "C. S. Lewis"],
  ["The wound is the place where the Light enters you.", "Rumi"],
  ["Be yourself; everyone else is already taken.", "Oscar Wilde"],
  ["Happiness is not something ready made. It comes from your own actions.", "Dalai Lama"],
  ["Walking with a friend in the dark is better than walking alone in the light.", "Helen Keller"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["Yaadhum oore yaavarum kelir - every place is my home, everyone my kin.", "Kaniyan Pungundranar"],
  ["Learning is the eye of the mind.", "Thiruvalluvar"],
  ["Love all, trust a few, do wrong to none.", "William Shakespeare"],
  ["Where there is love there is life.", "Mahatma Gandhi"],
  ["You must be the change you wish to see in the world.", "Mahatma Gandhi"],
  ["Take risks in your life. If you win, you can lead; if you lose, you can guide.", "Swami Vivekananda"],
  ["Excellence is a continuous process and not an accident.", "A. P. J. Abdul Kalam"],
  ["The sun is new each day.", "Heraclitus"],
  ["Where words fail, music speaks.", "Hans Christian Andersen"],
  ["What we have once enjoyed we can never lose. All that we love deeply becomes a part of us.", "Helen Keller"],
  ["Even the darkest night will end and the sun will rise.", "Victor Hugo"],
  ["The best and most beautiful things in the world cannot be seen or even touched. They must be felt with the heart.", "Helen Keller"],
  ["Don't cry because it's over, smile because it happened.", "Dr. Seuss"],
  ["Friendship is the only cement that will ever hold the world together.", "Woodrow Wilson"],
  ["A real friend is one who walks in when the rest of the world walks out.", "Walter Winchell"],
  ["Keep your face always toward the sunshine, and shadows will fall behind you.", "Walt Whitman"],
  ["Do not pray for an easy life, pray for the strength to endure a difficult one.", "Bruce Lee"],
  ["Life is what happens when you're busy making other plans.", "John Lennon"],
  ["Happiness depends upon ourselves.", "Aristotle"],
  ["What you seek is seeking you.", "Rumi"],
  ["Your time is limited, so don't waste it living someone else's life.", "Steve Jobs"],
  ["The heart has its reasons which reason knows nothing of.", "Blaise Pascal"],
  ["Every moment is a fresh beginning.", "T. S. Eliot"],
];

export function moodOf(text) {
  return moodScore(text).mood;
}
function moodScore(text) {
  const t = ` ${text.toLowerCase()} `;
  let best = "life";
  let score = 0;
  for (const [m, { words }] of Object.entries(MOODS)) {
    const s = words.reduce((n, w) => n + (new RegExp(`\\b${w}`).test(t) ? (w.includes(" ") ? 2 : 1) : 0), 0);
    if (s > score) [best, score] = [m, s];
  }
  return { mood: best, score };
}

// dummyjson capitalises Every Word Of Some Quotes; turn those into normal sentences.
function tidy(t) {
  t = t.replace(/\s+/g, " ").trim();
  const words = t.split(" ");
  const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (words.length > 4 && caps / words.length > 0.7) {
    t = t.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bi\b/g, "I");
  }
  return t;
}

// ---------- state ----------
const FILE = "quotes.json";
const MAX = 600;
let state = readJson(FILE, { items: [], seen: [] });
const seen = new Set(state.seen);
const save = () => writeJson(FILE, { items: state.items.slice(0, MAX), seen: [...seen].slice(-5000) });

export const quoteItems = () => state.items;

async function fetchQuotes(n) {
  const out = [];
  try {
    // dummyjson has ~1450 quotes; pull a random page
    const skip = Math.floor(Math.random() * 1400);
    const d = await fetchJson(`https://dummyjson.com/quotes?limit=${n * 3}&skip=${skip}`);
    // keep quotes that clearly carry a mood (they make better reels and better song matches)
    for (const q of d.quotes || []) if (moodScore(q.quote).score > 0 && !/stoned|drunk|sex|kill/i.test(q.quote)) out.push([tidy(q.quote), q.author]);
  } catch (e) {
    log("quotes", "dummyjson failed:", e.message);
  }
  try {
    // ZenQuotes: 50 fresh random quotes each call (free, no key)
    const z = await fetchJson("https://zenquotes.io/api/quotes", { timeout: 15000 });
    for (const q of Array.isArray(z) ? z : []) {
      if (q.q && q.a && !/zenquotes/i.test(q.a) && moodScore(q.q).score > 0) out.push([tidy(q.q), q.a]);
    }
  } catch (e) {
    log("quotes", "zenquotes failed:", e.message);
  }
  out.push(...shuffle(BUILTIN).slice(0, Math.max(3, n - out.length)));
  return shuffle(out)
    .filter(([t]) => t && t.length <= 220 && !seen.has(hash(t)))
    .slice(0, n);
}

// ---------- pipeline ----------
export async function addQuotes(n = 6) {
  const raw = await fetchQuotes(n);
  if (!raw.length) return [];
  const drafts = raw.map(([text, author]) => ({ id: hash(text), text, author: author || "Unknown" }));
  const ai = await suggestSongs(drafts);
  const made = [];
  for (const d of drafts) {
    const s = ai[d.id] || {};
    const mood = MOODS[s.mood] ? s.mood : moodOf(d.text);
    const lang = nextLang();
    const song = (await findSong(mood, lang, s[lang])) || (await findSong(mood, "ta"));
    const scene = pick(SCENES[mood] || SCENES.life);
    const photo = await findPhoto(scene);
    const item = {
      id: d.id,
      type: "quote",
      text: d.text,
      author: d.author,
      mood,
      moodLabel: MOODS[mood].label,
      moodEmoji: MOODS[mood].emoji,
      scene,
      image: photo?.url || `https://picsum.photos/seed/${d.id}/720/1280`,
      imageSource: photo ? "mood" : "random",
      credit: photo?.credit || "",
      song,
      createdAt: Date.now(),
    };
    seen.add(d.id);
    made.push(item);
  }
  state.items = [...made, ...state.items].slice(0, MAX);
  save();
  log("quotes", `+${made.length} quote reels (${made.map((m) => `${m.mood}/${m.song ? LANGS[m.song.lang] : "no song"}`).join(", ")})${geminiEnabled() ? " [AI picks]" : ""}`);
  return made;
}

// Give older reels that only got a random photo a mood photo (e.g. after the photo service was down).
export async function resumeImages() {
  let fixed = 0;
  for (const it of state.items) {
    if (it.imageSource === "mood" || !it.mood) continue;
    it.scene = it.scene && SCENES[it.mood].includes(it.scene) ? it.scene : pick(SCENES[it.mood]);
    const photo = await findPhoto(it.scene);
    if (photo) Object.assign(it, { image: photo.url, imageSource: "mood", credit: photo.credit }), fixed++;
  }
  if (fixed) save(), log("images", `upgraded ${fixed} reels to mood photos`);
}

export async function alternativeSong(mood, lang) {
  return findSong(MOODS[mood] ? mood : "life", LANGS[lang] ? lang : nextLang());
}

/** Instagram-style stories: one per mood (latest quotes of that mood) + "Fresh drops" + one per song language. */
export function quoteStories() {
  const items = state.items;
  const stories = [];
  const fresh = items.slice(0, 8);
  if (fresh.length) stories.push(story("fresh", "Fresh drops", "✨", fresh));
  for (const [m, meta] of Object.entries(MOODS)) {
    const list = items.filter((i) => i.mood === m).slice(0, 6);
    if (list.length) stories.push(story(`mood-${m}`, meta.label, meta.emoji, list));
  }
  for (const [l, name] of Object.entries(LANGS)) {
    const list = items.filter((i) => i.song?.lang === l).slice(0, 6);
    if (list.length) stories.push(story(`lang-${l}`, `${name} vibes`, "🎵", list, true));
  }
  return stories;
}
function story(id, title, emoji, list, songAvatar = false) {
  return {
    id,
    title,
    emoji,
    avatar: songAvatar ? list[0].song?.artwork || list[0].image : list[0].image,
    updatedAt: list[0].createdAt,
    slides: list.map((q) => ({ id: q.id, kind: "quote", image: q.image, text: q.text, author: q.author, song: q.song })),
  };
}
