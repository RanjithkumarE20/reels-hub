// Tamil quotes for the art-style reels: original lines written for this page, plus a few classics
// (Thirukkural, Purananuru) that are centuries old and free to use.
// Each has an English meaning (used in the caption and to match film songs) and a theme.
import { hash } from "./util.js";

// [tamil, english meaning, mood, theme, author]
const LIST = [
  ["உன் சிரிப்பில் தான் என் ஒவ்வொரு நாளின் விடியலும் இருக்கிறது", "Every one of my mornings begins in your smile.", "love", "love", ""],
  ["எங்கு போனாலும் என் மனம் உன்னிடமே திரும்பி வருகிறது", "Wherever I go, my heart keeps coming back to you.", "love", "love", ""],
  ["சில உறவுகளுக்கு வார்த்தைகள் தேவையில்லை, ஒரு பார்வை போதும்", "Some bonds need no words. One look is enough.", "love", "love", ""],
  ["நீ அருகில் இருந்தால் மழை கூட இசையாகிறது", "When you are near, even the rain becomes music.", "love", "love", ""],
  ["காதலின் அழகு பெறுவதில் இல்லை, கொடுப்பதில் தான் இருக்கிறது", "The beauty of love is not in receiving but in giving.", "love", "love", ""],
  ["உன் பெயரைச் சொன்னாலே என் இதயம் புன்னகைக்கிறது", "Just saying your name makes my heart smile.", "love", "love", ""],
  ["சிரிப்புக்குப் பின்னால் ஒளிந்திருக்கும் கண்ணீரை யாரும் பார்ப்பதில்லை", "Nobody sees the tears hiding behind a smile.", "sad", "heartbreak", ""],
  ["மறக்க நினைப்பது தான் மனதில் அதிகம் நிற்கிறது", "What we try hardest to forget stays the longest in the heart.", "sad", "heartbreak", ""],
  ["சொல்லாமல் போனவர்களை விட, சொல்லியும் புரியாதவர்கள் தான் அதிகம் வலிக்க வைக்கிறார்கள்", "Those who never understand hurt more than those who leave without a word.", "sad", "heartbreak", ""],
  ["தனிமை சில நேரம் தண்டனை, சில நேரம் தன்னைத் தேடும் வழி", "Being alone is sometimes a punishment, sometimes the way to find yourself.", "sad", "loneliness", ""],
  ["விழுவது தோல்வி அல்ல, எழாமல் இருப்பது தான் தோல்வி", "Falling is not failure. Not getting up is.", "motivation", "motivation", ""],
  ["இன்றைய வியர்வை நாளைய வெற்றியின் விதை", "Today's sweat is the seed of tomorrow's victory.", "motivation", "motivation", ""],
  ["பயம் உன்னை நிறுத்தும் முன், நீ ஒரு அடி முன்னே வை", "Before fear stops you, take one step forward.", "motivation", "motivation", ""],
  ["உன்னை நீ நம்பு, உலகம் பிறகு நம்பும்", "Believe in yourself first. The world will believe later.", "motivation", "motivation", ""],
  ["அமைதியாக உழை, உன் வெற்றி சத்தம் போடட்டும்", "Work in silence and let your success make the noise.", "success", "success", ""],
  ["சிகரம் தொட்டவர்கள் எல்லாம் ஒரு நாள் அடிவாரத்தில் நின்றவர்கள் தான்", "Everyone who reached the peak once stood at the bottom.", "success", "success", ""],
  ["இருள் எவ்வளவு நீண்டாலும், விடியல் வராமல் இருந்ததில்லை", "However long the night, the dawn has never failed to come.", "hope", "hope", ""],
  ["ஒவ்வொரு காலையும் ஒரு புதிய வாய்ப்பு", "Every morning is a new chance.", "hope", "hope", ""],
  ["நம்பிக்கை ஒரு சிறு விளக்கு, பாதையைக் காட்ட அது போதும்", "Hope is a small lamp, and it is enough to light the path.", "hope", "hope", ""],
  ["கஷ்டத்தில் கை கொடுப்பவனே உண்மையான நண்பன்", "A true friend is the one who holds your hand in hard times.", "friendship", "friendship", ""],
  ["நல்ல நண்பன் கிடைப்பது ஒரு வரம்", "Finding a good friend is a blessing.", "friendship", "friendship", ""],
  ["நட்புக்கு காரணம் தேவையில்லை, நம்பிக்கை மட்டும் போதும்", "Friendship needs no reason, only trust.", "friendship", "friendship", ""],
  ["அமைதி வெளியில் இல்லை, உன் மனதுக்குள் தான் இருக்கிறது", "Peace is not outside. It is within your own mind.", "peace", "peace", ""],
  ["சின்னச் சின்ன சந்தோஷங்களில் தான் வாழ்க்கையின் அழகு இருக்கிறது", "The beauty of life lives in its little joys.", "peace", "happiness", ""],
  ["வாழ்க்கை ஒரு பயணம், இலக்கை விட பாதை தான் அழகு", "Life is a journey, and the road is more beautiful than the destination.", "life", "life", ""],
  ["காலம் எல்லா காயங்களையும் ஆற்றும், ஆனால் பாடங்களை விட்டுச் செல்லும்", "Time heals every wound, but leaves its lessons behind.", "life", "life", ""],
  ["உலகம் முழுதும் தேடினாலும் அம்மாவின் மடி போல் ஒரு இடம் இல்லை", "Search the whole world, there is no place like a mother's lap.", "love", "mother", ""],
  ["அம்மா என்ற ஒரு வார்த்தையில் ஆயிரம் கவிதைகள்", "A thousand poems live in one word: Amma.", "love", "mother", ""],
  ["அப்பாவின் அன்பு சத்தமில்லாதது, ஆனால் ஆழமானது", "A father's love is silent, but it is deep.", "love", "father", ""],
  // short stanzas ("\n" = line break kept on screen)
  ["சில மௌனங்கள்\nஆயிரம் வார்த்தைகளை விட\nஅதிகம் வலிக்கின்றன..!", "Some silences hurt more than a thousand words.", "sad", "heartbreak", ""],
  ["அன்பு அதிகமானால்\nபயமும் கூடவே வருகிறது,\nஇழந்து விடுவோமோ என்று..!", "When love grows, fear comes with it: the fear of losing it.", "love", "love", ""],
  ["எதிர்பார்ப்பு குறைந்தால்\nஏமாற்றமும் குறையும்..!", "Expect less, and you will be disappointed less.", "life", "life", ""],
  ["கூட்டத்தில் இருந்தும்\nதனிமையாக உணர்வது தான்\nஉண்மையான தனிமை", "Feeling alone in a crowd is the truest loneliness.", "sad", "loneliness", ""],
  ["உன்னோடு பேசிய\nசில நிமிடங்கள் தான்\nஎன் நாளின் அழகான நேரம்", "The few minutes I talk with you are the most beautiful part of my day.", "love", "love", ""],
  ["போனவர்களை நினைத்து அழாதே,\n\nஇருப்பவர்களை\nநேசிக்க மறவாதே..!", "Don't cry over those who left. Don't forget to love those who stayed.", "sad", "heartbreak", ""],
  ["நேரம் மாறும்,\nமனிதர்களும் மாறுவார்கள்,\n\nநீ மட்டும்\nஉன்னை இழக்காதே..!", "Time will change, people will change. Just don't lose yourself.", "life", "life", ""],
  ["இன்று கடினமாக இருந்தாலும்\nநாளை உனக்கானது..!", "Today may be hard, but tomorrow is yours.", "hope", "hope", ""],
  ["நல்ல நட்பு\nசத்தமில்லாமல்\nகூடவே நடக்கும்", "A good friendship walks beside you, quietly.", "friendship", "friendship", ""],
  ["எல்லாவற்றுக்கும்\nபதில் சொல்ல வேண்டியதில்லை,\n\nசில நேரம்\nஅமைதியே பதில்", "Not everything needs an answer. Sometimes silence is the answer.", "peace", "peace", ""],
  ["தூரம் அதிகமானாலும்\nநினைவுகள் அருகில் தான்..!", "However far apart we are, the memories stay close.", "love", "love", ""],
  ["உன்னை கேலி செய்தவர்களுக்கு\nஉன் வெற்றியே பதில்..!", "Your success is the answer to everyone who mocked you.", "motivation", "motivation", ""],
  ["அன்பின் வழியது உயிர்நிலை", "The life of a being is in the path of love.", "love", "love", "திருவள்ளுவர்"],
  ["உள்ளுவது எல்லாம் உயர்வுள்ளல்", "Let every thought you think be a lofty one.", "motivation", "motivation", "திருவள்ளுவர்"],
  ["ஊழையும் உப்பக்கம் காண்பர் உலைவின்றித் தாழாது உஞற்று பவர்", "Those who strive without rest or fear will defeat even fate.", "motivation", "motivation", "திருவள்ளுவர்"],
  ["யாதும் ஊரே யாவரும் கேளிர்", "Every place is my home and everyone is my kin.", "life", "life", "கணியன் பூங்குன்றனார்"],
];

export const tamilQuotes = () =>
  LIST.map(([text, en, mood, theme, author]) => ({ id: `ta-${hash(text)}`, lang: "ta", text, en, mood, theme, author }));

// ---------- Thirukkural: chapters that make good reels (downloaded once, then cached) ----------
// chapter n = kurals (n-1)*10+1 .. n*10
const KURAL_CHAPTERS = {
  8: ["love", "love"], // அன்புடைமை: the possession of love
  7: ["love", "father"], // மக்கட்பேறு: children
  11: ["peace", "peace"], // செய்ந்நன்றி அறிதல்: gratitude
  16: ["peace", "peace"], // பொறையுடைமை: patience
  34: ["life", "life"], // நிலையாமை: impermanence
  40: ["life", "life"], // கல்வி: learning
  60: ["motivation", "motivation"], // ஊக்கமுடைமை: energy
  62: ["motivation", "motivation"], // ஆள்வினையுடைமை: perseverance
  67: ["success", "success"], // வினைத்திட்பம்: firm action
  79: ["friendship", "friendship"], // நட்பு: friendship
  80: ["friendship", "friendship"], // நட்பாராய்தல்: choosing friends
  109: ["love", "love"], // தகையணங்குறுத்தல்: beauty of the beloved
  111: ["love", "love"], // புணர்ச்சிமகிழ்தல்: joy of togetherness
  112: ["love", "love"], // நலம்புனைந்துரைத்தல்: praise of her beauty
  113: ["love", "love"], // காதற்சிறப்புரைத்தல்: greatness of love
  116: ["sad", "heartbreak"], // பிரிவாற்றாமை: unbearable separation
  117: ["sad", "loneliness"], // படர்மெலிந்திரங்கல்: pining
  121: ["sad", "heartbreak"], // நினைந்தவர்புலம்பல்: sad memories
  129: ["love", "love"], // புணர்ச்சிவிதும்பல்: longing to meet
};
const KURAL_URL = "https://raw.githubusercontent.com/tk120404/thirukkural/master/thirukkural.json";

/** Thirukkural couplets from the chosen chapters, as quotes. Downloads once; [] if offline. */
export async function kuralQuotes() {
  const { readJson, writeJson, fetchJson, log } = await import("./util.js");
  let list = readJson("kurals.json", null);
  if (!list) {
    try {
      const d = await fetchJson(KURAL_URL, { timeout: 60000 });
      list = (d.kural || d)
        .map((k) => ({ k, ch: Math.ceil(k.Number / 10) }))
        .filter(({ ch }) => KURAL_CHAPTERS[ch])
        .map(({ k, ch }) => ({ n: k.Number, text: `${k.Line1}\n${k.Line2}`, en: (k.Translation || k.couplet || "").replace(/\s+/g, " ").trim(), mood: KURAL_CHAPTERS[ch][0], theme: KURAL_CHAPTERS[ch][1] }));
      writeJson("kurals.json", list);
      log("tamil", `saved ${list.length} Thirukkural couplets`);
    } catch (e) {
      log("tamil", "Thirukkural download failed:", e.message);
      return [];
    }
  }
  // skip couplets with words modern readers take the wrong way (காமம் = classical 'love', read today as 'lust')
  list = list.filter((k) => !/காம|கள்ளு|கள்ளி|புணர்/.test(k.text));
  return list.map((k) => ({ id: `kural-${k.n}`, lang: "ta", text: k.text, en: k.en, mood: k.mood, theme: k.theme, author: `திருவள்ளுவர் · குறள் ${k.n}` }));
}
