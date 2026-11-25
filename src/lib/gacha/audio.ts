let ctx: AudioContext | null = null;
let muted = false;

export function setSynthMuted(value: boolean): void {
  muted = value;
}

function getCtx(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  start: number,
  dur: number,
  { type = "sine", gain = 0.15, endFreq }: { type?: OscillatorType; gain?: number; endFreq?: number } = {},
): void {
  const a = getCtx();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, gain = 0.12, highpass = 1200): void {
  const a = getCtx();
  if (!a) return;
  const t = a.currentTime + start;
  const len = Math.floor(a.sampleRate * dur);
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1 : 0.2);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t);
}

export function sfxClick(): void {
  tone(880, 0, 0.06, { type: "square", gain: 0.04 });
}

export function sfxCharge(seconds = 1.5): void {
  tone(55, 0, seconds, { type: "sawtooth", gain: 0.06, endFreq: 220 });
  tone(110, 0, seconds, { type: "sine", gain: 0.08, endFreq: 440 });
}

export function sfxCrackle(): void {
  noise(0, 0.25, 0.18, 2500);
  noise(0.12, 0.2, 0.12, 4000);
  tone(1800, 0, 0.08, { type: "square", gain: 0.05, endFreq: 400 });
}

export function sfxChime(rarity: 3 | 4 | 5): void {
  const sets: Record<3 | 4 | 5, number[]> = {
    3: [523, 659, 784],
    4: [523, 659, 784, 988, 1175],
    5: [523, 659, 784, 1047, 1319, 1568],
  };
  sets[rarity].forEach((f, i) => tone(f, i * 0.08, 0.5, { type: "triangle", gain: 0.1 }));
}

export function sfxBassDrop(): void {
  tone(160, 0, 1.2, { type: "sine", gain: 0.35, endFreq: 38 });
  tone(80, 0.05, 1.2, { type: "sawtooth", gain: 0.08, endFreq: 30 });
  noise(0, 0.4, 0.1, 200);
}

export function sfxJumpscare(): void {
  [65, 78, 98, 123].forEach((f) => tone(f, 0, 2.4, { type: "sawtooth", gain: 0.09 }));
  tone(220, 0, 0.9, { type: "square", gain: 0.12, endFreq: 30 });
  noise(0, 1.2, 0.3, 80);
}

export function sfxCash(): void {
  [1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.05, 0.18, { type: "square", gain: 0.04 }));
}
