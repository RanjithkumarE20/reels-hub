// Reels Hub client: two reels feeds (quotes+songs, trending news), Instagram-style stories,
// and live updates pushed from the server (new reels/stories appear without any action).

const $ = (s, r = document) => r.querySelector(s);
const feedEl = $("#feed");
const storiesEl = $("#stories");
const audio = new Audio();
audio.loop = true;
audio.preload = "auto";

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  feed: store.get("rh.feed", "quotes"),
  sound: false,
  feeds: {
    quotes: { items: [], ids: new Set(), next: 0, loading: false, stories: [], pos: 0 },
    news: { items: [], ids: new Set(), next: 0, loading: false, stories: [], pos: 0 },
  },
  likes: new Set(store.get("rh.likes", [])),
  seen: store.get("rh.seen", {}),
  active: null,
};
const F = () => S.feeds[S.feed];

// ---------- helpers ----------
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(c));
  return n;
}
const safe = (u) => (typeof u === "string" && /^(https?:\/\/|\/img\/)/.test(u) ? u : "");
const LANG = { ta: "TAMIL", hi: "HINDI", en: "ENGLISH" };
function ago(t) {
  const s = Math.max(1, (Date.now() - t) / 1000);
  for (const [n, u] of [[86400, "d"], [3600, "h"], [60, "m"]]) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return "just now";
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}
function img(src, cls, fallback) {
  const i = el("img", { class: cls, src: safe(src) || fallback, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  i.onerror = () => { if (fallback && i.src !== fallback) i.src = fallback; };
  return i;
}
const fallbackImg = (id) => `https://picsum.photos/seed/${encodeURIComponent(id)}/720/1280`;

// ---------- reel builders ----------
function songBar(song) {
  if (!song) return null;
  const title = `${song.title}${song.movie && song.movie !== song.title ? ` · ${song.movie}` : ""}`;
  return el("div", { class: "song" },
    img(song.artwork, "disc", "icon.svg"),
    el("div", { class: "song-info" },
      el("div", { class: "song-title" }, el("span", { class: `marq${title.length > 28 ? " long" : ""}`, text: `♪ ${title}` })),
      el("div", { class: "song-sub", text: song.artist })),
    el("span", { class: `lang ${song.lang}`, text: LANG[song.lang] || "" }),
    el("div", { class: "eq" }, el("i"), el("i"), el("i")),
    el("div", { class: "song-progress" }, el("b")));
}

function action(icon, label, onclick, cls = "") {
  return el("button", { class: `act ${cls}`, onclick, "aria-label": label }, el("span", { class: "ic", text: icon }), el("span", { text: label }));
}

function rail(item) {
  const liked = S.likes.has(item.id);
  const like = action(liked ? "❤️" : "🤍", liked ? "Liked" : "Like", () => toggleLike(item, like), liked ? "liked" : "");
  const acts = [like, action("↗", "Share", () => share(item))];
  if (item.type === "quote") {
    acts.push(action("🔀", "Song", () => swapSong(item)));
    acts.push(action("⬇", "Save", () => saveImage(item)));
  } else if (item.url) {
    acts.push(el("a", { class: "act", href: safe(item.url), target: "_blank", rel: "noopener noreferrer" }, el("span", { class: "ic", text: "🔗" }), el("span", { text: "Open" })));
  }
  return el("div", { class: "rail" }, acts);
}

function quoteReel(q) {
  // spaces go between the word spans (a trailing space inside an inline-block is dropped)
  const words = q.text.split(/\s+/).flatMap((w, i) => [i ? " " : null, el("span", { class: "w", style: `animation-delay:${0.15 + i * 0.07}s` }, w)]);
  const reel = el("section", { class: "reel quote", dataset: { id: q.id } },
    img(q.image, "bg kb", fallbackImg(q.id)),
    el("div", { class: "shade" }),
    el("div", { class: "meta-top" }, el("span", { class: "chip", text: `${q.moodEmoji || ""} ${q.moodLabel || q.mood}` })),
    el("div", { class: "quote-wrap" },
      el("div", { class: "quote-mark", text: "“" }),
      el("p", { class: `quote-text${q.text.length > 120 ? " long" : ""}` }, words),
      el("div", { class: "quote-author", text: q.author })),
    q.credit && el("div", { class: "credit", text: q.credit }),
    rail(q),
    songBar(q.song));
  reel.addEventListener("dblclick", () => toggleLike(q, reel.querySelector(".act"), true));
  return reel;
}

function articleReel(a) {
  return el("section", { class: "reel article", dataset: { id: a.id } },
    img(a.image, "bg-blur", ""),
    img(a.image, "bg kb", fallbackImg(a.id)),
    el("div", { class: "shade" }),
    el("div", { class: "news-body" },
      el("div", { class: "src" }, el("span", { class: "chip", text: `📰 ${a.source}` }), a.lang !== "en" && el("span", { class: `lang ${a.lang}`, text: LANG[a.lang] }), el("time", { text: ago(a.publishedAt) })),
      el("h2", { class: "headline", text: a.title }),
      a.summary && a.summary !== a.title && el("p", { class: "summary", text: a.summary }),
      el("a", { class: "cta", href: safe(a.url), target: "_blank", rel: "noopener noreferrer", text: "Read full story →" })),
    rail(a));
}

function videoReel(v) {
  return el("section", { class: `reel video${v.isShort ? " short" : ""}`, dataset: { id: v.id, video: v.videoId } },
    img(v.image, "bg-blur", ""),
    el("div", { class: "shade" }),
    el("div", { class: "play-hint", text: "▶" }),
    el("div", { class: "news-body" },
      el("div", { class: "src" }, el("span", { class: "chip", text: `▶️ ${v.source}` }), el("time", { text: ago(v.publishedAt) })),
      el("h2", { class: "headline", text: v.title }),
      el("a", { class: "cta", href: safe(v.url), target: "_blank", rel: "noopener noreferrer", text: "Watch on YouTube →" })),
    rail(v));
}

function trendReel(t) {
  return el("section", { class: "reel article trend", dataset: { id: t.id } },
    img(t.image, "bg-blur", ""),
    img(t.image, "bg", fallbackImg(t.id)),
    el("div", { class: "shade" }),
    el("div", { class: "news-body" },
      el("div", { class: "src" }, el("span", { class: "chip", text: `📈 Trending${t.geo === "IN-TN" ? " in Tamil Nadu" : " in India"}` }), t.traffic && el("span", { class: "traffic", text: `${t.traffic} searches` })),
      el("h2", { class: "headline", text: t.topic }),
      el("ul", { class: "trend-list" }, t.news.slice(0, 3).map((n) =>
        el("li", {}, el("a", { href: safe(n.url), target: "_blank", rel: "noopener noreferrer" }, n.title, el("small", { text: n.source })))))),
    rail({ ...t, title: t.topic, url: t.news[0]?.url }));
}

const build = (it) => ({ quote: quoteReel, article: articleReel, video: videoReel, trend: trendReel })[it.type]?.(it);

// ---------- feed rendering / paging ----------
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) activate(e.target);
}, { root: feedEl, threshold: [0.6] });

function renderFeed() {
  deactivate();
  feedEl.replaceChildren();
  const f = F();
  for (const it of f.items) mount(build(it));
  feedEl.append(loaderEl());
  const target = feedEl.children[Math.min(f.pos, f.items.length - 1)];
  if (target) feedEl.scrollTop = target.offsetTop;
  if (!f.items.length) loadMore();
}
function mount(node, before = $(".loader", feedEl)) {
  if (!node) return;
  before ? feedEl.insertBefore(node, before) : feedEl.append(node);
  observer.observe(node);
}
const loaderEl = () => el("div", { class: "loader" }, el("div", {}, el("div", { class: "spinner" }), el("div", { text: S.feed === "quotes" ? "Creating fresh quote reels…" : "Fetching the latest news…" })));

async function loadMore() {
  const f = F();
  const feed = S.feed;
  if (f.loading || f.next == null) return;
  f.loading = true;
  try {
    const r = await fetch(`/api/${feed}?offset=${f.next}&limit=10`).then((x) => x.json());
    const fresh = r.items.filter((i) => !f.ids.has(i.id));
    for (const it of fresh) { f.ids.add(it.id); f.items.push(it); }
    f.next = r.next ?? (feed === "quotes" ? f.items.length : null); // quotes are endless: server keeps generating
    if (feed === S.feed && fresh.length) {
      // scroll-snap would keep the loader in view after inserting above it; jump to the first new reel instead
      const loader = $(".loader", feedEl);
      const onLoader = loader && feedEl.scrollTop >= loader.offsetTop - 5;
      const nodes = fresh.map(build);
      nodes.forEach((n) => mount(n));
      if (onLoader) feedEl.scrollTop = nodes[0].offsetTop;
    }
    if (feed === "quotes" && !fresh.length) setTimeout(() => { f.loading = false; loadMore(); }, 4000);
    else f.loading = false;
  } catch {
    f.loading = false;
    setTimeout(loadMore, 5000);
  }
}

function activate(reel) {
  if (S.active === reel) return;
  deactivate();
  S.active = reel;
  reel.classList.add("active");
  const f = F();
  const idx = [...feedEl.children].indexOf(reel);
  f.pos = idx;
  if (idx >= f.items.length - 4) loadMore();
  const item = f.items.find((i) => i.id === reel.dataset.id);
  if (item?.type === "quote" && item.song?.preview) playSong(item.song, reel);
  if (item?.type === "video") startVideo(reel);
}
function deactivate() {
  const r = S.active;
  if (!r) return;
  r.classList.remove("active", "playing");
  r.querySelector(".video-frame")?.remove();
  audio.pause();
  S.active = null;
}

// ---------- audio ----------
function playSong(song, reel) {
  if (audio.dataset.src !== song.preview) {
    audio.src = song.preview;
    audio.dataset.src = song.preview;
  }
  audio.currentTime = 0;
  const bar = reel.querySelector(".song-progress b");
  audio.ontimeupdate = () => bar && (bar.style.width = `${(audio.currentTime / (audio.duration || 30)) * 100}%`);
  if (S.sound) audio.play().then(() => reel.classList.add("playing")).catch(() => {});
}
function startVideo(reel) {
  const id = reel.dataset.video;
  if (!/^[\w-]{11}$/.test(id)) return;
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${S.sound ? 0 : 1}&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${id}`;
  reel.prepend(el("iframe", { class: "video-frame", src, allow: "autoplay; encrypted-media; picture-in-picture", allowfullscreen: "", title: "Video" }));
}
function setSound(on) {
  S.sound = on;
  $("#soundBtn").textContent = on ? "🔊" : "🔇";
  const r = S.active;
  if (!r) return;
  if (r.classList.contains("quote")) on ? audio.play().then(() => r.classList.add("playing")).catch(() => {}) : (audio.pause(), r.classList.remove("playing"));
  if (r.classList.contains("video")) { r.querySelector(".video-frame")?.remove(); startVideo(r); }
}

// ---------- actions ----------
function toggleLike(item, btn, forceOn = false) {
  const on = forceOn || !S.likes.has(item.id);
  on ? S.likes.add(item.id) : S.likes.delete(item.id);
  store.set("rh.likes", [...S.likes].slice(-2000));
  if (btn) {
    btn.classList.toggle("liked", on);
    btn.querySelector(".ic").textContent = on ? "❤️" : "🤍";
    btn.lastChild.textContent = on ? "Liked" : "Like";
  }
  if (on && forceOn && S.active) S.active.append(el("div", { class: "burst", text: "❤️", onanimationend: (e) => e.target.remove() }));
}
async function share(item) {
  const text = item.type === "quote"
    ? `“${item.text}” — ${item.author}${item.song ? `\n🎵 ${item.song.title} · ${item.song.artist}` : ""}`
    : item.title || item.topic;
  const url = item.url || location.href;
  try {
    if (navigator.share) await navigator.share({ title: "Reels Hub", text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Copied to clipboard"); }
  } catch {}
}
const nextLangOf = (l) => ({ ta: "hi", hi: "en", en: "ta" })[l] || "ta";
async function swapSong(item) {
  const lang = nextLangOf(item.song?.lang);
  toast(`Finding a ${LANG[lang].toLowerCase()} song…`);
  try {
    const s = await fetch(`/api/song?mood=${encodeURIComponent(item.mood)}&lang=${lang}`).then((r) => r.json());
    if (!s.preview) return toast("No song found, try again");
    item.song = s;
    const reel = feedEl.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
    reel?.querySelector(".song")?.replaceWith(songBar(s));
    if (reel && reel === S.active) playSong(s, reel);
    toast(`🎵 ${s.title}`);
  } catch { toast("Could not reach the song service"); }
}
async function saveImage(item) {
  try {
    const c = el("canvas", { width: 1080, height: 1920 });
    const x = c.getContext("2d");
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.src = safe(item.image) || fallbackImg(item.id);
    await im.decode();
    const sc = Math.max(1080 / im.width, 1920 / im.height);
    x.drawImage(im, (1080 - im.width * sc) / 2, (1920 - im.height * sc) / 2, im.width * sc, im.height * sc);
    const g = x.createLinearGradient(0, 0, 0, 1920);
    g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(0.5, "rgba(0,0,0,.25)"); g.addColorStop(1, "rgba(0,0,0,.8)");
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
    x.fillStyle = "#fff"; x.textAlign = "center";
    const size = item.text.length > 120 ? 56 : 70;
    x.font = `600 ${size}px "Playfair Display", Georgia, serif`;
    const lines = [];
    let line = "";
    for (const w of `“${item.text}”`.split(" ")) {
      if (x.measureText(`${line} ${w}`).width > 900 && line) { lines.push(line); line = w; } else line = line ? `${line} ${w}` : w;
    }
    lines.push(line);
    let y = 960 - (lines.length * size * 1.3) / 2;
    for (const l of lines) { x.fillText(l, 540, y); y += size * 1.3; }
    x.font = `500 40px Inter, sans-serif`;
    x.fillText(`— ${item.author}`, 540, y + 40);
    if (item.song) { x.font = `500 34px Inter, sans-serif`; x.fillText(`🎵 ${item.song.title} · ${item.song.artist}`.slice(0, 60), 540, 1780); }
    const a = el("a", { href: c.toDataURL("image/jpeg", 0.92), download: `quote-${item.id}.jpg` });
    a.click();
    toast("Saved quote image");
  } catch { toast("Could not save this image"); }
}

// ---------- stories ----------
async function loadStories(feed = S.feed) {
  try {
    S.feeds[feed].stories = await fetch(`/api/stories?feed=${feed}`).then((r) => r.json());
    if (feed === S.feed) renderStories();
  } catch {}
}
function renderStories(newIds = new Set()) {
  // unseen stories first, like Instagram
  const isSeen = (s) => S.seen[s.id] >= s.updatedAt;
  const list = (F().stories = [...F().stories].sort((a, b) => isSeen(a) - isSeen(b)));
  storiesEl.replaceChildren(...list.map((s, i) => {
    const seen = S.seen[s.id] >= s.updatedAt;
    return el("button", { class: `story${seen ? " seen" : ""}${newIds.has(s.id) ? " new" : ""}`, onclick: () => openStory(i), "aria-label": s.title },
      el("div", { class: "ring" }, img(s.avatar, "", "icon.svg"), el("span", { class: "emoji", text: s.emoji })),
      el("span", { text: s.title }));
  }));
}

const V = { story: 0, slide: 0, timer: null, start: 0, dur: 6000, paused: false, elapsed: 0 };
function openStory(i) {
  const list = F().stories;
  if (!list[i]) return closeStory();
  deactivate();
  V.story = i;
  V.slide = 0;
  const s = list[i];
  $("#viewer").hidden = false;
  $("#vAvatar").src = safe(s.avatar) || "icon.svg";
  $("#vTitle").textContent = `${s.emoji} ${s.title}`;
  $("#vTime").textContent = ago(s.updatedAt);
  $("#vProgress").replaceChildren(...s.slides.map(() => el("div", {}, el("b"))));
  S.seen[s.id] = s.updatedAt;
  store.set("rh.seen", S.seen);
  showSlide();
}
function showSlide() {
  const s = F().stories[V.story];
  const sl = s?.slides[V.slide];
  if (!sl) return openStory(V.story + 1);
  [...$("#vProgress").children].forEach((d, i) => { d.classList.toggle("done", i < V.slide); d.firstChild.style.width = i < V.slide ? "100%" : "0"; });
  const text = sl.kind === "quote"
    ? el("div", { class: "v-text" }, el("p", { class: "quote-text", text: `“${sl.text}”` }), el("div", { class: "quote-author", text: sl.author }))
    : el("div", { class: "v-text" }, el("h2", { text: sl.title }), sl.text && el("p", { text: sl.text.slice(0, 220) }),
        sl.url && el("a", { class: "cta", href: safe(sl.url), target: "_blank", rel: "noopener noreferrer", text: sl.kind === "video" ? "Watch →" : "Read →", onclick: () => pauseStory(true) }));
  const slide = el("div", { class: "v-slide" }, img(sl.image, "bg", fallbackImg(sl.id)), el("div", { class: "shade" }), text, sl.song && songBar(sl.song));
  $("#vStage").replaceChildren(slide);
  V.dur = sl.kind === "quote" ? 8000 : 6000;
  if (sl.song?.preview && S.sound) {
    audio.src = sl.song.preview; audio.dataset.src = sl.song.preview; audio.currentTime = 0;
    audio.play().then(() => slide.classList.add("playing")).catch(() => {});
  } else if (sl.kind !== "quote") audio.pause();
  V.elapsed = 0;
  V.start = performance.now();
  V.paused = false;
  cancelAnimationFrame(V.timer);
  tick();
}
function tick() {
  const bar = $("#vProgress").children[V.slide]?.firstChild;
  const now = performance.now();
  const p = V.paused ? V.elapsed : V.elapsed + (now - V.start);
  if (bar) bar.style.width = `${Math.min(100, (p / V.dur) * 100)}%`;
  if (p >= V.dur) { V.slide++; return showSlide(); }
  V.timer = requestAnimationFrame(tick);
}
function pauseStory(on) {
  if (on === V.paused) return;
  if (on) { V.elapsed += performance.now() - V.start; V.paused = true; }
  else { V.start = performance.now(); V.paused = false; }
}
function closeStory() {
  cancelAnimationFrame(V.timer);
  $("#viewer").hidden = true;
  audio.pause();
  renderStories();
  const r = feedEl.children[F().pos];
  if (r) { S.active = null; activate(r); }
}
$("#vClose").onclick = closeStory;
$("#vNext").onclick = () => { V.slide++; showSlide(); };
$("#vPrev").onclick = () => { if (V.slide > 0) { V.slide--; showSlide(); } else if (V.story > 0) openStory(V.story - 1); else showSlide(); };
for (const b of [$("#vNext"), $("#vPrev")]) {
  b.addEventListener("pointerdown", () => { V.holdAt = Date.now(); setTimeout(() => V.holdAt && Date.now() - V.holdAt >= 280 && pauseStory(true), 300); });
  b.addEventListener("pointerup", (e) => { const held = Date.now() - V.holdAt > 280; V.holdAt = 0; if (held) { e.stopImmediatePropagation(); pauseStory(false); } }, true);
}
document.addEventListener("keydown", (e) => {
  if ($("#viewer").hidden) {
    if (e.key === "ArrowDown" || e.key === "j") feedEl.scrollBy({ top: feedEl.clientHeight, behavior: "smooth" });
    if (e.key === "ArrowUp" || e.key === "k") feedEl.scrollBy({ top: -feedEl.clientHeight, behavior: "smooth" });
    if (e.key === "m") setSound(!S.sound);
    return;
  }
  if (e.key === "Escape") closeStory();
  if (e.key === "ArrowRight") $("#vNext").click();
  if (e.key === "ArrowLeft") $("#vPrev").click();
});
let touchY = 0;
$("#viewer").addEventListener("touchstart", (e) => (touchY = e.touches[0].clientY), { passive: true });
$("#viewer").addEventListener("touchend", (e) => e.changedTouches[0].clientY - touchY > 90 && closeStory());

// ---------- live updates (server push) ----------
function connectLive() {
  const es = new EventSource("/api/events");
  const badge = $("#live");
  es.addEventListener("hello", () => badge.classList.add("on"));
  es.onerror = () => badge.classList.remove("on");
  es.addEventListener("update", (e) => {
    const { feed, items, stories } = JSON.parse(e.data);
    const f = S.feeds[feed];
    const fresh = items.filter((i) => !f.ids.has(i.id));
    const oldStories = new Map(f.stories.map((s) => [s.id, s.updatedAt]));
    const newStoryIds = new Set(stories.filter((s) => oldStories.get(s.id) !== s.updatedAt).map((s) => s.id));
    f.stories = stories;
    if (fresh.length) {
      // drop new reels right after the one being watched, so they're next when you swipe
      const at = feed === S.feed && S.active ? f.pos + 1 : 0;
      fresh.forEach((it) => f.ids.add(it.id));
      f.items.splice(at, 0, ...fresh);
      if (feed === S.feed) {
        const ref = feedEl.children[at] || $(".loader", feedEl);
        fresh.forEach((it) => { const n = build(it); n.classList.add("new-flag"); mount(n, ref); });
      } else if (f.items.length > fresh.length) f.pos += fresh.length; // other feed: keep your place, new ones wait above
    }
    if (feed === S.feed) {
      if ($("#viewer").hidden) renderStories(newStoryIds);
      if (fresh.length || newStoryIds.size) toast(`✨ ${fresh.length ? `${fresh.length} new reel${fresh.length > 1 ? "s" : ""}` : ""}${fresh.length && newStoryIds.size ? " · " : ""}${newStoryIds.size ? `${newStoryIds.size} story update${newStoryIds.size > 1 ? "s" : ""}` : ""}`);
    }
  });
}

// ---------- tabs / start ----------
function switchFeed(feed) {
  if (feed === S.feed && feedEl.children.length) return;
  deactivate();
  S.feed = feed;
  store.set("rh.feed", feed);
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.feed === feed));
  renderStories();
  renderFeed();
  if (!F().stories.length) loadStories(feed);
}
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => switchFeed(t.dataset.feed)));
$("#soundBtn").onclick = () => setSound(!S.sound);

function start(withSound) {
  $("#start").remove();
  setSound(withSound);
  if (withSound) audio.play().catch(() => {}); // unlocks audio on iOS/Chrome after a tap
}
$("#startBtn").onclick = () => start(true);
$("#startMuted").onclick = () => start(false);

if (/news|trending/.test(location.hash)) S.feed = "news"; // e.g. /#news or /#go-news
else if (/quotes/.test(location.hash)) S.feed = "quotes";
document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.feed === S.feed));
loadStories("quotes");
loadStories("news");
renderFeed();
connectLive();
if (location.hash.startsWith("#go")) start(false); // skip the start screen (muted), handy for kiosks/screenshots
// keep "x min ago" labels and story rings fresh even when nothing new arrives
setInterval(() => { loadStories("quotes"); loadStories("news"); }, 5 * 60_000);
