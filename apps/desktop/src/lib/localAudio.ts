import { newId } from "@worldforge/core";
import { db } from "./db";
import { fs, path } from "./tauri";
import type { LibraryAsset } from "./toolbox";

/**
 * Local procedural audio: sound effects, ambience loops and short music loops synthesized with the
 * Web Audio API (OfflineAudioContext) and written as 16-bit WAV files. Works without any key and gives
 * the game real files to upload to Roblox (Assets API `Audio`) — the ElevenLabs provider is the upgrade
 * path when a key is present.
 */
export type SfxPreset = "coin" | "purchase" | "error" | "notify" | "sparkle" | "chest" | "footstep" | "whoosh";
export type LoopPreset = "forest_ambience" | "night_crickets" | "wind_ruins" | "lake_water" | "village_music" | "mystic_music";

export const SFX_PRESETS: { id: SfxPreset; name: string; role?: "collect" | "purchase" | "error" | "notify" }[] = [
  { id: "coin", name: "Coin pickup", role: "collect" },
  { id: "purchase", name: "Purchase chime", role: "purchase" },
  { id: "error", name: "Error buzz", role: "error" },
  { id: "notify", name: "Notify pop", role: "notify" },
  { id: "sparkle", name: "Magic sparkle" },
  { id: "chest", name: "Chest open" },
  { id: "footstep", name: "Footstep (grass)" },
  { id: "whoosh", name: "Whoosh" },
];

export const LOOP_PRESETS: { id: LoopPreset; name: string; kind: "ambience" | "music"; zone?: string }[] = [
  { id: "forest_ambience", name: "Forest ambience", kind: "ambience", zone: "forest" },
  { id: "night_crickets", name: "Night crickets", kind: "ambience", zone: "village" },
  { id: "wind_ruins", name: "Wind over ruins", kind: "ambience", zone: "ruins" },
  { id: "lake_water", name: "Lake water", kind: "ambience", zone: "lake" },
  { id: "village_music", name: "Village theme (music loop)", kind: "music" },
  { id: "mystic_music", name: "Mystic forest theme (music loop)", kind: "music" },
];

const RATE = 44100;

type Ctx = OfflineAudioContext;

function tone(ctx: Ctx, dest: AudioNode, type: OscillatorType, freq: number, t0: number, dur: number, gain: number, opts: { attack?: number; decay?: number; slideTo?: number; detune?: number } = {}) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  if (opts.detune) osc.detune.value = opts.detune;
  const g = ctx.createGain();
  const attack = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(ctx: Ctx, dest: AudioNode, t0: number, dur: number, gain: number, filter: { type: BiquadFilterType; freq: number; q?: number; sweepTo?: number }, env: { attack?: number; release?: number } = {}) {
  const buf = ctx.createBuffer(1, Math.ceil(dur * RATE), RATE);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.setValueAtTime(filter.freq, t0);
  if (filter.sweepTo) f.frequency.exponentialRampToValueAtTime(filter.sweepTo, t0 + dur);
  f.Q.value = filter.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + (env.attack ?? 0.01));
  g.gain.setValueAtTime(gain, t0 + dur - (env.release ?? 0.05));
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + dur);
}

function sfxGraph(ctx: Ctx, preset: SfxPreset, out: AudioNode): number {
  switch (preset) {
    case "coin":
      tone(ctx, out, "square", 1318, 0, 0.09, 0.18);
      tone(ctx, out, "square", 1760, 0.08, 0.32, 0.18, { decay: 0.3 });
      tone(ctx, out, "sine", 3520, 0.08, 0.25, 0.05);
      return 0.5;
    case "purchase":
      [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, "triangle", f, i * 0.09, 0.35, 0.2));
      tone(ctx, out, "sine", 2093, 0.36, 0.5, 0.08);
      return 1.0;
    case "error":
      tone(ctx, out, "sawtooth", 180, 0, 0.18, 0.2, { slideTo: 140 });
      tone(ctx, out, "sawtooth", 120, 0.2, 0.28, 0.22, { slideTo: 90 });
      return 0.6;
    case "notify":
      tone(ctx, out, "sine", 880, 0, 0.12, 0.22);
      tone(ctx, out, "sine", 1175, 0.1, 0.25, 0.2);
      return 0.45;
    case "sparkle":
      for (let i = 0; i < 9; i++) tone(ctx, out, "sine", 1500 + Math.random() * 3000, i * 0.05, 0.25, 0.08);
      noise(ctx, out, 0, 0.7, 0.05, { type: "highpass", freq: 6000 });
      return 0.8;
    case "chest":
      noise(ctx, out, 0, 0.12, 0.3, { type: "lowpass", freq: 600 });
      tone(ctx, out, "triangle", 90, 0.02, 0.3, 0.3, { slideTo: 60 });
      [784, 988, 1175, 1568].forEach((f, i) => tone(ctx, out, "triangle", f, 0.25 + i * 0.07, 0.6, 0.12));
      return 1.1;
    case "footstep":
      noise(ctx, out, 0, 0.14, 0.35, { type: "bandpass", freq: 900, q: 0.8, sweepTo: 300 });
      tone(ctx, out, "sine", 70, 0, 0.1, 0.2, { slideTo: 40 });
      return 0.25;
    case "whoosh":
      noise(ctx, out, 0, 0.5, 0.35, { type: "bandpass", freq: 300, q: 1.5, sweepTo: 2500 }, { attack: 0.15, release: 0.2 });
      return 0.55;
  }
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function loopGraph(ctx: Ctx, preset: LoopPreset, out: AudioNode, dur: number): void {
  const pad = (notes: number[], t0: number, len: number, gain: number, type: OscillatorType = "triangle") => {
    for (const n of notes) {
      tone(ctx, out, type, NOTE(n), t0, len, gain, { attack: len * 0.35, detune: (Math.random() - 0.5) * 8 });
      tone(ctx, out, "sine", NOTE(n) * 2, t0, len, gain * 0.25, { attack: len * 0.4 });
    }
  };
  switch (preset) {
    case "forest_ambience": {
      noise(ctx, out, 0, dur, 0.06, { type: "lowpass", freq: 900 }, { attack: 1, release: 1 });
      // birds: short chirps at random moments
      for (let t = 0.5; t < dur - 0.5; t += 0.4 + Math.random() * 1.6) {
        const base = 2400 + Math.random() * 1800;
        tone(ctx, out, "sine", base, t, 0.08, 0.05, { slideTo: base * 1.4 });
        if (Math.random() < 0.5) tone(ctx, out, "sine", base * 1.1, t + 0.1, 0.07, 0.04, { slideTo: base * 0.8 });
      }
      // leaves rustle
      for (let t = 0; t < dur; t += 2 + Math.random() * 3) noise(ctx, out, t, 1.2, 0.04, { type: "highpass", freq: 3000 }, { attack: 0.5, release: 0.5 });
      return;
    }
    case "night_crickets": {
      noise(ctx, out, 0, dur, 0.03, { type: "lowpass", freq: 400 }, { attack: 1, release: 1 });
      for (let t = 0; t < dur; t += 0.09) if (Math.sin(t * 2.1) > -0.2) tone(ctx, out, "sine", 4200 + (Math.random() - 0.5) * 60, t, 0.05, 0.03);
      for (let t = 1; t < dur; t += 4 + Math.random() * 5) tone(ctx, out, "sine", 620, t, 0.5, 0.05, { slideTo: 480, attack: 0.15 }); // owl
      return;
    }
    case "wind_ruins": {
      noise(ctx, out, 0, dur, 0.09, { type: "bandpass", freq: 350, q: 0.6 }, { attack: 1.5, release: 1.5 });
      for (let t = 0; t < dur; t += 3 + Math.random() * 4) noise(ctx, out, t, 3.5, 0.08, { type: "bandpass", freq: 250, q: 2, sweepTo: 700 }, { attack: 1.5, release: 1.5 });
      tone(ctx, out, "sine", 55, 0, dur, 0.04, { attack: 2 });
      return;
    }
    case "lake_water": {
      noise(ctx, out, 0, dur, 0.07, { type: "lowpass", freq: 1200 }, { attack: 1, release: 1 });
      for (let t = 0; t < dur; t += 1.2 + Math.random() * 2) noise(ctx, out, t, 1.8, 0.06, { type: "lowpass", freq: 500, sweepTo: 1800 }, { attack: 0.8, release: 0.8 });
      for (let t = 0.7; t < dur; t += 2.5 + Math.random() * 4) tone(ctx, out, "sine", 900 + Math.random() * 600, t, 0.12, 0.03, { slideTo: 1600 }); // droplets
      return;
    }
    case "village_music": {
      // D major, 100 bpm, 8 bars: pad chords + plucked melody + soft bass
      const bar = 2.4;
      const chords = [
        [62, 66, 69],
        [67, 71, 74],
        [69, 73, 76],
        [62, 66, 69],
      ];
      const melody = [74, 76, 78, 81, 78, 76, 74, 71, 69, 71, 74, 76, 74, 71, 69, 66];
      for (let b = 0; b < dur / bar; b++) {
        const c = chords[b % chords.length];
        pad(c.map((n) => n - 12), b * bar, bar * 1.05, 0.06);
        tone(ctx, out, "sine", NOTE(c[0] - 24), b * bar, bar * 0.9, 0.12, { attack: 0.05 });
        for (let i = 0; i < 4; i++) {
          const n = melody[(b * 4 + i) % melody.length];
          tone(ctx, out, "triangle", NOTE(n), b * bar + i * (bar / 4), 0.5, 0.11, { attack: 0.01 });
        }
      }
      return;
    }
    case "mystic_music": {
      // A minor, slow, 6 bars: evolving pads + sparse bell notes
      const bar = 4;
      const chords = [
        [57, 60, 64, 67],
        [53, 57, 60, 64],
        [55, 59, 62, 65],
        [52, 55, 59, 62],
      ];
      for (let b = 0; b < dur / bar; b++) {
        const c = chords[b % chords.length];
        pad(c, b * bar, bar * 1.2, 0.05, "sine");
        tone(ctx, out, "triangle", NOTE(c[0] - 24), b * bar, bar, 0.1, { attack: 0.5 });
        for (let i = 0; i < 3; i++) {
          if (Math.random() < 0.7) tone(ctx, out, "sine", NOTE(c[(i + b) % c.length] + 24), b * bar + i * 1.3 + Math.random() * 0.4, 1.6, 0.05, { attack: 0.01 });
        }
      }
      return;
    }
  }
}

async function render(build: (ctx: Ctx, out: AudioNode) => void, duration: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * RATE), RATE);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  build(ctx, comp);
  comp.connect(master).connect(ctx.destination);
  return ctx.startRendering();
}

/** 16-bit PCM WAV encoder (mono). */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const data = buffer.getChannelData(0);
  const out = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(out);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + data.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data.length * 2, true);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const norm = peak > 0 ? 0.92 / peak : 1;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i] * norm));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(out);
}

export async function renderSfx(preset: SfxPreset): Promise<Uint8Array> {
  let dur = 1;
  const buf = await render((ctx, out) => {
    dur = sfxGraph(ctx, preset, out);
  }, 1.5);
  // trim to the preset length (+ tail)
  const len = Math.min(buf.length, Math.ceil((dur + 0.15) * RATE));
  const trimmed = new OfflineAudioContext(1, len, RATE).createBuffer(1, len, RATE);
  trimmed.copyToChannel(buf.getChannelData(0).slice(0, len), 0);
  return encodeWav(trimmed);
}

export async function renderLoop(preset: LoopPreset, seconds = 20): Promise<Uint8Array> {
  const buf = await render((ctx, out) => loopGraph(ctx, preset, out, seconds), seconds);
  return encodeWav(buf);
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Writes a synthesized clip into the shared library (app_data/toolbox/audio) and registers it. */
export async function synthesizeToLibrary(preset: SfxPreset | LoopPreset, name: string, tags: string[] = []): Promise<LibraryAsset> {
  const isLoop = LOOP_PRESETS.some((l) => l.id === preset);
  const bytes = isLoop ? await renderLoop(preset as LoopPreset) : await renderSfx(preset as SfxPreset);
  const paths = await fs.appPaths();
  const id = newId("lib", 8);
  const dest = path.join(paths.app_data, "toolbox", "audio", `${preset}_${id}.wav`);
  await fs.writeBinaryBase64(dest, b64(bytes));
  const allTags = ["synth", preset, ...tags];
  await (await db()).execute("INSERT INTO assets (id, name, category, subcategory, style, biome, source, license, file_path, tags, created_at) VALUES ($1,$2,'audio','wav','library','any','synth','generated',$3,$4,$5)", [id, name, dest, JSON.stringify(allTags), new Date().toISOString()]);
  return { id, name, category: "audio", subcategory: "wav", source: "synth", filePath: dest, tags: allTags, createdAt: new Date().toISOString() };
}

/** Full starter pack: every SFX preset + every ambience/music loop. */
export async function synthesizeStarterPack(onProgress?: (label: string) => void): Promise<LibraryAsset[]> {
  const out: LibraryAsset[] = [];
  for (const p of SFX_PRESETS) {
    onProgress?.(p.name);
    out.push(await synthesizeToLibrary(p.id, p.name, p.role ? [`sfx:${p.role}`] : ["sfx"]));
  }
  for (const l of LOOP_PRESETS) {
    onProgress?.(l.name);
    out.push(await synthesizeToLibrary(l.id, l.name, [l.kind, ...(l.zone ? [`zone:${l.zone}`] : [])]));
  }
  return out;
}
