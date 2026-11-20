// Official Instagram API. Two token kinds are supported:
//   IGAA...  "Instagram login" token  -> graph.instagram.com, expires in 60 days, auto-renewed
//   EAA...   "Unified / Facebook login" token, incl. system-user tokens that never expire -> graph.facebook.com
// Publishing is two steps: create a media container from a public URL, wait until it's FINISHED, publish it.
import { readJson, writeJson, sleep, log } from "../util.js";

const HOST = "https://graph.instagram.com";
const FB_HOST = "https://graph.facebook.com";
const isFbToken = () => !!token() && !token().startsWith("IG");
const version = (d) => (process.env.IG_API_VERSION || d).replace(/\/$/, "");
const base = () => (isFbToken() ? `${FB_HOST}/${version("v23.0")}/` : `${HOST}/${version("") ? version("") + "/" : ""}`);
const TOKEN_FILE = "ig-token.json";

// ---------- token: env value, upgraded/refreshed copy kept in data/ig-token.json ----------
function tokenState() {
  const env = (process.env.IG_ACCESS_TOKEN || "").trim();
  const saved = readJson(TOKEN_FILE, null);
  // a new token pasted into .env always wins over the saved one
  if (saved && saved.fromEnv === env.slice(-12)) return saved;
  return env ? { token: env, fromEnv: env.slice(-12), refreshedAt: 0 } : null;
}
export const hasToken = () => !!tokenState();
const token = () => tokenState()?.token;

async function call(method, path, params = {}) {
  const url = new URL(path.startsWith("http") ? path : base() + path);
  const body = new URLSearchParams({ ...params, access_token: params.access_token || token() });
  const opts = { method, signal: AbortSignal.timeout(60000) };
  if (method === "GET") body.forEach((v, k) => url.searchParams.set(k, v));
  else opts.body = body;
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const e = data.error || {};
    throw new Error(`Instagram API ${r.status}: ${e.message || r.statusText}${e.error_user_msg ? ` - ${e.error_user_msg}` : ""} (code ${e.code ?? "?"}${e.error_subcode ? `/${e.error_subcode}` : ""})`);
  }
  return data;
}

/** Exchange a short-lived token (1 hour) for a long-lived one (60 days). Needs IG_APP_SECRET. */
async function upgradeIfShortLived(st) {
  if (st.longLived || !process.env.IG_APP_SECRET) return st;
  try {
    const d = await call("GET", `${HOST}/access_token`, { grant_type: "ig_exchange_token", client_secret: process.env.IG_APP_SECRET, access_token: st.token });
    st = { ...st, token: d.access_token, longLived: true, refreshedAt: Date.now(), expiresAt: Date.now() + d.expires_in * 1000 };
    writeJson(TOKEN_FILE, st);
    log("instagram", "exchanged the short-lived token for a 60-day token");
  } catch (e) {
    // most dashboard tokens are already long-lived; that's fine
    if (!/already|long/i.test(e.message)) log("instagram", "token exchange skipped:", e.message);
  }
  return st;
}

/** Long-lived tokens last 60 days; refreshing (allowed once the token is 24h old) restarts the 60 days. */
export async function refreshTokenIfNeeded() {
  let st = tokenState();
  if (!st || isFbToken()) return; // system-user / Facebook-login tokens are managed in Meta Business settings
  st = await upgradeIfShortLived(st);
  const week = 7 * 86400000;
  if (st.refreshedAt && Date.now() - st.refreshedAt < week) return;
  try {
    const d = await call("GET", `${HOST}/refresh_access_token`, { grant_type: "ig_refresh_token", access_token: st.token });
    writeJson(TOKEN_FILE, { ...st, token: d.access_token, longLived: true, refreshedAt: Date.now(), expiresAt: Date.now() + d.expires_in * 1000 });
    log("instagram", `access token renewed, valid until ${new Date(Date.now() + d.expires_in * 1000).toDateString()}`);
  } catch (e) {
    log("instagram", "token refresh not done yet:", e.message);
    if (!st.refreshedAt) writeJson(TOKEN_FILE, { ...st, refreshedAt: Date.now() - week + 86400000 }); // retry in a day
  }
}

let foundId = null;
async function igUser(id) {
  const u = await call("GET", String(id), { fields: "id,username,media_count" });
  return { user_id: u.id, username: u.username, account_type: "PROFESSIONAL (Facebook-login token)", media_count: u.media_count };
}
/** EAA tokens: find the Instagram account the token can publish to (Page link, or business portfolio). */
async function discoverFbIgUser() {
  const candidates = [];
  const tryAdd = async (fn) => { try { candidates.push(...(await fn())); } catch {} };
  await tryAdd(async () => (await call("GET", "me/accounts", { fields: "instagram_business_account{id,username}" })).data.map((p) => p.instagram_business_account?.id).filter(Boolean));
  await tryAdd(async () => {
    const biz = (await call("GET", "me/businesses", { fields: "id" })).data || [];
    const ids = [];
    for (const b of biz) for (const edge of ["owned_instagram_accounts", "instagram_accounts"]) {
      try { ids.push(...((await call("GET", `${b.id}/${edge}`, { fields: "id,username" })).data || []).map((x) => x.id)); } catch {}
    }
    return ids;
  });
  for (const id of [...new Set(candidates)]) {
    try { return await igUser(id); } catch {}
  }
  throw new Error("Could not find your Instagram account ID automatically. Put it in .env as IG_USER_ID=... (it's shown in the Meta dashboard next to your Instagram account; usually starts with 1784)");
}

export async function whoAmI() {
  if (!isFbToken()) return call("GET", "me", { fields: "user_id,username,account_type,media_count" });
  if (process.env.IG_USER_ID) return igUser(process.env.IG_USER_ID);
  const u = await discoverFbIgUser();
  foundId = u.user_id;
  return u;
}
const userId = async () => process.env.IG_USER_ID || foundId || (await whoAmI()).user_id;

export async function publishingQuota() {
  const d = await call("GET", `${await userId()}/content_publishing_limit`, { fields: "quota_usage,config" });
  const x = d.data?.[0] || {};
  return { used: x.quota_usage ?? 0, max: x.config?.quota_total ?? 100 };
}

/**
 * kind: "reel" | "story-video" | "story-image" | "post-image"
 * Returns { id, permalink }.
 */
export async function publish({ kind, url, caption = "" }) {
  const uid = await userId();
  const p = {};
  if (kind === "reel") Object.assign(p, { media_type: "REELS", video_url: url, caption, share_to_feed: "true" });
  else if (kind === "story-video") Object.assign(p, { media_type: "STORIES", video_url: url });
  else if (kind === "story-image") Object.assign(p, { media_type: "STORIES", image_url: url });
  else Object.assign(p, { image_url: url, caption });

  const { id: container } = await call("POST", `${uid}/media`, p);
  // Instagram downloads + processes the file; videos usually take 20-90 s
  const started = Date.now();
  for (;;) {
    const s = await call("GET", container, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram could not process the media: ${s.status || s.status_code}`);
    if (Date.now() - started > 8 * 60000) throw new Error("Instagram processing timed out");
    await sleep(kind.includes("image") ? 3000 : 8000);
  }
  const { id } = await call("POST", `${uid}/media_publish`, { creation_id: container });
  let permalink = "";
  try { permalink = (await call("GET", id, { fields: "permalink" })).permalink || ""; } catch {}
  return { id, permalink };
}
