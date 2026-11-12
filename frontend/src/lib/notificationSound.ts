/**
 * Notification chime synthesised with the Web Audio API (no audio asset).
 * A soft two-note sine "glass" ping, low-passed and quiet, so it reads as a
 * terminal-style cue rather than a consumer app beep.
 */

const STORAGE_KEY = 'notification_sound';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
}

/**
 * Browsers keep an AudioContext suspended until a user gesture. Call once on
 * mount; the first click/key press anywhere on the page unlocks playback.
 */
export function primeNotificationSound(): () => void {
  const unlock = () => {
    getContext()?.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return unlock;
}

function tone(ac: AudioContext, out: AudioNode, freq: number, start: number, length: number, peak: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.05);

  // Quiet octave partial for a bell-like timbre.
  const harm = ac.createOscillator();
  const hGain = ac.createGain();
  harm.type = 'sine';
  harm.frequency.setValueAtTime(freq * 2, start);
  hGain.gain.setValueAtTime(0.0001, start);
  hGain.gain.exponentialRampToValueAtTime(peak * 0.18, start + 0.008);
  hGain.gain.exponentialRampToValueAtTime(0.0001, start + length * 0.45);
  harm.connect(hGain).connect(out);
  harm.start(start);
  harm.stop(start + length);
}

/** Plays the chime if the user has not muted it and the context is unlocked. */
export function playNotificationSound(force = false): void {
  if (!force && !isSoundEnabled()) return;
  const ac = getContext();
  if (!ac) return;
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
    if (!force) return;
  }

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3200;
  const master = ac.createGain();
  master.gain.value = 0.22;
  filter.connect(master).connect(ac.destination);

  const t = ac.currentTime + 0.02;
  tone(ac, filter, 880, t, 0.55, 0.5); // A5
  tone(ac, filter, 1318.5, t + 0.09, 0.8, 0.38); // E6
}
