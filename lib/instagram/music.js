// Original, royalty-free background music for Instagram uploads (copyrighted songs can't be uploaded).
// A tiny synth: chord pad + arpeggio + bass (+ soft drums for upbeat moods), one style per mood.
import fs from "node:fs";
import path from "node:path";
import { shuffle } from "../util.js";

const STYLES = {
  love: { bpm: 72, beatsPerChord: 4, arp: 2, drums: false, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]] },
  motivation: { bpm: 100, beatsPerChord: 4, arp: 4, drums: true, chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]] },
  sad: { bpm: 64, beatsPerChord: 4, arp: 2, drums: false, chords: [[57, 60, 64], [55, 59, 64], [53, 57, 60], [55, 60, 64]] },
  hope: { bpm: 84, beatsPerChord: 4, arp: 2, drums: false, chords: [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]] },
  peace: { bpm: 60, beatsPerChord: 8, arp: 1, drums: false, chords: [[53, 57, 60, 64], [48, 52, 55, 59]] },
  life: { bpm: 76, beatsPerChord: 4, arp: 2, drums: false, chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]] },
  friendship: { bpm: 104, beatsPerChord: 4, arp: 4, drums: true, chords: [[55, 59, 62], [54, 57, 62], [52, 55, 59], [52, 55, 60]] },
};
STYLES.success = STYLES.motivation;
STYLES.wisdom = STYLES.life;

const SR = 44100;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Writes a stereo 16-bit WAV of `seconds` length for the mood; returns the path. */
export function makeMusic(mood, seconds, file) {
  const st = STYLES[mood] || STYLES.life;
  const transpose = shuffle([-2, 0, 0, 2, 3])[0]; // a little variety between reels
  const beat = 60 / st.bpm;
  const chordLen = beat * st.beatsPerChord;
  const n = Math.floor(seconds * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ci = Math.floor(t / chordLen) % st.chords.length;
    const chord = st.chords[ci].map((m) => m + transpose);
    const tc = t % chordLen;
    // pad: soft attack/release per chord, slightly detuned for width
    const env = Math.min(1, tc / 0.6) * Math.min(1, (chordLen - tc) / 0.4 + 0.15);
    let padL = 0, padR = 0;
    for (const m of chord) {
      const f = hz(m);
      padL += Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2.003 * t);
      padR += Math.sin(2 * Math.PI * f * 1.002 * t) + 0.25 * Math.sin(2 * Math.PI * f * 1.997 * t);
    }
    padL *= (0.09 * env) / chord.length * 3;
    padR *= (0.09 * env) / chord.length * 3;
    // arpeggio pluck
    const step = beat / st.arp;
    const si = Math.floor(t / step);
    const ts = t - si * step;
    const notes = [...chord, chord[0] + 12, chord[1] + 12];
    const an = notes[si % notes.length] + 12;
    const pluck = Math.sin(2 * Math.PI * hz(an) * t) * Math.exp(-ts * 5) * 0.12;
    // bass on each beat
    const tb = t % beat;
    const bass = Math.sin(2 * Math.PI * hz(chord[0] - 24) * t) * Math.exp(-tb * 2.2) * 0.22;
    let drums = 0;
    if (st.drums) {
      const kick = Math.sin(2 * Math.PI * (50 + 70 * Math.exp(-tb * 25)) * tb) * Math.exp(-tb * 9) * 0.45;
      const th = (t + beat / 2) % beat;
      const hat = (Math.random() * 2 - 1) * Math.exp(-th * 60) * 0.05;
      drums = kick + hat;
    }
    L[i] = padL + pluck * 0.8 + bass + drums;
    R[i] = padR + pluck * 1.0 + bass + drums;
  }

  // simple stereo echo for space
  const d = Math.floor(beat * 0.75 * SR);
  for (let i = d; i < n; i++) {
    L[i] += R[i - d] * 0.28;
    R[i] += L[i - d] * 0.28;
  }
  // fades + normalise to -3 dB
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = Math.min(1, t / 1.2) * Math.min(1, (seconds - t) / 2);
    L[i] *= f;
    R[i] *= f;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = peak ? 0.7 / peak : 1;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), 46 + i * 4);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}

// Your own royalty-free tracks, sorted by mood: music/love, music/motivation, music/sad, music/hope,
// music/peace, music/life, music/friendship (+ music/any as a fallback for every mood).
const FOLDER_FOR = { success: "motivation", wisdom: "life" };
const recentTracks = [];
const audioFiles = (dir) => {
  try {
    return fs.readdirSync(dir).filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};
export function pickOwnTrack(dir, mood) {
  const folder = FOLDER_FOR[mood] || mood || "life";
  const files = audioFiles(path.join(dir, folder));
  const pool = files.length ? files : [...audioFiles(path.join(dir, "any")), ...audioFiles(dir)];
  if (!pool.length) return null;
  const fresh = pool.filter((f) => !recentTracks.includes(f));
  const track = shuffle(fresh.length ? fresh : pool)[0];
  recentTracks.push(track);
  if (recentTracks.length > 12) recentTracks.shift();
  return { track, fromMoodFolder: files.length > 0 };
}
