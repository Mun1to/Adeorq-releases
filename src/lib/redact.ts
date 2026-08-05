// Streaming shield. Blurring the UI never protected the thing that matters:
// what the AGENT prints inside a terminal. A key read from a .env, a Supabase
// error carrying its URL, `gh` echoing a token: those land as plain text on a
// live stream and are burnt the moment they render.
//
// So the text is rewritten BEFORE xterm paints it. The agent still receives
// the real bytes; only the view is masked, and the mask keeps the exact
// length so a TUI's boxes do not lose their alignment.
//
// This is a deny list, and deny lists are never complete: it buys time and
// catches the usual shapes, it is not a promise. The real defence is not
// having secrets on screen and running the stream on a delay.

export type Severity = "alta" | "baja";

interface Rule {
  /** Shown in the warning, so Munir knows what came up. */
  name: string;
  severity: Severity;
  /**
   * What to actually DO about it. The bar used to say "treat it as burnt and
   * rotate it" for every single hit, including a Windows path: you cannot
   * rotate your own home folder, and the advice read as "you are already
   * done for" when the shield had in fact worked. Advice belongs to the rule.
   */
  advice: string;
  re: RegExp;
  /** Masks only the secret part when the match carries context worth keeping. */
  mask?: (...args: string[]) => string;
}

// Masking happens BEFORE xterm paints, so a hit means the shield worked and
// nothing reached the stream. Say that, then point at the part that is real.
const ROTATE =
  "No ha llegado a verse: la tapé antes de pintarse. Lo que conviene mirar es de dónde salió, porque ahí sí sigue suelta.";
const HARMLESS = "Tapado y listo. Eso no es una credencial, no hay nada que rotar.";

const dots = (s: string): string => "●".repeat([...s].length);

const RULES: Rule[] = [
  {
    name: "clave de Anthropic",
    severity: "alta",
    advice: ROTATE,
    re: /sk-ant-[A-Za-z0-9_-]{12,}/g,
  },
  {
    name: "clave de OpenAI",
    severity: "alta",
    advice: ROTATE,
    re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "token de GitHub",
    severity: "alta",
    advice: ROTATE,
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})/g,
  },
  {
    name: "clave de AWS",
    severity: "alta",
    advice: ROTATE,
    re: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "token de Slack",
    severity: "alta",
    advice: ROTATE,
    re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    name: "clave de Google",
    severity: "alta",
    advice: ROTATE,
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    // Supabase and friends hand these out as anon/service keys.
    // Vuelve a ser ALTA (2026-07-29). Se bajó a baja el 28 para que el telón
    // dejara de saltar en bucle, pero eso era apagar la alarma en vez de
    // arreglar el incendio: la causa real era que el telón se volvía a levantar
    // en cuanto lo quitabas, y eso ya está resuelto aparte (15 segundos de
    // gracia en `panicDismissedAt`, y el sonido con su propio respiro). Un JWT
    // de servicio de Supabase abre la base de datos entera: es justo lo que
    // este escudo existe para no enseñar en un directo.
    name: "token JWT",
    severity: "alta",
    advice:
      "No ha llegado a verse. Estos caducan solos, así que casi nunca es urgente: mira si era el de servicio, que ese sí manda.",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    name: "clave privada",
    severity: "alta",
    advice:
      "No ha llegado a verse. Una clave privada en pantalla sí merece que compruebes qué la imprimió.",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: "cadena de conexión con contraseña",
    severity: "alta",
    advice: ROTATE,
    // postgres://user:password@host/db and every sibling protocol.
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|ftp|ssh):\/\/[^\s:@/]+:([^\s@]+)@/g,
    mask: (m, pwd) => m.replace(pwd, dots(pwd)),
  },
  {
    // Alta por lo mismo que el JWT: `API_KEY=...` en pantalla es el caso más
    // común de fuga de verdad, y era el otro que se había bajado a baja.
    name: "variable con secreto",
    severity: "alta",
    advice:
      "No ha llegado a verse: tapé el valor y dejé el nombre. Puede ser una clave de verdad o una variable que solo se llama así.",
    // KEY=..., API_TOKEN: "...": the name stays, the value goes.
    re: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIALS?)[A-Z0-9_]*)(\s*[:=]\s*)(["']?)([^\s"',;]{6,})/g,
    mask: (_m, name, sep, quote, value) => `${name}${sep}${quote}${dots(value)}`,
  },
  {
    name: "correo",
    severity: "baja",
    advice: HARMLESS,
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    name: "ruta con tu usuario",
    severity: "baja",
    advice:
      "Solo dejaba ver el nombre de tu cuenta de Windows, y ya está tapado. Una carpeta no se rota: no hay nada que hacer.",
    // Keeps the drive and the folder, drops the account name.
    re: /\b([A-Za-z]:[\\/]Users[\\/])([^\\/\s"'<>|]+)/g,
    mask: (_m, head, user) => `${head}${dots(user)}`,
  },
];

/** One thing that was masked, with what it means for you. */
export interface Hit {
  name: string;
  severity: Severity;
  advice: string;
}

export interface RedactResult {
  text: string;
  /** What fired, in rule order (the serious ones come first). */
  hits: Hit[];
  /** True when something rotatable showed up: only then is the curtain worth it. */
  severe: boolean;
}

export function redact(input: string): RedactResult {
  let text = input;
  const hits: Hit[] = [];
  let severe = false;
  for (const rule of RULES) {
    // Reset: the regexes are global and shared between calls.
    rule.re.lastIndex = 0;
    if (!rule.re.test(text)) continue;
    rule.re.lastIndex = 0;
    text = text.replace(rule.re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      return rule.mask ? rule.mask(...groups) : dots(groups[0]);
    });
    hits.push({ name: rule.name, severity: rule.severity, advice: rule.advice });
    if (rule.severity === "alta") severe = true;
  }
  return { text, hits, severe };
}

/**
 * A secret can arrive split across two PTY chunks, and half a token matches
 * nothing. So the tail of each chunk is held back briefly and joined to the
 * next one. xterm's parser copes with data split at any point, so holding a
 * few characters is safe; the timer flushes them when the stream goes quiet.
 */
export class RedactStream {
  private carry = "";
  private timer = 0;
  /** Long enough to hold any of the patterns above whole. */
  private static readonly TAIL = 160;
  private static readonly FLUSH_MS = 40;

  constructor(
    private readonly write: (text: string) => void,
    private readonly onHits: (hits: Hit[], severe: boolean) => void,
  ) {}

  push(chunk: string): void {
    window.clearTimeout(this.timer);
    const all = this.carry + chunk;
    const cut = Math.max(0, all.length - RedactStream.TAIL);
    this.carry = all.slice(cut);
    if (cut > 0) this.emit(all.slice(0, cut));
    this.timer = window.setTimeout(() => this.flush(), RedactStream.FLUSH_MS);
  }

  /** Writes whatever is held back: called on quiet and when tearing down. */
  flush(): void {
    window.clearTimeout(this.timer);
    if (!this.carry) return;
    const pending = this.carry;
    this.carry = "";
    this.emit(pending);
  }

  private emit(text: string): void {
    const out = redact(text);
    this.write(out.text);
    if (out.hits.length) this.onHits(out.hits, out.severe);
  }
}
