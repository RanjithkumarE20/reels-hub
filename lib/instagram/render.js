// Renders Instagram media with ffmpeg:
//   quote reel / story  -> 1080x1920 MP4 (mood photo, slow zoom, animated quote text, original music)
//   news story          -> 1080x1920 JPEG (gradient card with headline; no copyrighted news photos)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { DATA_DIR, ROOT, fetchRaw, log } from "../util.js";
import { makeMusic, pickOwnTrack } from "./music.js";

export const OUT_DIR = path.join(DATA_DIR, "ig-out");
const WORK = path.join(DATA_DIR, "ig-work");
const FONTS = path.join(DATA_DIR, "fonts");
for (const d of [OUT_DIR, WORK, FONTS]) fs.mkdirSync(d, { recursive: true });

// Fonts are copied next to the data so ffmpeg filter paths stay simple (no "C:" escaping).
// Windows uses its built-in fonts; Linux (the GitHub cloud runner) uses the free Noto fonts.
const WIN = process.platform === "win32";
const WIN_FONTS = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
const NOTO = "/usr/share/fonts/truetype/noto";
const FONT_SOURCES = WIN
  ? { serif: "georgiab.ttf", serifItalic: "georgiaz.ttf", sans: "segoeui.ttf", sansBold: "segoeuib.ttf", tamil: "Nirmala.ttf", tamilBold: "NirmalaB.ttf", deva: "Nirmala.ttf", devaBold: "NirmalaB.ttf" }
  : { serif: "NotoSerif-Bold.ttf", serifItalic: "NotoSerif-BoldItalic.ttf", sans: "NotoSans-Regular.ttf", sansBold: "NotoSans-Bold.ttf", tamil: "NotoSansTamil-Regular.ttf", tamilBold: "NotoSansTamil-Bold.ttf", deva: "NotoSansDevanagari-Regular.ttf", devaBold: "NotoSansDevanagari-Bold.ttf" };
const FONT_FALLBACK = { serifItalic: "serif", tamil: "sans", tamilBold: "sansBold", deva: "sans", devaBold: "sansBold" };
const fontFile = {};
for (const [key, file] of Object.entries(FONT_SOURCES)) {
  const src = path.join(WIN ? WIN_FONTS : NOTO, file);
  const dst = path.join(FONTS, file);
  if (!fs.existsSync(dst) && fs.existsSync(src)) fs.copyFileSync(src, dst);
  if (fs.existsSync(dst)) fontFile[key] = file;
}
// handwriting fonts for the art-style reels ship with the app (free OFL fonts, same on PC and cloud)
for (const [key, file] of [["hand", "Caveat.ttf"], ["handTa", "Arima.ttf"]]) {
  const src = path.join(ROOT, "assets", "fonts", file);
  const dst = path.join(FONTS, file);
  if (!fs.existsSync(dst) && fs.existsSync(src)) fs.copyFileSync(src, dst);
  if (fs.existsSync(dst)) fontFile[key] = file;
}
FONT_FALLBACK.hand = "serifItalic";
FONT_FALLBACK.handTa = "tamil";
const font = (k) => `fonts/${fontFile[k] || fontFile[FONT_FALLBACK[k]] || fontFile.sansBold || fontFile.sans}`;

export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const winget = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
  try {
    for (const pkg of fs.readdirSync(winget).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
      for (const sub of fs.readdirSync(path.join(winget, pkg))) {
        const exe = path.join(winget, pkg, sub, "bin", "ffmpeg.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch {}
  return "ffmpeg";
}

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd, windowsHide: true });
    // low CPU priority so the YouTube Shorts pipeline (and the PC) are never slowed down
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_LOW); } catch {}
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-600)}`))));
  });
}

// Skip a track's slow intro: start somewhere between 20% and 45% of the way in (if it's long enough).
function bestStart(file, seconds) {
  const probe = ffmpegPath().replace(/ffmpeg(\.exe)?$/i, (m, ext) => `ffprobe${ext || ""}`);
  const r = spawnSync(probe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true });
  const dur = parseFloat(r.stdout);
  if (!dur || dur < seconds + 25) return 0;
  return (dur - seconds) * (0.2 + Math.random() * 0.25);
}

const isIndic = (s) => /[\u0900-\u097F\u0B80-\u0BFF]/.test(s);
const isDeva = (s) => /[\u0900-\u097F]/.test(s);
const scriptFont = (s, bold) => (isDeva(s) ? (bold ? "devaBold" : "deva") : isIndic(s) ? (bold ? "tamilBold" : "tamil") : bold ? "sansBold" : "sans");
function wrap(text, maxChars) {
  // "\n" in a quote = a line break the writer wants kept (stanza-style Tamil quotes); "\n\n" = a gap
  if (text.includes("\n")) return text.split("\n").flatMap((part) => (part.trim() ? wrap(part, maxChars) : [""]));
  const lines = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > maxChars && line) { lines.push(line); line = w; }
    else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
// drawtext reads text from files, so quotes/colons/emoji-free text needs no escaping
const txt = (dir, name, s) => (fs.writeFileSync(path.join(dir, name), s, "utf8"), path.relative(DATA_DIR, path.join(dir, name)).replaceAll("\\", "/"));
const id = () => crypto.randomBytes(9).toString("hex"); // unguessable public file names

async function download(url, file) {
  const r = await fetchRaw(url, { timeout: 60000, headers: { "User-Agent": "reels-hub/1.0 (personal quote reels app)" } });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

/** Quote -> MP4. Returns { file, name, seconds, music } */
export async function renderQuoteVideo(q, { seconds = 20, handle = "", music: musicMode } = {}) {
  const dir = path.join(WORK, id());
  fs.mkdirSync(dir, { recursive: true });
  try {
    const bg = path.join(dir, "bg.jpg");
    try { await download(q.image, bg); } catch { await download(`https://picsum.photos/seed/${q.id}/1080/1920`, bg); }

    // auto (default): a real track from music/<mood>/ if you've added some, otherwise generated music
    // musicMode "none" = silent reel (the film song is then added in the Instagram app)
    const mode = (musicMode || process.env.IG_MUSIC || "auto").toLowerCase();
    let audio = null;
    let audioStart = 0;
    let music = "none";
    if (mode === "auto" || mode === "folder") {
      const own = pickOwnTrack(path.resolve(ROOT, process.env.IG_MUSIC_DIR || "music"), q.mood);
      if (own) {
        audio = own.track;
        audioStart = bestStart(audio, seconds);
        music = `${own.fromMoodFolder ? q.mood : "any"}:${path.basename(audio)}`;
      }
    }
    if (!audio && mode !== "none") {
      audio = makeMusic(q.mood, seconds, path.join(dir, "music.wav"));
      music = "generated";
    }

    const long = q.text.length > 120;
    // Noto Serif (cloud/Linux) is wider and taller than Georgia (Windows): smaller text, shorter lines, more spacing
    const k = WIN ? 1 : 0.86;
    const size = Math.round((long ? 58 : q.text.length > 70 ? 68 : 80) * k);
    const lines = wrap(`“${q.text}”`, WIN ? (long ? 28 : 24) : long ? 30 : 22);
    const lineH = Math.round(size * (WIN ? 1.32 : 1.5));
    const blockH = lines.length * lineH;
    const y0 = Math.round(960 - blockH / 2 - 40);
    const quoteFile = txt(dir, "quote.txt", lines.join("\n"));
    const authorFile = txt(dir, "author.txt", `— ${q.author}`);
    const moodFile = txt(dir, "mood.txt", (q.moodLabel || q.mood || "").toUpperCase());
    const handleFile = handle ? txt(dir, "handle.txt", handle) : null;
    const fade = (a, b) => `alpha='if(lt(t,${a}),0,if(lt(t,${b}),(t-${a})/${b - a},1))'`;
    const frames = seconds * 30;

    const vf = [
      `[0:v]scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880`,
      `zoompan=z='1+0.12*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
      `eq=saturation=1.08`,
      `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.42:t=fill`,
      `drawtext=fontfile=${font("sansBold")}:textfile=${moodFile}:fontsize=30:fontcolor=white@0.85:x=(w-text_w)/2:y=${y0 - 110}:box=1:boxcolor=black@0.35:boxborderw=14:${fade(0.2, 0.8)}`,
      `drawtext=fontfile=${font("serif")}:textfile=${quoteFile}:fontsize=${size}:line_spacing=${lineH - size}:text_align=C:fontcolor=white:shadowcolor=black@0.6:shadowx=3:shadowy=3:x=(w-text_w)/2:y=${y0}:${fade(0.5, 1.6)}`,
      `drawtext=fontfile=${font("serifItalic")}:textfile=${authorFile}:fontsize=44:fontcolor=white@0.92:shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2:y=${y0 + blockH + (WIN ? 46 : 70)}:${fade(1.6, 2.4)}`,
      handleFile && `drawtext=fontfile=${font("sansBold")}:textfile=${handleFile}:fontsize=34:fontcolor=white@0.8:x=(w-text_w)/2:y=1730`,
      `format=yuv420p[v]`,
    ].filter(Boolean).join(",");

    const name = `${id()}.mp4`;
    const out = path.join(OUT_DIR, name);
    const args = ["-loop", "1", "-framerate", "30", "-t", String(seconds), "-i", path.relative(DATA_DIR, bg)];
    // IG_MUSIC=none -> silent track (Instagram expects an audio stream)
    if (audio) args.push(...(audioStart ? ["-ss", audioStart.toFixed(1)] : []), "-i", path.relative(DATA_DIR, audio));
    else args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
    args.push("-filter_complex", vf, "-map", "[v]", "-map", "1:a");
    args.push("-af", `afade=t=in:d=1,afade=t=out:st=${seconds - 2}:d=2`, "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2");
    args.push("-t", String(seconds), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-r", "30", "-threads", "2", "-movflags", "+faststart", out);
    await run(args, DATA_DIR);
    return { file: out, name, seconds, music };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Art-style quote reel: pencil-sketch picture on cream paper, the quote handwritten above it
 * (English in Caveat, Tamil in Arima), lines appearing one by one, signature in the corner. Silent:
 * the film song (and its lyrics) are added in the Instagram app.
 * q: { id, text, author, mood, theme, lang }. Returns { file, name, seconds, music, credit, art }.
 */
export async function renderArtVideo(q, { seconds = 20, handle = "" } = {}) {
  const { artFor } = await import("../art.js");
  const dir = path.join(WORK, id());
  fs.mkdirSync(dir, { recursive: true });
  try {
    const artFile = path.join(dir, "art.jpg");
    const art = await artFor(q, artFile);
    const ART = 1000, ART_X = 40, ART_Y = 760;

    // 1. the still page: paper + feathered picture (multiply, so the picture's white becomes paper)
    const sketch = art.kind === "photo"
      // photo -> pencil sketch: colour-dodge of the grey image with its blurred negative, then a little of the colour back
      ? `split=2[a][c];[a]format=gray,split[g1][g2];[g2]negate,gblur=sigma=10[inv];[g1][inv]blend=all_expr='if(gte(B,254),255,min(255,A*255/(255-B)))',format=rgb24,curves=all='0/0 0.7/0.52 1/1'[sk];[c]eq=saturation=0.75:brightness=0.1,format=rgb24[col];[sk][col]blend=all_mode=multiply:all_opacity=0.32,format=rgb24,`
      : "";
    const still = [
      `color=c=0xf6ecd8:s=1080x1920:d=1,noise=alls=8:allf=u,vignette=PI/9,format=rgb24[paper]`,
      `[0:v]scale=${ART}:${ART}:force_original_aspect_ratio=increase,crop=${ART}:${ART},format=rgb24,${sketch}colorlevels=rimax=0.93:gimax=0.93:bimax=0.9,format=rgba,` +
        `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*min(1,min(min(X,Y),min(W-1-X,H-1-Y))/110)'[art]`,
      `color=c=white:s=1080x1920:d=1[w]`,
      `[w][art]overlay=${ART_X}:${ART_Y},format=rgb24[pic]`,
      `[paper][pic]blend=all_mode=multiply,format=rgb24[out]`,
    ].join(";");
    await run(["-i", path.relative(DATA_DIR, artFile), "-filter_complex", still, "-map", "[out]", "-frames:v", "1", path.relative(DATA_DIR, path.join(dir, "page.png"))], DATA_DIR);

    // 2. the text: biggest size that fits the zone above the picture
    const ta = isIndic(q.text);
    const ZONE_TOP = 170, ZONE_H = 540;
    let size = ta ? 62 : 92, lines, lineH;
    for (;;) {
      const perLine = Math.round((ta ? 1500 : 1680) / size); // characters per line at this size
      lines = wrap(q.text, perLine);
      lineH = Math.round(size * (ta ? 1.75 : 1.22));
      if (lines.length * lineH <= ZONE_H - (q.author ? 90 : 0) || size <= 40) break;
      size -= 4;
    }
    const blockH = lines.length * lineH;
    const y0 = Math.round(ZONE_TOP + (ZONE_H - blockH - (q.author ? 90 : 0)) / 2);
    const ink = "0x2b2520";
    const textFont = font(ta ? "handTa" : "hand");
    const fade = (a) => `alpha='if(lt(t,${a}),0,if(lt(t,${a + 0.7}),(t-${a})/0.7,1))'`;
    const vf = [
      `[0:v]scale=1620:2880,zoompan=z='1+0.04*on/${seconds * 30}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
      // each line fades in after the previous one, like it is being written
      ...lines.map((l, i) =>
        `drawtext=fontfile=${textFont}:textfile=${txt(dir, `l${i}.txt`, ` ${l} `)}:fontsize=${size}:fontcolor=${ink}:borderw=${ta ? 0 : 1}:bordercolor=${ink}:x=(w-text_w)/2:y=${y0 + i * lineH}:${fade(0.4 + i * 0.6)}`),
      q.author && `drawtext=fontfile=${font(isIndic(q.author) ? "handTa" : "hand")}:textfile=${txt(dir, "author.txt", `— ${q.author}`)}:fontsize=${ta ? 40 : 52}:fontcolor=${ink}@0.85:x=(w-text_w)/2:y=${y0 + blockH + 30}:${fade(0.4 + lines.length * 0.6)}`,
      handle && `drawtext=fontfile=${font("hand")}:textfile=${txt(dir, "handle.txt", handle.replace(/^@/, ""))}:fontsize=54:fontcolor=${ink}@0.9:borderw=1:bordercolor=${ink}@0.9:x=w-text_w-80:y=1790`,
      handle && `drawbox=x=iw-470:y=1858:w=400:h=3:color=${ink}@0.7:t=fill`,
      `format=yuv420p[v]`,
    ].filter(Boolean).join(",");

    const name = `${id()}.mp4`;
    const out = path.join(OUT_DIR, name);
    await run([
      "-loop", "1", "-framerate", "30", "-t", String(seconds), "-i", path.relative(DATA_DIR, path.join(dir, "page.png")),
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-filter_complex", vf, "-map", "[v]", "-map", "1:a", "-c:a", "aac", "-b:a", "128k",
      "-t", String(seconds), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-r", "30", "-threads", "2", "-movflags", "+faststart", out,
    ], DATA_DIR);
    return { file: out, name, seconds, music: "none", credit: art.credit, art: art.kind };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// moody backgrounds for the minimal style (freely licensed photos)
const MINIMAL_SCENES = {
  love: ["lanterns dusk", "fairy lights night", "sunset palm trees", "candle light dark"],
  sad: ["rain window", "foggy road", "empty bench fog", "rainy street night"],
  hope: ["misty hills sunrise", "sun rays clouds", "beach dawn"],
  peace: ["misty hills", "lake reflection dusk", "tea plantation mist"],
  life: ["open book pages", "train window", "winding road mist", "old books"],
  motivation: ["mountain road dawn", "sunrise mountains"], success: ["mountain peak clouds"], friendship: ["campfire night", "sunset beach"],
};

/**
 * Minimal style (like many Tamil quote pages): a moody photo, a short stanza in soft white text in the
 * upper third, lines fading in one by one. Silent; the song is added in Instagram.
 */
export async function renderMinimalVideo(q, { seconds = 20, handle = "" } = {}) {
  const { findPhoto } = await import("../images.js");
  const dir = path.join(WORK, id());
  fs.mkdirSync(dir, { recursive: true });
  try {
    const list = MINIMAL_SCENES[q.mood] || MINIMAL_SCENES.life;
    const photo = await findPhoto(list[Math.floor(Math.random() * list.length)]);
    const bg = path.join(dir, "bg.jpg");
    try { await download(photo?.url, bg); } catch { await download(`https://picsum.photos/seed/${q.id}/1080/1920`, bg); }

    const ta = isIndic(q.text);
    let size = ta ? 50 : 60, lines, lineH;
    for (;;) {
      lines = wrap(q.text, Math.round((ta ? 1250 : 1500) / size));
      lineH = Math.round(size * (ta ? 1.8 : 1.4));
      if (lines.length * lineH <= 620 || size <= 34) break;
      size -= 3;
    }
    const y0 = 300;
    const f = font(ta ? "tamil" : "serifItalic");
    const fade = (a) => `alpha='if(lt(t,${a}),0,if(lt(t,${a + 0.8}),(t-${a})/0.8,0.96))'`;
    const vf = [
      `[0:v]scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880`,
      `zoompan=z='1+0.07*on/${seconds * 30}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
      `eq=saturation=0.85:brightness=-0.09:gamma=0.92`, `colorbalance=rs=0.05:bs=-0.03:rh=0.04`, `vignette=PI/4.5`,
      ...lines.map((l, i) => l.trim() &&
        `drawtext=fontfile=${f}:textfile=${txt(dir, `l${i}.txt`, ` ${l} `)}:fontsize=${size}:fontcolor=white:borderw=2:bordercolor=black@0.25:shadowcolor=black@0.6:shadowx=2:shadowy=3:x=(w-text_w)/2:y=${y0 + i * lineH}:${fade(0.5 + i * 0.7)}`),
      handle && `drawtext=fontfile=${font("sans")}:textfile=${txt(dir, "handle.txt", handle)}:fontsize=32:fontcolor=white@0.7:x=(w-text_w)/2:y=1760`,
      `format=yuv420p[v]`,
    ].filter(Boolean).join(",");
    const name = `${id()}.mp4`;
    const out = path.join(OUT_DIR, name);
    await run([
      "-loop", "1", "-framerate", "30", "-t", String(seconds), "-i", path.relative(DATA_DIR, bg),
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-filter_complex", vf, "-map", "[v]", "-map", "1:a", "-c:a", "aac", "-b:a", "128k",
      "-t", String(seconds), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-r", "30", "-threads", "2", "-movflags", "+faststart", out,
    ], DATA_DIR);
    return { file: out, name, seconds, music: "none", credit: photo?.credit || "", art: "minimal" };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const GRADS = [["0x0f2027", "0x2c5364"], ["0x1a0933", "0x6b1f5f"], ["0x0b1d3a", "0x7a1e3a"], ["0x10241c", "0x1f6f5c"], ["0x2b1055", "0x7597de"]];

/** News headline -> story JPEG. Uses only text + gradient (news photos belong to the publishers). */
export async function renderNewsStory(n, { handle = "" } = {}) {
  const dir = path.join(WORK, id());
  fs.mkdirSync(dir, { recursive: true });
  try {
    const indic = isIndic(n.title);
    const [c0, c1] = GRADS[Math.floor(Math.random() * GRADS.length)];
    // fixed zones so nothing overlaps: headline 680-1300, summary 1360-1580, footer 1640+
    // (Tamil/Hindi glyphs are much taller than Latin ones at the same font size)
    const size = indic ? (n.title.length > 70 ? 52 : 60) : n.title.length > 90 ? 58 : 70;
    const lineH = Math.round(size * (indic ? 1.9 : 1.3));
    const maxLines = Math.floor(580 / lineH);
    let lines = wrap(n.title, indic ? 22 : 26);
    if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), lines[maxLines - 1] + "…"];
    const y0 = 680;
    const tf = txt(dir, "title.txt", lines.join("\n"));
    const label = txt(dir, "label.txt", n.kind === "trend" ? "TRENDING NOW" : "LATEST NEWS");
    const src = txt(dir, "src.txt", n.source || "");
    const subIndic = isIndic(n.sub || "");
    const sub = n.sub && n.sub !== n.title ? txt(dir, "sub.txt", wrap(n.sub, subIndic ? 36 : 44).slice(0, subIndic ? 3 : 4).join("\n")) : null;
    const read = n.domain ? txt(dir, "read.txt", `Read more: ${n.domain}`) : null;
    const handleFile = handle ? txt(dir, "handle.txt", handle) : null;
    const tFont = font(scriptFont(n.title, true));
    const sFont = font(scriptFont(n.sub || "", false));
    const vf = [
      `drawbox=x=80:y=520:w=170:h=8:color=0xff3d7f:t=fill`,
      `drawtext=fontfile=${font("sansBold")}:textfile=${label}:fontsize=40:fontcolor=white:x=80:y=430`,
      `drawtext=fontfile=${font("sansBold")}:textfile=${src}:fontsize=44:fontcolor=white@0.85:x=80:y=580`,
      `drawtext=fontfile=${tFont}:textfile=${tf}:fontsize=${size}:line_spacing=${lineH - size}:fontcolor=white:x=80:y=${y0}`,
      sub && `drawtext=fontfile=${sFont}:textfile=${sub}:fontsize=${subIndic ? 34 : 38}:line_spacing=${subIndic ? 30 : 18}:fontcolor=white@0.8:x=80:y=1360`,
      read && `drawtext=fontfile=${font("sans")}:textfile=${read}:fontsize=36:fontcolor=white@0.75:x=80:y=1640`,
      handleFile && `drawtext=fontfile=${font("sansBold")}:textfile=${handleFile}:fontsize=34:fontcolor=white@0.8:x=80:y=1720`,
    ].filter(Boolean).join(",");
    const name = `${id()}.jpg`;
    const out = path.join(OUT_DIR, name);
    await run(["-f", "lavfi", "-i", `gradients=s=1080x1920:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=1080:y1=1920:speed=0.0001`, "-vf", vf, "-frames:v", "1", "-q:v", "2", out], DATA_DIR);
    return { file: out, name };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Remove rendered files older than `days` (they're only needed until Instagram has downloaded them). */
export function cleanOutput(days = 3) {
  const cutoff = Date.now() - days * 86400000;
  for (const f of fs.readdirSync(OUT_DIR)) {
    const p = path.join(OUT_DIR, f);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch {}
  }
}
export { log };

/** Small JPEG thumbnail from a video (used as the poster image in the picks app). */
export async function videoFrame(video, outJpg, t = 2.5) {
  await run(["-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", outJpg], DATA_DIR);
}
