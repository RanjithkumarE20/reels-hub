// Feed 2: latest news + trending topics + news video reels, mixed into one reels feed with stories.
// Sources are all free and keyless: RSS feeds, Google Trends RSS, YouTube channel RSS.
import { fetchText, readJson, writeJson, hash, items, tag, attr, stripTags, safeUrl, log } from "./util.js";

const FEEDS = [
  { name: "BBC Tamil", lang: "ta", url: "https://feeds.bbci.co.uk/tamil/rss.xml" },
  { name: "BBC Hindi", lang: "hi", url: "https://feeds.bbci.co.uk/hindi/rss.xml" },
  { name: "BBC India", lang: "en", url: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml" },
  { name: "Times of India", lang: "en", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms" },
  { name: "The Hindu", lang: "en", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { name: "BBC World", lang: "en", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
];

// YouTube news channels (by @handle). Change with YT_CHANNELS=ThanthiTV,SunNews,... in .env
const DEFAULT_CHANNELS = "ThanthiTV,SunNewsTamil,PolimerNews,PuthiyathalaimuraiTV,NDTV,IndiaToday,aajtak,BBCNewsTamil";
const TREND_GEOS = () => (process.env.TRENDS_GEO || "IN,IN-TN").split(",").map((s) => s.trim()).filter(Boolean);

const FILE = "news.json";
const MAX_AGE = 2 * 24 * 3600 * 1000;
let state = readJson(FILE, { articles: [], videos: [], trends: [], channels: {} });
const save = () => writeJson(FILE, state);

function bigImage(u) {
  // BBC serves 240px thumbnails; the same path works at 800px.
  return u.replace(/\/ace\/ws\/\d+\//, "/ace/ws/800/").replace(/\/news\/\d+\/cpsprodpb/, "/news/800/cpsprodpb");
}

async function readFeed(f) {
  const xml = await fetchText(f.url);
  return items(xml).map((it) => {
    const link = safeUrl(tag(it, "link") || attr(it, "link", "href"));
    const img =
      attr(it, "media:thumbnail", "url") || attr(it, "media:content", "url") || attr(it, "enclosure", "url") ||
      (tag(it, "description").match(/<img[^>]+src="([^"]+)"/) || [])[1] || "";
    const pub = Date.parse(tag(it, "pubDate")) || Date.now();
    return {
      id: hash(link || tag(it, "title")),
      type: "article",
      title: stripTags(tag(it, "title")),
      summary: stripTags(tag(it, "description")).slice(0, 320),
      image: safeUrl(bigImage(img)),
      url: link,
      source: f.name,
      lang: f.lang,
      publishedAt: pub,
    };
  }).filter((a) => a.title && a.url);
}

async function channelId(handle) {
  if (state.channels[handle]) return state.channels[handle];
  const html = await fetchText(`https://www.youtube.com/@${handle}`, { timeout: 20000 });
  const id = (html.match(/"externalId":"(UC[\w-]{20,})"/) || html.match(/"channelId":"(UC[\w-]{20,})"/) || [])[1];
  if (!id) throw new Error("channel id not found");
  state.channels[handle] = id;
  return id;
}

async function readChannel(handle) {
  const id = await channelId(handle);
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  const channel = tag(xml.split("<entry>")[0], "title") || handle;
  return items(xml, "entry").map((e) => {
    const vid = tag(e, "yt:videoId");
    const link = attr(e, "link", "href");
    return {
      id: `yt-${vid}`,
      type: "video",
      videoId: vid,
      isShort: link.includes("/shorts/"),
      title: stripTags(tag(e, "title")),
      summary: stripTags(tag(e, "media:description")).slice(0, 200),
      image: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${vid}`,
      source: channel,
      views: +attr(e, "media:statistics", "views") || 0,
      publishedAt: Date.parse(tag(e, "published")) || Date.now(),
    };
  }).filter((v) => /^[\w-]{11}$/.test(v.videoId));
}

const HT = "ht:";
async function readTrends(geo) {
  const xml = await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`);
  return items(xml).map((it) => {
    const topic = stripTags(tag(it, "title"));
    const news = items(it, `${HT}news_item`).map((n) => ({
      title: stripTags(tag(n, `${HT}news_item_title`)),
      url: safeUrl(tag(n, `${HT}news_item_url`)),
      image: safeUrl(tag(n, `${HT}news_item_picture`)),
      source: stripTags(tag(n, `${HT}news_item_source`)),
    })).filter((n) => n.title && n.url);
    return {
      id: `tr-${hash(geo + topic)}`,
      type: "trend",
      topic,
      geo,
      traffic: tag(it, `${HT}approx_traffic`),
      image: safeUrl(tag(it, `${HT}picture`)) || news.find((n) => n.image)?.image || "",
      news,
      publishedAt: Date.parse(tag(it, "pubDate")) || Date.now(),
    };
  }).filter((t) => t.topic);
}

function merge(old, fresh, key = "id") {
  const map = new Map(old.map((x) => [x[key], x]));
  const added = [];
  for (const f of fresh) {
    if (!map.has(f[key])) added.push(f);
    map.set(f[key], { ...map.get(f[key]), ...f });
  }
  const cutoff = Date.now() - MAX_AGE;
  const list = [...map.values()].filter((x) => x.publishedAt > cutoff).sort((a, b) => b.publishedAt - a.publishedAt);
  return { list, added };
}

/** Pull every source; returns the newly seen items (used for live push updates). */
export async function refreshNews() {
  const handles = (process.env.YT_CHANNELS || DEFAULT_CHANNELS).split(",").map((s) => s.trim()).filter(Boolean);
  const settle = async (label, jobs) => {
    const res = await Promise.allSettled(jobs.map((j) => j.run()));
    const out = [];
    res.forEach((r, i) => (r.status === "fulfilled" ? out.push(...r.value) : log("news", `${label} ${jobs[i].name} failed: ${r.reason?.message}`)));
    return out;
  };
  const [arts, vids, trs] = await Promise.all([
    settle("feed", FEEDS.map((f) => ({ name: f.name, run: () => readFeed(f) }))),
    settle("youtube", handles.map((h) => ({ name: h, run: () => readChannel(h) }))),
    settle("trends", TREND_GEOS().map((g) => ({ name: g, run: () => readTrends(g) }))),
  ]);
  const a = merge(state.articles, arts);
  const v = merge(state.videos, vids);
  // trends are a "now" snapshot: replace with the latest list when we got one
  const t = merge(trs.length ? [] : state.trends, trs);
  const oldTrendIds = new Set(state.trends.map((x) => x.id));
  state = { ...state, articles: a.list.slice(0, 400), videos: v.list.slice(0, 200), trends: t.list.slice(0, 60) };
  save();
  const added = [...a.added, ...v.added, ...t.added.filter((x) => !oldTrendIds.has(x.id))];
  log("news", `articles ${state.articles.length}, videos ${state.videos.length}, trends ${state.trends.length} (+${added.length} new)`);
  return added;
}

/** Mixed reels feed: 2 news stories, 1 video, repeating, with a trending topic every 6th reel. */
export function newsFeed() {
  const A = state.articles.filter((x) => x.image);
  const noImg = state.articles.filter((x) => !x.image);
  const V = state.videos;
  const T = state.trends.filter((x) => x.image);
  const out = [];
  let ai = 0, vi = 0, ti = 0, n = 0;
  while (ai < A.length || vi < V.length || ti < T.length) {
    const slot = n++ % 6;
    if (slot === 5 && ti < T.length) out.push(T[ti++]);
    else if (slot % 3 === 2 && vi < V.length) out.push(V[vi++]);
    else if (ai < A.length) out.push(A[ai++]);
    else if (vi < V.length) out.push(V[vi++]);
    else if (ti < T.length) out.push(T[ti++]);
  }
  return [...out, ...noImg];
}

/** Stories: each trending topic + one per news source / channel with its latest headlines. */
export function newsStories() {
  const stories = [];
  for (const t of state.trends.slice(0, 14)) {
    const slides = [
      { id: t.id, kind: "trend", image: t.image, title: t.topic, text: t.traffic ? `${t.traffic} searches · trending now` : "Trending now" },
      ...t.news.slice(0, 4).map((n, i) => ({ id: `${t.id}-${i}`, kind: "news", image: n.image || t.image, title: n.title, text: n.source, url: n.url })),
    ];
    stories.push({ id: t.id, title: t.topic, emoji: "📈", avatar: t.image, updatedAt: t.publishedAt, slides });
  }
  const bySource = Object.groupBy([...state.articles, ...state.videos], (x) => x.source);
  for (const [source, list] of Object.entries(bySource)) {
    const top = list.filter((x) => x.image).slice(0, 6);
    if (!top.length) continue;
    stories.push({
      id: `src-${hash(source)}`,
      title: source,
      emoji: top[0].type === "video" ? "▶️" : "📰",
      avatar: top[0].image,
      updatedAt: top[0].publishedAt,
      slides: top.map((x) => ({ id: x.id, kind: x.type === "video" ? "video" : "news", image: x.image, title: x.title, text: x.summary, url: x.url, videoId: x.videoId })),
    });
  }
  // trending topics and news sources alternate: trend, source, trend, source ...
  const trends = stories.filter((s) => s.emoji === "📈");
  const sources = stories.filter((s) => s.emoji !== "📈").sort((a, b) => b.updatedAt - a.updatedAt);
  const mixed = [];
  while (trends.length || sources.length) {
    if (trends.length) mixed.push(trends.shift());
    if (sources.length) mixed.push(sources.shift());
  }
  return mixed;
}
