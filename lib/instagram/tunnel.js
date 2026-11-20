// Instagram's servers must download each file from a public https URL.
// A separate tiny server shares ONLY data/ig-out (random file names), and a free Cloudflare quick tunnel
// makes it public just for the minutes an upload takes, then it's closed again.
// If you already have a permanent public address for the media server port, set IG_PUBLIC_BASE_URL (no quick tunnel).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { log, sleep } from "../util.js";
import { OUT_DIR } from "./render.js";

const PORT = +process.env.IG_MEDIA_PORT || 4322;
let server;

function startMediaServer() {
  if (server) return Promise.resolve();
  server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1));
    if (!/^[a-f0-9]{18}\.(mp4|jpg)$/.test(name) || !["GET", "HEAD"].includes(req.method)) {
      res.writeHead(404).end();
      return;
    }
    const file = path.join(OUT_DIR, name);
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    const size = fs.statSync(file).size;
    const type = name.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? +range[1] : 0;
      const end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" });
      return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) =>
    server
      .once("error", (e) => {
        // the always-on Reels Hub server already shares the same folder on this port: just use it
        if (e.code === "EADDRINUSE") ok();
        else fail(e);
      })
      .listen(PORT, "127.0.0.1", ok),
  );
}

export function cloudflaredPath() {
  const candidates = [
    process.env.CLOUDFLARED,
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "cloudflared.exe"),
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || "cloudflared";
}

/** Opens a public base URL, runs fn(baseUrl), then closes the tunnel. */
export async function withPublicUrl(fn) {
  await startMediaServer();
  // your own reverse proxy / named tunnel pointing at the media server port
  if (process.env.IG_PUBLIC_BASE_URL) return fn(process.env.IG_PUBLIC_BASE_URL.replace(/\/$/, ""));
  const proc = spawn(cloudflaredPath(), ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], { windowsHide: true });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cloudflared did not give a public URL within 60 s")), 60000);
      const onData = (d) => {
        const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) { clearTimeout(timer); resolve(m[0]); }
      };
      proc.stdout.on("data", onData);
      proc.stderr.on("data", onData);
      proc.on("error", (e) => { clearTimeout(timer); reject(new Error(`cloudflared is not installed (${e.code}). Run: winget install --id Cloudflare.cloudflared`)); });
      proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`cloudflared exited (${c})`)); });
    });
    // wait until the new hostname actually resolves and serves (usually 5-20 s)
    for (let i = 0; i < 20; i++) {
      try {
        const r = await fetch(`${url}/health-check`, { signal: AbortSignal.timeout(5000) });
        if (r.status === 404) break; // our server answered
      } catch {}
      await sleep(3000);
    }
    log("instagram", "temporary public link open:", url);
    return await fn(url);
  } finally {
    proc.kill();
    log("instagram", "temporary public link closed");
  }
}
