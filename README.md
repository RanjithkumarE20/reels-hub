# Reels Hub

Two Instagram-style reels feeds with stories. Both update themselves while the server runs.

| Feed | What you get |
|---|---|
| **Quotes & songs** | English quotes on mood photos, each with a matching **Tamil, Hindi or English** song (30-second preview that plays as you swipe). Stories: Fresh drops, one per mood (Love, Motivation, Hope…), and Tamil / Hindi / English vibes. |
| **Trending** | Latest news (BBC Tamil, BBC Hindi, BBC India, Times of India, The Hindu, BBC World), YouTube news videos (Thanthi, Sun News, Polimer, Puthiya Thalaimurai, NDTV, India Today, Aaj Tak, BBC Tamil) and Google Trends topics (India + Tamil Nadu), mixed into one feed. Stories: one per trending topic, one per news source or channel. |

## Run

```
cd C:\Users\USER\reels-hub
npm start
```
Open http://localhost:4321. Requires Node 22 or later; there is nothing to install.

* `http://localhost:4321/#news` opens the Trending tab. `#go` / `#go-news` skips the start screen (muted), which is handy on a wall screen.
* To open it on your phone, set `HOST=0.0.0.0` in `.env`, then open `http://<PC-IP>:4321` on the same Wi-Fi.
* Start it automatically at Windows login: `powershell -ExecutionPolicy Bypass -File install-autostart.ps1` (remove it with `-Remove`).

## How the automation works

* Every **15 min** the server makes 5 new quote reels. It also makes more whenever you scroll near the end, so the feed never runs out.
* Every **10 min** it pulls all news feeds, channels and trends.
* New reels and changed stories are **pushed live** to open pages (Server-Sent Events). They are slotted right after the reel you're watching, so the next swipe shows them; story rings light up again. You don't need to refresh.
* Everything is saved in `data/`, so a restart keeps the feeds.

## How songs are matched

1. The quote's mood comes from keywords (love, motivation, success, sad, friendship, hope, peace, life).
2. The song language rotates by `SONG_MIX` (default Tamil twice as often as Hindi or English).
3. The free iTunes Search API is queried with mood-specific artists (for example: Sid Sriram / Harris Jayaraj for Tamil love, Anirudh / Santhosh Narayanan for Tamil motivation, Arijit Singh for Hindi love, Imagine Dragons for English motivation). iTunes' genre tag (`Tamil`, `Bollywood`…) guarantees the language.
4. Optional: with a valid `GEMINI_API_KEY`, Gemini picks a specific matching song per quote and language first.

The 🔀 **Song** button cycles that reel to a Tamil, then Hindi, then English song. ⬇ **Save** downloads the quote as a 1080×1920 image.

## Settings (`.env`, optional)

Copy `.env.example` to `.env`. You can set the port/host, update intervals, the song language mix, trend regions, YouTube channels (by @handle), `GEMINI_API_KEY` and `PEXELS_API_KEY`. A free Pexels key gives better photos; without it, photos come from Wikimedia Commons with credits shown.

## Reused from `youtube-shorts-ai`

The Google Trends RSS reader (`shorts/topics.py fetch_trends`), including the `ht:` news items and the `IN-TN` region, was ported to `lib/news.js`. So were the Pexels → free-fallback image chain and the optional Gemini setup. The Cloudflare image credentials were deliberately **not** shared, so this app can't use up the Shorts pipeline's daily image allowance.

## Files

```
server.js          HTTP server, API, live push, schedulers
lib/quotes.js      quote sources, mood engine, quote stories
lib/songs.js       Tamil/Hindi/English song matching (iTunes)
lib/images.js      mood photos (Pexels / Wikimedia Commons)
lib/news.js        RSS news, YouTube channels, Google Trends, mixed feed + stories
lib/gemini.js      optional AI song suggestions
public/            the app (reels, stories viewer, live updates)
```

## Instagram auto-posting

See **[INSTAGRAM.md](INSTAGRAM.md)**: a step-by-step setup to post reels and stories automatically through the official API, with original music and quiet hours that keep it out of the YouTube Shorts schedule.
