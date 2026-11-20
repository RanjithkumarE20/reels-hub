// Film-song suggestions that match what a quote is ABOUT (mother, heartbreak, friendship, hope...),
// not just its mood. Returns one Tamil, one Hindi and one English song, each with a short reason and
// (when iTunes has it) a 30 s preview + cover art. The user adds the chosen song in the Instagram app.
import { fetchJson, readJson, writeJson, shuffle, log } from "./util.js";

// [title, movie, artist]
const THEMES = {
  mother: {
    label: "a mother's love",
    words: ["mother", "mom", "mum", "maa", "amma", "motherhood"],
    ta: [["Amma Amma", "Velaiilla Pattadhari", "Dhanush, S. Janaki"], ["Amma Endrazhaikkadha", "Mannan", "K. J. Yesudas"]],
    hi: [["Maa", "Taare Zameen Par", "Shankar Mahadevan"], ["Luka Chuppi", "Rang De Basanti", "Lata Mangeshkar, A. R. Rahman"]],
    en: [["The Best Day", "", "Taylor Swift"], ["Mama", "", "Spice Girls"]],
  },
  father: {
    label: "a father's love",
    words: ["father", "dad", "daddy", "papa", "appa", "daughter", "son"],
    ta: [["Kannaana Kanne", "Viswasam", "Sid Sriram"], ["Unakkenna Venum Sollu", "Yennai Arindhaal", "Benny Dayal, Mahathi"], ["Aariraro", "Deiva Thirumagal", "G. V. Prakash Kumar"]],
    hi: [["Papa Kehte Hain", "Qayamat Se Qayamat Tak", "Udit Narayan"]],
    en: [["Father and Son", "", "Cat Stevens"], ["Dance with My Father", "", "Luther Vandross"]],
  },
  friendship: {
    label: "friendship",
    words: ["friend", "friends", "friendship", "buddy", "companion", "brotherhood", "loyal", "loyalty"],
    ta: [["Mustafa Mustafa", "Kadhal Desam", "A. R. Rahman"], ["Megham Karukatha", "Thiruchitrambalam", "Dhanush"]],
    hi: [["Yeh Dosti", "Sholay", "Kishore Kumar, Manna Dey"], ["Tere Jaisa Yaar Kahan", "Yaarana", "Kishore Kumar"], ["Dil Chahta Hai", "Dil Chahta Hai", "Shankar Mahadevan"]],
    en: [["See You Again", "Furious 7", "Wiz Khalifa, Charlie Puth"], ["Count on Me", "", "Bruno Mars"]],
  },
  heartbreak: {
    label: "heartbreak and pain",
    words: ["broken", "tears", "cry", "crying", "pain", "hurt", "goodbye", "lost", "miss", "missing", "sorrow", "regret", "grief", "wound", "scar", "leave", "left"],
    ta: [["Po Nee Po", "3", "Anirudh Ravichander"], ["Ninaithu Ninaithu Parthen", "7G Rainbow Colony", "KK"], ["Kanave Kanave", "David", "Anirudh Ravichander"], ["Idhazhin Oram", "3", "Anirudh Ravichander"]],
    hi: [["Channa Mereya", "Ae Dil Hai Mushkil", "Arijit Singh"], ["Agar Tum Saath Ho", "Tamasha", "Alka Yagnik, Arijit Singh"], ["Tujhe Bhula Diya", "Anjaana Anjaani", "Mohit Chauhan"]],
    en: [["Someone Like You", "", "Adele"], ["Let Her Go", "", "Passenger"], ["Fix You", "", "Coldplay"]],
  },
  loneliness: {
    label: "loneliness and solitude",
    words: ["alone", "lonely", "loneliness", "solitude", "silence", "empty", "nobody"],
    ta: [["Life of Ram", "96", "Pradeep Kumar"], ["Oru Naalil", "Pudhupettai", "Yuvan Shankar Raja"]],
    hi: [["Phir Le Aya Dil", "Barfi!", "Arijit Singh"], ["Kabira", "Yeh Jawaani Hai Deewani", "Tochi Raina, Rekha Bhardwaj"]],
    en: [["Boulevard of Broken Dreams", "", "Green Day"], ["Lovely", "", "Billie Eilish, Khalid"]],
  },
  love: {
    label: "love",
    words: ["love", "heart", "soul", "romance", "beloved", "kiss", "lover", "adore", "darling", "together", "forever"],
    ta: [["Munbe Vaa", "Sillunu Oru Kaadhal", "Shreya Ghoshal, Naresh Iyer"], ["Nenjukkul Peidhidum", "Vaaranam Aayiram", "Hariharan"], ["Ennodu Nee Irundhal", "I", "Sid Sriram, Sunitha Sarathy"], ["Vaseegara", "Minnale", "Bombay Jayashri"], ["Thalli Pogathey", "Achcham Yenbadhu Madamaiyada", "Sid Sriram"], ["Kaathalae Kaathalae", "96", "Chinmayi, Govind Vasantha"], ["Maruvaarthai", "Enai Noki Paayum Thota", "Sid Sriram"], ["Uyire Uyire", "Bombay", "Hariharan, K. S. Chithra"]],
    hi: [["Tum Hi Ho", "Aashiqui 2", "Arijit Singh"], ["Kesariya", "Brahmastra", "Arijit Singh"], ["Tujh Mein Rab Dikhta Hai", "Rab Ne Bana Di Jodi", "Roop Kumar Rathod"], ["Raabta", "Agent Vinod", "Arijit Singh"]],
    en: [["Perfect", "", "Ed Sheeran"], ["All of Me", "", "John Legend"], ["A Thousand Years", "The Twilight Saga", "Christina Perri"], ["Can't Help Falling in Love", "", "Elvis Presley"]],
  },
  motivation: {
    label: "courage and never giving up",
    words: ["work", "effort", "give up", "fight", "strong", "strength", "courage", "brave", "fear", "discipline", "goal", "push", "try", "hard", "fail", "failure", "rise", "power"],
    ta: [["Singappenney", "Bigil", "A. R. Rahman"], ["Ethir Neechal", "Ethir Neechal", "Anirudh Ravichander, Hiphop Tamizha"], ["Aalaporaan Thamizhan", "Mersal", "Kailash Kher, Sathyaprakash"]],
    hi: [["Zinda", "Bhaag Milkha Bhaag", "Siddharth Mahadevan"], ["Lakshya", "Lakshya", "Shankar Mahadevan"], ["Kar Har Maidaan Fateh", "Sanju", "Sukhwinder Singh, Shreya Ghoshal"], ["Ziddi Dil", "Mary Kom", "Vishal Dadlani"]],
    en: [["Hall of Fame", "", "The Script"], ["Believer", "", "Imagine Dragons"], ["Eye of the Tiger", "Rocky III", "Survivor"], ["Lose Yourself", "8 Mile", "Eminem"]],
  },
  success: {
    label: "success and winning",
    words: ["success", "succeed", "win", "winner", "victory", "achieve", "champion", "greatness", "excellence", "leader", "ambition"],
    ta: [["Singappenney", "Bigil", "A. R. Rahman"], ["Aalaporaan Thamizhan", "Mersal", "Kailash Kher, Sathyaprakash"]],
    hi: [["Chak De India", "Chak De! India", "Sukhwinder Singh"], ["Lakshya", "Lakshya", "Shankar Mahadevan"]],
    en: [["Hall of Fame", "", "The Script"], ["Unstoppable", "", "Sia"], ["We Are the Champions", "", "Queen"]],
  },
  hope: {
    label: "hope and dreams",
    words: ["hope", "dream", "dreams", "tomorrow", "believe", "faith", "light", "sunrise", "possible", "future", "new beginning", "begin"],
    ta: [["Vellai Pookal", "Kannathil Muthamittal", "A. R. Rahman"], ["Pudhu Vellai Mazhai", "Roja", "Unni Menon, Sujatha"]],
    hi: [["Aashayein", "Iqbal", "KK"], ["Ilahi", "Yeh Jawaani Hai Deewani", "Arijit Singh"], ["Phir Se Ud Chala", "Rockstar", "Mohit Chauhan"]],
    en: [["A Million Dreams", "The Greatest Showman", "Ziv Zaifman, Hugh Jackman, Michelle Williams"], ["Fight Song", "", "Rachel Platten"], ["Here Comes the Sun", "", "The Beatles"]],
  },
  peace: {
    label: "peace and calm",
    words: ["peace", "calm", "nature", "rain", "sea", "breathe", "gratitude", "grateful", "present", "moment", "quiet", "simple", "god", "pray", "prayer"],
    ta: [["Kaatrin Mozhi", "Mozhi", "Balram"], ["Pudhu Vellai Mazhai", "Roja", "Unni Menon, Sujatha"], ["Vellai Pookal", "Kannathil Muthamittal", "A. R. Rahman"]],
    hi: [["Kun Faya Kun", "Rockstar", "A. R. Rahman, Javed Ali, Mohit Chauhan"], ["Arziyan", "Delhi-6", "Javed Ali, Kailash Kher"]],
    en: [["What a Wonderful World", "", "Louis Armstrong"], ["Let It Be", "", "The Beatles"]],
  },
  happiness: {
    label: "happiness and smiles",
    words: ["happy", "happiness", "smile", "joy", "laugh", "fun", "celebrate", "enjoy"],
    ta: [["Rowdy Baby", "Maari 2", "Dhanush, Dhee"], ["Vaathi Coming", "Master", "Anirudh Ravichander, Gana Balachandar"]],
    hi: [["Badtameez Dil", "Yeh Jawaani Hai Deewani", "Benny Dayal"], ["Gallan Goodiyaan", "Dil Dhadakne Do", "Yashita Sharma, Manish Kumar Tipu"]],
    en: [["Happy", "Despicable Me 2", "Pharrell Williams"], ["Can't Stop the Feeling!", "Trolls", "Justin Timberlake"], ["Good Life", "", "OneRepublic"]],
  },
  life: {
    label: "life and its journey",
    words: ["life", "live", "living", "time", "journey", "change", "world", "wisdom", "learn", "truth", "experience", "road", "path"],
    ta: [["Life of Ram", "96", "Pradeep Kumar"], ["Oru Naalil", "Pudhupettai", "Yuvan Shankar Raja"], ["Megham Karukatha", "Thiruchitrambalam", "Dhanush"]],
    hi: [["Zindagi Kaisi Hai Paheli", "Anand", "Manna Dey"], ["Ilahi", "Yeh Jawaani Hai Deewani", "Arijit Singh"], ["Kabira", "Yeh Jawaani Hai Deewani", "Tochi Raina, Rekha Bhardwaj"]],
    en: [["Viva la Vida", "", "Coldplay"], ["The Climb", "Hannah Montana: The Movie", "Miley Cyrus"], ["Wake Me Up", "", "Avicii"]],
  },
};
// fallbacks from the app's mood labels
const MOOD_THEME = { love: "love", motivation: "motivation", success: "success", sad: "heartbreak", friendship: "friendship", hope: "hope", peace: "peace", life: "life", wisdom: "life" };

/** Which theme is the quote about? Returns { theme, word } (word = the keyword that matched). */
export function themeOf(text, mood) {
  const t = ` ${text.toLowerCase()} `;
  let best = null;
  for (const [key, th] of Object.entries(THEMES)) {
    let score = 0;
    let word = "";
    for (const w of th.words) {
      // whole words only (plural allowed): "son" must not match "song"
      if (new RegExp(`\\b${w}(s|es)?\\b`).test(t)) {
        score += w.includes(" ") ? 2 : 1;
        word ||= w;
      }
    }
    // specific themes (mother, father, friendship, loneliness) beat general ones on a tie
    const weight = ["mother", "father", "friendship", "loneliness"].includes(key) ? 1.5 : 1;
    if (score && (!best || score * weight > best.score)) best = { theme: key, word, score: score * weight };
  }
  return best || { theme: MOOD_THEME[mood] || "life", word: "" };
}

// ---------- iTunes lookup for preview + artwork (cached) ----------
const CACHE = "filmsong-cache.json";
const cache = readJson(CACHE, {});
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").trim();
async function lookup(title, artist) {
  const key = `${title}|${artist}`;
  if (cache[key] && Date.now() - cache[key].at < 30 * 86400000) return cache[key].v;
  let v = null;
  try {
    const term = `${title} ${artist.split(",")[0]}`;
    const d = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=IN&media=music&entity=song&limit=10`, { timeout: 15000 });
    const want = norm(title).split(" ")[0];
    const hit = (d.results || []).find((r) => r.previewUrl && norm(r.trackName || "").includes(want));
    if (hit) v = { preview: hit.previewUrl, artwork: (hit.artworkUrl100 || "").replace("100x100", "400x400"), url: hit.trackViewUrl };
  } catch (e) {
    log("filmsongs", "lookup failed:", title, e.message);
  }
  cache[key] = { at: Date.now(), v };
  writeJson(CACHE, cache);
  return v;
}

const recent = readJson("filmsong-recent.json", []);
function choose(list) {
  const fresh = list.filter(([t]) => !recent.includes(t));
  return shuffle(fresh.length ? fresh : list)[0];
}

/** 3 suggestions (Tamil, Hindi, English) for a quote. */
export async function suggestFilmSongs(quote) {
  const { theme, word } = themeOf(quote.text, quote.mood);
  const th = THEMES[theme];
  const why = word ? `The quote talks about “${word}”, and this song is about ${th.label}.` : `This song carries the same feeling of ${th.label}.`;
  const out = [];
  for (const lang of ["ta", "hi", "en"]) {
    const [title, movie, artist] = choose(th[lang]);
    recent.push(title);
    const extra = await lookup(title, artist);
    out.push({ lang, title, movie, artist, why, theme, ...(extra || {}) });
  }
  writeJson("filmsong-recent.json", recent.slice(-40));
  return { theme, themeLabel: th.label, songs: out };
}
