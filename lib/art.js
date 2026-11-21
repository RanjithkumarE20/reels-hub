// Pictures for the art-style reels (pencil-sketch look on cream paper).
//   1. Cloudflare Workers AI (FLUX), if CF_ACCOUNT_ID + CF_API_TOKEN are set: a new hand-drawn illustration
//      that fits the quote. Free daily allowance is far more than 3 pictures a day.
//   2. Otherwise a freely licensed photo (Wikimedia Commons / Pexels), turned into a sketch by ffmpeg.
import fs from "node:fs";
import { fetchRaw, pick, log } from "./util.js";
import { findPhoto } from "./images.js";

// Scenes per theme: Indian settings, people seen from a distance or from behind work best.
const SCENES = {
  love: [
    "a young Indian couple laughing together under warm string lights on a city street at night",
    "a couple sharing one umbrella walking in the rain on a quiet Chennai street",
    "a young couple riding a scooter on a coastal road at sunset, her hair flowing",
    "a boy and a girl sitting on temple steps, sharing a smile, evening lamps glowing",
    "a couple standing on a lighthouse balcony under a huge full moon",
    "two lovers holding hands on a beach at dusk, footprints in the sand",
  ],
  mother: ["an Indian mother lovingly feeding her small child in a sunlit kitchen", "a mother holding her sleeping baby by a window with soft morning light"],
  father: ["a father carrying his little daughter on his shoulders at a village festival", "a father teaching his son to ride a bicycle on an empty road"],
  friendship: ["two friends laughing at a roadside tea stall in the rain", "a group of college friends on a road trip, sitting on the car bonnet at sunset", "two old friends sitting on a bench by the sea"],
  heartbreak: ["a girl looking out of a rain-streaked window holding a cup of tea", "a young man sitting alone on wet steps at night under a street lamp", "a girl walking away down an empty road, a boy standing still behind"],
  loneliness: ["a lone person on an empty railway platform at dusk", "a man sitting alone on a rock watching the sea", "an old radio, a cup of tea and an empty chair by an open window"],
  motivation: ["a young woman running up a mountain road at sunrise", "a boy studying late at night by a small lamp", "a climber reaching the top of a rocky peak"],
  success: ["a person standing on a mountain summit with arms wide open above the clouds", "a young graduate throwing a cap in the air"],
  hope: ["a lighthouse on rocks shining over a calm sea at dawn", "a small plant growing through a crack in a wall in sunlight", "a girl releasing a paper lantern into the night sky"],
  peace: ["misty tea hills of Munnar in the early morning", "a lotus pond with a small temple at sunrise", "a person meditating under a banyan tree"],
  happiness: ["children flying kites on a terrace on a sunny day", "a family laughing together on a swing in a garden"],
  life: ["a long winding road through green hills with a lone traveller", "a train passing through hills and tea gardens", "an old man reading a book under a tree"],
};
const STYLE =
  "hand-drawn colored pencil sketch illustration on textured cream paper, soft warm muted colors, delicate graphite linework, gentle cross-hatching, dreamy and emotional, plenty of empty paper around the scene, no text, no letters, no words, no watermark, no signature";

const sceneFor = (q) => pick(SCENES[q.theme] || SCENES[q.mood] || SCENES.life);

async function cloudflare(prompt, file) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const r = await fetchRaw(url, {
    method: "POST",
    timeout: 120000,
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 8 }),
  });
  const d = await r.json();
  const b64 = d?.result?.image;
  if (!b64) throw new Error(d?.errors?.[0]?.message || "no image returned");
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
}

const PHOTO_SCENES = {
  love: ["couple silhouette sunset", "lighthouse moon", "bicycle street rain"], mother: ["mother child"], father: ["father daughter"],
  friendship: ["friends sunset", "tea stall india"], heartbreak: ["rain window", "empty street night"], loneliness: ["lonely bench sea", "railway platform"],
  motivation: ["mountain road sunrise", "runner silhouette"], success: ["mountain summit"], hope: ["lighthouse", "sunrise field"],
  peace: ["munnar tea hills", "lotus pond"], happiness: ["kites sky", "children playing india"], life: ["winding road hills", "train hills"],
};

/**
 * Writes a picture for the quote to `file`.
 * Returns { kind: "ai" | "photo", credit, scene } (kind "photo" = needs the sketch filter).
 */
export async function artFor(q, file) {
  const scene = sceneFor(q);
  if (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) {
    try {
      await cloudflare(`${scene}. ${STYLE}`, file);
      return { kind: "ai", credit: "", scene };
    } catch (e) {
      log("art", "AI picture failed, using a sketched photo:", e.message);
    }
  }
  const photo = await findPhoto(pick(PHOTO_SCENES[q.theme] || PHOTO_SCENES[q.mood] || PHOTO_SCENES.life));
  const src = photo?.url || `https://picsum.photos/seed/${q.id}/1000/1000`;
  const r = await fetchRaw(src, { timeout: 60000, headers: { "User-Agent": "reels-hub/1.0 (personal quote reels app)" } });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return { kind: "photo", credit: photo?.credit || "", scene };
}
