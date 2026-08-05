// His own dashboard, read from the cockpit.
//
// munito.dev already holds the things Adeorq was missing: external_windows is
// his real calendar (the deadlines that come from outside, each with its own
// notice period), ideas are his ideas with their state and their unlocking
// condition. Rebuilding any of that here would have created a second copy that
// disagrees with the first by Thursday, so this reads his.
//
// Talking to Supabase over plain fetch instead of pulling in supabase-js: the
// three calls needed are three URLs, and the library would ship a session
// manager that wants to keep the refresh token in localStorage, which is
// exactly what we are avoiding.
//
// SECURITY, the part that matters:
//   · The password is used once, for the sign-in call, and never stored.
//   · The refresh token goes into the Windows Credential Manager (secrets.rs),
//     encrypted by the system under his login. Never a file, never localStorage.
//   · The publishable key below is not a secret: it ships inside his public
//     website. On its own it opens nothing, because every table is fenced by
//     row-level security on auth.uid() = user_id.
//   · Supabase rotates the refresh token on every use, so each refresh writes
//     the new one back into the vault.

import { secretForget, secretGet, secretPut } from "./pty";

const BASE = "https://ijraewpmsgwmxmfgwwae.supabase.co";
const PUBLISHABLE = "sb_publishable_7x34u1r_bNVnDpD45HdG2g_JKLWuW0y";
const VAULT_KEY = "brujula/refresh";
/** Refresh a minute before the token really dies, to survive a slow request. */
const EARLY_MS = 60_000;

export interface Ventana {
  id: string;
  title: string;
  /** ISO date, no time: these are days, not appointments. */
  date: string;
  url: string | null;
  noticeDays: number;
}

export type IdeaStatus = "live" | "parked" | "done" | "discarded";

export interface Idea {
  id: string;
  title: string;
  note: string;
  project: string;
  status: IdeaStatus;
  conditionId: string | null;
}

export interface Condicion {
  id: string;
  text: string;
  status: "far" | "near" | "met";
}

let access: string | null = null;
let expiresAt = 0;

function headers(token?: string): Record<string, string> {
  return {
    apikey: PUBLISHABLE,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Turns Supabase's own error shape into something worth reading. */
async function fail(res: Response): Promise<never> {
  let detail = `${res.status}`;
  try {
    const body = await res.json();
    detail = body.error_description || body.message || body.msg || detail;
  } catch {
    // A body that is not JSON adds nothing to the status code.
  }
  throw new Error(detail);
}

async function keep(json: { access_token: string; refresh_token: string; expires_in: number }) {
  access = json.access_token;
  expiresAt = Date.now() + json.expires_in * 1000 - EARLY_MS;
  await secretPut(VAULT_KEY, json.refresh_token);
}

export async function signIn(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) await fail(res);
  await keep(await res.json());
}

/** True when a stored token could be traded for a live session. */
export async function restore(): Promise<boolean> {
  const saved = await secretGet(VAULT_KEY);
  if (!saved) return false;
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token: saved }),
  });
  if (!res.ok) {
    // A refused token is a dead token: drop it rather than retrying forever.
    await secretForget(VAULT_KEY).catch(() => {});
    return false;
  }
  await keep(await res.json());
  return true;
}

export async function signOut(): Promise<void> {
  access = null;
  expiresAt = 0;
  await secretForget(VAULT_KEY);
}

export function isSignedIn(): boolean {
  return !!access;
}

async function token(): Promise<string> {
  if (access && Date.now() < expiresAt) return access;
  if (!(await restore())) throw new Error("Entra en tu brújula para ver esto");
  return access as string;
}

async function read<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: headers(await token()) });
  if (!res.ok) await fail(res);
  return res.json();
}

export async function ventanas(): Promise<Ventana[]> {
  const rows = await read<Array<Record<string, unknown>>>(
    "external_windows?select=id,title,date,url,notice_days&order=date.asc",
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    date: String(r.date),
    url: (r.url as string) ?? null,
    noticeDays: Number(r.notice_days ?? 0),
  }));
}

export async function ideas(): Promise<Idea[]> {
  const rows = await read<Array<Record<string, unknown>>>(
    "ideas?select=id,title,note,project,status,condition_id&order=updated_at.desc",
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    note: String(r.note ?? ""),
    project: String(r.project ?? "ecosistema"),
    status: (r.status as IdeaStatus) ?? "parked",
    conditionId: (r.condition_id as string) ?? null,
  }));
}

export async function condiciones(): Promise<Condicion[]> {
  const rows = await read<Array<Record<string, unknown>>>(
    "idea_conditions?select=id,text,status",
  );
  return rows.map((r) => ({
    id: String(r.id),
    text: String(r.text),
    status: (r.status as Condicion["status"]) ?? "far",
  }));
}

/**
 * Adds an idea. user_id is not sent: the table defaults it to auth.uid(), and
 * row-level security would reject anything else anyway.
 */
export async function addIdea(title: string, project: string, note = ""): Promise<void> {
  const res = await fetch(`${BASE}/rest/v1/ideas`, {
    method: "POST",
    headers: { ...headers(await token()), Prefer: "return=minimal" },
    body: JSON.stringify({ title, project, note, status: "parked" }),
  });
  if (!res.ok) await fail(res);
}

/** Days from today, negative once it is past. */
export function daysTo(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** How loud a window should look: its own notice period decides, not a guess. */
export function urgency(v: Ventana): "past" | "now" | "soon" | "later" {
  const left = daysTo(v.date);
  if (left < 0) return "past";
  if (left <= Math.min(7, v.noticeDays)) return "now";
  if (left <= v.noticeDays) return "soon";
  return "later";
}
