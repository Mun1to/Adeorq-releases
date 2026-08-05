import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";

// Desktop notifications for the two moments that actually matter: an agent
// finished its turn, or an agent is waiting for a yes/no. Nine terminals means
// nine possible pings, so the rules below exist to keep it from becoming noise.

export type NotifyMode = "fondo" | "siempre" | "nunca";

export const NOTIFY_KEY = "adeorq-notify";

/** Same pane + same reason cannot ping twice within this window. */
const COOLDOWN_MS = 20_000;
const last = new Map<string, number>();

let granted: boolean | null = null;

async function allowed(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
  } catch {
    granted = false;
  }
  return granted;
}

export interface NotifyOpts {
  mode: NotifyMode;
  /** Key for the cooldown, e.g. "12:done". */
  tag: string;
  title: string;
  body: string;
  /** True when the user is already looking at this very pane. */
  looking?: boolean;
}

/**
 * Sends the notification when it is worth sending: never in "nunca", never
 * when the user is watching that exact pane, and in "fondo" only while the
 * window is in the background, which is the whole point of a push.
 */
export async function notify(o: NotifyOpts): Promise<void> {
  if (o.mode === "nunca") return;
  const focused = document.hasFocus();
  if (o.mode === "fondo" && focused) return;
  if (focused && o.looking) return;

  const now = Date.now();
  const before = last.get(o.tag) ?? 0;
  if (now - before < COOLDOWN_MS) return;
  last.set(o.tag, now);

  if (!(await allowed())) return;
  try {
    sendNotification({ title: o.title, body: o.body });
  } catch {
    // The system may block them; the pane's own glow still says it.
  }
  // Flash the taskbar button too: on Windows that is the signal people see.
  try {
    await getCurrentWindow().requestUserAttention(UserAttentionType.Informational);
  } catch {
    // Not fatal: the toast already went out.
  }
}

/**
 * A short chime for the same two moments as the toast. Synthesised with the
 * Web Audio API instead of shipping a .wav: no asset, nothing to load, and the
 * pitch can carry the meaning.
 *
 * Two notes, deliberately opposite: "terminó" falls, like a full stop; "te
 * espera" rises, like a question. With seven terminales abiertas se aprende a
 * distinguirlas sin mirar, que es para lo que sirve un sonido.
 */
let audio: AudioContext | null = null;
const CHIME_COOLDOWN_MS = 4000;
const lastChime = new Map<string, number>();

export function chime(kind: "done" | "ask", mode: NotifyMode, looking?: boolean): void {
  // The same switch that governs the toasts: "nunca" means nunca, sound too.
  if (mode === "nunca") return;
  const focused = document.hasFocus();
  if (mode === "fondo" && focused) return;
  if (focused && looking) return;

  const now = Date.now();
  const before = lastChime.get(kind) ?? 0;
  if (now - before < CHIME_COOLDOWN_MS) return;
  lastChime.set(kind, now);

  try {
    audio ??= new AudioContext();
    // The context starts suspended until a gesture; resuming is free and after
    // his first click it stays running.
    if (audio.state === "suspended") void audio.resume();
    const ctx = audio;
    const t = ctx.currentTime;
    const notes = kind === "done" ? [880, 587.33] : [587.33, 880];
    notes.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      const at = t + i * 0.12;
      // An envelope, not a raw edge: the click at the start of a beep is what
      // makes a notification sound cheap.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.14, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
    });
  } catch {
    // No audio device, or the context was refused: the glow still says it.
  }
}

/**
 * El final de un temporizador. No es el mismo aviso que «el agente terminó».
 *
 * Aquel se oye de refilón y no pasa nada si se pierde, porque el panel se
 * queda ahí encendido esperando. Este tiene que sacarte de otra pestaña: tú
 * pusiste el reloj y a las cero deja de contar. Por eso son tres repiques y
 * no dos notas, y suena aunque estés mirando la ventana.
 */
export function alarm(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const ctx = audio;
    const t0 = ctx.currentTime;
    for (let rep = 0; rep < 3; rep++) {
      [1046.5, 784].forEach((hz, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = hz;
        const at = t0 + rep * 0.42 + i * 0.15;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.2, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.22);
      });
    }
  } catch {
    // Sin tarjeta de sonido, o el contexto denegado: queda la notificación.
  }
}

/** Forgets a pane's cooldowns when it closes. */
export function forgetPane(id: number): void {
  for (const key of [...last.keys()]) {
    if (key.startsWith(`${id}:`)) last.delete(key);
  }
}
