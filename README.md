<div align="center">

<img src="web/assets/adeorq.svg" alt="Adeorq" height="88">

# Adeorq

**Nine agents working. One screen.**

A desktop panel for Windows, Linux and Mac that opens your projects in **real terminals** (the same ConPTY the system uses, not a chat box imitating one), shows your Claude Code sessions with their actual state, and lets you run several agents at once without losing track of any of them. And it comes with you: **from your phone or any browser**, wherever you are.

<a href="https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-setup.exe"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-windows-dark.svg"><img src=".github/readme/download-windows-light.svg" alt="Download Adeorq for Windows"></picture></a>
<a href="https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-arm64.dmg"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-mac-dark.svg"><img src=".github/readme/download-mac-light.svg" alt="Download Adeorq for Mac"></picture></a>
<a href="https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-x86_64.AppImage"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-linux-dark.svg"><img src=".github/readme/download-linux-light.svg" alt="Download Adeorq for Linux"></picture></a>

Free · no account · no API keys · updates itself · [PolyForm Shield License 1.0.0](LICENSE)

[All releases](https://github.com/Mun1to/Adeorq-releases/releases) · [Website](https://adeorq.com) · [Guide](https://adeorq.com/guia) · [Latest version](https://github.com/Mun1to/Adeorq-releases/releases/latest) · [Español](README.es.md)

</div>

<p align="center"><img src="web/assets/screens/en/cockpit.png" alt="The Cockpit with four agents at once, each in its own project: a Claude Code session that has finished, Codex working, a Claude Code session asking permission with the answer buttons above its terminal, and another one in the middle of an edit"></p>

<p align="center">Four agents, four projects. One has finished, two are working, and one is asking permission, with the answer one click away.</p>

## How it works

<p align="center"><picture>
<source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset=".github/readme/how-it-works-dark-narrow.svg">
<source media="(max-width: 600px)" srcset=".github/readme/how-it-works-light-narrow.svg">
<source media="(prefers-color-scheme: dark)" srcset=".github/readme/how-it-works-dark.svg">
<img src=".github/readme/how-it-works-light.svg" alt="Download it and open it.: There is no account to create and no key to paste. Tell it where your projects live.: Every folder in there becomes a project in the sidebar, with the sessions you already had in each one. Click a project.: A session of your usual CLI opens in a real terminal, in that folder (Claude Code, out of the box). Click another project and you have two.">
</picture></p>

## What is inside

|  |  |
|---|---|
| **Home** | Adeo and one box to ask him for anything in your own words: he splits it into sessions and the router picks the model. Beside it, your projects ordered by who is waiting for you and who is working, and your usage this month. |
| **The Cockpit** | A grid of real terminals. Split them, move them, set them aside without closing them, and find them where you left them next time. And if you want, they survive Adeorq itself: with **Settings > Terminals > Keep the terminals alive if Adeorq crashes** (experimental), your agents keep working through a crash and reattach when you open it again. |
| **Your sessions** | Reads `~/.claude`, and Codex's `~/.codex`, with no API at all: title, real state (asking you / finished / halfway), how long ago, and which ones are still alive. One click resumes any of them inside the panel. |
| **Adeo's plan** | Tell Adeo what you want out loud and he proposes a board. Nothing runs without your OK, and the plan goes through a deterministic gate before you even see it. |
| **The Canvas** | An infinite board with the terminals living inside it, plus notes, images, a kanban, and arrows that hand one agent's output to the next. A note with a title and steps can be **saved as a runbook** in the project's `docs/fichas`, ready to repeat. |
| **Swarms** | Join sessions that are already open on the canvas into one group chat: drop a terminal on another, or **Add > Swarm**. What you type goes to Adeo, who picks the session it belongs to, rewrites the task and sends it; what each session answers comes back to the chat under its name. |
| **The web pane** | Your localhost right beside the agent building it: a small browser with tabs, back and forward, and one click to swap in YOUR real browser, extensions and all. |
| **Files** | The project's tree beside the terminals. Create files and folders, rename them or move them to the recycle bin from the right-click menu; open one in the editor, where images and PDFs show as themselves. And **Ctrl+K > Search in the files** finds text inside the project and opens the hit at its line. It also shows **what your agent touches**: the latest thing that terminal's session did, and the files it read, edited or committed. |
| **Shadow Mode** | Each agent in its own git worktree. You read the diff and decide whether it lands or gets thrown away. |
| **Decisions** | When an agent needs you to choose, it asks with numbered options and says which one it would pick. You answer in its own tab, or from your phone, and the answer goes straight back to the terminal that asked. |
| **The Agenda** | What is coming at you, your goals for the day, and the ideas your agents leave behind along the way. Plus orders that run on their own, on the days and at the hour you set, with a breaker that stops one after three failures in a row. |
| **Your profile and usage** | Your name, your @ and your photo, with your Accounts, Agenda, Memory and Commands inside, each with its summary. Below, your usage: this month's tokens by provider, model or project, the year in squares, and a card to share it as an image or a video. |
| **Accounts** | Several logins of the same CLI side by side, each with its plan and how much of its limit is left. You choose which one new terminals are born with, or open a terminal on a specific one. |
| **Commands** | Everything you can type inside each agent, searchable by what you want to do rather than by its name, and sent to the terminal with one click. |
| **Your agents and bots** | One button connects your Claude Code to Adeorq, in the welcome and in **Settings > Terminals**, and takes the entry out again just as cleanly. **Settings > Bots** connects Hermes or OpenClaw with one click, each with its own permission, and tells them (and your Grok Bot) when a terminal finishes or is waiting for you, sending only its name, its project and its state. A program from outside Adeorq sees the list of terminals and the usage, and can open new ones; to let it read more, raise it in **Settings > Terminals**. |
| **Memory** | Your Obsidian vault inside the panel, searchable by what the notes say, with a map of what links to what. |
| **Adeo in the Chat** | One chat with two tabs. In **Adeo**, he opens sessions for you as tabs, with a router that picks which model or client takes each job, and at the bottom you choose which of your Claude accounts he thinks with. In **Sessions**, your usual ones by project, from Claude Code, Codex, Gemini and Pi, read as a conversation or opened raw in their terminal. |
| **On your phone** | Adeo, your sessions and every terminal, from any browser and wherever you are. Attach photos, get a notification when an agent asks you something, and see what an agent shares with you under **To look at**: an image, a page or a phone-sized capture of the web it is building on your PC. |
| **Adeo** | The little pixel A in the top bar is the bell. He types when your agents are working, waves when one is waiting for you, jumps when one finishes and sleeps when there are none, and follows your mouse with his eye. |

## Screenshots

<table>
<tr>
<td width="50%" valign="top"><img src="web/assets/screens/en/canvas.png" alt="The Canvas: three terminals living on the board, a swarm that joins two of them into one chat, two notes and the board of what every agent is doing"><br>The Canvas: three terminals living on the board, a swarm that joins two of them into one chat, two notes and the board of what every agent is doing</td>
<td width="50%" valign="top"><img src="web/assets/screens/en/files.png" alt="Files: the project's tree on the right, a file open in the editor, and two terminals with the tests passing and the diff"><br>Files: the project&#39;s tree on the right, a file open in the editor, and two terminals with the tests passing and the diff</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top"><img src="web/assets/screens/en/dashboard.png" alt="Home: Adeo with the box to ask him for anything, your projects by who is working, and your usage in squares"><br>Home: Adeo with the box to ask him for anything, your projects by who is working, and your usage in squares</td>
<td width="50%" valign="top"><img src="web/assets/screens/en/profile.png" alt="Your profile: your name, the summaries of Accounts, Agenda, Memory and Commands, and your usage with the month, the year and the split by project"><br>Your profile: your name, the summaries of Accounts, Agenda, Memory and Commands, and your usage with the month, the year and the split by project</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top"><img src="web/assets/screens/en/decisions.png" alt="Decisions: a question from an agent with its numbered options, the recommended one marked, and the answer being filled in"><br>Decisions: a question from an agent with its numbered options, the recommended one marked, and the answer being filled in</td>
<td width="50%" valign="top"><img src="web/assets/screens/en/agenda.png" alt="The Agenda: the month with each day's goals, what your agents propose, and today's goals in a floating panel"><br>The Agenda: the month with each day&#39;s goals, what your agents propose, and today&#39;s goals in a floating panel</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top"><img src="web/assets/screens/en/accounts.png" alt="Accounts: two Claude Code logins and a Codex one, each with its plan and how much of its limit is used"><br>Accounts: two Claude Code logins and a Codex one, each with its plan and how much of its limit is used</td>
<td width="50%" valign="top"><img src="web/assets/screens/en/swarm.png" alt="A swarm: two sessions joined into one chat, Adeo splitting the task between them and each session's answer coming back under its name"><br>A swarm: two sessions joined into one chat, Adeo splitting the task between them and each session&#39;s answer coming back under its name</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top"><img src="web/assets/screens/en/board.png" alt="The board of what the agents are doing: to do, working, waiting on you and done, with each session's project, state and context used"><br>The board of what the agents are doing: to do, working, waiting on you and done, with each session&#39;s project, state and context used</td>
<td width="50%" valign="top"><img src="web/assets/screens/en/commands.png" alt="Commands: everything you can type inside Claude Code and Antigravity, with a search box to find them by what you want to do"><br>Commands: everything you can type inside Claude Code and Antigravity, with a search box to find them by what you want to do</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top"><img src="web/assets/screens/en/settings.png" alt="Settings: the theme picker with every theme of the house, and the colour of the terminals below it"><br>Settings: the theme picker with every theme of the house, and the colour of the terminals below it</td>
<td width="50%" valign="top"><img src="web/assets/screens/en/phone-home.png" alt="Adeorq on a phone: what is waiting for you, the agent that is running, your conversations and the box to tell Adeo what to do"><br>Adeorq on a phone: what is waiting for you, the agent that is running, your conversations and the box to tell Adeo what to do</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top"><img src="web/assets/screens/en/phone-concierge.png" alt="Adeo on a phone: one message split into two sessions in two projects, each with the model the router picked and why"><br>Adeo on a phone: one message split into two sessions in two projects, each with the model the router picked and why</td>
<td width="50%" valign="top"><img src="web/assets/screens/en/phone-menu.png" alt="The menu on a phone: Adeo, Terminals, Decisions, To look at, Scheduled and Usage on top, and below them your projects with their sessions and conversations, the one you used last first"><br>The menu on a phone: Adeo, Terminals, Decisions, To look at, Scheduled and Usage on top, and below them your projects with their sessions and conversations, the one you used last first</td>
</tr>
</table>

## Windows will warn you when you install it

**That is expected.** The installer is not code-signed (a certificate for an individual costs
around 200 euros a year, and even signed installers keep the warning until they have built up
reputation with Microsoft), so SmartScreen shows *"Windows protected your PC"* the first time.

To carry on: **More info > Run anyway**.

Always download it from
[this repository's releases page](https://github.com/Mun1to/Adeorq-releases/releases/latest)
and nowhere else. And once installed, **updates are signed**: Adeorq verifies each one's
cryptographic signature before applying it, so that warning only ever appears once.

<details>
<summary><b>On a Mac</b></summary>

Download
**[Adeorq-arm64.dmg](https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-arm64.dmg)**,
open it and drag Adeorq to Applications. It is for **Apple Silicon** only (arm64, M1 and
newer) with macOS 12 or later; Macs with Intel are not supported.

**It opens like any other app.** The app and its disk image are signed with an Apple
Developer ID and notarized by Apple, so Gatekeeper does not stop it with the warning that
Apple cannot check it. Its updates are signed too, and install themselves.

The first time an agent in one of your terminals reads your Desktop, Documents or Downloads
folder, macOS asks once per folder whether Adeorq may: it puts down to Adeorq whatever the
programs in its terminals read. Voice dictation asks for the microphone.

It is built and started on an automatic Mac, but **it has not yet been used daily on a real
Mac**, so if something fails, [tell us](https://github.com/Mun1to/Adeorq-releases/issues).

**What works differently:**

- **Keys** go to the login **Keychain** (service "Adeorq"), and the ones that were in a
  file move there on their own.
- The **title bar** follows Adeorq's theme (light or dark) instead of the system mode.
- Data lives in `~/Library/Application Support/Adeorq`. Consoles use zsh, and an app opened
  from the Finder inherits the PATH of your user shell, so it finds your programs.
- Shortcuts use the **Control** key, not Command (⌘).
- As on Linux: no music controls, a simpler browser in the web pane and terminals without a
  separate process by default. Closing the window closes Adeorq and takes its terminals
  with it.

</details>

<details>
<summary><b>On Linux</b></summary>

Download
**[Adeorq-x86_64.AppImage](https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-x86_64.AppImage)**,
make it executable and run it. There is nothing to install:

```bash
chmod +x Adeorq-x86_64.AppImage
./Adeorq-x86_64.AppImage
```

If it says "Cannot mount AppImage, please check your FUSE setup", install `fuse3`
(`sudo apt install fuse3`, `sudo dnf install fuse3`) or open it with `--appimage-extract-and-run`.

The [releases page](https://github.com/Mun1to/Adeorq-releases/releases/latest) also carries a
`.deb` for Debian and Ubuntu (`sudo apt install ./Adeorq_*.deb`) and an `.rpm` for Fedora
(`sudo dnf install ./Adeorq-*.rpm`).

**Four things work differently**, and it is better to know them upfront:

- **Secrets.** On Windows they go to the Credential Manager, which encrypts them with your
  login. Linux has no such vault, so they go to a `600` file under
  `~/.local/share/adeorq/secretos`: that protects them from other users of the machine, not
  from another program of yours.
- **The music controls** (what is playing, next, volume) are Windows-only: the system itself
  publishes that, and the Linux equivalent is MPRIS, which is not in yet.
- **The window is translucent**, so it needs a compositing desktop. Any modern GNOME or KDE
  has one; without a compositor the glass will look opaque.
- **There is no tray icon.** If you keep Adeorq running in the background when you close the
  window, your agents and the Agenda's scheduled orders carry on, and you come back by opening
  Adeorq again.

It is built on **Ubuntu 22.04**, so it needs glibc 2.35 or newer (Ubuntu 22.04+, Debian 12+,
Fedora 36+, Arch).

</details>

## It runs on YOUR account

Adeorq neither sells nor bundles access to any model. It **uses the subscriptions you already
pay for** and the CLIs you already have installed, twenty-two of them today: Claude Code,
Codex, Gemini CLI, Antigravity, Copilot, Cursor, Qwen, Grok, Kimi Code, Kiro, pi, opencode,
Crush, Amp, Aider, Goose, Droid, Jules, Auggie, Codebuff, Cody and CodeWhale. If you have more
than one account, each terminal can be born on a different one.

That is the whole reason it exists: **new model features land on the command line before they
land in desktop apps**. Adeorq builds the experience on top of those programs instead of
replacing them, so the day something new ships, you have it.

<sub>Every screenshot is the real app, opened on a demo workshop instead of anybody's projects. The agents in the
terminals are real sessions, recorded in those demo projects and played back; the accounts, their limits and the
usage are sample data.</sub>

## From your phone, or any browser

Adeorq can travel with you: from your phone, a tablet or another computer you talk to
Adeo, read your sessions, type into any terminal and get a notification when an agent
finishes or asks you something. What you see is **your PC**, not a copy in the cloud, so it
has to be on with Adeorq open. Set it up once:

1. Install [Tailscale](https://tailscale.com/download) on the PC and on your phone, and sign
   in with the same account on both. It is a private network between your devices, free for
   personal use.
2. In Adeorq, open **Settings > Mobile** and turn on **Adeo on your phone**.
3. Press **Bring Adeo to Tailscale**. The first time, Tailscale may ask you to enable
   HTTPS on your account: if a link appears, open it, enable it and press again.
4. Press **Pair a phone**. You get a QR code with your address
   (`https://your-pc.your-net.ts.net:8443`) and a six-digit code that lasts ten minutes.
5. On your phone, with Tailscale on, scan the QR code, type the code and press **Pair**. Each
   browser pairs once. The page speaks the language Adeorq is set to.

When an agent needs you to choose something, it asks you with its numbered options and the
question reaches your phone, under **Decisions**; your answer goes straight back to the terminal
that asked. And a **mode button** does what Shift+Tab does on the PC in Claude Code.

On Android the page installs as an app with its own icon; on iPhone, Safari > Share > Add to
Home Screen. **Why it is safe to leave on:** Adeorq only listens inside your PC and Tailscale
carries it to your devices through an encrypted tunnel, so it cannot be seen from the
internet; every request still needs the key of a paired device, and only a fingerprint of
each key is kept on disk. Full steps in [the guide](https://adeorq.com/guia#movil).

Adeorq would not exist without these. All permissively licensed, all credited one by one with
their copyright in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## Notices

Not affiliated with Anthropic, OpenAI, Google, Microsoft or Apple. Their names and logos are
trademarks of their respective owners and appear here only to identify which tool or system
you are working with.

Something wrong? [Open an issue](https://github.com/Mun1to/Adeorq-releases/issues). If the
window froze, look in `rastro.log`, in Adeorq's data folder (`%LOCALAPPDATA%\Adeorq` on
Windows): every stall of the window is written there with its culprit, and those lines help
in the issue.

## Don't trust it, check it

Published code only helps if somebody actually reads it, and almost nobody does. So
instead of asking you to trust this project, here is the prompt to check it: point your own
AI agent at this repository and get a security report, in your language, in a few minutes,
even if you do not know how to program.

**[Open AI-AUDIT.md](AI-AUDIT.md)** and paste it into Claude Code, Codex, Cursor, Copilot or
whatever you use. It is the same prompt in every public repository here, so you can compare.

> **ES:** No hace falta que te fíes. Abre [AI-AUDIT.md](AI-AUDIT.md), pega ese texto en tu IA
> y te dirá en tu idioma qué hace este programa de verdad: qué envía por internet, qué toca
> en tu ordenador y qué ejecuta al instalarse.

<details>
<summary><b>Building it yourself</b></summary>

```bash
pnpm install
pnpm tauri dev      # development window
pnpm tauri build    # installer
```

You need [Rust](https://rustup.rs). On Windows, also the Visual Studio build tools; on Linux,
Tauri 2's own:

```bash
sudo apt install build-essential pkg-config libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

</details>

## Licence

**[PolyForm Shield License 1.0.0](LICENSE)**, an off-the-shelf licence written by
lawyers, not a bespoke EULA.

You may do **anything** with Adeorq, including using it for your work and your
company's: read the source, study it, audit it, modify it, compile it, fork it and
distribute it. The one thing you may not do is use it to provide a product that
**competes** with Adeorq. The licence spells out that competing includes giving it
away free, and that marketing something as a practical substitute for Adeorq
"definitely competes".

Put the way people actually ask it: **you cannot sell Adeorq**, nor a modified
version of it, nor charge others for access to it. Selling the work YOU do with
Adeorq is your business.

Trademark and AI-provider notices are in [`NOTICE.md`](NOTICE.md). Third-party
components keep their own licences, with every copyright notice collected in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

<details>
<summary><b>Built on</b></summary>

|  |  |
|---|---|
| [**Tauri**](https://tauri.app) | The window and the bridge to Rust. A 5 MB binary instead of 150. |
| [**xterm.js**](https://xtermjs.org) | The terminal emulator, with its WebGL renderer. |
| [**portable-pty (WezTerm)**](https://github.com/wezterm/wezterm/tree/main/pty) | Real ConPTY, from Rust. |
| [**React + Vite**](https://react.dev) | The interface. |
| [**React Flow**](https://reactflow.dev) | The infinite canvas. |
| [**Ollama · whisper.cpp**](https://ollama.com) | What runs on your own machine: summaries and dictation, without leaving the house. |

</details>

<br>

<p align="center">Made by <a href="https://munito.dev"><b>Munir Torres</b></a>. Also by him: <a href="https://vocript.app">VoCript</a> · <a href="https://winshotx.com">winshotx</a> · <a href="https://github.com/Mun1to/Expoal">Expoal</a> · <a href="https://github.com/Mun1to/hotkeyconfig">hotkeyconfig</a> · <a href="https://github.com/Mun1to/froede">froede</a></p>
