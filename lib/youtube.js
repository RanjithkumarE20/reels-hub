// Uploads the quote reels to your existing YouTube channel as Shorts (YouTube Data API v3, no extra libraries).
// Uses the same Google login as the PC's YouTube Shorts project (its token.json, saved as the GitHub
// secret YT_TOKEN_JSON), so nothing about that project changes. Quote Shorts are NOT "made for kids".
import fs from "node:fs";
import { log } from "./util.js";

function creds() {
  try {
    const t = JSON.parse(process.env.YT_TOKEN_JSON || "");
    if (t.refresh_token && t.client_id && t.client_secret) return t;
  } catch {}
  return null;
}
export const youtubeEnabled = () => !!creds() && (process.env.YT_UPLOAD || "true").toLowerCase() !== "false";

async function accessToken() {
  const t = creds();
  const r = await fetch(t.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`Google login failed: ${d.error_description || d.error || r.status}`);
  return d.access_token;
}

/** Upload one Short. Returns the Shorts URL. */
export async function uploadShort(file, { title, description, tags = [], lang = "en", ai = false }) {
  const token = await accessToken();
  const size = fs.statSync(file).size;
  const meta = {
    snippet: {
      title: title.slice(0, 100),
      description: description.slice(0, 4900),
      tags: tags.slice(0, 15),
      categoryId: "22", // People & Blogs
      defaultLanguage: lang,
      defaultAudioLanguage: lang,
    },
    status: {
      privacyStatus: process.env.YT_PRIVACY || "public",
      selfDeclaredMadeForKids: false, // quotes about love/heartbreak are for a general audience
      containsSyntheticMedia: ai, // YouTube asks to label realistic AI images
    },
  };
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify(meta),
  });
  const where = start.headers.get("location");
  if (!where) throw new Error(`YouTube refused the upload: ${start.status} ${(await start.text()).slice(0, 300)}`);
  const put = await fetch(where, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(size) }, body: fs.readFileSync(file) });
  const d = await put.json().catch(() => ({}));
  if (!d.id) throw new Error(`YouTube upload failed: ${put.status} ${JSON.stringify(d).slice(0, 300)}`);
  const url = `https://youtube.com/shorts/${d.id}`;
  log("youtube", `uploaded: ${url}`);
  return url;
}

/** Title, description and tags for a quote Short. */
export function shortText(q, songs = []) {
  const ta = q.lang === "ta";
  const first = q.text.split("\n").join(" ").replace(/\s+/g, " ").trim();
  const head = first.length > 70 ? first.slice(0, first.lastIndexOf(" ", 68)) + "…" : first;
  const title = ta ? `${head} | Tamil Quotes #shorts` : `${head} #shorts`;
  const vibe = songs.slice(0, 3).map((s) => `${s.trending ? "🔥 " : ""}${s.title}${s.movie ? ` (${s.movie})` : ""}`).join(" · ");
  const tags = ta
    ? ["tamil quotes", "tamil kavithai", "tamil status", "tamil love quotes", "tamil motivation", "thirukkural", "shorts"]
    : ["quotes", "english quotes", "motivational quotes", "love quotes", "life quotes", "tamil vibes", "shorts"];
  const description = [
    ta ? q.text : `“${q.text}”`,
    ta && q.en ? `(${q.en})` : "",
    q.author && q.author !== "Unknown" ? `— ${q.author}` : "",
    "",
    vibe ? `🎧 Song vibe for this quote: ${vibe}` : "",
    "🎵 Background music: original",
    "",
    "Subscribe for a new quote every day ❤️",
    "",
    ta ? "#tamilquotes #tamilkavithai #shorts" : "#quotes #motivation #shorts",
  ].filter((l, i, a) => l || a[i - 1]).join("\n");
  return { title, description, tags };
}
