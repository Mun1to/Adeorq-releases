# Questions · English

`data-content` keys. Six questions, awkward ones included.

## faq.eyebrow
Questions

## faq.titulo
What people usually ask.

## faq.lead
Short answers below. If yours is missing, say so and it gets added.

---

## faq.0.p
Do I need an API key or a separate subscription?

## faq.0.r
No. Adeorq uses the CLI you already have installed and the session you are already logged into.
It asks for no keys, stores no credentials and sends your code to no server of ours. Whatever
quota you spend, you would spend the same typing into the terminal by hand.

## faq.1.p
Does it work with anything other than Claude Code?

## faq.1.r
The terminals are real, so you can run whatever you like inside them: Antigravity, Codex, Gemini
or your own script. What is tuned for Claude Code today is the session reading, because it is
the only one that stores them in readable files. The others are on the list.

## faq.2.p
Why does Windows warn me during install?

## faq.2.r
Because the installer has no publisher certificate yet, and SmartScreen distrusts anything with
few downloads by default. Updates are signed and verified by the app. Before running anything,
check the file comes from our GitHub releases page and is named
`Adeorq_<version>_x64-setup.exe`.

## faq.3.p
Is there a macOS or Linux version?

## faq.3.r
Not today. The terminals rely on ConPTY, which is a Windows thing, so porting it is real work
and not a box to tick. If you want it, say so: that is what moves it up the list.

## faq.4.p
How much space and memory does it take?

## faq.4.r
The installer is 3.5 MB. It is a native app built with Tauri, with no browser packed inside, so
it starts instantly and sits quiet when idle. Anything beyond that is what your agents and your
terminals already consume.

## faq.5.p
Does my data leave the computer?

## faq.5.r
Only what already left through your CLI. Adeorq reads local files to show you your projects and
sessions, and checks whether a new version exists. Nothing else. It also ships a broadcast mode
that masks paths, names and keys for when you share your screen or go live.
