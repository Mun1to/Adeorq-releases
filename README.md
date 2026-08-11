<div align="center">

<img src="web/assets/adeorq.svg" width="78" alt="">

# Adeorq

### Nueve agentes trabajando. Una sola pantalla.

Panel de escritorio para Windows que abre tus proyectos en **terminales de verdad** —las
mismas ConPTY que usa el sistema, no una caja de chat que las imita—, te enseña tus sesiones
de Claude Code con su estado real y te deja dirigir a varios agentes a la vez sin perder de
vista a ninguno.

<br>

<!-- Los dos botones van en HTML y no en markdown (`![alt](ruta)`) a propósito.
     En markdown, el de Windows salía como un enlace roto en GitHub mientras el
     de Linux se pintaba bien, y las dos imágenes existen y se sirven con un 200
     (comprobado el 2026-08-08). La forma que SÍ funciona en este mismo archivo
     es la de la línea del logo de arriba: un `<img>` con su ancho puesto. Con
     `width` explícito además quedan exactamente a la par, que en markdown
     dependía de que GitHub respetara el `viewBox`. -->
<a href="https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-setup.exe"><img src="web/assets/descargar-windows.svg" width="330" alt="Descargar Adeorq para Windows"></a>
<a href="https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-x86_64.AppImage"><img src="web/assets/descargar-linux.svg" width="330" alt="Descargar Adeorq para Linux"></a>

**Gratis · sin cuenta · sin API keys · se actualiza sola**

[![Última versión](https://img.shields.io/github/v/release/Mun1to/Adeorq-releases?label=&color=1C66DE&style=flat-square)](https://github.com/Mun1to/Adeorq-releases/releases/latest)
&nbsp;
[Todas las versiones](https://github.com/Mun1to/Adeorq-releases/releases) ·
[La web](https://mun1to.github.io/Adeorq-releases/) ·
[La guía](https://mun1to.github.io/Adeorq-releases/guia.html) ·
[English](README.en.md)

<br>

<img src="web/assets/screens/cockpit.png" alt="La Cabina: nueve terminales reales en un mosaico">

</div>

---

## Funciona con TU cuenta

Adeorq no vende ni incluye acceso a ningún modelo. **Usa las suscripciones que ya pagas** y
los CLI que ya tienes instalados: Claude Code, Codex, Gemini CLI, Antigravity, Copilot, Qwen,
Crush, opencode, Amp, Cursor, pi y Kiro. Si tienes varias cuentas, cada terminal puede nacer
con la suya.

Ese es el motivo de existir: **las novedades de los modelos llegan antes a la línea de
comandos que a las aplicaciones de escritorio**. Adeorq monta la experiencia encima de esos
programas en lugar de sustituirlos, así que el día que salga algo nuevo, lo tienes.

## Qué hay dentro

| | |
|---|---|
| **La Cabina** | Un mosaico de terminales reales. Se parten, se mueven, se apartan sin cerrarse y vuelven donde estaban al reabrir. |
| **Tus sesiones** | Lee `~/.claude` sin API ninguna: título, estado real (te pregunta / terminó / a medias), cuándo fue y cuáles siguen vivas. Un clic las retoma dentro del panel. |
| **El Capataz** | Le pides el tablero hablando y te propone un plan. Nada se ejecuta sin tu OK, y el plan pasa por una verja determinista antes de que lo veas. |
| **El Lienzo** | Tablero infinito con las terminales dentro, notas, imágenes, kanban y flechas que encadenan a un agente con el siguiente. |
| **Modo Espejo** | Cada agente en su propio worktree de git. Ves el diff y decides si entra o se descarta. |
| **La Agenda** | Lo que se te viene encima, tus objetivos del día y las ideas que los agentes te dejan por el camino. |
| **La Memoria** | Tu bóveda de Obsidian dentro del panel, con búsqueda por contenido y el mapa de lo que enlaza con qué. |

<div align="center">
<img src="web/assets/screens/canvas.png" width="49%" alt="El Lienzo">
<img src="web/assets/screens/dashboard.png" width="49%" alt="El Panel">
</div>

## Al instalar: Windows te va a avisar

**Es esperado.** El instalador no lleva firma de código —un certificado Authenticode cuesta
varios cientos de euros al año—, así que SmartScreen enseña *«Windows protegió su PC»* la
primera vez.

Para seguir: **Más información → Ejecutar de todas formas**.

Descárgalo siempre desde
[la página de releases de este repositorio](https://github.com/Mun1to/Adeorq-releases/releases/latest)
y de ningún otro sitio. Y una vez instalado, **las actualizaciones sí van firmadas**: Adeorq
verifica la firma criptográfica de cada una antes de aplicarla, así que ese aviso solo sale
la primera vez.

## En Linux

Descarga
**[Adeorq-x86_64.AppImage](https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-x86_64.AppImage)**,
dale permiso y arráncalo. No hay nada que instalar:

```bash
chmod +x Adeorq-x86_64.AppImage
./Adeorq-x86_64.AppImage
```

En la [página de releases](https://github.com/Mun1to/Adeorq-releases/releases/latest) hay
también un `.deb` para Debian y Ubuntu (`sudo apt install ./Adeorq_*.deb`).

**Tres cosas funcionan distinto**, y es mejor saberlas antes que descubrirlas:

- **Los secretos.** En Windows van al Almacén de credenciales, que los cifra con tu sesión.
  En Linux no existe ese almacén, así que van a un archivo con permisos `600` dentro de
  `~/.local/share/adeorq/secretos`: eso los protege de otros usuarios de la máquina, no de
  otro programa tuyo.
- **El reproductor de música** (qué suena, siguiente, volumen) es de Windows: lo publica el
  propio sistema y en Linux el equivalente es MPRIS, que todavía no está.
- **La ventana es translúcida**, así que necesita un escritorio con composición. Cualquier
  GNOME o KDE moderno la tiene; en uno sin compositor el cristal se verá opaco.

Se compila sobre **Ubuntu 22.04**, así que hace falta glibc 2.35 o posterior (Ubuntu 22.04+,
Debian 12+, Fedora 36+, Arch).

## Compilarlo tú

```bash
pnpm install
pnpm tauri dev      # ventana de desarrollo
pnpm tauri build    # instalador
```

Hace falta [Rust](https://rustup.rs). En Windows, además, las herramientas de compilación de
Visual Studio; en Linux, las de Tauri 2:

```bash
sudo apt install build-essential pkg-config libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

## Don't trust it, check it

Open source only helps if somebody actually reads the code, and almost nobody does. So
instead of asking you to trust this project, here is the prompt to check it: point your own
AI agent at this repository and get a security report, in your language, in a few minutes,
even if you do not know how to program.

**[Open AI-AUDIT.md](AI-AUDIT.md)** and paste it into Claude Code, Codex, Cursor, Copilot or
whatever you use. It is the same prompt in every public repository here, so you can compare.

> **ES:** No hace falta que te fíes. Abre [AI-AUDIT.md](AI-AUDIT.md), pega ese texto en tu IA
> y te dirá en tu idioma qué hace este programa de verdad: qué envía por internet, qué toca
> en tu ordenador y qué ejecuta al instalarse.

## Licencia

**El código está a la vista. Eso no lo hace software libre.**

Puedes instalar Adeorq y usarlo libremente, para ti o para tu empresa, y puedes leer,
estudiar y compilar este código. Lo que **no** puedes es redistribuirlo, revenderlo ni
publicar versiones derivadas. Está todo explicado, y en castellano legible, en
[`LICENSE`](LICENSE).

Los componentes de terceros que incorpora conservan sus propias licencias, con sus avisos de
copyright recogidos en [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## Construido sobre

Sin estos proyectos Adeorq no existiría. Todos con licencias permisivas, todos acreditados
uno a uno con su copyright en [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

| | |
|---|---|
| [**Tauri**](https://tauri.app) | La ventana y el puente a Rust. Un binario de 5 MB en vez de 150. |
| [**xterm.js**](https://xtermjs.org) | El emulador de terminal, con su renderizador WebGL. |
| [**portable-pty**](https://github.com/wezterm/wezterm/tree/main/pty) (WezTerm) | Los ConPTY de verdad, desde Rust. |
| [**React**](https://react.dev) + [**Vite**](https://vite.dev) | La interfaz. |
| [**React Flow**](https://reactflow.dev) | El lienzo infinito. |
| [**Ollama**](https://ollama.com) · [**whisper.cpp**](https://github.com/ggml-org/whisper.cpp) | Lo que corre en tu máquina: resúmenes y dictado, sin salir de casa. |

## Avisos

No afiliado a Anthropic, OpenAI, Google ni Microsoft. Sus nombres y logotipos son marcas de
sus respectivos titulares y aquí solo sirven para identificar con qué herramienta estás
trabajando.

¿Algo va mal? [Abre una incidencia](https://github.com/Mun1to/Adeorq-releases/issues).
