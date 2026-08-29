# The Adeorq guide (plain English, no jargon)

> English version of `GUIA.md`, rewritten on 1 August 2026 for version 0.9.42.
> It walks through every element on screen: what it is and what it does.

## Contents

0. [Why use Adeorq](#0-why-use-adeorq)
1. [Adeorq in one sentence](#1-adeorq-in-one-sentence)
2. [The TWO bars at the top](#2-the-two-bars-at-the-top)
3. [The nine tabs](#3-the-seven-tabs)
4. [Dashboard (the ◱ tab)](#4-dashboard-the-tab)
5. [Cockpit (the ▦ tab)](#5-cockpit-the-tab)
6. [Canvas (the ⬡ tab)](#6-canvas-the-tab)
7. [Each terminal's header, field by field](#7-each-terminals-header-field-by-field)
8. [The bars that appear inside a terminal](#8-the-bars-that-appear-inside-a-terminal)
9. [Accounts (the ◍ tab)](#9-accounts-the-tab)
10. [Commands (the ⌘ tab)](#10-commands-the-tab)
11. [Settings (the ⚙ tab)](#11-settings-the-tab)
12. [Streaming mode](#12-streaming-mode)
13. [The Foreman](#13-the-foreman)
14. [The Split (several tasks at once)](#14-the-split-several-tasks-at-once)
15. [Right click and tooltips](#15-right-click-and-tooltips)
16. [Keyboard shortcuts](#16-keyboard-shortcuts)
17. [Colour legend](#17-colour-legend)
18. [Glossary](#18-glossary)
19. [Not there yet](#19-not-there-yet)

## 0. Why use Adeorq

If you already have the Claude desktop app, it is a fair question. The reasons,
heaviest first:

**1. New things reach the terminal first.** Opus 5 was usable in the CLI before
the app, and the million-token context took far longer to land there.

**2. You see ALL of your work at once.** Every project in C:\proyectos and every
session, grouped by project, showing which are alive and which are waiting on
you. Without opening anything.

**3. Several at a time, for real.** Nine conversations working in parallel, each
in its own folder, all visible.

**4. Archiving does not eat your work.** The official app's archive can take
uncommitted changes with it, without warning. Adeorq checks first, lists the
files and never deletes anything.

**5. The Foreman sets the board up.** Say "today I want to fix VoCript bugs" and
it proposes which sessions to open and with what brief. You approve.

**6. It is yours.** Your rules, your language, your themes, your skills, your
streaming mode. Built for how you work, not for the average.

**7. It is fast.** Rust and Tauri: about 3 MB, instant start, GPU terminals.

### The map of the window

<svg viewBox="0 0 720 330" width="100%" role="img" aria-label="Map of the Adeorq window">
  <rect x="1" y="1" width="718" height="328" rx="12" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
  <rect x="1" y="1" width="718" height="42" rx="12" fill="currentColor" fill-opacity="0.07"/>
  <text x="18" y="27" font-size="13" fill="currentColor" font-weight="700">Adeorq</text>
  <text x="88" y="27" font-size="12" fill="currentColor" fill-opacity="0.85">Dashboard   Cockpit   Canvas   Guide   Commands   Settings</text>
  <text x="470" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">music</text>
  <text x="534" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Streaming</text>
  <text x="622" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Foreman</text>
  <text x="6" y="58" font-size="11" fill="currentColor" fill-opacity="0.55">1</text>
  <rect x="14" y="62" width="160" height="252" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <text x="26" y="84" font-size="12" fill="currentColor" font-weight="600">Workspaces</text>
  <rect x="26" y="96" width="136" height="30" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="34" y="115" font-size="11" fill="currentColor" fill-opacity="0.8">Orquio</text>
  <rect x="130" y="103" width="24" height="16" rx="5" fill="currentColor" fill-opacity="0.2"/>
  <rect x="26" y="132" width="136" height="22" rx="6" fill="currentColor" fill-opacity="0.05"/>
  <text x="36" y="147" font-size="10" fill="currentColor" fill-opacity="0.7">yesterday's session</text>
  <rect x="26" y="160" width="136" height="22" rx="6" fill="currentColor" fill-opacity="0.05"/>
  <text x="36" y="175" font-size="10" fill="currentColor" fill-opacity="0.7">session waiting</text>
  <text x="26" y="206" font-size="11" fill="currentColor" fill-opacity="0.55">2</text>
  <rect x="186" y="62" width="340" height="122" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <rect x="186" y="62" width="340" height="24" rx="10" fill="currentColor" fill-opacity="0.09"/>
  <text x="198" y="79" font-size="11" fill="currentColor" fill-opacity="0.85">session   79%   Opus 5 high   C:\proyectos\Orquio</text>
  <text x="198" y="118" font-size="11" fill="currentColor" fill-opacity="0.7">the agent working in here</text>
  <rect x="186" y="192" width="340" height="122" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <rect x="186" y="192" width="340" height="24" rx="10" fill="currentColor" fill-opacity="0.09"/>
  <text x="198" y="209" font-size="11" fill="currentColor" fill-opacity="0.85">terminal</text>
  <text x="336" y="252" font-size="11" fill="currentColor" fill-opacity="0.55">3</text>
  <rect x="538" y="62" width="168" height="252" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <text x="550" y="84" font-size="12" fill="currentColor" font-weight="600">Skills</text>
  <rect x="550" y="96" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="113" font-size="10" fill="currentColor" fill-opacity="0.75">/frontlaxweb</text>
  <rect x="550" y="128" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="145" font-size="10" fill="currentColor" fill-opacity="0.75">/fin</text>
  <text x="550" y="206" font-size="11" fill="currentColor" fill-opacity="0.55">4</text>
</svg>

1. **The app bar**: the seven views, today's goals, the Pulse, music,
   streaming mode and the Foreman.
2. **Workspaces**: your projects and their sessions.
3. **The terminals**: each box is an agent or a console at work.
4. **Skills**: your commands, to drag onto a terminal.

## 1. Adeorq in one sentence

Your vibe coding workshop: one window where you see ALL your projects and ALL
your Claude Code sessions, and from which you open them, resume them and talk
to them, without depending on the Claude desktop app.

The extra edge of working through terminals: new model features land in the CLI
BEFORE they reach the desktop app. Opus 5 shipped in the terminal first, and
things like the million-token context took much longer to arrive in the app.

**How to open it**: Adeorq is installed like any other Windows program (Start
menu, pinnable) and updates itself. Developer mode (`pnpm tauri dev`) is a
separate window, only for when the app is being built; both can run at once.

### The first time you open it

A four-question welcome shows up, and none of them is decoration:

1. **Your name**, for the Dashboard greeting.
2. **Where your projects live**: the folder that is read to know which projects
   you have. Every subfolder of it is one, and anything you open outside it
   lands in the **Loose** drawer. Picking it tells you how many projects it can
   see in there, so you know at once whether it is the right one.
3. **Which clients you use**, out of the ones it finds installed. The ones you
   do not tick will never be suggested as a fallback when you run out of week.
4. **The look**: the theme, applied as you pick it.

At the end it offers a **tour** pointing at each part of the window. Both can be
replayed any time from **Settings › Help**, and the folder and the name are
changed in **Settings › Adeorq › You and your projects**.

## 2. The TWO bars at the top

There are two bars up there and they are different things.

### 2.1 The app bar (one only, at the very top)

| Element | What it is |
|---|---|
| **Logo + "Adeorq"** | The brand, nothing to click. |
| **◱ Dashboard · ▦ Cockpit · ▤ Agenda · ⬡ Canvas · ◍ Accounts · ⌘ Commands · ⚙ Settings** | The seven views of the app. |
| **Number next to "Cockpit" or "Canvas"** | How many terminals are open there right now. |
| **The Goals button** | Opens a floating panel with what you want to close out today. Type it, tick it off with a click anywhere on the row (no tiny checkbox to aim for), and it is saved to a file for the day, not localStorage, so an agent can also tick it off once it finishes what you asked. Drag it anywhere and fold it down to just the counter (say, 2/3). |
| **The Pulse** | The pill showing what Adeorq and its agents are using in RAM right now, and how many agent processes are running. Click to open the detail: Adeorq's memory versus the whole machine's. It turns amber when Adeorq itself is the one squeezing memory and red when the whole machine is under pressure, so you know whose fault it is before opening Task Manager. |
| **The music strip** | Only shows when something is playing. Title, artist, ⏮ previous, ❚❚/▶ pause and ⏭ next. Volume stays in Windows' own mixer. |
| **○ Streaming / ◉ Streaming on** | The streaming shield: masks paths, personal data and any key the terminals print. Ctrl+Shift+E, details in section 12. |
| **✦ Foreman** | Summons the orchestrator overlay. Ctrl+Shift+A. |

Above all of that, a blue **update bar** appears when a new version of Adeorq is
out: "Update now" downloads it and "Restart" puts it live. A Windows
notification arrives too, in case the app is minimised.

### 2.2 The bar of EACH terminal (one per pane)

Every pane carries its own header with the session name, the context meter, the
model and the folder. Field by field in [section 6](#6-each-terminals-header-field-by-field).

Rule of thumb: if it says "Adeorq" and shows tabs, it is the app bar. If it
shows a session name and a folder, it is a terminal's bar.

## 3. The nine tabs

- **◱ Dashboard**: your numbers, the Foreman, hot projects, new project,
  missions and the focus.
- **▦ Cockpit**: where the work happens. Projects left, terminals centre,
  skills right.
- **▤ Agenda**: the whole day in one place: your calendar, your saved ideas,
  today's goals and the next steps from `docs/METAS.md`.
- **⬡ Canvas**: the free board, with terminals you move and wire together.
- **◍ Accounts**: every agent CLI's accounts in one place, grouped by
  program, with which one is signed in and how much you have left.
- **⌘ Commands**: the searchable cheat sheet for Claude, Antigravity and your
  own skills.
- **⚙ Settings**: language, theme, font size, updates, your quota and, under
  Help, this very guide (it stopped being a tab up top).

Terminals do NOT close when you change tabs: they stay alive.

## 4. Dashboard (the ◱ tab)

- **Three numbers**: sessions live right now, sessions this week, and projects
  in `C:\proyectos`.
- **✦ Foreman card**: tell it the goal of the day, it proposes the board.
- **Hot projects**: the six busiest this week. Click one to jump to it.
- **＋ New project**: creates the folder with `AGENTS.md`, `docs/METAS.md`,
  `.gitignore` and git, ready for its first session. The `AGENTS.md` it writes
  is a short, neutral starting point — drop your own rules in
  `%LOCALAPPDATA%\Adeorq\plantilla-agents.md` (write `{name}` where the project
  name should go) and every new project will be born with those instead.
- **⚑ Mission**: describe what you want, pick a project and roles (Frontend,
  Backend, Security, Design): one Claude per role, each with its brief, all
  coordinating through the project's `BUZON.md`. Each one proposes a plan and
  waits for your OK.
- **The focus**: the only real deadline in the system, kept in sight.

## 5. Cockpit (the ▦ tab)

### 5.1 Left column: workspaces

- **Search box**: filters by project name or session title.
- **"Workspaces" row**: **⊟ n** shows or hides archived sessions, **↻** re-reads
  everything now (it refreshes itself every 45 seconds).
- **Each project card**: its **logo** in a rounded square, Discord style, found
  inside the project's own folder (`brand/`, `assets/`, `public/`,
  `web/public/`, `src-tauri/icons/`, or the icon you gave the folder in
  Explorer); with none, its initials in the project's colour. Right-click the
  card to set one by hand, remove it, or search again. Then the name (click to
  expand its sessions), a **green dot** if it has a session open right now, a
  **blue pill** with sessions this week and a **red pill** with how many are
  waiting on you.
- **Hover buttons**: **⧉** opens its sessions at once (up to the cap in
  Settings, 12 by default), **✦** a new Claude, **>_** a PowerShell console,
  **AG** Antigravity (`agy`) in a terminal.
- **"no recent sessions" divider**: quiet projects sink below it.
- The right border drags to widen the column and the width is remembered.

### 5.2 Each session

**▣ n on a row**: that session has that many subagents working inside it right
now, counted from the transcript (dispatched minus returned), so it is exact.
It used to be visible only inside an open pane.

**Why were there dozens of "(sin título)" sessions?** An Adeorq bug, fixed on
26 July 2026: the usage panel asks for your quota with `claude -p /usage`, which
costs nothing but filed a saved session every time, 59 of them in one night. The
part watching the plan was littering the part showing the work. Each probe now
carries its own id and its file is deleted as soon as the answer is read, and
such sessions are filtered out of the list even if they linger on disk.

Dot colours: green (open now), amber (a question or an offer waiting), blue
(left halfway), grey (nothing pending). The whole row is tinted **amber** when
Claude ended by asking you something and **reddish** when it left you a
multiple-choice question and is stopped until you answer.

**Click a session = it resumes in a terminal**, with all its memory.

The **⋯** button (or right click) gives three actions:

- **✎ Rename**: saved where the official app keeps titles, so both agree.
- **▣ Move to group…**: manual groups inside the project; the × dissolves a
  group without touching its sessions.
- **⊟ Archive**: hides it. Before doing it, Adeorq checks whether the project
  has **uncommitted work** and lists the files. Archiving here never deletes
  anything and can be undone (**⊟** button, then ↩).

### 5.3 Centre: the terminal grid

Terminals sit in columns (up to three) and stack inside each one. Each pane is
a real terminal: **✦ Claude**, **◈ Antigravity** or **>_ shell**. Every agent
Adeorq launches starts in auto mode (accepts edits, still asks about risky
commands); Shift+Tab inside cycles the mode.

Copy and paste work like any app: Ctrl+V pastes (right click too), Ctrl+C
copies when there is a selection and still interrupts when there is not.
Pasting an image works: it is saved to disk and the agent gets its path.

### 5.4 Right column: your skills

Your own commands from `~/.claude/skills`. **Drag one onto a terminal** to drop
it into its prompt, or click to send it to the focused pane. The ▸ button folds
the panel away.

## 6. Canvas (the ⬡ tab)

The Cockpit gives you a tidy grid. The Canvas gives you an infinite board:
terminals anywhere, resized by hand, and above all **wired together**.

The Canvas keeps its OWN terminals: the Cockpit's stay where they are.

- **Top bar**: pick a project and drop in **✦ Claude**, **>_ Terminal** or
  **◈ Antigravity**.
- **Move a card** by its header; inside, the mouse belongs to the terminal.
  **Resize** from the corners when selected. **Pan** by dragging the
  background, **zoom** with the wheel (inside a terminal the wheel scrolls).
- **⛶** centres and zooms on a card; **◫** opens a sibling console in the same
  folder, already wired.
- **The arrows**: drag from the right edge of one card to the left edge of
  another. **Click the arrow** to write the brief (what the second agent should
  do with the first one's output) and to tick "send on its own".
- When the first agent **finishes its turn**, a relay appears at the bottom:
  **Hand it over** types the brief PLUS the first agent's last answer into the
  second one and sends it. **✎** types it without sending.

The answer is read from the session transcript (clean prose), not from the
screen. If you open two brand new terminals in the same folder, the relay can
read the wrong one: for chaining, prefer one per project or resumed sessions.

## 7. Each terminal's header, field by field

| Element | What it means |
|---|---|
| **The icon** (Claude's burst, the orbiting arrow or the console mark) | What runs inside: Claude Code, Antigravity or a console, and whether it is still alive: the mark goes grey when the program ends. That last bit used to be a separate green square; the mark carries it now. The name is in the tooltip. |
| **The name** | The session title, the same one in the left list. |
| **▣ n** | Subagents working right now inside that session, counted in the transcript (dispatched minus returned), so it is exact. Only shows while there are any. |
| **The bar + %** | The context: how full its working memory is. Hover for exact tokens; it turns amber past 80%. |
| **"Opus 5" + "high"** | The model doing the thinking and its effort. Change them inside with `/model` and `/effort`. |
| **The folder** | Where that agent works. If it is not the project folder, that agent cannot see the project's code. |
| **○ / ◉** | Blurs THIS terminal only, for streaming. |
| **◫ / ⬓** | Split: a console beside it / below it. |
| **⛶ / ❐** | Full screen for that pane, and back. |
| **×** | Close the terminal (the conversation is kept). |

**The glows**: the pane you are working in carries a halo in the theme's
colour; when an agent finishes its turn and waits for you, its pane lights up
with a **blue glow** until you open it.

## 8. The bars that appear inside a terminal

1. **Blue question bar**: when the agent asks with a numbered menu, real
   BUTTONS appear. It disappears on its own when the question does.
2. **Amber reconnect notice**: when your access expires, the **Reconnect**
   button does what `/login` does.
3. **Plain-language notes**: when the agent is compacting the conversation or
   is busy and what you type is queued.

## 9. Accounts (the ◍ tab)

Every agent CLI keeps everything it owns (your login, your history, its
settings) in one folder. Point it at a different folder and it behaves like a
clean install: another login, other limits. That is what an account is here.
Your usual one is never touched; the others get a folder of their own inside
Adeorq.

Which programs it knows, with the variable that moves their folder, each one
checked on this machine on 26 July 2026:

| Program | Several accounts? | How | Shows what you spent? |
|---|---|---|---|
| Claude Code | Yes | `CLAUDE_CONFIG_DIR` | Yes, and for free |
| Codex | Yes | `CODEX_HOME` | No |
| Gemini CLI | Yes | `GEMINI_CLI_HOME` | No |
| Qwen Code | Yes | `QWEN_HOME` | No |
| Pi | Yes | `PI_CODING_AGENT_DIR` | No |
| GitHub Copilot | No | uses `~/.copilot`, cannot be moved | No |
| Crush | No | no variable found | No |
| opencode | No | no variable found | No |
| Amp | No | no variable found | No |
| Antigravity (`agy`) | No | keeps its state in `~/.gemini` | No |
| Cursor | No | no variable found | No |

The first five can be multiplied because each variable was checked here: Codex
moved its `auth.json` when the variable moved, and Gemini and Qwen say so in
their own code. "No variable found" means exactly that, and adding one later is
a one-line change. Saying "I don't know" beats guessing a variable name and
having an account write into the wrong folder.

**Pi** (pi.dev) joined on 1 August 2026 under the same bar: its `config.ts`
shows `getAgentDir()` reading `PI_CODING_AGENT_DIR` and falling back to
`~/.pi/agent`, and its login writes `auth.json` inside that same folder. Mind
one detail that is easy to get wrong: the folder is `.pi/agent`, not plain
`.pi`, so looking for the login in `.pi` would always report "signed out". It
is an agent that talks to several providers (Claude Pro/Max, ChatGPT, Copilot),
which is why it is **not offered as an automatic fallback** when you run out of
week: if it is signed in with your own Claude account, sending you there would
be sending you to the same exhausted quota.

⚠ Two install warnings that cost a check: the npm packages named `agy`,
`antigravity-cli` and `cursor-agent` do NOT belong to those companies (one
calls itself a "placeholder", another is a third party's), so use their
official installers. And `opencode` through pnpm leaves a 0-byte .exe on
Windows that will not run; its own installer works.

**Antigravity's `agy`** installs with `irm
https://antigravity.google/cli/install.ps1 | iex` and lands in
`%LOCALAPPDATA%\agy\bin`. If it ever "disappears", look there first: on 26 July
2026 the folder had been deleted while its PATH entry stayed, so Windows kept
looking somewhere that no longer existed.

Anything you do not have installed sits at the bottom under "Not installed",
with the command to install it, and moves up on its own once it appears.

Each card shows the name you gave it and whether it is signed in. Claude's also
show its plan and the session and week bars with their reset time, free because
`/usage` is a local slash command. **The other programs publish no usage on the
machine**, so their cards say so rather than invent a bar: that is their limit,
not Adeorq's.

⚠ Antigravity is a special case: it keeps its state inside `~/.gemini` and no
variable to move it turned up, so it can only have one account. Its own section
says so.

You can **add** an account (name it, it gets its folder and a terminal opens for
the login), make one the **default** for new terminals, open a **terminal with a
specific one**, **rename** and **remove** (which deletes only that account's
folder, never `~/.claude`).

The account is decided when the terminal is born and cannot change afterwards:
the CLI reads that folder once, at start. A pane that is not on the main account
carries its name in a blue pill in the header, and a restored board brings every
terminal back to its own account.

⚠ Several accounts of YOUR OWN, no problem. Rotating other people's accounts to
stretch limits breaks Anthropic's terms, and what you risk is losing the account.

### Vibecoding with OpenRouter (Aider)

Inside **Accounts → API keys** there is an OpenRouter card: a pay-per-token key
that unlocks models from many providers, including ones with no CLI of their
own (Kimi, DeepSeek, Grok…). Once that key is saved, a second card appears
below it, **Vibecoding**, which opens a real terminal of
[Aider](https://aider.chat) — the only CLI in the house that accepts an
OpenRouter model with a plain `--model openrouter/<whatever>` — pointed at
whichever model you type in there (default: `moonshotai/kimi-k3`).

**How to use it from the card**: paste the OpenRouter key, type the model, and
press the button. The first time it says "Install Aider first": it installs it
with `uv tool install aider-chat`, no need to repeat that afterwards. Every
time after, it says "Open terminal" and opens one with the key already set.

⚠ **If you open Aider by hand instead of through the button**, two things
Adeorq handles for you that fail silently if you forget them:
- **You always have to tell it the model**: `aider --model openrouter/<model>`.
  Without `--model`, Aider grabs the first API key it finds lying around in
  your environment (Gemini, Anthropic…) and tries that provider's own default
  model, which may not even exist anymore, and never touches OpenRouter at
  all.
- **The key has to be in `OPENROUTER_API_KEY`** in that specific terminal
  (`$env:OPENROUTER_API_KEY = "sk-or-v1-…"` in PowerShell, lasts only that
  window). The card pulls it straight from the Credential Manager right before
  starting the process; a plain terminal does not have it unless you set it
  yourself.

---

## 10. Commands (the ⌘ tab)

66 Claude Code and Antigravity commands plus your skills, read from disk.
Search by what you want to do ("undo", "quota", "context"), filter by tool, and
click one to type it into the active terminal. You press Enter, so nothing ever
runs by accident. The Foreman knows this same list.

## 11. Settings (the ⚙ tab)

- **Language**: Spanish or English, the whole app including this guide.
- **Theme**: Midnight blue, Graphite, Violet, Forest, Crimson, Amber, Ocean, Neon, Nord, Cyberpunk, Dracula, Tokyo Night, Emerald, Sunset, Matrix, Synthwave '84, Solarized Dark, Rosé Pine, Gruvbox, One Dark, Catppuccin Mocha, Volcano, Turquoise and Light.
- **Terminals**: auto-fit the type to each terminal (on by default, so a
  crowded pane shrinks its type until the line fits again and the size you pick
  becomes a ceiling), font size (11 to 22 px, applied live) and how many
  sessions the ⧉ button opens (2 to 20; each one is about 200 MB).
- **You and your projects** (under Adeorq): your name and the projects folder.
  Changing it re-reads the whole list, so it is how you move Adeorq to another
  working folder without reinstalling anything.
- **Help**: "First steps" replays the welcome, or just the tour; below it
  lives this very guide (it stopped being a tab up top), and next to it a
  link to the web documentation, which updates without waiting for a new
  app version.
- **Updates**: installed version and a button to check now; it also checks on
  start and every 6 hours.
- **Your quota**: the button types `/usage` into the active terminal, which is
  the only place that number lives.

## 12. Streaming mode

Built so you can go live without giving away your keys:

1. **Covered, not blurred**: paths, the sidebar footer and the Agenda's content
   get a solid bar. A soft blur over monospaced text can be undone from a
   recording. **Session titles and today's goals are NOT covered**: they are the
   thread of what you are doing, and without them the stream makes no sense.
2. **Hold Alt to peek**: hovering no longer reveals anything (it used to, which
   on a stream meant a mouse move exposed it). Let go and it covers again.
3. **Shield inside the terminals**: whatever the agent prints is checked BEFORE
   it is painted, and anything key-shaped is replaced with ●●●: GitHub tokens,
   Anthropic/OpenAI/AWS/Google keys, Supabase JWTs, passwords inside connection
   strings, `API_KEY=...` variables, your email and your username in paths. The
   agent still receives the real text; only the view is masked.
4. **Ctrl+Shift+P, the curtain**: covers the whole window instantly. If the
   shield catches a key, the curtain raises on its own in case more follows.
5. **The bar naming what it masked.** Masking happens BEFORE the pane paints,
   so if the bar appears, nothing reached the stream. The advice therefore
   depends on what fired: a **red bar** (key, token, password) means it never
   showed but that key is still loose wherever it was stored, so check where it
   came from; a **blue bar** (your email, a path with your username) means it
   is masked and there is nothing to do, and it leaves on its own after nine
   seconds. Both used to say "treat it as burnt and rotate it", which means
   nothing for a folder. Fixed 26 July 2026.

What it does NOT do: it cannot fix what was printed before you turned it on, it
does not cover your browser or Windows notifications, and no pattern list is
ever complete. The single most effective measure is still a **30 second delay
in OBS**. The full reasoning lives in `docs/EMISION.md`.

## 13. The Foreman

Your orchestrator. You write what you want, it proposes a plan, and NOTHING
runs without your OK. It lives in the Dashboard card and in the Cockpit overlay
(Ctrl+Shift+A).

Under the hood: your request goes to one `claude -p` call (your Max
subscription, no API keys) together with the real list of your projects,
sessions, skills and commands. It returns a plan in a fixed format, and Adeorq
checks every action against what actually exists: anything unknown is shown
**struck through** and never runs.

It picks only the sessions that match the goal of the day, and never resumes a
session that would open OUTSIDE its project folder (those cannot see the code).

Every action that opens an agent shows **which brain it opens with**, and above
the button you get what the whole plan weighs: «Opens 6 agents · 2 opus + 4
sonnet · ×22». Not an invoice (a subscription has no invoice), just the only
comparable figure there is, with haiku as 1. That brain goes through the same
router as the brief card, so it looks at your real quota: with the week spent, a
six-agent plan gets cheaper wherever it safely can, and says so. The one thing
it never cheapens is judgement work, where saving on brains costs you the whole
job twice.

### Write the brief: the other button

This one builds no board. You give it one sentence and it hands back **the brief
properly written** and **who should get it**, then waits.

The card shows the brief (editable), the destination (CLI, account, model,
effort) and, listed one by one, **why that one**. Three buttons: put it in the
terminal in front of you (it sets the model and effort and types the brief
without sending it), open a new terminal already born that way, or copy it.

How the brain is picked: first what the work demands (a mechanical errand goes
to **haiku**, everyday craft to **sonnet**, anything needing judgement, security,
audits, review, architecture, to **opus**). Size never raises the model;
**consequence** does, meaning a failure that could go unnoticed and cause harm
later. Then it looks at your real weekly quota, account by account: it picks the
one with the most left, makes things cheaper where cheaper is fine, and if no
Claude account has any week left it offers another CLI **among the ones you have
connected**, with the fallback still on screen. What it never does is cheapen an
audit to save quota, because redoing that work costs more than the difference.

You can always override it: the three brains show their weight (`haiku ×1`,
`sonnet ×3`, `opus ×5`, the list-price ratios). Note that **only Claude
publishes how much is left**, so for other CLIs Adeorq knows whether they are
connected, not how much they have. Settings → Alerts controls how much it says
about the model you already have running.

## 14. The Split (several tasks at once)

The three-branch button next to the Assistant. The Assistant solves ONE thing;
this one solves a whole day.

Paste your tasks, one per line, or tick the ones you already wrote down: your
**goals for today** and the **ideas your agents left in the Agenda** show up
right there with a checkbox, so you do not have to copy them by hand.

Hitting Split does this, in order:

1. **One single call** classifies EVERY task and hands out the files. One call,
   not one per task, and it also lets the model see the whole list, which is the
   only way it can tell that two tasks would collide.
2. **The code picks each destination**: client, account, model and effort,
   looking at what you have installed, which accounts are signed in, how much of
   the week is left and **which plan you pay for**. That costs no tokens.
3. **The shared sheet is written** into the project's `BUZON.md`: who does what,
   which files belong to whom, and where to report back. If `.gitignore` did not
   cover it, the line is added, because that file is never committed (rule Q).
4. **They all open**, staggered, each with its brief already written in its own
   client's language: skills (`/frontlaxweb`) are only offered to Claude Code,
   because that slash does nothing in the others.

Before the final button you see what the batch weighs ("Opens 4 agents · 1 opus
+ 3 sonnet · ×14"), and the warnings: if two tasks go to the same project with
no files assigned, it says so, because two agents on one file are slower than
one after the other.

**The paid plan works like the quota does**: downwards only, and never on
judgement work. With no subscription it will not suggest opus for an errand, but
an audit still comes out as opus, because redoing it costs more than the turn.

## 15. Right click and tooltips

Adeorq uses its own menus, not the browser's: right click a terminal (copy,
paste, split, maximise, blur, close), a project (new Claude, terminal,
Antigravity, open all) or a session (resume, rename, group, archive). Hovering
almost anything explains what it is and its shortcut.

## 16. Keyboard shortcuts

| Shortcut | What it does |
|---|---|
| Ctrl+Shift+T | New terminal |
| Ctrl+Shift+→ | Split the focused pane right |
| Ctrl+Shift+↓ (or D) | Split it down |
| Ctrl+Shift+F | Maximise or restore it |
| Ctrl+Shift+A | Call or dismiss the Foreman |
| Ctrl+Shift+E | Streaming mode |
| Shift+Tab | Change permission mode INSIDE Claude |

### On the canvas

These **can be changed** under Settings → Canvas shortcuts. They only fire with
the canvas in front and the focus outside a terminal: while you type, the keys
belong to whoever is typing.

| Shortcut | What it does |
|---|---|
| Alt+C / Alt+T / Alt+G | Open a Claude / a terminal / an Antigravity |
| Alt+N / Alt+L / Alt+I | Place a note / a localhost window / the gallery |
| Ctrl+A | Pick the whole canvas |
| Esc | Drop what is picked; with nothing picked, drop the tool |
| Del | Delete what is picked (asks once) |
| Alt+0 | Fit everything on screen |
| V M P F L R O T E | Hand, lasso, pencil, arrow, line, box, ellipse, text, eraser |
| Ctrl+Z | Undo the last stroke (only with a tool active) |

They use Alt rather than Ctrl because inside a terminal Ctrl+letter belongs to
the program running there: Ctrl+C interrupts Claude, Ctrl+R searches history.

**With the mouse:** dragging with the **right button** lassoes pieces and
drawing at once, with no trip to the toolbar. Hold Shift to add to what you
already had. A plain right-click still opens the add menu.

## 17. Colour legend

- **Green**: alive right now.
- **Amber**: waiting for you (a pending question, or context over 80%).
- **Red**: stopped until you answer, or a warning worth reading.
- **Theme blue**: what is selected or focused.
- **Blue glow on a pane**: that agent finished its turn.
- **Grey**: nothing pending.

## 18. Glossary

- **Terminal**: a text window where a program lives.
- **Pane**: each terminal box inside the Cockpit.
- **Session**: a Claude Code conversation saved on disk, resumable months later.
- **Context**: the working memory of that conversation, everything the model
  has in front of it. When it fills up, older parts get compressed and detail
  is lost.
- **Tokens**: the chunks that text is measured in; a normal word is one or two.
- **Window**: the maximum context of that model (200,000 tokens normally,
  1,000,000 for the long-context ones).
- **Effort** (low, medium, high, max): how hard it thinks before answering.
- **Auto mode**: the agent applies its edits without asking file by file, but
  still asks about risky things.
- **Subagent**: a helper the agent dispatches for a side task. That is what ▣
  counts.

## 19. Not there yet

- **Saving the canvas layout**: positions and arrows are lost when Adeorq
  closes (the terminals do not survive a close either).
- **Internal sessions of Antigravity and other CLIs** (Codex, Gemini) are not
  listed: each one stores its data its own way.
- **A kanban that dispatches agents, swarm missions and a CLI router**: parked
  in `docs/METAS.md`, each with its unlock condition.
