# Hero · English

`data-i18n` keys, for `TEXTOS.en` in `js/boot.js`.

## hero.pildora
Real terminals, not another chat box

## hero.titulo1
Nine agents working.

## hero.titulo2
One single screen.

## hero.entrada
Adeorq is a desktop panel for Windows. It opens your projects in real terminals, shows your
Claude Code sessions with their actual state, catches loose ideas in the Agenda and updates
itself.

## cta.windows
Download for Windows

## cta.meta
free, no account

## cta.como
See how it works

## hero.nota1
Windows 10 and 11

## hero.nota2
Updates itself

## hero.nota3
No API keys

## hero.bajar
more

## demo strings **[rebuilt: see DISENO.md §8 bis]**

The mockup is being redrawn to match the real app. New keys:

| Key | English |
|---|---|
| `demo.panel` | Panel |
| `demo.cabina` | Cockpit |
| `demo.lienzo` | Canvas |
| `demo.cuentas` | Accounts |
| `demo.cabina.n` | 2 |
| `demo.emision` | Broadcast |
| `demo.capataz` | Foreman |
| `demo.workspaces` | Workspaces |
| `demo.proy1` | Adeorq |
| `demo.proy1.badge` | 4 |
| `demo.proy1.wait` | 1 |
| `demo.s1` | web hero |
| `demo.s1.ago` | now |
| `demo.s2` | website copy |
| `demo.s2.ago` | 1 h ago |
| `demo.proy2` | VoCript |
| `demo.proy2.badge` | 2 |
| `demo.s3` | voice dictation |
| `demo.s3.ago` | yesterday |
| `demo.proy3` | froede |
| `demo.proy4` | Layco |
| `demo.pie` | C:\proyectos · sessions from ~/.claude |
| `demo.pane1.proy` | Adeorq |
| `demo.pane1` | web hero |
| `demo.pane1.agents` | ▣ 2 |
| `demo.pane1.ctx` | 43% |
| `demo.pane1.modelo` | Opus 5 |
| `demo.pane1.esfuerzo` | high |
| `demo.pane2.proy` | VoCript |
| `demo.pane2` | pnpm tauri dev |

Terminal lines, pane 1 (the prompt line is the only translated bit, the tool lines are what
Claude Code actually prints):

```
> build the hero with the tokens from DISENO.md

⏺ Read(web/DISENO.md)
  ⎿  214 lines

⏺ Update(web/styles/hero.css)
  ⎿  3 additions

⏺ Done: the hero now uses the new tokens.
```

Archive warning, moved to feature card 02: `⚠ This project has 3 files with unsaved changes in
git`, followed by `Adeorq does not touch them. The official app would delete them on archive,
with no warning.`

## Ready to paste into `js/boot.js`

```js
'hero.pildora': 'Real terminals, not another chat box',
'hero.titulo1': 'Nine agents working.',
'hero.titulo2': 'One single screen.',
'hero.entrada': 'Adeorq is a desktop panel for Windows. It opens your projects in real ' +
                'terminals, shows your Claude Code sessions with their actual state, catches ' +
                'loose ideas in the Agenda and updates itself.',
'cta.windows': 'Download for Windows',
'cta.meta': 'free, no account',
'cta.como': 'See how it works',
'hero.nota1': 'Windows 10 and 11',
'hero.nota2': 'Updates itself',
'hero.nota3': 'No API keys',
'hero.bajar': 'more',
```

## Mockup description (`aria-label`)

Mockup of the Adeorq panel: the tab bar, the session list per project with its state and two
open terminals, one of them done with its turn
