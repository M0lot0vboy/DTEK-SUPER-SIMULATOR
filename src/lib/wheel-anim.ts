export function isReducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function easeOutQuart(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 4);
}

export type SpinAnimationHandle = {
  cancel: () => void;
};

/**
 * Animates a wheel container reliably across Chrome, Safari, Firefox, and mobile browsers
 * using requestAnimationFrame rather than CSS `transition` switches (which WebKit/Firefox
 * skip when `transition-property` changes from `none` in the same React commit as `transform`).
 */
export function startWheelSpinAnimation(options: {
  getElement: () => HTMLElement | null;
  fromDeg: number;
  sliceIndex: number;
  sliceCount: number;
  durationMs: number;
  turns: number;
  jitterRatio?: number;
  wedgeDeg: number;
  onWedgeTick?: (step: number) => void;
  onFinish: (finalModDeg: number) => void;
}): SpinAnimationHandle {
  const {
    getElement,
    fromDeg,
    sliceIndex,
    sliceCount,
    durationMs,
    turns,
    jitterRatio = 0.5,
    wedgeDeg,
    onWedgeTick,
    onFinish,
  } = options;

  const reduced = isReducedMotionPreferred();
  const effectiveDuration = reduced ? Math.min(durationMs, 850) : durationMs;
  const effectiveTurns = reduced ? 1 : Math.max(1, turns);
  const stepDeg = 360 / Math.max(1, sliceCount);
  const jitter = reduced ? 0 : (Math.random() - 0.5) * (stepDeg * jitterRatio);

  const startMod = ((fromDeg % 360) + 360) % 360;
  const desiredMod = (((360 - (sliceIndex * stepDeg + stepDeg / 2) + jitter) % 360) + 360) % 360;
  let delta = desiredMod - startMod;
  if (delta < 0) delta += 360;
  const totalDelta = effectiveTurns * 360 + delta;
  const targetDeg = startMod + totalDelta;

  let rafId = 0;
  let cancelled = false;
  let startTime: number | null = null;
  let lastWedgeIndex = Math.floor(startMod / wedgeDeg);
  let tickCount = 0;

  const applyDeg = (deg: number) => {
    const el = getElement();
    if (el) {
      el.style.transform = `translate3d(0, 0, 0) rotate(${deg.toFixed(2)}deg)`;
    }
  };

  applyDeg(startMod);

  const step = (now: number) => {
    if (cancelled) return;
    if (startTime === null) startTime = now;
    const elapsed = now - startTime;
    const progress = effectiveDuration > 0 ? Math.min(1, elapsed / effectiveDuration) : 1;
    const eased = easeOutQuart(progress);
    const currentDeg = startMod + totalDelta * eased;
    applyDeg(currentDeg);

    const currentWedge = Math.floor(currentDeg / wedgeDeg);
    if (currentWedge > lastWedgeIndex) {
      lastWedgeIndex = currentWedge;
      tickCount += 1;
      onWedgeTick?.(tickCount);
    }

    if (progress < 1) {
      rafId = window.requestAnimationFrame(step);
    } else {
      const finalMod = ((targetDeg % 360) + 360) % 360;
      applyDeg(finalMod);
      onFinish(finalMod);
    }
  };

  rafId = window.requestAnimationFrame(step);

  return {
    cancel: () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    },
  };
}
