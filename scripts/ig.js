// Instagram helper commands:
//   npm run ig:check              verify token, account, quota, ffmpeg, cloudflared
//   npm run ig:test               render one reel + one quote story + one news story (no upload)
//   node scripts/ig.js post reel  post one right now (reel | quote-story | news-story), real upload
//   npm run ig:status             recent uploads
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { loadEnv } from "../lib/util.js";

loadEnv();
const { whoAmI, publishingQuota, refreshTokenIfNeeded, hasToken } = await import("../lib/instagram/api.js");
const { runJob, igState } = await import("../lib/instagram/scheduler.js");
const { ffmpegPath } = await import("../lib/instagram/render.js");
const { cloudflaredPath } = await import("../lib/instagram/tunnel.js");

const [cmd = "check", arg] = process.argv.slice(2);
const ok = (b, msg) => console.log(`${b ? "✅" : "❌"} ${msg}`);

if (cmd === "check") {
  const ff = spawnSync(ffmpegPath(), ["-version"], { encoding: "utf8" });
  ok(ff.status === 0, `ffmpeg: ${ff.status === 0 ? ff.stdout.split("\n")[0] : "not found (set FFMPEG=path in .env)"}`);
  const cf = spawnSync(cloudflaredPath(), ["--version"], { encoding: "utf8" });
  ok(cf.status === 0 || !!process.env.IG_PUBLIC_BASE_URL, process.env.IG_PUBLIC_BASE_URL ? `public URL: ${process.env.IG_PUBLIC_BASE_URL}` : `cloudflared: ${cf.status === 0 ? cf.stdout.trim() : "not found -> winget install --id Cloudflare.cloudflared"}`);
  if (!hasToken()) {
    ok(false, "IG_ACCESS_TOKEN missing in .env (see INSTAGRAM.md step 4)");
  } else {
    try {
      const me = await whoAmI();
      ok(true, `Instagram account: @${me.username} (${me.account_type}), id ${me.user_id}`);
      if (process.env.IG_USER_ID && process.env.IG_USER_ID !== String(me.user_id)) ok(false, `IG_USER_ID in .env (${process.env.IG_USER_ID}) differs from the token's account (${me.user_id})`);
      const q = await publishingQuota();
      ok(true, `publishing quota: ${q.used}/${q.max} used in the last 24 h`);
      await refreshTokenIfNeeded();
      if (!process.env.IG_ACCESS_TOKEN.trim().startsWith("IG")) {
        ok(true, "token: Facebook-login / system-user token (set to never expire in Meta settings)");
      } else {
        const f = new URL("../data/ig-token.json", import.meta.url);
        const t = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
        if (t.expiresAt) ok(true, `token valid until ${new Date(t.expiresAt).toDateString()} (auto-renewed weekly)`);
      }
    } catch (e) {
      ok(false, e.message);
    }
  }
  ok(process.env.IG_ENABLED === "true", `IG_ENABLED=${process.env.IG_ENABLED || "false"}`);
  ok(true, `IG_DRY_RUN=${process.env.IG_DRY_RUN || "true"} ${process.env.IG_DRY_RUN === "false" ? "(real uploads)" : "(renders only)"}`);
} else if (cmd === "test") {
  for (const job of ["reel", "quote-story", "news-story"]) {
    const r = await runJob(job, { dryRun: true });
    ok(r.ok, `${job}: ${r.ok ? r.file : r.error}`);
  }
  console.log("\nOpen the files above to check them. Nothing was uploaded.");
} else if (cmd === "post") {
  if (!["reel", "quote-story", "news-story"].includes(arg)) {
    console.log("usage: node scripts/ig.js post reel|quote-story|news-story");
    process.exit(1);
  }
  const r = await runJob(arg, { dryRun: false, force: true });
  ok(r.ok, r.ok ? `posted: ${r.permalink || r.mediaId}` : r.error);
  process.exit(r.ok ? 0 : 1);
} else if (cmd === "status") {
  for (const h of igState().history.slice(-20).reverse()) {
    console.log(`${new Date(h.at).toLocaleString()}  ${h.ok ? "✅" : "❌"} ${h.job.padEnd(11)} ${h.dryRun ? "[dry]" : "     "} ${h.permalink || h.error || h.file || ""}  ${h.title ? `- ${h.title.slice(0, 50)}` : ""}`);
  }
} else {
  console.log("commands: check | test | post <reel|quote-story|news-story> | status");
}
