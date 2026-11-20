// Optional AI helper. With a valid GEMINI_API_KEY the app asks Gemini for the mood of each quote and
// a specific matching Tamil / Hindi / English song. Without a key (or if it fails) the keyword mood
// engine + mood song bank is used instead, so the app always works.
import { fetchJson, log } from "./util.js";

let disabled = false;

export const geminiEnabled = () => !!process.env.GEMINI_API_KEY && !disabled;

export async function suggestSongs(quotes) {
  if (!geminiEnabled() || !quotes.length) return {};
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const list = quotes.map((q, i) => `${i + 1}. "${q.text}" - ${q.author}`).join("\n");
  const prompt = `For each English quote below, pick its mood (one of: love, motivation, success, sad, life, friendship, hope, peace, wisdom)
and suggest one real, well-known song whose feeling matches the quote in each language:
- "ta": a Tamil film song, "hi": a Hindi/Bollywood song, "en": an English song.
Give each song as "Song title Artist". Reply ONLY with a JSON array, one object per quote, in order:
[{"mood":"...","ta":"...","hi":"...","en":"..."}]

${list}`;
  try {
    const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      timeout: 45000,
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
      }),
    });
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "[]";
    const arr = JSON.parse(text.replace(/^```json|```$/g, ""));
    const out = {};
    quotes.forEach((q, i) => arr[i] && (out[q.id] = arr[i]));
    return out;
  } catch (e) {
    if (/HTTP 40[013]/.test(e.message)) {
      disabled = true;
      log("gemini", "API key rejected - using the built-in mood engine instead. Fix GEMINI_API_KEY in .env to enable AI song picks.");
    } else log("gemini", "suggestion failed:", e.message);
    return {};
  }
}
