# Adeorq guide (no jargon)

> Reviewed on 3 November 2026 against version 0.9.239.
> It goes screen by screen: what you see, what it does and what it does not do. If you
> only want one part, jump from the contents.

## Contents

0. [Why use Adeorq](#0-why-use-adeorq)
1. [What Adeorq is](#1-what-adeorq-is)
2. [The two bars at the top](#2-the-two-bars-at-the-top)
3. [The seven tabs](#3-the-seven-tabs)
4. [Dashboard](#4-dashboard)
5. [Cockpit](#5-cockpit)
6. [Chat](#6-chat)
7. [Decisions](#7-decisions)
8. [Canvas](#8-canvas)
9. [The header of each terminal](#9-the-header-of-each-terminal)
10. [What appears inside a terminal](#10-what-appears-inside-a-terminal)
11. [Profile](#11-profile)
12. [Accounts](#12-accounts)
13. [Agenda](#13-agenda)
14. [Memory](#14-memory)
15. [Commands](#15-commands)
16. [Settings](#16-settings)
17. [What an outside program can do](#17-what-an-outside-program-can-do)
18. [The Foreman and the Split](#18-the-foreman-and-the-split)
19. [On your phone](#19-on-your-phone)
20. [Streaming mode](#20-streaming-mode)
21. [Updating without losing your terminals](#21-updating-without-losing-your-terminals)
22. [Windows, Linux and Mac](#22-windows-linux-and-mac)
23. [Right click and tooltips](#23-right-click-and-tooltips)
24. [Keyboard shortcuts](#24-keyboard-shortcuts)
25. [Colour legend](#25-colour-legend)
26. [Where your things are kept](#26-where-your-things-are-kept)
27. [Glossary in plain words](#27-glossary-in-plain-words)
28. [Frequently asked questions](#28-frequently-asked-questions)
29. [What it does not do yet](#29-what-it-does-not-do-yet)

---

## 0. Why use Adeorq

Adeorq is a window where you work with the programming agents you already use
(Claude Code, Codex, Gemini and the rest) in real terminals, with all your
projects one click away. These are the reasons, heaviest first:

**1. New things reach the terminal first.** Opus 5 could be used in the terminal
before the desktop app, and the million-token context took quite a bit longer to
get there. Working through terminals, you get new things the day they come out.

**2. You see all your work at once.** Your projects and all their sessions, sorted
by project, with which ones are alive and which ones are waiting for you.

**3. Several at a time, for real.** You can have many conversations working in
parallel, each in its own folder, and see which one has finished without opening
them one by one.

**4. Archiving does not delete your work.** Before archiving a session, Adeorq
checks whether the project has changes not saved in git and shows them to you.
Archiving never deletes anything and can be undone.

**5. It splits the work and watches your quota.** The Foreman sets up the board from
one sentence, and picks the model and the account according to what you have left
on each subscription. You give the OK.

**6. It is yours.** Your language, your themes, your background, your skills, your
canvas shortcuts, your accounts and the parts of Adeorq you want to use. And
everything it saves lives on your computer.

**7. It is light.** It is built in Rust with Tauri: the installer weighs a few
megabytes, it starts instantly and the terminals are drawn with the graphics card.

### The map of the window

<svg viewBox="0 0 720 330" width="100%" role="img" aria-label="Map of the Adeorq window">
  <rect x="1" y="1" width="718" height="328" rx="12" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
  <rect x="1" y="1" width="718" height="42" rx="12" fill="currentColor" fill-opacity="0.07"/>
  <text x="18" y="27" font-size="13" fill="currentColor" font-weight="700">Adeo</text>
  <text x="62" y="27" font-size="11" fill="currentColor" fill-opacity="0.85">Dashboard  Cockpit  Chat  Decisions  Canvas  Profile  Settings</text>
  <text x="452" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Pulse</text>
  <text x="510" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">music</text>
  <text x="580" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Streaming</text>
  <text x="654" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">orb</text>
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
  <text x="198" y="79" font-size="11" fill="currentColor" fill-opacity="0.85">session   79%   Opus 5 high   Orquio</text>
  <text x="198" y="118" font-size="11" fill="currentColor" fill-opacity="0.7">the agent working in here</text>
  <rect x="186" y="192" width="340" height="122" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <rect x="186" y="192" width="340" height="24" rx="10" fill="currentColor" fill-opacity="0.09"/>
  <text x="198" y="209" font-size="11" fill="currentColor" fill-opacity="0.85">terminal</text>
  <text x="336" y="252" font-size="11" fill="currentColor" fill-opacity="0.55">3</text>
  <rect x="538" y="62" width="168" height="252" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <text x="550" y="84" font-size="12" fill="currentColor" font-weight="600">Usage · Skills · Files</text>
  <rect x="550" y="96" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="113" font-size="10" fill="currentColor" fill-opacity="0.75">/frontlaxweb</text>
  <rect x="550" y="128" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="145" font-size="10" fill="currentColor" fill-opacity="0.75">/fin</text>
  <text x="550" y="206" font-size="11" fill="currentColor" fill-opacity="0.55">4</text>
</svg>

1. **The app bar**: Adeo, the seven tabs, your goals, the Pulse, the music, streaming mode and the Foreman's orb.
2. **Workspaces**: your projects and, inside them, their sessions.
3. **The terminals**: each box is an agent or a console at work.
4. **The strip on the right**: your usage, your skills, the project's files and a browser.

---

## 1. What Adeorq is

Your vibe coding workshop: one window where you see all your projects and all your
sessions, and from which you open them, resume them and talk to them, without
depending on any provider's desktop app. Adeorq does not include or resell any
model: it uses the subscriptions and keys you already have.

**How to install it.** On Windows it is a normal program (Start menu, can be pinned
to the taskbar). On Linux there are AppImage, `.deb` and `.rpm`; the Mac is covered
in [section 22](#22-windows-linux-and-mac). When there is a new version it tells you
and it installs with one click: what happens to your open terminals is in
[section 21](#21-updating-without-losing-your-terminals).

### The first time you open it

A welcome of six screens appears, and you can **Skip** whenever you like:

1. **Welcome to Adeorq**: what you are called (for the greeting) and the language.
2. **Where your projects live**: the folder that is read to find out which projects
   you have. Each subfolder of it is one. When you pick it, it tells you how many it
   sees inside. If you do not keep them in a single folder, **They are not all in
   one folder**.
3. **Your agents**: you tick the programs you use, from the ones it finds
   installed, and you can **Pick up the sessions you already have**.
4. **What do you want to use?**: the parts of Adeorq you want switched on (Cockpit,
   Canvas, Memory and Chat). It is explained in [section 16](#16-settings).
5. **The look**: the theme, which is applied while you choose it.
6. **Done**: a summary. **Just go in** or **Show me around**, which launches a tour
   pointing at each part of the window.

Everything can be repeated whenever you want in **Settings › Help**. Your name and
the projects folder are changed in **Settings › Adeorq › You and your projects**.

---

## 2. The two bars at the top

There are two bars at the top and they are different things. A rule so you do not
get mixed up: if Adeo and the tabs are there, it is the app bar; if it shows the
name of a session, it is the bar of a terminal.

### The app bar (at the very top, only one)

From left to right:

| Element | What it is |
|---|---|
| **Adeo, the mascot** | It is the notification bell and stands alone, without the app's name next to it. Its pose tells you the most urgent thing going on, in this order: it calls you if a terminal is waiting for you, is left in doubt if a decision is waiting for you, celebrates if someone finished without you having seen it, frets if a scheduled order has stopped, types if your agents are working, dances if music is playing, stays still if nothing is going on and sleeps if no terminal is open. If you click it, it hops, and on the third click in a row a heart comes out. The number it carries on top is the notices you have not seen. Clicking it opens **Notifications**, with which terminal it is, whether it "finished" or "is waiting for you" and how long ago; a row takes you to that terminal. **The list empties itself**: what was waiting for you goes when you answer it or close the terminal, and what finished goes when you close the list or enter that terminal. |
| **The seven tabs** | Dashboard, Cockpit, Chat, Decisions, Canvas, Profile and Settings. If the window is narrow they shrink to the icon and the name shows when you hover. They are explained in [section 3](#3-the-seven-tabs). |
| **A number on a tab** | On Cockpit and Canvas, how many terminals you have open there. On Decisions, how many are waiting for you (in amber). |
| **Today's goals** | An icon that opens a floating panel with what you want to get closed today. You can drag it wherever you like, fold it down to just the counter (for example 2/3) and close it with Esc. More in [section 13](#13-agenda). |
| **The Pulse** | A pill with three figures: what Adeorq and its agents use in CPU, in memory (RAM) and how many agents are alive (AG). It turns amber when Adeorq uses a quarter or more of the machine's CPU or memory, and red when the whole machine is at 90% or Adeorq alone goes over 50% CPU. A click opens **What Adeorq is using**, with the detail. It measures the whole tree of processes, not just the window. |
| **The music strip** | Only appears if something is playing on the PC: title, artist, previous, pause and next. The volume stays in the system mixer. It is not there on Linux and Mac. |
| **Streaming** | The shield for broadcasting, icon only. Ctrl+Shift+E turns it on. Details in [section 20](#20-streaming-mode). |
| **The orb** | Calls the Foreman (in some texts of the app, "the Assistant"). Ctrl+Shift+A opens and closes it; Ctrl+Shift+M opens it already listening to you. More in [section 18](#18-the-foreman-and-the-split). |
| **Three more icons** | Only in the Cockpit and with more than one terminal: **Minimise all** (they stay alive in the strip below and it turns into **Bring them all back**), **Layout** (a grid of up to 4 by 4, or "one big one and the rest beside it") and **Close all**, which asks first because it kills their agents and tells you which ones are working. |

The **update** is no longer a bar at the top: it is a card at the end of the sidebar
([section 21](#21-updating-without-losing-your-terminals)).

### The bar of each terminal (one per box)

Each terminal carries its own header with the name of the session, the context, the
model and the project. It is explained field by field in
[section 9](#9-the-header-of-each-terminal).

---

## 3. The seven tabs

- **Dashboard**: the home. Adeo, a box to ask for things, your projects and your usage.
- **Cockpit**: where the work happens. Projects on the left, terminals in the
  centre, a strip of tools on the right.
- **Chat** (beta): the same conversations as the Cockpit, read like a chat, and on
  top a concierge that opens sessions for you.
- **Decisions**: what your agents ask you with options, so you can answer on the
  spot.
- **Canvas**: a free board where terminals move around, connect with arrows and
  live next to notes, drawing and tools.
- **Profile**: you (name, @ and photo), your usage and four sections that live
  inside: **Accounts**, **Agenda**, **Memory** and **Commands**.
- **Settings**: how everything looks and behaves, and the help.

The terminals **do not close when you change tab**: they stay alive.

Two things you can change to your liking, in Settings › Look:

- **The header**: remove, put back and reorder the tabs. Removing one only hides
  it: it is still available with Ctrl+K. Settings cannot be removed.
- **Parts of Adeorq**: switch off the Cockpit, the Canvas, Memory or Chat entirely
  ([section 16](#16-settings)).

---

## 4. Dashboard

The first thing you see when you open it. On the left, a big **Adeo** with a
greeting according to the time of day and your name, and below it a line saying what
is going on:

- If something is waiting for you: "“X” is asking you something" or "“X” and N more
  are waiting for you", with the **Answer** button, which takes you to that
  terminal.
- If all is well: "N sessions running, nothing waiting on you." or "All quiet.
  Nothing running right now." A click takes you to the Cockpit.

Below is **the box to ask Adeo for something**, with your own words ("open the
Orquio stuff", "go over the login", "push today's work"). When you send it with
Enter or **Send**, a new conversation opens in the [Chat](#6-chat) that already
carries your request; **Dictate** adds what you say, if you have local voice
installed.

On the right:

- **Your projects**: first the ones with a session this week (the ones waiting for
  you, then the ones working and then by last activity), each with its logo and
  "is asking you something", "one working", "N working" or how long ago. With no
  activity, eight show, with **See all N** and **Show fewer**. A click takes you to
  the Cockpit with that project unfolded.
- **New project**, at the bottom: you type the name and **Create**. Adeorq creates
  the folder with `AGENTS.md` (your rules for the agents), `docs/METAS.md`,
  `.gitignore` and git already started. If you already have a model of your own for
  `AGENTS.md`, leave it in `plantilla-agents.md` inside Adeorq's data folder
  ([section 26](#26-where-your-things-are-kept)): it is used instead of the factory
  one, and `{name}` puts in the project's name.
- **Your usage**: the month's tokens, "N today · N days in a row · your record", and
  squares for the last 26 weeks. **See your usage** takes you to the
  [Profile](#11-profile).

**Picking up sessions you already have** is not in the Dashboard but in the **＋** of
the Cockpit's sidebar ([section 5](#5-cockpit)).

---

## 5. Cockpit

Three zones:

```
+----------------+--------------------------------------+-----------+
|  LEFT          |  CENTRE                              |  RIGHT    |
|  Workspaces    |  The terminals                       |  Usage    |
|  (projects and |  Each box = one conversation         |  Skills   |
|  their         |  or a console working                |  Files    |
|  sessions)     |                                      |           |
+----------------+--------------------------------------+-----------+
```

### 5.1 Left: the projects bar

The same bar is seen in the Canvas. From top to bottom:

- **"Workspaces" header**: the **＋** (*Open a session*: you choose folder, program,
  model and account), three ways to see the bar (logo and name, just the logos
  big, or shrunk right down into a strip), the archived button with its number and
  **Rescan projects and sessions** (it rescans by itself every 45 seconds).
- **Search box** *Filter projects and sessions*: it forgives accents and accepts the
  words in any order. With text typed in, everything unfolds.
- **Each project** is a card with its logo (Adeorq looks for it in the folder by
  itself, or draws its initials), its name, an arrow with the number of sessions, a
  badge with the recent ones and a red one with the ones waiting for you. A green
  frame with a glow means an agent is typing right now. Click: unfolds or folds.
- **When you hover** buttons appear to open a new session in that project: the
  programs you choose in [Accounts](#12-accounts) (Claude and Antigravity by
  default) and one for each extra account.
- **Right click on a project**: new Claude Code session, a normal terminal,
  Antigravity, each other program you have installed, an entry per extra account,
  **Open all N sessions at once** (up to the limit in Settings › Terminals) and the
  options for name, logo and order. **Remove from Adeorq** deletes nothing;
  **Delete the folder from disk…** sends it to the recycle bin and asks you to type
  its name.
- **The order** can be "By age" or "Whoever needs you first", and projects can be
  dragged by hand (**Back to automatic order** undoes it). The **Pinned** ones go
  on top; what you remove from the bar stays in **Hidden**.
- **Old things are hidden**: whatever has gone more than a month untouched shows up
  as "N older" in each project, and you can look at them.
- **The right edge** can be dragged to widen the bar, and it is remembered.

**The ＋ also resumes what you already had.** As well as opening something new, it
lets you go back to conversations you had already started: the whole list with a
search box, **Tick the ones I lack** and **Put them in the rail (N)**. **Bringing
them in opens nothing**: what you tick appears in the bar and stays waiting,
because every open terminal uses memory. The old ones show up too (the ones over a
week old do not appear on other screens), and the ones you already have show up
ticked and without a checkbox.

### 5.2 Each session inside a project

A session is a saved conversation. The bar lists those of Claude Code, Codex and
Pi, each with the logo of its program. In its row you see a status dot, the title,
the account if it is not the main one, the role if it belongs to a crew, and how
long ago it was.

- **Green** dot: open right now.
- **Amber** dot: the agent left an offer or a question waiting for you.
- **Dimmed** dot: left half done. Dimmer still: nothing pending.
- The dot **empties** once you have looked at the last thing it did.

On top of that, the whole row is tinted when it is waiting for you: **amber** if it
finished by offering something and **pink or red** if it left you a question with
options.

**▣ N** in the row are the subagents that session has working right now. Hover and
it tells you how many there are and how many it has launched in total.

**Click on a session = it is resumed in a terminal**, with all its memory. The **⋯**
button or the right click offer: *Resume the session here*, *Pin to the top*,
*Rename* (saved where the official app saves titles), *Move to group…*, *Take it
out of this project*, *Make “X” a project*, *Archive* and *Delete the session*
(goes to the recycle bin). Groups are created by dragging one session onto another;
they have a name and a colour, and dissolving them does not touch the sessions.

**Archive** first checks whether the project has files not saved in git and shows
them to you in a list. It never deletes anything and can be undone with the
archived button.

### 5.3 Centre: the mosaic of terminals

The terminals are laid out in columns (up to three when splitting) and stack. The
border between them can be dragged to share out the width or the height. The ones
you **set aside** drop to a strip, keep working, and each tile carries the logo of
the program, the name, the three letters of the account, the memory it takes up and
a ✕ (which asks for a second click if the agent is working). With no terminals, the
Cockpit says "The cockpit is ready."

Each box is a real terminal with its program inside: Claude Code, Codex, Gemini,
Antigravity, a normal console or any of the programs in
[Accounts](#12-accounts). New Claudes are born with the permission mode you choose
in Settings › Terminals (by default, *Auto-accept edits*); Shift+Tab switches mode
inside.

**Copy and paste like in any app.** Ctrl+V pastes (so does the right click), Ctrl+C
copies if there is a selection and, if there is not, it is still the usual "stop what
is going on". **Pasting an image** saves it and writes its path in quotes, which is
what the agent knows how to read. **Dragging any file** onto a terminal writes its
real path, without Enter and without copying it. **Ctrl+F** searches inside the
terminal.

An **open file** from the Files panel is another piece of the mosaic: an editor with
tabs (Ctrl+S saves; if the file changed on disk, it lets you choose between bringing
in the new one or saving yours over it).

A **crew** (several terminals from the same split) is marked with its colour and
with an "N/total", and has a board above the mosaic.

### 5.4 Right: Usage, Skills, Files and Browser

The strip of icons is always there. Each icon opens a face and, if you click the
icon of the open face, it hides.

- **Usage**: a battery for each account, the most spent on top, with the bars for
  the five hours, for the week and for each model, and when each one renews.
  Programs that do not publish their spending show "No usage data". **Ask again**
  costs no quota.
- **Skills**: your commands from `~/.claude/skills`, with a search box and grouped
  into "The ones you use most", "The rest", "Yours" and "From claude.ai and
  plugins". A click sends it to the terminal you have in front; dragging it onto
  another one pastes it into that one.
- **Files**: the tree of the project of the terminal you have in front, with the
  colour of what git sees as changed. With the right click you open, create files
  and folders, copy the path, show it in the file explorer, rename or send to the
  recycle bin, and it never overwrites one that already exists. To search for a text
  in the project: **Ctrl+K › Search in the files**.
- **Browser** (set apart by a line): a real Chromium with tabs, which is also useful
  for viewing your website while you program it. Ctrl+T opens a tab, Ctrl+W closes
  it and Ctrl+L goes to the address bar. It has a mode for editing the page by
  clicking and saving it into the code. On Linux and Mac a simpler version appears
  ([section 22](#22-windows-linux-and-mac)). If a terminal starts a server, Adeorq
  asks **Open {url} in the web view?** (turned off in Settings › Terminals).

**What the agent does in your files.** Above the tree, a card says the last thing
that matters: "Claude is editing" with its file, "Claude edited 2 files" with what
they add up to, or "Claude committed 2 files" with the hash, plus the branch and
what you have not pushed. Below, the list of what it has touched: **Reading** and
**Opened** in purple, **Editing** and **Edited** in orange with their lines,
**Committed** in green. It comes from what the program itself leaves written in its
history, without spending a token, so it depends on the program: **Claude Code**
notes what it reads and what it edits, **Codex** only what it edits (and the panel
warns you), and with the others you only see what git says. A subagent's edits do
not show.

---

## 6. Chat

Chat (in beta) has two parts:

- **At the top, the concierge.** "Talk to the concierge" opens a chat with Adeo: you
  tell it what you want, it splits it into jobs and opens a session for each one.
  The sessions show up as tabs above the thread (green dot: working; amber: asking
  you; orange: finished) and a click enters them. Each session it opens leaves a
  card with its program, its model, what it was asked to do and, if the router
  chose it, why.
- **Below, your usual sessions**, by day, with **New conversation** and a search
  box. Each session is read as a conversation (**Clean**) or opened raw
  (**Terminal**), and what you type below goes down to the same terminal. The box
  carries pills for the model ("Automatic" lets the router choose it), for the
  effort and a ring with the context.

What is worth knowing:

- The concierge only opens sessions in real folders from your projects, only writes
  in the terminals it opened itself and opens four at most per message.
- Each message to the concierge is a short call made with your subscription
  (Claude, or the program you choose in its pills), not with an API key. The
  sessions it opens spend their own quota. With the concierge you can press
  **Improve** so it rewrites your message without adding anything, and **Stop**
  while it thinks.
- The router reads rules that you write in your notes in the house memory, in the
  form `router: words -> model / effort / client` ([section 14](#14-memory)).
- Switching off the "Chat" part also removes the box from the Dashboard. It does
  not switch off the concierge on the phone, which has its own switch
  ([section 19](#19-on-your-phone)).

---

## 7. Decisions

When an agent needs you to choose something, it asks you here instead of in the
chat. The tab lists **Waiting for you** and **Earlier**. Each question brings from
two to six numbered options (the recommended one carries "Recommended", and none
comes ticked) and a box **Something else, in your own words**.

- **Send answer** waits five seconds with **Undo** and then types it into the
  terminal that asked, if it is still the same one. If not, the agent reads it when
  it looks again.
- **Discard** sets it aside without answering and warns the terminal that was
  waiting.
- The earlier ones delete themselves after a week.
- The notice is an amber count on the tab and Adeo with a doubtful face. On the
  paired phone a notification arrives and you answer from there
  ([section 19](#19-on-your-phone)).

---

## 8. Canvas

The Cockpit gives you a tidy mosaic. The Canvas gives you a free board: terminals
are placed wherever you want, enlarged by hand and **connected with arrows**. They
live alongside notes, drawing and small tools.

The board **saves itself** (a moment after every change) and comes back when you
open Adeorq. The terminals come back according to the setting **Bring the terminals
back on start**; the rest (pieces, arrows with their brief, notes, drawing) always
comes back. The Canvas has its own terminals: those of the Cockpit are not moved or
closed.

### The top bar

- **Pick a project**: decides in which folder what you drop is born.
- **✦ Claude**, **>_ Terminal** and **◈ Antigravity**: open a session in that
  project.
- **Three modes**: **Terminals** (just the work), **Drawing** (the whiteboard) and
  **All** (both, by default). Changing mode does not lose the drawing.
- **Drawing tools**, in the same bar and only in the Drawing and All modes: move,
  lasso several, pencil, arrow, line, box, diamond, ellipse, text and eraser.
- **The grid**: makes what you move land in the nearest cell.
- **＋ Add**: the menu of pieces (the right click on a gap of the board opens the
  same one, with *Pick the whole canvas*).
- **⌘ Describe the board**: tells the terminal you have focused what else there is
  on the canvas and which arrows leave from where.
- **Canvas ▾**: save the canvas to a file, open one (it asks whether only the drawing
  and the pieces or also the terminals, and it is added to what is already there),
  export the drawing to PNG or SVG, fit everything on screen and erase the whole
  drawing.
- **The "?"** opens a short help on how the canvas works.

### The pieces you can put

- **Your work**: **Note**, **Lane**, **Swarm**, **Gallery**, **A localhost window**,
  **The work board** and **Chat with a model**.
- **Gadgets**: Pomodoro (25 minutes of focus and 5 of rest), stopwatch, countdown,
  calculator and a calendar with notes per day.
- **Tools** ("nothing leaves this app"): JSON, regular expression, compare texts,
  encoder, hash, passwords, identifiers, colour and count text.

What each of the ones in your work is:

- **Note** (Alt+N): a sticky note with checkboxes that inside is a real `.md` file,
  so an agent can tick the box when it finishes. Its launch button sends it to an
  open terminal, opens a new session in the project you choose or, if two or more
  tasks are left, hands them to the Foreman to split. An empty note offers you the
  project's **runbooks**: every `.md` you save in `docs/fichas` is a recipe of steps
  that you repeat, and when you pick it the note is born with those steps as
  checkboxes. Any note can be **Saved as a runbook**.
- **Lane**: a named strip of colour that separates a workspace. It goes underneath
  the terminals; it is renamed with a double click and removed with its ✕ without
  closing anything.
- **Gallery** (Alt+I): everything you have ever pasted into Adeorq; you drop an image
  onto the canvas. With Ctrl+V on the canvas you paste a screenshot as a piece and
  can annotate over it.
- **A localhost window** (Alt+L): a web page inside the canvas, with an address bar
  and shortcuts to the usual ports. You have to "Click to use the page" and then
  release it to be able to move the piece. If a website forbids opening in a frame,
  it says so.
- **The work board**: a kanban with four columns. **To do** you write yourself;
  **Working**, **Waiting on you** and **Done** fill themselves in from the state of
  each terminal. Dropping a card into "Working" opens a terminal with that brief,
  and you can tick several and split them together.
- **Chat with a model**: a conversation with a model through your OpenRouter key,
  which does not spend your subscription and shows you what it costs.

### Move, enlarge and navigate

- **Moving a terminal**: you grab it by its header. Inside, the mouse belongs to the
  terminal.
- **Enlarging**: stretch it from any edge or corner, without selecting it first. The
  **Maximise** button in its header sets it to what you can see of the canvas and
  the same button puts it back exactly in its place.
- **Moving around the board**: drag the background. The wheel zooms (30 to 140%);
  inside a terminal the wheel is for its scroll. Below you have the minimap and the
  zoom buttons. With the zoom under 55%, each terminal shows its "cover" (logo,
  name and project) and stops painting its contents, although it keeps working.
- **Picking several**: dragging with the **right button** lassos pieces and drawing
  at once; with Shift it adds. A bar "N picked" appears with *All*, *Delete* and
  *Drop*.
- **Each terminal wears the colour of its project**: a stripe, the header tinted and
  the project's logo as a watermark. **Where** a new terminal is born: inside the
  lane named like its project; if there is none, to the right of the last one; and
  if it does not fit, below all of them with the camera going to look for it.
- **The sessions bar** of the Cockpit is also in the Canvas; what you open from it
  is born on the board.

### Arrows: chaining

This is what makes the canvas worth it.

1. Drag from the dot on the right edge of one card to the dot on the left of
   another: an arrow is born. An arrow can also leave from a note.
2. **Click the arrow** to write the brief: what the second agent has to do with what
   the first one produces. That is where the checkbox *Send on its own, without
   asking me* is.
3. When the first agent **finishes its turn**, "A finished → B" appears below with
   **Hand it over**: Adeorq writes into the second one your brief PLUS the first
   one's last answer, and sends it. The pencil leaves it written without sending,
   in case you want to touch it up.

The brakes: an automatic handover stops if the source agent asked you something,
and an automatic arrow that hands over three times in ten minutes goes back to
manual. If the arrow you draw closes a circle, Adeorq warns you, but does not forbid
it. With the automatic checkbox unticked, nothing is sent unless you press it.

### Swarms: several sessions and one chat

A swarm gathers sessions that you **already have open** into a single piece: its name
on top, a row for each session below and, at the end, a chat with a box to talk to
all of them. Up to twelve fit.

- **It is created in two ways**: with **＋ Add › Swarm**, ticking the sessions that go
  in, or dragging a terminal **onto another** and holding for a moment: when the one
  underneath lights up with a frame, drop it. The one you dragged goes back to its
  place. A console cannot join: only sessions of an agent are gathered.
- **Each swarm has its own Adeo, in a colour** (blue, green, violet, pink…), to tell
  one from another at a glance.
- **What you write goes to Adeo**, not to the terminals. Adeo thinks with a small
  model (Haiku), decides which session it falls to, rewrites it so it is
  understood and tells you who it sent it to. If you name one (by its name or its
  project) it goes to that one; if you say "to all", to all of them. It does not
  open new sessions.
- **What each session answers comes back to the chat** with its name.
- **The eye** in the header tucks the swarm's terminals away under the card: they
  keep working, they just stop taking up room. *Taking one out* leaves it alive
  beside it, outside the group. **Break up the swarm** (its ✕, with a double tap)
  deletes the group's chat and leaves the terminals. If you have just joined them
  by mistake, the piece offers **Don't join them**.

Three things worth knowing: Adeo knows whether each session is working or has
finished and how much context it carries, and chooses with that; **only Claude Code
and Codex** report how they are doing and only from them is the answer brought to
the chat (a session of another program joins, but its row says it is not known); and
**a session that is asking you something does not get a split**, because it would
land in its menu. Each message to Adeo spends a short call from your Claude
subscription; joining the sessions spends nothing.

### Drawing on top

Everything is drawn **on top of** the terminals without bothering them: with the hand
on, the mouse goes back to being theirs.

- **Arrows stick.** If you finish an arrow on a terminal, it stays hooked and
  follows it when you move it. The piece it is about to stick to is outlined in
  green.
- **It lines up by itself.** When drawing or stretching, everything snaps to the
  edges and centres of what is already there. Hold **Ctrl** to turn the magnet off.
- **Fill** hollow, translucent or solid; **freehand** for the wobble of a sketch;
  text of several lines (Shift+Enter goes down a line).
- **Undo is serious**: Ctrl+Z and Ctrl+Shift+Z go back up to sixty steps with a tool
  on.
- **Bring to front** and **send to back** appear when you select a stroke.

### Ctrl+Z and closed terminals

Outside a terminal and a text box, **Ctrl+Z reopens the last terminal you closed**
with its ✕: a Claude session resumes its conversation and a console comes back
empty. The notice "Closed “X” · Undo" lasts five seconds; in the Canvas, Ctrl+Z only
does this while the notice is up, because the rest of the time it undoes the
drawing.

---

## 9. The header of each terminal

From left to right, it has three zones.

**Who it is**

| Element | What it means |
|---|---|
| **The icon** | What is inside: Claude Code, Codex, Antigravity, a console… When the program ends, the icon goes grey. |
| **The three letters of the account** | Only if the terminal does not use your main account: the first three letters of its name, in capitals and in the accent colour. The full name shows when you hover. |
| **The project** | In a pill of its colour. The full path, only when you hover. |
| **The name** | The title of the session, the same as in the sidebar. Double click to rename it. |
| **"from: X"** | If another session opened this terminal with the MCP ([section 17](#17-what-an-outside-program-can-do)), it says which one. |

**The data**

| Element | What it means |
|---|---|
| **▣ N** | How many subagents are working inside that session right now. When you hover (or press it) the list appears: who each one is, what it was sent to do, what state it is in and how long it has been at it. |
| **The bar and the %** | The context: how much of its working memory it has taken up. The tooltip gives the exact tokens. Warnings go by tokens, not by percentage: see [section 10](#10-what-appears-inside-a-terminal). |
| **The model and the effort** | Changed inside with `/model` and `/effort`. |
| **The memory** | What that terminal takes up; it turns to a warning tone from 1 GB. |

The three pieces of data (context, model and memory) can be hidden so that the bar
only carries project and name: **Settings › Terminals › Show the model, context and
memory in each terminal's bar**.

**The buttons**: *Shadow Mode* (a separate branch, see section 10), the eye to cover
only this terminal on a live stream, minimise, pop out into its own window, maximise
or restore, delete the session (it goes to the recycle bin) and close. Splitting to
the right or down are no longer buttons: they are in the right click and in
Ctrl+Shift+→ and Ctrl+Shift+↓. The ✕ closes the terminal; the conversation is not
deleted and stays in the sidebar.

**Popping out into its own window.** If you drag a terminal's bar outside Adeorq, it
comes out into a Windows window of its own and the agent never notices. Its ✕
becomes **Return to Adeorq**.

**The glow.** The panel where you are working wears a ring in the accent colour.
When an agent **finishes its turn** and is waiting for you, its panel lights up with
an **orange** glow that pulses until you open it.

---

## 10. What appears inside a terminal

Adeorq watches the screen of each terminal and turns the cryptic into buttons.

1. **Question bar**: when the agent asks with a menu of numbers (permission for a
   command, trusting the folder, how to resume), buttons appear with the options.
   Click and it is answered; you can also answer with the keyboard.
2. **Reconnection notice**: if your access expires, "needs to reconnect your account"
   appears with the **Reconnect** button, which is the same as typing `/login`.
3. **Notes in plain words**: while the agent compresses its memory (the `/compact`),
   or when it is busy and what you type is queued.
4. **Hung agent notice**: if it has gone three minutes without giving a sign of life,
   **Revive** appears (it closes the program and resumes the same conversation) or
   **Start fresh** if the session weighs too much.
5. **Context notice.** Long sessions get expensive: each message pays for the whole
   context again. Adeorq warns by tokens: at **300,000** "good moment to compact", at
   **400,000** (in red) it compacts by itself if you have that turned on and at
   **600,000** it recommends a new terminal with a handoff. The buttons are
   *Compact*, *New with handoff*, *Not now* and *Close this one*. In a small context
   window the percentage rules (50, 60 and 80%). Compacting first sends the handoff
   (the `/fin` if that skill exists) and then `/compact`, only when the agent has
   finished its turn. What happens at 400,000 you choose in **Settings ›
   Terminals** (warn and wait for the button, compact without commits, or compact with
   the whole `/fin`). It never compacts by itself in Codex or Gemini. If the session
   has already been compacted twice, it offers a new one instead of a third.
6. **Shadow Mode**: a terminal born in shadow works on a separate branch, and its
   button opens **Shadow proposals** with *Accept* and *Discard*. It is chosen when
   opening; it cannot be turned on midway.

If you use a program in the **alternate screen** (the "fullscreen" mode of Claude
Code), Adeorq behaves like a normal terminal: the wheel goes to the program.

---

## 11. Profile

One single page that scrolls down. At the top, you: your **photo**, your **name** and
your **@**. **Edit** changes the name and the @ (the at sign and the spaces are
removed by themselves) and clicking the photo changes it. Everything stays on your
computer. Beside it, **Your sections**: four summaries that open the full section,
with "‹ Profile" on top to go back. You also get to each one with Ctrl+K.

- **Accounts**: how many are connected and what each one has spent
  ([section 12](#12-accounts)).
- **Agenda**: your pending things for today ([section 13](#13-agenda)).
- **Memory**: how many notes there are and in which vault ([section 14](#14-memory));
  it does not show with the Memory part switched off.
- **Commands**: how many skills of yours there are, with the names of the first ones
  ([section 15](#15-commands)).

### Your usage

Below, **Your usage**. The big figure is the **tokens of the current month**,
counting the cache; below it, the *New* ones (without cache), the active days and
your record (the day with the most tokens). A list with three tabs, **Providers**,
**Models** and **Projects**, shares the month out with bars. Below is **The year** in
squares and the month day by day, with arrows to go to the previous or the next one.
Tapping a day with usage opens its card.

The data comes from the conversations that **Claude Code and Codex** already save on
your disk: it spends no quota and needs no key. The first read takes a good minute;
the following ones, a few seconds.

### The card to share

Tapping a day, your record or the share icon opens **Share your usage**: a card with
your figures ready to post. You choose:

- What it shows: **Month**, **Day**, **Record** or **All time**.
- The format: 16:9 (1920×1080) or 9:16 (1080×1920), as **Image** or as **Video**.
- The background: the one behind your terminals, four built in, or the ones you
  upload yourself (image or video; they are copied to Adeorq's data folder and an X
  removes the copy, never your original).
- The colour of the figure and whether it is **highlighted** on a box.
- A **project**, if you want. It comes out as **None** every time it is opened: no
  project appears on the card unless you choose it.

Your @ (or your name), your photo and, at the foot, "adeorq.com · Made with Adeorq"
always appear.

In the video, the figure counts up from zero to yours; you trim the stretch of
background with two handles and can add sound (a hit, a counter or the video's own).

- **Download** saves a PNG or an MP4 wherever you choose.
- **Copy**, in Image mode, copies the image to the clipboard so you can paste it
  wherever you like. In Video mode it renders the whole MP4 and **copies the file**:
  on Windows it pastes as a file in a chat or a folder (and as its path in a
  text-only place, for example a terminal); on Mac, as a file reference; on Linux,
  just the path.
- On Linux the Video tab is switched off: "This computer can't make videos."

---

## 12. Accounts

Inside the Profile. All your agent accounts in one place, grouped by program.

**What an account is here.** Each agent program keeps everything of its own (your
login, your history, its settings) in a folder. If you tell it to use another
folder, it behaves like a clean installation: another login, other limits. That is
what Adeorq does. Your usual account is never touched; the others live in a folder
of their own inside Adeorq.

The screen has a status line ("N connected of N installed", the tightest limit and
which one is the usual one) and four sections: **Your accounts**, **API keys**,
**Shortcuts** and **Not installed**.

**Which programs it knows.** The catalogue has 22: Claude Code, Codex, Gemini CLI,
Qwen Code, GitHub Copilot, Grok, Crush, opencode, Amp, Antigravity, Cursor, Pi, Kiro
CLI, Kimi Code, CodeWhale, Goose, Droid, Jules, Auggie, Codebuff, Cody and Aider.
**Eight support several accounts**, because it has been checked that their variable
really moves the folder:

| Program | Variable that moves its folder |
|---|---|
| Claude Code | `CLAUDE_CONFIG_DIR` |
| Codex | `CODEX_HOME` |
| Gemini CLI | `GEMINI_CLI_HOME` |
| Qwen Code | `QWEN_HOME` |
| Grok | `GROK_HOME` |
| Pi | `PI_CODING_AGENT_DIR` |
| Kimi Code | `KIMI_CODE_HOME` |
| CodeWhale | `CODEWHALE_HOME` |

The others show up with the note "one account only": no way has been found to move
their folder, and it is better to say so than to make up a name and have an account
end up writing where it should not. **Antigravity** keeps its state inside
`~/.gemini` and can only have one. Pi talks to several providers, and that is why it
is not proposed as an automatic relay when you run out of week: if its login is that
of your own Claude account, sending you there would be sending you to the same
used-up quota.

**What you see on each card.** The name (the usual one carries the name of the
program; the ones you add get a name of your own), the plan and whether it is the
default. **Claude Code, Codex and GitHub Copilot** also show their session and week
bars with their renewal time, and it comes free. The other programs do not publish
your consumption on the machine, so the card says so instead of making up a bar.
The ones that leave no trace when you sign in say "unknown".

**What you can do.**

- **Add account**: you give it a name (whatever you like, never your email, because
  this screen can end up on a live stream), its folder is created and a terminal
  opens where the program itself asks you to sign in.
- **Make it the default**: new terminals of that program will be born with that
  account.
- **Terminal with this one**: a session with a specific account, without changing
  the default.
- **Sign out** (deletes only the login), **Share my skills** (the same skills folder
  as the main one), **Rename** and **Remove**. Remove deletes only the folder of that
  account, with its history.
- **Sign out of all**, at the top, with two or more connected.
- The programs you did not install show up in **Not installed**, with **Download**
  (opens a terminal with the install command) or **Open its site**.
- **Shortcuts** chooses which programs show up as buttons when you hover over a
  project.

**The account is decided when the terminal is opened and no longer changes**,
because the program reads its folder only once, at startup. When a terminal does not
use the main one, it carries the three letters of its account in the header. If you
bring the board back when opening Adeorq, or press **Revive**, each terminal is born
again in its account. And from the right click of a terminal, **Continue on another
account** opens a new one with a record of where you were.

⚠ Several accounts **of your own**, no problem. Taking turns with other people's
accounts to stretch the limits breaks the providers' terms, and what you risk is
having your account closed.

### The split between accounts

When an agent opens a terminal with Adeorq's MCP and does not say which account,
**the terminal goes by itself to the account of that program that would lose the
most quota if it were left unused**: the one with the most week to spare compared
with the days left until it renews. So a Pro account at 17% that renews in two days
beats a main one at 60% that renews in five, and the other way round if the main one
renews tomorrow.

- It skips the account that is stopped by its five-hour cap or the one that is at
  92% of its week or more, unless there is no other. If the model the agent asks for
  is not given by that account's plan, it prefers another; if there is none, it is
  born with the ceiling of its plan.
- Each terminal that an agent has just opened on an account counts as a bit of
  spending until a new reading arrives, so that three openings in a row do not land
  on the same one.
- The one who finds out which account was chosen and why is the **agent** that
  opened it (the reply tells it, and which things that account will not see). On
  screen you see the result in the terminal's header. If the agent asks for a
  specific account, it is born on that one or fails saying so: never on another one
  in silence. A scheduled order with no account does not choose: it goes to the
  default.
- The same criterion chooses the account in the plans of the Foreman and of the
  Split, and is explained in their "why".
- There is a limit: six terminals open by agents at once and twelve per hour.

### API keys and Vibecoding with OpenRouter

**API keys** is the other way to pay for what a program consumes: by tokens instead
of with your subscription. There is a card for each program that accepts a key
(Claude Code, Codex, Gemini CLI, Grok, opencode, Pi and Aider): *Paste a key*, *Get
one* (the link to where it is obtained), *Forget it* and a switch between **Opens on
the key (by tokens)** and **Opens on your subscription**. The key is saved encrypted,
you only see its last four letters and it never comes back to the screen. Where it is
kept, in [section 17](#17-what-an-outside-program-can-do).

The **OpenRouter** card is a single key that opens models from many providers,
including those with no program of their own (Kimi, DeepSeek, Grok…). Once the key is
pasted, it shows what you have left, today's, the week and the month. Below it
appears **Vibecoding**: it opens a real terminal of [Aider](https://aider.chat)
pointing at the model you type (by default, `moonshotai/kimi-k3`). The first time it
says **Install Aider first**; afterwards, **Open terminal**, with the key in place.

⚠ **If you open Aider by hand**, always tell it the model (`aider --model
openrouter/<model>`), or it will take the first key it finds in your environment and
try with another provider. And the key has to be in `OPENROUTER_API_KEY` in that
terminal. The card does both things by itself.

---

## 13. Agenda

Inside the Profile. What is coming at you, what you thought of and what is due. The
front page brings today's date, five figures that open their screen (sessions waiting
for you, proposals from your agents, open goals, live ideas and scheduled orders) and
a calendar of the month that marks on each day how many goals you did.

- **Today's goals**: which two or three things you want to get closed today. They
  belong to no project: they are yours and the day's. They are ticked with a click on
  the whole row and are saved as one text file per day, so **an agent can tick them
  off** when it finishes what you asked. When the day changes an empty list is born
  and, if you left something unticked, **Bring over the one you left yesterday**
  appears. The icon in the top bar opens them as a floating panel from any tab, with a
  slider for how much it covers of what is behind it.
- **Your sessions**: all of them sorted by who is waiting for you, with **Resume this
  session here**. If you have chosen a local model in Settings, each one carries a line
  about what it needs from you.
- **From your agents** (the tray): while they work, loose ends come up that are not
  for now. Instead of interrupting you, the agents write them down there, one at a
  time, and you choose **Accept** (a step is written into the project's `METAS.md`),
  **Discard** or **Later**. An agent can propose things there without touching any of
  your credentials.
- **Next steps**: the goals in the `docs/METAS.md` of the project you choose and its
  parked items.
- **Ideas and external dates**: they come from the **compass**, a separate service
  that belongs to Adeorq's author and which you enter with an email and a password. If
  you do not have it, those two cards say "Connect your compass" and everything else
  in the Agenda works the same.

### Scheduled orders

You leave written what to do, in which project and when, and Adeorq opens a session
by itself at that time, also with the window in the background. You choose the agent
(**Claude Code or Codex**), the account (if there are two or more of that agent), the
model and a name.

- **Days and time**: the days of the week and an hour. It launches at most once a
  day; if the PC was off at its hour, it launches when you turn it on that same day
  and, if not, it waits for the next time.
- **Every N hours**: from one to a hundred and sixty-eight, and it repeats.
- Each order shows how its last three times went (finished, failed, did not launch)
  and its next time. **Try now** launches it right away. **Pause**, **Edit** and
  **Delete** do what they say.
- **The brake**: if it fails three times in a row it stops and warns you (on the
  phone too) until you press **Re-arm**. If the account it would be born with is at
  85% or more, that time is skipped and it does not count as a failure.
- It is born in auto mode; if it asks something, the question reaches the phone.
  There is a limit of twenty orders.

The clock works on Windows, Linux and macOS; on Linux and Mac it has not been tested
yet on a real desktop.

---

## 14. Memory

Inside the Profile. Your Obsidian notes (or any folder with markdown) inside Adeorq.
**Nothing is copied or moved**: they are read where they are. The first time it shows
the Obsidian vaults it already knows, or lets you point at another folder.

- **Search your notes**: by what they say, without capitals or accents, and the title
  weighs more.
- **The note**: the list by folders or by recent, the note read on the right, **Edit**
  and **Save** (it checks that nobody touched the file in between) and **Open
  outside**. `[[like this]]` links work.
- **Brain**: the map of what links to what, in 3D, in two shapes, **Sphere** (by
  projects) and **Galaxy**. Performance mode, which turns on by itself with four
  terminals, leaves it still and says so.
- **Schema**: you pick a project and **Read the project**. The Foreman (a Claude)
  reads the code and draws what it is made of; it takes a few minutes, spends quota,
  is saved and is shown as a map or a mind map.

**The house memory** is something else, although it looks alike. The notes that Claude
Code saves per folder, in all your accounts, are gathered into an index that **the
agents** consult with the tools `buscar_memoria` and `leer_memoria`. It searches by
words and, if you have Ollama with the `bge-m3` model, also by meaning. There you can
write lines `router: words -> model / effort / client` that the router uses to decide
(the rule that demands more words wins). With the Memory part switched off, none of
this works.

---

## 15. Commands

Inside the Profile. The house cheat sheet: **65 commands** (52 from Claude Code and
13 from Antigravity) plus your skills (those in `~/.claude/skills`, those of your
claude.ai account and those of plugins).

- **Search box**: search by what you want to do, not by what it is called. Type
  "undo", "quota", "context" or "security".
- **Filters**: All, Claude Code, Antigravity (agy) and Your skills.
- **One click** and the command is typed into the active terminal. You press the
  Enter, so nothing ever runs by accident. With no terminal open, the buttons are
  greyed out.

---

## 16. Settings

Ten groups on the left, in this order. Clicking the open group folds its index, and
Adeorq remembers the last one you looked at. If a group has several cards, their
names appear below so you can jump to one.

**Look**

- **Parts of Adeorq**: switches for **Cockpit**, **Canvas**, **Memory** and **Chat**.
  Switching one off switches it off **entirely**: no tab, no entry in Ctrl+K and
  nothing of its own starting up (it is switched back on in the same place).
  Dashboard, Profile, Decisions and Settings are always there. The Cockpit and the
  Canvas **cannot both be switched off at once**, because they are the two places
  where a terminal is opened. With the Cockpit off, new terminals are born in the
  Canvas; with Memory off, the agents lose `buscar_memoria` and `leer_memoria`. A view
  that is off but still has open terminals stays in sight until they are closed, and
  Settings says how many are left.
- **The header**: remove, put back and reorder the tabs at the top, with *Back to how
  it came*.
- **Language**: Spanish or English. It changes the whole app, this guide included. The
  terminals keep speaking whatever each agent speaks.
- **Theme**: 32 themes in five families (House, Familiar, Loud, Blacked out and Light
  background), with a filter and a search box. Each card is a miniature of the app with
  that palette. You can ask it to follow the **light or dark of the system**, with a
  theme for each case, and **To match your photo** picks the theme whose accent
  resembles your background image.
- **The colour of the terminals**: 12 colour schemes for the 16 colours of the
  terminal, and **Import a theme…** brings one from Warp (`.yaml`) or from Ghostty.
- **Blackout**: solid black behind the terminals, even if there is a background.
- **Scroll smoothness**: *Snap*, *Smooth* or *Very smooth*; it changes at once.
- **Performance mode**: *Automatic* (it switches off the glass when you open the
  fourth terminal and gives it back when you close them), *Always pretty* or *Always
  fast*.
- **Shape of the terminals**: *Flush* (mosaic), *Soft corners* or *Loose cards*.
- **The background**: an image or a video (looping and without sound) behind
  everything. It is copied to Adeorq's folder; you choose the framing, how much shows
  and the blur. With **See-through terminals** the photo shows through the text.

**Terminals**

- **Fit the type to each terminal's size** (on): with many narrow terminals, the type
  shrinks by itself until the line fits. The size you choose is then the maximum.
- **Font size** (11 to 32 px) and **how many sessions a project opens at once** (2 to
  20; each one is about 200 MB, which is why there is a limit).
- **Show the model, context and memory in each terminal's bar.**
- **Bring the terminals back on start** (yes by default): the same terminals come back
  in their folders and each Claude resumes its conversation.
- **Keep the terminals alive if Adeorq crashes**: see
  [section 21](#21-updating-without-losing-your-terminals).
- **Jump to the session that finishes, full screen**, **Ask to open the web view when
  a terminal starts a server** and the **search engine of the browser bar** (Google,
  Brave Search or DuckDuckGo).
- **At 400,000 tokens of context**: warn and wait for the button, compact by itself
  without commits, or compact by itself with the whole `/fin`
  ([section 10](#10-what-appears-inside-a-terminal)).
- **Start Adeorq when the computer boots.**
- **When you close the window**: *Ask every time*, *Keep running in the background*
  (the window hides, the agents carry on and an icon is left next to the clock) or
  *Close everything*.
- **Permission mode**: the mode each new Claude is born with (*Auto-accept edits* by
  default, *Plan mode*, *Manual*, *Automatic*, *Only what is approved* or *No
  checks*). It is changed inside with Shift+Tab.
- **What each client may do through the MCP** and **Agents' keys**: they are told in
  [section 17](#17-what-an-outside-program-can-do).

**Notifications**

- **Notifications**: a system notice when an agent finishes or waits for your OK, with
  the icon blinking in the taskbar. *Only in the background* (default), *Always* or
  *Never*. It never warns about the panel you are looking at.
- **Your default brain**: *Let Adeorq decide*, or fix haiku, sonnet or opus for
  everything. Quota decides, and a task that needs judgement is never made cheaper.
- **When the brain does not fit**: the Foreman warns you if the model of the terminal
  in front of you is much more expensive or weaker than the task asks for. *Only big
  differences* (default), *Any difference* or *Never*.
- **The crew lookout**: with a crew open, it checks every minute who finished, who is
  waiting and whether anyone touches another one's files, and leaves a line in the
  Agenda's tray. It never writes, opens or closes terminals.
- **The session copilot**: looks at the open terminals and suggests, through the tray,
  another program with quota, a cheaper brain or what it would cost by API. It never
  changes anything by itself.

**Shortcuts**: **Canvas shortcuts**, the editable table of the 31 actions of the canvas
([section 24](#24-keyboard-shortcuts)).

**Local model**: if Ollama answers on your machine, you choose a small model that writes
the "what it asks you" line of each session in the Agenda. Without Ollama, the Agenda
works the same without that line.

**Discord**: **Show Adeorq on my Discord** (on by default) talks to the Discord open on
your machine, with no account or server; **Say which project I am in** (off). In
streaming mode, Discord goes back to generic.

**Mobile**: see [section 19](#19-on-your-phone).

**Bots**: **Connect a bot** gives your **Hermes** or your **OpenClaw** Adeorq's tools, with
its own permission. Before writing anything it shows what it will write, and it leaves a copy
of the file. Each bot starts on **Looks** (the list of terminals and the usage, not what is
inside), and you change it right there to **Opens with my click** (it opens terminals; if they
carry a brief it asks you first, and it only reads the ones it opened) or to **In charge, no
asking** (it types into any terminal, opens without asking and reads everything). With that
last one, whoever fools the bot is in charge of your computer. **Disconnect** stops counting
at once and removes its entry, and what each bot did last stays below. You link the chat with
the bot (Telegram and the like) in the bot itself: Adeorq keeps nothing of that. **Grok Bot**
lives in the cloud and does not reach your machine: **Give it a key** gives you a line to
paste into it, which its desktop app runs here asking your permission each time (`adeorq
preguntar <tool> [name=value]`). That line carries its key: it stays in Grok Bot and in the
history of any console you paste it into. If Adeorq is not open, the bot gets an error that
says so.

**Notify a bot** (everything off by default). When a terminal finishes or is
waiting for you, Adeorq writes to your **Grok Bot** (the webhook address of a routine and
its key, which is kept in your machine's key store and never comes back to the window), to
your **Hermes** or to your **OpenClaw**, if you have them installed. It sends only the
terminal's name, its project and what happened, never what is on the screen. It only
notifies when you are not looking at Adeorq and follows what you choose in **Notifications**;
several terminals finishing together are one message, and at most one goes out every 30
seconds. **Test** sends a test message, and the Grok Bot one starts a real run of your Bot
and spends from its quota (so does every notice). If a notice does not arrive it does not
interrupt you: Settings says so.

**Mods**: a mod is a change of yours to how Adeorq looks (the round icons, another
colour, a hidden piece). It lives in your data folder (`mods`), so an update does not
touch it. **Ask your agent for a mod** leaves the brief written in its terminal,
without sending it. **They are off by default**. Each one says how it is: *Applied*,
*Off*, *No longer hooks on* (an update changed the piece it was hooked to; **Hand it to
your agent** gives it to your agent to redo it) or *Not loaded*, with the reason. They
only change the look: Adeorq does not load code from a mod nor does it let its
stylesheet ask for anything from the internet. If one leaves your screen unusable,
**Ctrl+Alt+Shift+0** switches them all off.

**Help**: **First steps** (*Take the tour* and *Run the welcome again*), the web
**Documentation** (it opens in your browser and is always up to date, without waiting
for a new version) and **Have my agent explain it**, which opens a session with this
guide in front of it: it asks you what you want to do and shows you only that. Below
lives this whole guide.

**Adeorq**

- **You and your projects**: your name, the projects folder (changing it re-reads the
  whole list) and the loose projects you add by hand.
- **Updates**: the installed version and **Check for updates** (it only checks). If
  there is one, a second click installs it and **Restart** puts it into use. It checks
  by itself on startup and every six hours, and it installs nothing unless you tell it
  to.
- **Your quota**: **Show my weekly usage** types `/usage` into the Claude terminal you
  have active and takes you there. To see all your accounts at once use the **Usage**
  face of the Cockpit ([section 5](#5-cockpit)) or the [Profile](#11-profile).

---

## 17. What an outside program can do

Adeorq has a local door, the **MCP**, through which an AI program can look at and
handle your terminals: list projects and terminals, read what is on screen in one,
open a new one, write to it, ask you something with options (which reaches
[Decisions](#7-decisions) and the phone), check your quota and the house memory.
There are eighteen tools, spread over three tiers named in plain words:

- **Look only**: reads terminals, projects, the agenda, the quota and memory. It
  changes nothing.
- **Open and look**: also opens new terminals, draws arrows between two on the
  canvas, asks you questions and closes **the ones that same program opened**. It does
  not write into other people's.
- **All**: also writes into any terminal, closes it and can compact it.

**How you connect your Claude Code to these tools.** Adeorq does not touch your Claude
Code's settings: you give it the door yourself, once, with
`claude mcp add adeorq --scope user -- "<path to adeorq.exe>" --mcp` (the path is the
folder where you installed Adeorq). Adeorq has to be open: with it open,
`claude mcp list` should say "Connected". From then on, a Claude Code you open in an
Adeorq terminal has the tools at that terminal's tier, and one in another console has
them as an outside program (below).

**Each terminal is born with its own password**, and the tier comes from the terminal
the program connects from, not from the name it claims to have. A program that
introduces itself as "claude" from outside does not inherit the tier of Claude Code.
By default, **Claude Code has "All"** and the other programs have "Open and look".

**Outside Adeorq** is everything that arrives **without** the password of an Adeorq
terminal: a Claude Code open in another console, any program that talks to the port.
By default it can only **open terminals and look**. Those terminals start in the mode
you have in Settings, and if it asks to open one **with a job**, a window appears with
the text, who is asking and in which folder: **No** or **Open**; if nobody answers, it
does not open. For it to do more, raise it
yourself in **Settings › Terminals › What each client may do through the MCP**, on its
row (it applies to any outside program, and on **All** it no longer asks, so raise it with
care). Each row says the
program, its version, how many times it connected and when the last time was. The
Foreman and the concierge come in through a line of their own and do not count as
clients.

An agent with a low tier that asks for something that is not its to ask gets a
refusal that tells it which tier it has and where that is changed.

Limits worth knowing: an agent opens six live terminals at most at once and twelve
per hour; a new message to a Claude terminal with more than 300,000 tokens of context
comes back to it and only goes out if it insists; it cannot compact one that a person
opened; and the terminals an agent opens it closes itself when it finishes, leaving a
summary in the data folder.

### Asking for a key without showing it

When an agent needs a token, **it is not asked for in the chat nor left in a file**.
An Adeorq window comes up where you paste it, and the agent does not read it and it
does not stay in its history. The agent uses it with `adeorq secreto <name> --
<command>`: the command receives the key in an environment variable and its output
comes out with `***` where the key would have been.

- An **Adeorq terminal** that asks for an already saved key gets it **without
  asking**. If it was not saved, the window **An agent needs a key** appears
  (*Cancel* or *Hand it over*, with a checkbox to save it for next time).
- **A program outside Adeorq** that asks for a saved key makes another window appear:
  **A program outside Adeorq asks for a key. It does not come from an Adeorq terminal.
  Give it only if you know which program it is.** You choose **No** or **Give it this
  once**.
- **The agents' keys** (Settings › Terminals) lists each saved key with who used it
  and when ("terminal 4 used it 3 min ago"), with a *Forget* button. It never shows
  the value, and the card does not appear if there are none.
- **Where they are kept**: in the Windows Credential Manager, in your Mac's Keychain
  or, on Linux, in a file in your data folder with 600 permissions **unencrypted**
  (the screen warns you about it).

**What this does not do**, so you do not get overconfident: the `***` filter only
recognises the key as it is, so it does not stop an agent determined to get it out
(for example, with a command that encodes it before printing it); and any program
that runs under your user can read the Credential Manager directly, without going
through Adeorq. It is a barrier against accidents and casual reads, not against an
agent you do not trust: you do not give that one the key.

---

## 18. The Foreman and the Split

The Foreman is your orchestrator agent. You write what you want and it proposes a
plan; **nothing is run without your OK**. It opens with the orb in the top bar, with
**Ctrl+Shift+A**, and from any tab. **Ctrl+Shift+M** opens it already listening to
you, and with OpenRouter's voice it can answer you aloud. In the window and in some
texts of the app it is called "the Assistant".

**How much it can touch.** It has the same three tiers as
[section 17](#17-what-an-outside-program-can-do): *Look* (only reads), *Plan* (opens
new terminals, but does not write into other people's) and *Auto* (also writes into
any terminal). It is chosen in the window itself.

**What buttons it has.**

- **Plan it**: it proposes which sessions to open, with which program, which brain and
  which brief. In the list you see with which brain it opens each thing and, before
  the button, how much the whole plan weighs ("Opens 6 agents · 2 opus + 4 sonnet ·
  ×22"). It is not a bill (with a subscription there is no bill): it is the only
  comparable figure that exists, with haiku as 1.
- **Ask**: it only looks at Adeorq and answers you, without opening anything.
- **Write the brief**: you throw it one sentence of what you want and it gives you
  back the brief well written, for whom and why that one. There are three buttons: put
  it in the terminal you have in front (it changes its model and effort and leaves the
  brief written, without sending it), open a new terminal already born like that, or
  copy it.
- **Automatic**: instead of showing you the card, it adjusts the brain and leaves the
  brief written in the terminal in front. It does not send it: "no intermediate
  screen" does not mean "without your finger".
- **Voice**: for the Foreman to say its answers aloud.

**How it chooses the brain.** It goes through the same router as the rest of Adeorq
and looks at your real quota, account by account:

- First it looks at what the job asks for: a mechanical errand goes to haiku, the
  day-to-day to sonnet and whatever demands judgement (security, auditing, reviewing,
  architecture) to opus.
- Then it looks at your week. With the week running short it makes cheaper what can be
  made cheaper, chooses the account with the most margin (the same rule as the
  [split between accounts](#12-accounts)) and, if no week is left on any Claude
  account, proposes another program **among the ones you have connected**. Codex and
  GitHub Copilot publish their quota and the router uses it; for the others, Adeorq
  knows whether they are connected, not how much they have.
- What it **never** does is make an audit cheaper to save quota: repeating that work
  costs more than the difference.
- Handovers to another program only come in for an objective reason, which is that you
  have no week left. And you can always change the brain by hand.

### The Split: several tasks at once

It has no button of its own: it is the same Foreman. One sentence is planned right
there; **several lines are several tasks**, and the button changes by itself to
**Split up the N tasks** (up to eight per batch) and takes you to a screen with the
text already put in. You can paste your tasks, one per line, or tick your **today's
goals** and the **ideas your agents left in the Agenda**.

1. **A single call** classifies all the tasks and shares the files out among them, so
   that two tasks do not step on each other.
2. **The code decides the destination of each one**: program, account, model and
   effort, looking at what you have installed, which accounts are connected, how much
   week you have left and what plan you have. That spends no token.
3. **The common paper is written** in the project's `BUZON.md`: who does what, which
   files belong to each one and where to note what they finish. That file is never
   versioned.
4. **They are all opened**, staggered, each one with its brief written in the language
   of its program. Skills (such as `/frontlaxweb`) are only offered to Claude Code.

Before the final button you see how much the whole batch weighs and the warnings: if
two tasks go to the same project with no files shared out, it tells you, because two
agents on the same file go slower than one after the other.

---

## 19. On your phone

Adeorq comes with you. From your phone, a tablet or another computer you talk to the
concierge, see how each terminal is going and write to it, answer what your agents ask
you and open sessions on the PC. The page is **served by your own PC**, and the
traffic goes over **Tailscale**, its private network: it does not go through any
Adeorq server. Only devices you have paired get in. The PC has to be on with Adeorq
open (while it serves, it asks the system not to sleep).

**Pairing a phone.** In **Settings › Mobile**:

1. Turn on **Concierge on my phone**. Three rows appear with a green or red dot —
   *This PC*, *Tailscale* and *Your phone* — and the fix on the one that fails.
2. If it is missing, **Bring the concierge to Tailscale** (and *Open the Tailscale
   link* if it asks you to turn on HTTPS).
3. An address `https://….ts.net:8443` appears with its QR and **Copy**.
4. **Pair a phone** gives a six-digit code that is valid for ten minutes. On the phone
   you type it and press **Pair**.

The paired devices show up on the same screen with "seen … ago", if they have
notifications, **Test notification** and **Remove**.

**What is on the phone.** A drawer with **Concierge**, **Terminals**, **Decisions**,
**Scheduled**, **Usage** and, at the bottom, **Settings**, plus **New task**.

- **The home screen**: Adeo with the state of the PC, **Waiting for you** (decisions
  and terminals that are asking), **Running**, your conversations with the concierge
  and the box to write to it.
- **Terminals**: grouped into *Asking you*, *Working*, *Finished* and *Idle*. For each
  one you see **Chat** (what was said, with **Copy** on the code blocks) and **Screen**
  (what is seen on the PC). Its box accepts text, photos and attached files, and
  carries **Stop**, a pill for model and effort and **Mode** (Claude Code's
  Shift+Tab).
- **Opening sessions on the PC**: **New session here** per project, **Another
  project…** and continuing an earlier session. Only in folders that are projects of
  yours and with known programs.
- **Decisions**: you answer with an option or with words, with five seconds to undo
  and **Discard**. The ones that are no longer waiting go to *Earlier* and are deleted
  after a week.
- **The phone's own Settings** (saved on that device): the background, the colours, the
  type and how Adeo moves, which sections show on the home screen and in what order,
  the notifications and **Install Adeorq as an app on this device**.
- **Notifications**: they arrive even if the page is closed, through the notification
  service of your phone's browser (Google, Mozilla or Apple). On iPhone they only work
  with the app added to the home screen. The filter of which notifications are sent is
  applied on the PC.

Security: the page only listens on your PC, every request carries the key of the
paired device (only its fingerprint is left on disk) and any foreign origin is
rejected.

---

## 20. Streaming mode

Designed so that you can broadcast without giving away your keys. It has four pieces:

1. **Covered, not blurred**: the foot of the sidebar, the Foreman's summary, the names
   of accounts and the Agenda's texts are covered with a solid bar. A soft blur can be
   undone from a recording, which is why it is not used. **The titles of your sessions
   and the day's goals are not covered**: they are the thread of what you are doing,
   and without them the stream makes no sense.
2. **Alt to look**: the mouse hovering over reveals nothing. Hold **Alt** to see what is
   covered; when you let go, or switch window, it is covered again.
3. **The shield in the terminals**: what the agent writes is checked before it is
   painted and anything shaped like a key is changed to ●●●: Anthropic, OpenAI, AWS or
   Google keys, GitHub and Slack tokens, JWTs, private keys, passwords inside a
   connection string, variables like `API_KEY=…`, your email and your user in paths.
   The agent does get the real text: it is only hidden from view.
4. **The curtain, Ctrl+Shift+P**: covers the whole window instantly; it comes back with
   a click or with the same keys. **It is only put on by hand.**

When the shield covers something a card appears at the bottom right, "I masked
something that looks like…", with a piece of advice and the **Got it** button. As the
shield acts **before** it is painted, if the card appears it means **nothing was seen
on the stream**. The advice depends on what it was:

- **Reddish border** (key, token, password; lasts nine seconds): it was not seen, but
  that key is still loose wherever it was stored. What you have to look at is where it
  came from.
- **Blue border** (your email or a path with your user; lasts five): covered and that
  is all.

You can also cover **a single terminal** with the eye in its header or with the right
click (*Cover this terminal (for streaming)*).

What it **does not do**: it does not fix what already came out before you turned it
on, it does not cover your browser or the system notifications, and no list of
patterns is complete. What protects you most is still a **30-second delay in OBS**.
The whole reasoning is in `docs/EMISION.md`.

---

## 21. Updating without losing your terminals

**The card.** Adeorq checks whether there is a new version on startup, every six hours
and when you come back to the window, and warns you in two ways: a system notification
(once per version) and an **Update Adeorq** card with the version, at the end of the
sidebar. If the bar is shrunk to a strip, only the notification warns you. One click
downloads the version (with its percentage) and installs it; afterwards it says
**Restart to get it**. The ✕ (*Not now*) hides it. It never installs by itself.

**If there are agents working.** The card says **Waiting for them to finish** and who
is half way through; when they finish, it updates by itself. If you press again, it
updates now.

**"The terminals stay alive" means** that your consoles and your agents carry on with
what they were doing: a `pnpm dev` keeps running and Claude does not start again. The
terminals live in a separate process that the installer does not close, and the new
window picks them up with their history. The limits, said plainly:

- **Only on Windows**, in the installed app and with the setting **Keep the terminals
  alive if Adeorq crashes** on (yes by default). In development, Linux and Mac it is
  off by default.
- **Without that separate process**, updating closes the terminals: Claudes are
  shut down with Ctrl+C and resumed with `--resume`, and a console loses whatever it
  had running.
- **What you close yourself kills them**: the ✕ with *Close everything*, *Quit Adeorq*
  or *Close all*. And if Adeorq dies suddenly, the terminals hold on for half an hour;
  if nobody comes back, they close by themselves.
- **The separate process belongs to the version it was born in.** After updating, the
  window is new but that process is still the old one, and the terminals you open
  afterwards in that session are born in it too until you quit Adeorq completely.
  What is new in the version that depends on that process does not reach them, so after
  updating it is worth quitting Adeorq completely as soon as you can. This has been read
  in the code and not tested with a real
  installer.
- A live terminal that was not on the saved board shows up marked as "recovered"; it is
  never killed in silence.

The Windows installer runs in passive mode. It carries no paid code signature, so
Windows may warn that it does not recognise the publisher: the installer is signed
with Adeorq's updater key, which is what guarantees that the update that reaches you
is ours.

---

## 22. Windows, Linux and Mac

Adeorq works the same on all three, with these differences.

**Windows** is where it is used most and where everything is: the terminal engine in a
separate process, the real browser, the music, the background with an icon, the clock
for scheduled orders and the Credential Manager.

**Linux.** AppImage, `.deb` and `.rpm` are published (on Fedora the `.rpm` is the
better choice; the AppImage carries its own web engine). The window is translucent and
asks for a desktop with a compositor. The differences you will see:

- Keys go to a file with 600 permissions, unencrypted (the screen says so).
- There is no music control.
- When you hit the X with terminals open it offers **Keep running in the
  background**: the window hides, with no icon, and comes back when you open Adeorq
  again.
- The panel's browser is a simple version in a frame, not the real Chromium.
- The terminals do not run in a separate process by default.
- The Video tab of the usage card is switched off.

**Mac.** There is a `.dmg` installer for Apple Silicon (macOS 12 or later) among the
published versions. It is built and started on an automatic Mac, but **it has
not yet been used daily on a real Mac**, so if something fails, tell us.

- Keys go to the login **Keychain** (service "Adeorq"); Adeorq moves into the Keychain
  the ones that were in a file and only deletes the file once it has checked that the
  key read back is identical.
- The **title bar** follows Adeorq's theme (light or dark) instead of the system mode.
- Data lives in `~/Library/Application Support/Adeorq`. Consoles use zsh, and an app
  opened from the Finder inherits the PATH of your user shell, to find your programs.
- Shortcuts use the **Control** key, not ⌘ (to be reviewed with a Mac at hand).
- As on Linux: no music control, a simple browser and terminals without a separate
  process by default. When you close the window Adeorq closes and takes its terminals
  with it.

---

## 23. Right click and tooltips

Adeorq does not use the browser's menus: they are its own, in your language and with
the shortcuts written out.

- **Right click on a terminal**: copy, paste, split right, split down, maximise, cover
  for streaming, *Revive*, *Continue on another account* and close. In a loose window,
  *Return to Adeorq*.
- **Right click on a project**: a new session of each program, an entry per extra
  account, open all its sessions, remove it from Adeorq, change its name, logo and
  order.
- **Right click on a session**: resume, pin to the top, rename, move to group, take it
  out of the project, archive, delete.
- **Right click on a gap in the Canvas**: the menu for adding pieces.
- **Mouse over almost anything**: a tooltip appears explaining what it is and its
  shortcut. The numbers and pills say exactly what they count.

---

## 24. Keyboard shortcuts

| Shortcut | What it does |
|---|---|
| Ctrl+K | The palette: type and go to any tab (also the ones you removed from the header), open terminal or project, or launch any of the shortcuts below. It searches without accents and with the words in any order. It also works inside a terminal |
| Ctrl+P | Open a file of the project in front of you by typing part of its name. Inside a terminal that key belongs to the program: you get there through Ctrl+K, "Open a file by its name" |
| Ctrl+Shift+T | New terminal (in the folder of the active one) |
| Ctrl+Shift+→ | Split the active terminal to the right |
| Ctrl+Shift+↓ (or D) | Split it down |
| Ctrl+Shift+F | Maximise or restore the active terminal |
| Ctrl+Shift+A | Call or close the Foreman |
| Ctrl+Shift+M | Call the Foreman and dictate to it |
| Ctrl+Shift+E | Streaming mode |
| Ctrl+Shift+P | The curtain: covers the whole window |
| Alt (held) | Look at what streaming mode covers |
| Ctrl+Z | Reopen the last closed terminal (outside a terminal and a text box) |
| Ctrl+Alt+Shift+0 | Switch off all mods |
| Esc | Close whatever is open on top (palette, Pulse, Foreman, notifications) |

These **cannot be changed**; those of the canvas can.

### In a terminal

| Shortcut | What it does |
|---|---|
| Ctrl+V / Ctrl+C | Paste / copy. Ctrl+C copies if there is a selection; if not, it goes to the program |
| Ctrl+F | Search inside the terminal (Enter next, Shift+Enter previous, Esc closes). It does not reach the agent |
| Shift+Tab | Change the permission mode inside Claude |

### In the panel's browser

With focus inside the browser: Ctrl+T new tab, Ctrl+W close, Ctrl+L the address bar.

### In the file editor

With the keyboard inside an open file. The code is painted with the colours of the
terminal scheme you have chosen.

| Shortcut | What it does |
|---|---|
| Ctrl+S | Save |
| Ctrl+F | Search and replace in the file |
| Ctrl+G | Go to a line |
| Alt+Z | Turn line wrapping off or on |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+Shift+[ / Ctrl+Shift+] | Fold / unfold the block you are in |

### On the canvas

These **can be changed** in **Settings › Shortcuts**: there are 31 actions. They only
act with the canvas in front and with focus outside a terminal and a text box: while
you type, the keys belong to whoever is typing.

| Shortcut | What it does |
|---|---|
| Alt+C / Alt+T / Alt+G | Open a Claude / a terminal / an Antigravity |
| Alt+N / Alt+L / Alt+I | Put a note / a localhost window / the gallery |
| Ctrl+A | Pick the whole canvas |
| Esc | Drop what is picked; if nothing is picked, leave the tool |
| Del (or Backspace) | Delete what is picked (asks once) |
| Alt+0 | Fit everything on screen |
| V M P F L R D O T E | Hand, frame, pencil, arrow, line, box, diamond, ellipse, text, eraser |
| Ctrl+Z / Ctrl+Shift+Z | Undo and redo the drawing (with a tool on) |
| Ctrl+C / Ctrl+D | Copy / duplicate what is drawn |
| Ctrl+G / Ctrl+L | Group / pin to the board |
| Ctrl+Shift+↑ / Ctrl+Shift+↓ | Bring to front / send to back |
| Ctrl+Alt+C / Ctrl+Alt+V | Copy / paste the style |
| Ctrl+Shift+E | Export the drawing |
| Ctrl (held) | While drawing, turns off the magnet of the guides |

They use Alt and not Ctrl because inside a terminal Ctrl+letter belongs to the program
running there: Ctrl+C interrupts Claude and Ctrl+R searches the history. In the combination
picker, a repeated combination takes the shortcut away from the other action, and
**Back to the factory ones** puts everything back as it came.

---

## 25. Colour legend

- **Green**: alive right now (open session, running process).
- **Amber**: waiting for you (pending question or offer).
- **Pink or red**: stopped until you answer (a question with options), or a notice
  worth looking at. Context beyond the line, in red.
- **Orange that pulses in a terminal**: that agent finished its turn and is waiting for
  you.
- **The theme's accent colour**: what you have selected or the terminal with focus.
- **Dimmed**: nothing pending, or left half done.
- **A thread of light** that runs round a session's card in the sidebar: the agent is
  working.

---

## 26. Where your things are kept

Everything is on your computer, and in formats you can open yourself. Adeorq's data
folder is `%LOCALAPPDATA%\Adeorq` on Windows, `~/.local/share/adeorq` on Linux (or
wherever `XDG_DATA_HOME` says) and `~/Library/Application Support/Adeorq` on Mac.

| What | Where (inside that folder) |
|---|---|
| Today's goals | `objetivos`, one Markdown file per day |
| Canvas notes | `notas`, in Markdown |
| The Canvas | `lienzo.json` |
| Scheduled orders | `programados.json` |
| Decisions and concierge conversations | `decisiones`, `conserje` and `chats` |
| Ideas and steps that the agents propose | `bandeja.md` |
| Failure trail | `rastro.log` |
| Summaries of the terminals that an agent closed | `rastros` |
| Accounts of each program | `accounts`, one folder per account |
| Mods | `mods` |
| Paired phone devices | `movil.json` (only their fingerprint) |
| Pasted screenshots and phone attachments | `pastes` |
| API keys and agents' keys | Windows Credential Manager, Mac Keychain or, on Linux, the `secretos` folder |
| Sessions and histories | Where each program leaves them (`~/.claude` for Claude Code): Adeorq reads them, it does not copy them |
| Your window settings (theme, type, header, parts, Cockpit layout) | In the window's own store, not in a file in that folder |

### What goes out to the internet

Adeorq carries no telemetry or analytics. Things leave your computer, and only in these
cases:

- **To look for updates**: it asks GitHub on startup, every six hours and when you come
  back to the window.
- **OpenRouter**, only if you save your key: checking the key and the balance, listing
  models, talking to one and generating the Foreman's voice.
- **The compass** of the Agenda, only if you sign in with your account.
- **Notifications to the phone**, encrypted, through your browser's notification
  service.
- **Notifications to a bot**, only if you turn them on in **Settings › Bots**: the
  webhook of your Grok Bot (the address you paste yourself) or the Hermes or OpenClaw
  program on your machine, which goes out on its own.
- **A connected bot**, if you connect one: what its permission lets it read reaches it,
  and from it, its provider.
- **The phone** goes over Tailscale; Adeorq runs `tailscale` on your machine.
- **The panel's browser and the Canvas's localhost windows** load the page you open
  yourself.
- **The agents** (Claude Code, Codex…) and the concierge reach the internet through the
  program of each one, not through Adeorq.

Ollama, Discord, local voice and the phone and MCP servers stay inside your machine.

---

## 27. Glossary in plain words

- **Terminal**: a text window where a program lives. It is not magic: it is the
  original way of talking to the computer, with no buttons.
- **Pane** (panel): each terminal box.
- **Session**: a conversation with an agent, saved on disk, that can be resumed months
  later.
- **Context**: the working memory of that conversation. Everything the model has in
  front of it right now: your messages, its answers, the files it has read and the
  results of commands. When it fills up, it compresses the old and detail is lost.
- **Tokens**: the little pieces in which that text is measured. A normal word is one or
  two.
- **Window**: the maximum size of that model's context (200,000 tokens in normal mode, a
  million in the long-context ones).
- **Effort** (low, medium, high, max): how much it thinks things over before answering.
  More effort, better answers and more quota spent.
- **Brain**: the model that does a job (haiku, sonnet or opus). They weigh ×1, ×3 and
  ×5.
- **Auto mode**: the agent applies its edits without asking your permission file by
  file, but still asks about anything risky.
- **Subagent**: a helper that the agent launches for a one-off task. It is what the ▣
  counts.
- **Quota**: how much of your subscription you have spent.
- **Account**: a login of a program, with its own folder.
- **MCP**: the local door through which an AI program can look at and handle your
  terminals.
- **Crew**: several terminals opened from the same split.
- **Swarm**: several already-open sessions gathered into a piece of the Canvas with a
  single chat.
- **Concierge**: Adeo's chat that opens sessions for you, in the Chat and on the phone.
- **Foreman**: the orchestrator agent behind the orb.

---

## 28. Frequently asked questions

- **"Do I need an Adeorq account?"** No. Adeorq is used without creating anything. The
  programs it runs (Claude Code, Codex…) do have their own accounts.
- **"Does it replace Claude Code or Codex?"** No: it runs them. Adeorq puts the room
  around them, and if they release a new feature tomorrow, you have it the same day.
- **"Does it take my data anywhere?"** There is no telemetry. What leaves your computer
  and when is in [section 26](#26-where-your-things-are-kept).
- **"Can I use two accounts of the same program?"** Yes, as long as they are yours
  ([section 12](#12-accounts)).
- **"What happens if I close a terminal with an agent working?"** The program closes,
  and everything that hung from it. If it was in the middle of a turn, that work is
  lost: check the state before closing it. The conversation is not deleted and can be
  resumed.
- **"Windows says the installer is not safe."** It is the standard warning for
  programs with no paid code signature. Press *More info › Run anyway*. The installer
  is signed with Adeorq's updater key.
- **"I updated and my terminals are still there, but with an old version behind."** That
  is what is expected: [section 21](#21-updating-without-losing-your-terminals).
- **"A terminal of mine does not let another program write into it."** It is the MCP
  tier: [section 17](#17-what-an-outside-program-can-do).
- **"My terminal looks black and white."** An inherited program put the variable
  `NO_COLOR` on it. Adeorq clears it when opening each terminal; if you see it in a
  console you opened somewhere else, remove it.
- **"Why do I have two Adeorqs open?"** The installed version only allows one window;
  if you see two, the other is development mode.
- **"I don't see the Cockpit (or the Canvas, Memory or Chat)."** It is switched off in
  **Settings › Look › Parts of Adeorq**, or removed from the header in **The header**.
  Ctrl+K takes you there anyway.

---

## 29. What it does not do yet

- **Sessions of Antigravity and of other programs**: the bar lists those of Claude
  Code, Codex and Pi. Each program saves its data its own way and the others are not
  read yet.
- **Mac daily**: the installer exists, but it has not been used on a real Mac.
- **Scheduled orders on Linux and Mac**: the clock is there, but it has not been tested
  on a real desktop.
- **Music and the real Chromium outside Windows**: on Linux and Mac there is no music
  control and the panel's browser is a simple version.
- **MCP permissions reaching a terminal from an old process**: after updating, those
  terminals are governed by the name of the program until they are closed.
