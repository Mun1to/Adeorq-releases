// Adeorq in his Discord activity (META 7).
//
// Rust carries the two lines to Discord's local pipe; deciding WHAT those two
// lines say happens here, in one place, because it is the only part with a
// rule attached: the name of a project he has not published must never end up
// on anyone's Discord. So the default is generic, saying the project name is
// something he turns on by hand, and streaming mode overrides that switch
// without asking. The count of open terminals gives it away to nobody.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import type { Lang } from "./i18n";

export const DISCORD_KEY = "adeorq-discord";

/**
 * Adeorq's own application on discord.com/developers, which is what gives the
 * activity its name and its logo.
 *
 * In the source on purpose. This number identifies the APPLICATION, not the
 * person: it is what tells Discord to draw "Adeorq" with Adeorq's mark, and it
 * ships inside the binary of every game that does this. Asking each user to go
 * and register their own would be asking them to publish a different app that
 * happens to be called the same. So: one id, everyone's activity, one logo,
 * served from the application Munir set up on 2026-07-26.
 */
export const ADEORQ_APP_ID = "1530951552561582100";

export interface DiscordConfig {
  on: boolean;
  /** Almost always ADEORQ_APP_ID; overridable for whoever wants their own. */
  clientId: string;
  /** Off by default, and streaming mode ignores it anyway. */
  showProject: boolean;
}

/**
 * On from the start. What it publishes is deliberately harmless: the app's
 * name, "Programando con agentes" and how many terminals are open. Never the
 * project (that is its own switch, off), never a path, never an account, and
 * streaming mode overrides the lot. A switch nobody ever finds is a feature
 * nobody ever has, and this one shows Adeorq to everyone its user talks to.
 */
export const EMPTY_DISCORD: DiscordConfig = {
  on: true,
  clientId: ADEORQ_APP_ID,
  showProject: false,
};

export function loadDiscord(): DiscordConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(DISCORD_KEY) ?? "{}");
    const saved = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
    return {
      // Only an explicit false counts as off: anything else is somebody who
      // has never opened the setting, and they get it on.
      on: typeof raw.on === "boolean" ? raw.on : true,
      // An empty box means "use Adeorq's own", which is what it means for
      // everyone who never opens that setting.
      clientId: saved || ADEORQ_APP_ID,
      showProject: !!raw.showProject,
    };
  } catch {
    return EMPTY_DISCORD;
  }
}

/** What the app knows about itself right now, before it becomes two lines. */
export interface Presence {
  /** Open terminals, whoever is inside them. */
  panes: number;
  /** The project of the pane he is looking at, if any. */
  project: string | null;
  /** Streaming mode: whatever the switch says, nothing private goes out. */
  stream: boolean;
}

export interface Lines {
  details: string;
  status: string;
}

/**
 * Everything this app ever says on somebody's profile, in one table.
 *
 * Not routed through the app's `t()` on purpose: these five lines are read by
 * strangers, not by the user, so they are worth having in one place where the
 * whole of what Adeorq publishes can be read at a glance, in every language,
 * without chasing a dictionary. They follow the app's language, because a user
 * working in English should not be announcing himself in Spanish.
 */
const SAYS = {
  es: {
    on: (project: string) => `Trabajando en ${project}`,
    generic: "Programando con agentes",
    idle: "Con el taller abierto",
    one: "1 terminal abierta",
    many: (n: number) => `${n} terminales abiertas`,
  },
  en: {
    on: (project: string) => `Working on ${project}`,
    generic: "Coding with agents",
    idle: "Workshop open",
    one: "1 terminal open",
    many: (n: number) => `${n} terminals open`,
  },
} as const;

/**
 * The two lines Discord shows. Exported on its own so the rule can be read,
 * and tested, without a Discord anywhere near it.
 */
export function linesFor(cfg: DiscordConfig, p: Presence, lang: Lang = "es"): Lines {
  const says = SAYS[lang] ?? SAYS.es;
  const named = cfg.showProject && !p.stream && !!p.project;
  return {
    details: named ? says.on(p.project as string) : says.generic,
    status:
      p.panes === 0 ? says.idle : p.panes === 1 ? says.one : says.many(p.panes),
  };
}

export function discordSet(
  clientId: string,
  details: string,
  status: string,
  restart: boolean,
): Promise<void> {
  return invoke("discord_set", { clientId, details, status, restart });
}

export function discordClear(): Promise<void> {
  return invoke("discord_clear");
}

// Discord throttles activity updates to roughly one every fifteen seconds and
// silently drops the rest, so a burst of pane changes waits its turn.
const MIN_GAP_MS = 16_000;
// Re-publishing on a slow beat costs nothing and is what brings the activity
// back if Discord was restarted underneath us.
const REFRESH_MS = 60_000;

/**
 * Keeps the activity in step with the app. `onError` gets the reason the first
 * time it fails and null once it works, so Settings can say what happened
 * instead of failing quietly forever.
 */
export function useDiscordPresence(
  cfg: DiscordConfig,
  p: Presence,
  onError: (message: string | null) => void,
  lang: Lang = "es",
) {
  const last = useRef({ at: 0, details: "", status: "" });
  const timer = useRef(0);
  // An id Discord itself turns down will be turned down every minute for as
  // long as the app is open, so the first refusal parks it until he edits it.
  const rejected = useRef("");
  // The callback changes identity on every render of its owner; keeping it in
  // a ref stops that from restarting the whole effect.
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    window.clearTimeout(timer.current);
    const id = cfg.clientId.trim();
    if (!cfg.on || !id) {
      last.current = { at: 0, details: "", status: "" };
      discordClear().catch(() => {});
      return;
    }
    if (rejected.current === id) return;

    let alive = true;
    const publish = () => {
      const { details, status } = linesFor(cfg, p, lang);
      const changed = details !== last.current.details || status !== last.current.status;
      const since = Date.now() - last.current.at;
      // Nothing new to say, and it was said recently: sending it again only
      // spends the one update Discord allows every so often.
      if (!changed && since < REFRESH_MS) return;
      if (changed && MIN_GAP_MS - since > 0) {
        timer.current = window.setTimeout(publish, MIN_GAP_MS - since);
        return;
      }
      // The clock restarts only when the work itself changed, not when the
      // terminal count moved: "for 40 minutes" should survive opening a pane.
      const restart = details !== last.current.details;
      last.current = { at: Date.now(), details, status };
      discordSet(id, details, status, restart)
        .then(() => alive && report.current(null))
        .catch((e) => {
          if (!alive) return;
          const why = String(e);
          if (/no reconoce/i.test(why)) rejected.current = id;
          report.current(why);
        });
    };

    publish();
    const beat = window.setInterval(publish, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(beat);
      window.clearTimeout(timer.current);
    };
    // Switching the app's language rewrites what the profile says, so it
    // belongs here: it is one of the things that changes the two lines.
  }, [cfg, p, lang]);
}
