let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  void ctx.resume();
  return ctx;
}

export function tick(freq: number, dur = 0.04): void {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.04, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

export function chord(notes: number[] = [523, 659, 784]): void {
  const c = ac();
  if (!c) return;
  notes.forEach((f, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.05, c.currentTime + i * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.09 + 0.4);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + i * 0.09);
    osc.stop(c.currentTime + i * 0.09 + 0.45);
  });
}
