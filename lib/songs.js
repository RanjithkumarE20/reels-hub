// Song matching: mood -> Tamil / Hindi / English song via the free iTunes Search API (30s previews).
// iTunes tags each track with a genre ("Tamil", "Bollywood", ...) which we use to guarantee the language.
import { fetchJson, readJson, writeJson, pick, shuffle, log } from "./util.js";

export const LANGS = { ta: "Tamil", hi: "Hindi", en: "English" };

// Search phrases per mood and language. Phrases favour artists whose catalogue fits the mood.
const BANK = {
  love: {
    ta: ["sid sriram tamil", "harris jayaraj love", "anirudh ravichander melody", "yuvan shankar raja love", "gv prakash kumar melody", "a r rahman tamil love", "hesham abdul wahab tamil"],
    hi: ["arijit singh romantic", "atif aslam", "shreya ghoshal romantic", "pritam love", "jubin nautiyal", "vishal mishra"],
    en: ["ed sheeran", "john legend", "taylor swift love", "bruno mars", "shawn mendes", "calum scott"],
  },
  motivation: {
    ta: ["anirudh ravichander mass", "santhosh narayanan", "hiphop tamizha", "anirudh ravichander", "d imman", "yuvan shankar raja mass"],
    hi: ["shankar mahadevan", "zinda", "divine rapper", "badshah", "vishal dadlani", "sukhwinder singh"],
    en: ["imagine dragons", "eminem", "sia unstoppable", "katy perry roar", "survivor eye of the tiger", "kanye west stronger"],
  },
  sad: {
    ta: ["yuvan shankar raja", "sid sriram", "a r rahman tamil melody", "harris jayaraj melody", "santhosh narayanan melody"],
    hi: ["arijit singh sad", "jubin nautiyal sad", "kk singer", "mohit chauhan", "b praak"],
    en: ["adele", "lewis capaldi", "billie eilish", "sam smith", "james arthur"],
  },
  life: {
    ta: ["ilaiyaraaja", "a r rahman tamil", "pradeep kumar tamil", "sean roldan", "vijay antony"],
    hi: ["lucky ali", "a r rahman hindi", "amit trivedi", "mohit chauhan", "papon"],
    en: ["coldplay", "avicii", "one republic", "the script", "passenger let her go"],
  },
  friendship: {
    ta: ["friendship tamil", "hiphop tamizha", "anirudh ravichander dance", "d imman", "yuvan shankar raja"],
    hi: ["yaariyan", "dil chahta hai", "shankar ehsaan loy", "amit trivedi", "vishal shekhar"],
    en: ["wiz khalifa see you again", "bruno mars count on me", "queen you're my best friend", "maroon 5", "one direction"],
  },
  hope: {
    ta: ["a r rahman tamil", "sean roldan", "pradeep kumar tamil", "harris jayaraj", "g v prakash kumar"],
    hi: ["a r rahman hindi", "amit trivedi", "shankar mahadevan", "arijit singh", "papon"],
    en: ["coldplay", "keane", "one republic", "rachel platten fight song", "andy grammer"],
  },
  peace: {
    ta: ["ilaiyaraaja melody", "pradeep kumar tamil", "sid sriram", "a r rahman tamil melody", "bombay jayashri"],
    hi: ["prateek kuhad", "lucky ali", "shreya ghoshal", "ankit tiwari", "armaan malik"],
    en: ["jack johnson", "norah jones", "ed sheeran acoustic", "lauv", "jason mraz"],
  },
};
BANK.success = BANK.motivation;
BANK.wisdom = BANK.life;

const INDIAN = new Set(["Tamil", "Telugu", "Malayalam", "Kannada", "Bollywood", "Indian Pop", "Hindi", "Punjabi", "Indian", "Indian Classical", "Devotional & Spiritual", "Marathi", "Bengali"]);
const GENRE_OK = {
  ta: (g) => g === "Tamil",
  hi: (g) => g === "Bollywood" || g === "Hindi" || g === "Indian Pop",
  en: (g) => !INDIAN.has(g),
};

const CACHE_FILE = "itunes-cache.json";
const DAY = 24 * 3600 * 1000;
const cache = readJson(CACHE_FILE, {});
const recent = []; // last used track ids -> avoid repeating the same song back to back
let saveTimer;
const persist = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJson(CACHE_FILE, cache), 2000);
};

async function search(term) {
  const hit = cache[term];
  if (hit && Date.now() - hit.at < DAY) return hit.results;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=IN&media=music&entity=song&limit=40`;
  try {
    const data = await fetchJson(url, { timeout: 15000 });
    const results = (data.results || [])
      .filter((r) => r.previewUrl && r.trackName)
      .map((r) => ({
        id: r.trackId,
        title: r.trackName.replace(/\s*\(From "[^"]*"\)?/i, "").trim(),
        movie: (r.collectionName || "").replace(/\s*\(Original Motion Picture Soundtrack\)/i, "").trim(),
        artist: r.artistName,
        genre: r.primaryGenreName,
        artwork: (r.artworkUrl100 || "").replace("100x100", "400x400"),
        preview: r.previewUrl,
        url: r.trackViewUrl,
      }));
    cache[term] = { at: Date.now(), results };
    persist();
    return results;
  } catch (e) {
    log("songs", "iTunes search failed:", term, e.message);
    return hit?.results || [];
  }
}

function choose(results, lang) {
  const ok = results.filter((r) => GENRE_OK[lang](r.genre));
  const fresh = ok.filter((r) => !recent.includes(r.id));
  const chosen = pick(fresh.length ? fresh : ok);
  if (chosen) {
    recent.push(chosen.id);
    if (recent.length > 120) recent.shift();
  }
  return chosen;
}

/** Find a song for a mood in a language. `hint` is an optional "title artist" suggestion (from Gemini). */
export async function findSong(mood, lang, hint) {
  if (hint) {
    const s = choose((await search(hint)).slice(0, 5), lang);
    if (s) return { ...s, lang, mood, matched: "ai" };
  }
  const phrases = shuffle((BANK[mood] || BANK.life)[lang]);
  for (const p of phrases.slice(0, 3)) {
    const s = choose(await search(p), lang);
    if (s) return { ...s, lang, mood, matched: "mood" };
  }
  return null;
}

// Language rotation for the "mixed" feed, e.g. SONG_MIX=ta:2,hi:1,en:1 -> Tamil twice as often.
let mixSeq = [];
let mixIdx = 0;
export function nextLang() {
  if (!mixSeq.length) {
    const spec = process.env.SONG_MIX || "ta:2,hi:1,en:1";
    for (const part of spec.split(",")) {
      const [l, w] = part.split(":").map((x) => x.trim());
      if (LANGS[l]) for (let i = 0; i < (+w || 1); i++) mixSeq.push(l);
    }
    if (!mixSeq.length) mixSeq = ["ta", "hi", "en"];
    // spread languages out: ta, hi, en, ta ...
    const byLang = Object.groupBy(mixSeq, (x) => x);
    const out = [];
    while (out.length < mixSeq.length) for (const l of Object.keys(byLang)) if (byLang[l].length) out.push(byLang[l].pop());
    mixSeq = out;
  }
  return mixSeq[mixIdx++ % mixSeq.length];
}
