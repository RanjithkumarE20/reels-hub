// Mood photos for quote reels. Order: Pexels (if PEXELS_API_KEY is set; best quality, free key)
// -> Wikimedia Commons (keyless, freely licensed photos) -> picsum random photo (handled by caller).
import { fetchJson, readJson, writeJson, shuffle, log } from "./util.js";

const CACHE_FILE = "photo-cache.json";
const WEEK = 7 * 24 * 3600 * 1000;
const cache = readJson(CACHE_FILE, {});
const used = new Set(readJson("photos-used.json", []));
let t;
const persist = () => {
  clearTimeout(t);
  t = setTimeout(() => {
    writeJson(CACHE_FILE, cache);
    writeJson("photos-used.json", [...used].slice(-3000));
  }, 2000);
};

async function pexels(q) {
  const d = await fetchJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=40`, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  return (d.photos || []).map((p) => ({ url: p.src.portrait || p.src.large, credit: `Photo: ${p.photographer} / Pexels`, link: p.url }));
}

async function commons(q) {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "40",
    gsrsearch: `filetype:bitmap ${q}`, prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "900",
    iiextmetadatafilter: "Artist|LicenseShortName",
  }).forEach(([k, v]) => api.searchParams.set(k, v));
  const d = await fetchJson(api, { headers: { "User-Agent": "reels-hub/1.0 (personal quote reels app)" } });
  return Object.values(d.query?.pages || {})
    .map((p) => ({ p, i: p.imageinfo?.[0] }))
    .filter(({ i }) => i && i.mime === "image/jpeg" && i.width >= 1000 && i.height >= 700 && i.thumburl)
    // no scanned book pages, maps, posters or documents: they make poor backgrounds
    .filter(({ p, i }) => !/\b(page|book|scan|map|diagram|poster|document|letter|newspaper|magazine|text|logo|chart)\b/i.test(p.title || "") &&
      !/internet archive|book images|library/i.test(i.extmetadata?.Artist?.value || ""))
    // portrait-ish first: looks best full-screen
    .sort((a, b) => b.i.height / b.i.width - a.i.height / a.i.width)
    .map(({ p, i }) => {
      const artist = (i.extmetadata?.Artist?.value || "").replace(/<[^>]*>/g, "").trim().slice(0, 40);
      return { url: i.thumburl, credit: `Photo: ${artist || "Wikimedia Commons"} (${i.extmetadata?.LicenseShortName?.value || "CC"})`, link: i.descriptionurl };
    });
}

/** A photo for a search phrase that hasn't been used yet, or null. */
export async function findPhoto(query) {
  const key = `${process.env.PEXELS_API_KEY ? "px" : "wm2"}:${query}`;
  let list = cache[key]?.at > Date.now() - WEEK ? cache[key].list : null;
  if (!list) {
    try {
      list = process.env.PEXELS_API_KEY ? await pexels(query) : await commons(query);
      cache[key] = { at: Date.now(), list };
      persist();
    } catch (e) {
      log("images", `photo search failed (${query}):`, e.message);
      list = cache[key]?.list || [];
    }
  }
  const fresh = list.filter((x) => !used.has(x.url));
  const top = fresh.slice(0, 12); // the top of the list fits the phrase best
  const photo = shuffle(top.length ? top : list.slice(0, 12))[0] || null;
  if (photo) {
    used.add(photo.url);
    persist();
  }
  return photo;
}
