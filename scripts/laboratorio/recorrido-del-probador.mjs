// Recorrer la app como el revisor de la Microsoft Store, con el paquete fingido y sin
// ninguna cuenta de IA (encargo E30). Es el recorrido de `docs/contexto/tiendas/notas-del-probador.md`
// (los cinco pasos y lo que necesita una cuenta de IA) y de las frases de «lo que se ve» de
// `ficha.md`, pulsadas en la app de verdad y con fotos.
//
//   node scripts/laboratorio/recorrido-del-probador.mjs [carpeta para las fotos] [exe]
//
// Lo que finge, y lo que no:
//  · `ADEORQ_FINGIR_EMPAQUETADA=1`: el mismo ejecutable de desarrollo con la señal del paquete.
//    NO es un `.msix` instalado (eso lo midió E25 en un runner).
//  · Un `PATH` de Windows limpio: solo el sistema y Git. Ni `claude`, ni `codex`, ni `gemini`, ni
//    node: como el equipo de quien revisa. La casa es una carpeta vacía y sin sesiones.
//  · La bienvenida de verdad (sin el perfil que siembra `abrirAislada`), con una carpeta de usuario
//    de mentira que trae Desktop, Documents y Downloads, y un repositorio de Git en Documents.
//    El revisor cae en la carpeta de usuario (`raiz_por_defecto`): aquí hay que sembrarla, porque
//    en esta máquina existe `C:\proyectos` y la ganaría.
//  · Nada de una cuenta de IA: no se escribe a ningún modelo. Lo que un agente haría (preguntar
//    una decisión) se hace desde fuera, por el puente del MCP, como un programa cualquiera.
//
// Dice `OK` o `FALLO` por cada cosa que las notas afirman, y `VISTO` por lo que solo se mira (las
// fotos). Sale con 1 si algo no se cumple.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const exe = resolve(process.argv[3] || EXE);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
const visto = (texto, detalle = "") => console.log(`VISTO ${texto}${detalle ? `\n      ${detalle}` : ""}`);
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const GIT = (spawnSync("where", ["git"], { encoding: "utf8" }).stdout ?? "").split(/\r?\n/)[0].trim();
const PATH_LIMPIO = ["C:\\WINDOWS\\system32", "C:\\WINDOWS", "C:\\WINDOWS\\System32\\Wbem", "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0", ...(GIT ? [GIT.replace(/\\git\.exe$/i, "")] : [])].join(";");

/** Lo que dice cada idioma en la pantalla (el revisor ve el de su Windows: casi seguro inglés). */
const T = {
  en: { next: "Next", skip: "Skip", entrar: "Just go in", terminal: "Terminal", bienvenida: "Welcome to Adeorq", carpeta: "Where your projects live", agentes: "Your agents", noEsta: "not here", noCarpeta: "They are not all in one folder" },
  es: { next: "Seguir", skip: "Saltar", entrar: "Entrar directamente", terminal: "Terminal", bienvenida: "Bienvenido a Adeorq", carpeta: "Dónde viven tus proyectos", agentes: "Tus agentes", noEsta: "no está", noCarpeta: "No los tengo en una sola carpeta" },
};

/** La carpeta de usuario de mentira: lo que el revisor tiene al abrir (y lo que `raiz_por_defecto` elige). */
function sembrarCasa(datos) {
  const casa = resolve(datos, "..", "..", "casa");
  mkdirSync(join(casa, ".adeorq"), { recursive: true });
  writeFileSync(join(casa, ".adeorq", "raiz.txt"), casa);
  // Dentro del paquete los datos viven en `.adeorq`: la puerta de lo de fuera se sube ahí, no en LOCALAPPDATA.
  writeFileSync(join(casa, ".adeorq", "mcp_clientes.json"), JSON.stringify({ niveles: { fuera: "auto" } }));
  for (const d of ["Desktop", "Documents", "Downloads"]) mkdirSync(join(casa, d), { recursive: true });
  const doc = join(casa, "Documents");
  writeFileSync(join(doc, "README.md"), "# Notes\n\nA file to open with the editor.\n");
  writeFileSync(join(doc, "todo.txt"), "one\ntwo\n");
  if (GIT) {
    const g = (...a) => spawnSync(GIT, ["-c", "user.name=Lab", "-c", "user.email=lab@example.invalid", ...a], { cwd: doc, stdio: "ignore" });
    g("init", "-b", "main");
    g("add", ".");
    g("commit", "-m", "first");
    writeFileSync(join(doc, "todo.txt"), "one\ntwo\nthree\n");
  }
}

/** Cuenta cuántas veces algo pidió el micrófono, y recoge lo que se mandó abrir. */
const GUARDA = (idioma) => `(() => {
  window.__mic = 0;
  try {
    const md = navigator.mediaDevices;
    if (md) md.getUserMedia = () => { window.__mic++; return Promise.reject(new DOMException("probando", "NotAllowedError")); };
  } catch {}
  localStorage.setItem("adeorq-lang", ${JSON.stringify(idioma)});
})()`;

async function recorrido(idioma, n) {
  const e = T[idioma];
  console.log(`\n── ${idioma === "es" ? "Español" : "English"}: el paquete fingido, sin ninguna cuenta de IA ──`);
  const a = await abrirAislada({
    nombre: `recorrido-${idioma}`,
    puertoMcp: 47_600 + (process.pid % 200) + n,
    depurar: 9700 + (process.pid % 90) + n,
    exe,
    fotos: FOTOS,
    sembrar: sembrarCasa,
    guarda: GUARDA(idioma),
    entorno: { ADEORQ_FINGIR_EMPAQUETADA: "1", PATH: PATH_LIMPIO, Path: PATH_LIMPIO },
  });
  try {
    const { v } = a;
    const js = (x) => v.js(x);
    const foto = (nombre) => a.foto(null, `recorrido-${idioma}-${nombre}.png`);
    const pulsarTexto = (sel, texto) =>
      js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(texto)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
    const tab = async (k) => {
      await js(`document.querySelector('[data-tab="${k}"]')?.click(); "ok"`);
      await dormir(1200);
    };

    dice((await js(`window.__TAURI_INTERNALS__.invoke("esta_empaquetada")`)) === true, "es el paquete fingido (`esta_empaquetada` dice que sí)");

    // ── La bienvenida de verdad ────────────────────────────────────────────
    await js(`localStorage.removeItem("adeorq-perfil"); location.reload(); "ok"`);
    await hasta(() => js(`!!document.querySelector(".onb")`), 20_000);
    await dormir(1200);
    dice((await js(`document.querySelector(".onb-tit")?.textContent`)) === e.bienvenida, `abre en la bienvenida («${e.bienvenida}»)`);
    dice(await js(`[...document.querySelectorAll(".onb-pie button")].some((b) => b.textContent.trim() === ${JSON.stringify(e.skip)})`), `y tiene «${e.skip}»`);
    dice(await js(`[...document.querySelectorAll(".onb-pie button")].find((b) => b.textContent.trim() === ${JSON.stringify(e.next)})?.disabled === true`), `«${e.next}» no deja pasar sin nombre`);
    await foto("1-bienvenida");
    await js(`(() => { const i = document.querySelector(".onb input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Reviewer"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await dormir(300);
    dice(await pulsarTexto(".onb-pie button", e.next), `con un nombre, «${e.next}» pasa a la carpeta`);
    await dormir(1200);
    dice((await js(`document.querySelector(".onb-tit")?.textContent`)) === e.carpeta, `el segundo paso es «${e.carpeta}»`);
    const carpeta = await js(`document.querySelector(".onb-cuerpo").innerText.replace(/\\s+/g, " ")`);
    visto("el paso de la carpeta", carpeta.slice(0, 260));
    dice(/\b4\b/.test(carpeta) && !/C:\\proyectos/i.test(carpeta), "por defecto es la carpeta de usuario y cada carpeta de dentro es un proyecto (Desktop, Documents, Downloads y AppData)", carpeta.slice(-120));
    dice(await js(`[...document.querySelectorAll(".onb-cuerpo button")].some((b) => b.textContent.trim() === ${JSON.stringify(e.noCarpeta)})`), `y existe «${e.noCarpeta}»`);
    await foto("2-bienvenida-carpeta");
    dice(await pulsarTexto(".onb-pie button", e.next), `«${e.next}» sigue con la carpeta de usuario`);
    await dormir(800);
    dice((await js(`document.querySelector(".onb-tit")?.textContent`)) === e.agentes, `el tercer paso es «${e.agentes}»`);
    const clis = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll(".onb-cli")].map((b) => b.querySelector("small")?.textContent.trim()))`));
    dice(clis.length > 0 && clis.every((x) => x === e.noEsta), `sin ningún agente instalado, los ${clis.length} salen «${e.noEsta}» y no ofrece instalar ninguno`, JSON.stringify([...new Set(clis)]));
    const orden = await js(`(document.querySelector(".onb-cuerpo").innerText.match(/pnpm add|irm |\\| iex|npm i |curl |\\bDownload|\\bDescargar|\\bInstall\\b|\\bInstalar\\b/i) ?? [""])[0]`);
    dice(orden === "", "y esa pantalla no enseña ninguna orden ni botón de instalar", orden && `sale «${orden}»: ${(await js(`document.querySelector(".onb-cuerpo").innerText.replace(/\\s+/g, " ")`)).slice(0, 200)}`);
    await foto("3-bienvenida-agentes");
    // El resto de pasos, hasta «Listo».
    for (let i = 0; i < 6; i++) {
      if (await js(`[...document.querySelectorAll(".onb-pie button")].some((b) => b.textContent.trim() === ${JSON.stringify(e.entrar)})`)) break;
      await pulsarTexto(".onb-pie button", e.next);
      await dormir(600);
    }
    dice(await pulsarTexto(".onb-pie button", e.entrar), `«${e.entrar}» entra en la app`);
    await dormir(2500);
    dice(!(await js(`!!document.querySelector(".onb")`)), "la bienvenida se cierra");

    // ── La barra: con la carpeta de usuario, hay tres proyectos ────────────
    const proyectos = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll(".project-main")].map((b) => b.textContent.replace(/\\s+/g, " ").trim().slice(0, 30)))`));
    dice(proyectos.length === 4, "la barra lista los proyectos de la carpeta de usuario", JSON.stringify(proyectos));

    // ── Paso 2: Lienzo, «Terminal»: una PowerShell de verdad ───────────────
    await tab("lienzo");
    const antes = JSON.parse(await js(`JSON.stringify({ proyecto: document.querySelector(".cb-proj-name")?.textContent, terminalDeshabilitado: [...document.querySelectorAll(".cb-spawn")].find((b) => b.textContent.includes(${JSON.stringify(e.terminal)}))?.disabled })`));
    visto("la barra del lienzo recién abierta", JSON.stringify(antes));
    await foto("4-lienzo-vacio");
    dice(await js(`(() => { const b = [...document.querySelectorAll(".cb-spawn")].find((x) => x.textContent.includes(${JSON.stringify(e.terminal)})); if (!b || b.disabled) return false; b.click(); return true; })()`), `se pulsa «${e.terminal}» en el lienzo`);
    const hayTerminal = await hasta(() => js(`document.querySelectorAll("[data-pane-id]").length >= 1`), 15_000);
    dice(!!hayTerminal, "nace una terminal en el lienzo");
    await dormir(3500);
    await foto("5-lienzo-terminal");
    const mcp = a.puente(null);
    await mcp.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
    const paneId = Number(await js(`document.querySelector("[data-pane-id]")?.getAttribute("data-pane-id")`));
    // El puerto pide mirar la lista antes de escribir en un número (los números se reinician con la app).
    await mcp.llamar("get_active_panes", {});
    const enviado = await mcp.llamar("send_command", { paneId, command: "$PSVersionTable.PSVersion.Major; (Get-Process -Id $PID).ProcessName; dir" });
    visto("send_command contestó", JSON.stringify(enviado).slice(0, 160));
    const pantalla = await hasta(async () => {
      const t = (await mcp.llamar("read_pane_screen", { paneId })).texto ?? "";
      return /README\.md/.test(t) ? t : null;
    }, 20_000, 700);
    dice(!!pantalla, "teclear `dir` en esa terminal lista los archivos de la carpeta (README.md)", (pantalla ?? "").replace(/\s+/g, " ").slice(0, 200));
    dice(/powershell|pwsh/i.test(pantalla ?? ""), "y la consola es PowerShell", (pantalla ?? "").replace(/\s+/g, " ").slice(0, 160));
    if (GIT) {
      await mcp.llamar("send_command", { paneId, command: "git status" });
      const g = await hasta(async () => {
        const t = (await mcp.llamar("read_pane_screen", { paneId })).texto ?? "";
        return /On branch|nothing to commit|modified:|Changes not staged/.test(t) ? t : null;
      }, 20_000, 700);
      dice(!!g, "y `git status` contesta con la rama y el cambio (Git instalado)", (g ?? "").replace(/\s+/g, " ").slice(-160));
    }
    mcp.cerrar();

    // ── Paso 3: notas, dibujos y un tablero de tareas en el lienzo ─────────
    const herramientas = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll(".canvas-bar button")].map((b) => (b.getAttribute("data-tip") || b.title || b.getAttribute("aria-label") || "") + " | " + b.textContent.trim()).filter((x) => x.trim() !== "|"))`));
    visto("los botones de la barra del lienzo", herramientas.join("\n      "));
    const nodos = () => js(`document.querySelectorAll(".react-flow__node").length`);
    const abrirAdd = async () => {
      await js(`[...document.querySelectorAll(".canvas-bar button")].find((b) => /^＋ ?(Add|Añadir)/.test(b.textContent.trim()))?.click(); "ok"`);
      await dormir(700);
    };
    await abrirAdd();
    // El menú no tiene una clase fija: se saca de lo que hay encima de la página tras pulsar «Add».
    const menu = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll("body button, body [role=menuitem]")].filter((b) => { const r = b.getBoundingClientRect(); const s = getComputedStyle(b.closest("[class*=menu], [class*=pop], [role=menu]") ?? b); return r.width > 0 && r.top > 60 && /fixed|absolute/.test(s.position) && !b.closest(".sidebar, aside, .canvas-bar"); }).map((b) => b.textContent.replace(/\\s+/g, " ").trim()).filter(Boolean))`));
    visto("el menú «Add»", menu.join(" | "));
    await foto("6-lienzo-add");
    const hay = (txt) => menu.some((m) => m.startsWith(txt));
    const nombres = idioma === "en" ? { nota: "Note", tablero: "The work board", chat: "Chat with a model", galeria: "Gallery" } : { nota: "Nota", tablero: "Tablero del trabajo", chat: "Chat con un modelo", galeria: "Galería" };
    for (const [clave, txt] of Object.entries(nombres)) dice(hay(txt), `el menú «Add» ofrece «${txt}»`, clave === "nota" ? menu.join(" | ").slice(0, 200) : "");
    // Una nota y un tablero de verdad: nacen como piezas del lienzo.
    const nodosAntes = await nodos();
    await js(`(() => { const b = [...document.querySelectorAll("button, [role=menuitem]")].find((x) => x.textContent.replace(/\\s+/g, " ").trim().startsWith(${JSON.stringify(nombres.nota)}) && !x.closest(".canvas-bar, aside")); b?.click(); return !!b; })()`);
    await dormir(1500);
    dice((await nodos()) === nodosAntes + 1, `«${nombres.nota}» pone una nota en el lienzo`, `${nodosAntes} → ${await nodos()}`);
    await abrirAdd();
    await js(`(() => { const b = [...document.querySelectorAll("button, [role=menuitem]")].find((x) => x.textContent.replace(/\\s+/g, " ").trim().startsWith(${JSON.stringify(nombres.tablero)}) && !x.closest(".canvas-bar, aside")); b?.click(); return !!b; })()`);
    await dormir(1500);
    dice((await nodos()) === nodosAntes + 2, `«${nombres.tablero}» pone un tablero de tareas en el lienzo`, `${await nodos()} piezas`);
    await foto("6b-lienzo-nota-y-tablero");
    // Un dibujo: el lápiz y arrastrar sobre el hueco no se pulsa aquí (haría falta el ratón del sistema);
    // se mira que las herramientas están y que el modo «Dibujo» existe.
    dice(herramientas.some((h) => /Pencil|Lápiz/.test(h)) && herramientas.some((h) => /Arrow|Flecha/.test(h)) && herramientas.some((h) => /Box|Recuadro/.test(h)), "las herramientas de dibujo están en la barra (lápiz, flecha, recuadro…)");

    // ── Paso 4: Cabina, el icono de carpeta del borde derecho ──────────────
    await tab("cabina");
    await dormir(800);
    const rail = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll("button.franja-btn")].map((b) => ({ tip: b.getAttribute("data-tip") || b.title || b.getAttribute("aria-label") || "", on: b.getAttribute("data-on") })))`));
    visto("los iconos del borde derecho de la Cabina", JSON.stringify(rail));
    const nombreFiles = idioma === "en" ? "Files" : "Archivos";
    dice(rail.some((r) => r.tip === nombreFiles), `entre ellos está «${nombreFiles}» (la carpeta)`);
    await foto("7-cabina");
    await js(`[...document.querySelectorAll("button.franja-btn")].find((b) => (b.getAttribute("data-tip") || b.title || "") === ${JSON.stringify(nombreFiles)})?.click(); "ok"`);
    await dormir(2000);
    // El árbol cuelga de la carpeta de proyectos (la carpeta de usuario del revisor), no de «el proyecto»:
    // la Cabina no tiene ninguna terminal (la que se abrió está en el lienzo) y no hay un proyecto enfocado.
    const clic = (texto, minX = 1600) =>
      js(`(() => { const e = [...document.querySelectorAll("*")].filter((x) => x.children.length === 0 && x.textContent.trim() === ${JSON.stringify(texto)} && x.getBoundingClientRect().left > ${minX} && x.getBoundingClientRect().width > 0).at(0); if (!e) return false; e.click(); return true; })()`);
    const arbol = await js(`[...document.querySelectorAll("*")].filter((x) => x.children.length === 0 && x.getBoundingClientRect().left > 1600 && x.getBoundingClientRect().top > 50 && x.getBoundingClientRect().width > 0).map((x) => x.textContent.trim()).filter(Boolean).slice(0, 14).join(" | ")`);
    visto("el panel «Files» al abrirlo", arbol);
    await foto("8-cabina-archivos");
    dice(await clic("Documents"), "se abre la carpeta Documents en el árbol");
    await dormir(1200);
    dice(await clic("README.md"), "y se pulsa README.md");
    await dormir(2500);
    const editor = await js(`(() => { const e = document.querySelector(".cm-editor, .monaco-editor, .editor-codigo, textarea.archivo-editor"); return e ? { clase: e.className.slice(0, 60), texto: e.innerText.replace(/\\s+/g, " ").slice(0, 120) } : null; })()`);
    dice(!!editor && /A file to open with the editor/.test(editor.texto), "el archivo se abre en un editor con su texto", JSON.stringify(editor));
    await foto("9-cabina-editor");
    const rama = await js(`document.body.innerText.match(/main[^\\n]{0,40}/)?.[0] ?? ""`);
    visto("la rama y los cambios (si hay Git)", rama);

    // ── Paso 5: Ajustes, temas e idioma; y lo que dice de la Tienda ────────
    await tab("ajustes");
    const secciones = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll(".set-tab")].map((b) => b.textContent.trim()))`));
    visto("las secciones de Ajustes", secciones.join(" | "));
    const ajustes = {};
    for (let i = 0; i < secciones.length; i++) {
      await js(`(() => { const b = document.querySelectorAll(".set-tab")[${i}]; if (!b.hasAttribute("data-on")) b.click(); return true; })()`);
      await dormir(700);
      ajustes[secciones[i]] = JSON.parse(await js(`JSON.stringify({ texto: (document.querySelector(".panel.settings") ?? document.body).innerText.replace(/\\s+/g, " "), botones: [...document.querySelectorAll(".panel.settings button")].map((b) => b.textContent.trim()).filter(Boolean), enlaces: [...document.querySelectorAll(".panel.settings a")].map((x) => x.href) })`));
      await foto(`10-ajustes-${i}`);
    }
    const todoAjustes = Object.values(ajustes).map((x) => x.texto).join(" ");
    dice(Object.values(ajustes).some((x) => (idioma === "en" ? /Spanish/.test(x.texto) && /English/.test(x.texto) : /Español/.test(x.texto) && /(English|Inglés)/.test(x.texto))), idioma === "en" ? "Ajustes › Look tiene el idioma (Spanish y English)" : "Ajustes › Aspecto tiene el idioma (Español e Inglés)");
    dice(Object.values(ajustes).some((x) => (idioma === "en" ? /Theme/.test(x.texto) && /Light background/.test(x.texto) : /Tema/.test(x.texto) && /De fondo claro/.test(x.texto))), "y los temas (con los de fondo claro)");
    dice(/Microsoft Store/.test(todoAjustes), "Ajustes dice que la Tienda actualiza la app", (todoAjustes.match(/.{0,60}Microsoft Store.{0,80}/) ?? [""])[0]);
    dice(!Object.values(ajustes).some((x) => x.botones.some((b) => /Check for updates|Buscar actualizaciones/.test(b))), "y no hay botón de buscar actualizaciones");
    dice(/Connect your Claude Code|Conectar tu Claude Code/.test(todoAjustes), "Ajustes › Terminales tiene «Connect your Claude Code» (la ficha lo cita para desinstalar con limpieza)", Object.keys(ajustes).find((k) => /Connect your Claude Code|Conectar tu Claude Code/.test(ajustes[k].texto)));
    dice(Object.values(ajustes).every((x) => !x.enlaces.some((l) => /tailscale/i.test(l))), "ninguna sección de Ajustes (con el móvil apagado) enlaza a Tailscale", Object.values(ajustes).flatMap((x) => x.enlaces).filter((l) => /tailscale/i.test(l)).join(" "));
    visto("el texto de Móvil/Mobile", (Object.entries(ajustes).find(([k]) => /Mobile|Móvil/.test(k)) ?? ["", { texto: "" }])[1].texto.slice(0, 500));
    visto("el texto de Discord", (Object.entries(ajustes).find(([k]) => /Discord/.test(k)) ?? ["", { texto: "" }])[1].texto.slice(0, 300));

    // ── Lo que necesita una cuenta de IA: qué ve quien no tiene ninguna ────
    await tab("panel");
    await dormir(1500);
    const portada = await js(`document.body.innerText.replace(/\\s+/g, " ").slice(0, 900)`);
    visto("la primera pantalla (Dashboard)", portada);
    // La caja de Adeo de la primera pantalla: la línea de IA y el botón (y el correo), sin haber escrito nada.
    const lineaInicio = await js(`(() => { const a = document.querySelector(".inicio-caja + .inf-aviso"); if (!a) return null; const r = a.getBoundingClientRect(); return { texto: a.textContent.replace(/\\s+/g, " ").trim(), visible: r.width > 0 && r.height > 0 && r.bottom <= innerHeight, px: parseFloat(getComputedStyle(a).fontSize) }; })()`);
    const frases = idioma === "en" ? "Adeo is an AI and can make mistakes. Report an issue or by email" : "Adeo es una IA y puede equivocarse. Informar de un problema o por correo";
    dice(!!lineaInicio && lineaInicio.visible && lineaInicio.texto === frases && lineaInicio.px >= 12, "la caja de Adeo de la primera pantalla lleva la línea de IA, «Report an issue» y el correo, a la vista y sin haber escrito nada", JSON.stringify(lineaInicio));
    await foto("11-dashboard");
    const caja =await js(`(() => { const t = [...document.querySelectorAll("textarea, input[type=text]")].filter((x) => x.getBoundingClientRect().width > 0).map((x) => (x.placeholder || "") + " | " + x.className); return t; })()`);
    visto("las cajas de escribir de la primera pantalla", JSON.stringify(caja));

    await tab("chat");
    await dormir(800);
    await hasta(async () => {
      await js(`document.querySelector(".cj-nueva")?.click(); "ok"`);
      await dormir(400);
      return js(`!!document.querySelector(".chat-caja.cj-caja")`);
    }, 8000);
    await dormir(600);
    await foto("12-chat-vacio");
    dice((await js(`document.querySelector(".chat-caja-zona .inf-aviso")?.textContent.replace(/\\s+/g, " ").trim() ?? ""`)).length > 0, "el Chat recién abierto y vacío ya enseña la línea de IA y el botón de informar");
    // Un mensaje a Adeo sin ningún agente instalado: tiene que contestar con un error entendible.
    const textoAdeo = idioma === "en" ? "hello" : "hola";
    await js(`(() => { const t = document.querySelector(".chat-caja textarea"); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, ${JSON.stringify(textoAdeo)}); t.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await dormir(400);
    await js(`(() => { const t = document.querySelector(".chat-caja textarea"); t.focus(); t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })); return true; })()`);
    const respuesta = await hasta(async () => {
      const turnos = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll(".chat-turno")].map((t) => ({ rol: t.getAttribute("data-rol"), texto: t.innerText.replace(/\\s+/g, " ").trim(), informar: !!t.querySelector(".inf-boton") })))`));
      const suya = turnos.find((t) => t.rol === "agente");
      return suya && !/^(Thinking|Pensando)/.test(suya.texto) ? turnos : null;
    }, 90_000, 1000);
    visto("los turnos del Chat tras escribirle a Adeo sin ningún agente", JSON.stringify(respuesta));
    await dormir(800);
    await foto("13-chat-sin-agente");
    dice(!!respuesta && respuesta.some((t) => t.rol === "agente" && /could not|no pude|no está instalado|not found|no se encontr/i.test(t.texto)), "sin ningún agente instalado, Adeo contesta con un error que dice que no pudo lanzar el programa (y no se cuelga)", respuesta?.find((t) => t.rol === "agente")?.texto);

    // ── El micrófono: sin whisper.cpp no se abre nunca ─────────────────────
    await tab("panel");
    await dormir(800);
    const antesMic = await js(`window.__mic`);
    await js(`(() => { const b = document.querySelector('.inicio-botones button.mini.icono'); b?.click(); return !!b; })()`);
    await dormir(2500);
    const notaMic = await js(`document.querySelector(".inicio-nota")?.textContent ?? ""`);
    dice((await js(`window.__mic`)) === antesMic, "pulsar dictar sin whisper.cpp NO pide el micrófono (0 llamadas a getUserMedia)", `llamadas: ${await js(`window.__mic`)}`);
    dice(/whisper/i.test(notaMic), "y la caja dice que no encuentra whisper.cpp", notaMic);
    await foto("14-dictar-sin-whisper");

    // ── Decisiones: sin un agente real, uno de mentira pregunta por el MCP ──
    await tab("decisiones");
    await dormir(1000);
    visto("la pestaña Decisions sin ninguna pregunta", (await js(`document.body.innerText.replace(/\\s+/g, " ")`)).slice(0, 300));
    await foto("15-decisiones-vacia");
    const mcp2 = a.puente(null);
    await mcp2.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
    await mcp2.llamar("get_active_panes", {});
    const pregunta = await mcp2.llamar("ask_decision", { title: "Prueba del revisor", paneId, questions: [{ title: idioma === "en" ? "Which one?" : "¿Cuál?", options: [{ text: "first" }, { text: "second" }] }] });
    const decision = pregunta.texto?.match(/Decisi[oó]n (\w+) creada/)?.[1];
    dice(!!decision, "un programa de fuera (como lo haría un agente) deja una pregunta con opciones", JSON.stringify(pregunta).slice(0, 140));
    await dormir(2500);
    const opciones = await js(`(() => { const t = document.body.innerText.replace(/\\s+/g, " "); return { hay: /first/.test(t) && /second/.test(t), numeradas: /(^|\\s)1\\s*first|1\\.\\s*first|\\b1\\b[^a-z]{0,6}first/i.test(t), texto: t.slice(0, 400) }; })()`);
    dice(opciones.hay, "las opciones salen en Decisions", opciones.texto);
    await foto("16-decisiones-con-pregunta");
    mcp2.cerrar();

    // ── Perfil y Agenda: sin cuenta propia ─────────────────────────────────
    await tab("perfil");
    await dormir(1500);
    const perfilTexto = await js(`document.body.innerText.replace(/\\s+/g, " ")`);
    visto("la pestaña Profile", perfilTexto.slice(0, 500));
    await foto("17-perfil");
    dice(!/Sign in|Log in|Create account|Register|Iniciar sesión|Crear cuenta|Registrarse/i.test(perfilTexto), "Perfil no ofrece iniciar sesión ni crear una cuenta de Adeorq");

    // ── La Agenda del paquete: sin «ideas» ni brújula ──────────────────────
    await js(`[...document.querySelectorAll("button, a, [role=button], div")].filter((b) => /^Agenda/.test(b.textContent.trim()) && b.children.length < 6).at(-1)?.click(); "ok"`);
    await dormir(2500);
    const agenda = await js(`document.body.innerText.replace(/\\s+/g, " ")`);
    visto("la Agenda", agenda.slice(0, 700));
    await foto("18-agenda");
    dice(!/ideas?\b|brújula|compass|munito\.dev/i.test(agenda.replace(/Dashboard.*?AG /, "")), "la Agenda del paquete no habla de «ideas», de la brújula ni de munito.dev", (agenda.match(/.{0,40}(ideas?\b|compass|munito\.dev).{0,40}/i) ?? [""])[0]);

    // ── Un proyecto: sesión o terminal normal, y la cuadrícula de la Cabina ─
    await tab("cabina");
    await dormir(800);
    const menuProyecto = await js(`(() => { const p = [...document.querySelectorAll(".project-main")].find((x) => x.textContent.includes("Documents")); if (!p) return null; const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); return true; })()`);
    await dormir(700);
    const terminalAqui = idioma === "en" ? "Terminal here" : "Terminal aquí";
    const sesionAqui = idioma === "en" ? "New Claude Code session here" : "Nueva sesión de Claude Code aquí";
    const items = (txt) => js(`[...document.querySelectorAll("button")].some((b) => b.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(txt)} && b.getBoundingClientRect().width > 0)`);
    dice(menuProyecto === true && (await items(terminalAqui)) && (await items(sesionAqui)), `el clic derecho en un proyecto ofrece «${sesionAqui}» y «${terminalAqui}»`);
    await foto("19-menu-proyecto");
    const visibles = () => js(`[...document.querySelectorAll("[data-pane-id]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 40 && r.left >= 280; }).length`);
    const antesPaneles = await visibles();
    for (let i = 0; i < 2; i++) {
      if (i > 0) {
        await js(`(() => { const p = [...document.querySelectorAll(".project-main")].find((x) => x.textContent.includes("Documents")); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); return true; })()`);
        await dormir(500);
      }
      await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(terminalAqui)})?.click(); "ok"`);
      await dormir(2500);
    }
    const tras = await hasta(async () => ((await visibles()) >= antesPaneles + 2 ? await visibles() : null), 15_000);
    dice(!!tras, "«Terminal here» dos veces pone dos terminales en la Cabina, una al lado de la otra (cuadrícula)", `${antesPaneles} → ${await visibles()}`);
    await dormir(1500);
    await foto("20-cabina-dos-terminales");
    const rects = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll("[data-pane-id]")].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 40 && r.height > 40 && r.left >= 280).map((r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })))`));
    dice(rects.length >= 2 && new Set(rects.map((r) => r.x)).size >= 2, "y están una al lado de la otra, no apiladas", JSON.stringify(rects));

    // ── Modo Espejo: un botón en la cabecera de cada terminal (con Git) ────
    const espejo = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll("[data-tip]")].map((x) => x.getAttribute("data-tip")).filter((t) => /Shadow Mode|Modo Espejo/.test(t)).slice(0, 3))`));
    dice(espejo.length > 0, "las terminales de la Cabina traen el botón del Modo Espejo / Shadow Mode (el proyecto de Documents tiene Git)", espejo.join(" | "));

    // ── Archivos: buscar dentro; el asistente de sesiones ──────────────────
    const botonesArchivos = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll("button, input")].filter((b) => b.getBoundingClientRect().left > 1600 && b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute("data-tip") || b.title || b.getAttribute("aria-label") || b.placeholder || b.textContent.trim())).filter(Boolean))`));
    visto("lo que hay en el panel de archivos (botones y cajas)", botonesArchivos.join(" | "));
    await js(`document.querySelector(".rail-new")?.click(); "ok"`);
    await dormir(1500);
    const asistente = await js(`(document.querySelector(".wizard, [class*=wizard], [class*=newsession], .velo, .modal") ?? document.body).innerText.replace(/\\s+/g, " ").slice(0, 700)`);
    visto("el asistente de «Open a session…»", asistente);
    await foto("21-asistente-de-sesion");
    await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); "ok"`);
    await dormir(600);

    // ── Buscar dentro de los archivos: Ctrl+K › «Search in files» ──────────
    const tecla = (type, key, code, vk, modifiers = 0) => v.enviar("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await tecla("rawKeyDown", "k", "KeyK", 75, 2);
    await tecla("keyUp", "k", "KeyK", 75, 2);
    await dormir(900);
    const paleta = await js(`!!document.querySelector("[class*=paleta], .palette, [role=dialog] input")`);
    await v.enviar("Input.insertText", { text: idioma === "en" ? "Search in the files" : "Buscar en los archivos" });
    await dormir(700);
    const opcionesPaleta = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll("[class*=paleta] li, [class*=paleta] button, .palette li, [role=option]")].map((x) => x.textContent.replace(/\\s+/g, " ").trim()).slice(0, 6))`));
    visto("la paleta de comandos con «Search in the files»", `${paleta} | ${opcionesPaleta.join(" | ")}`);
    await foto("23-paleta-buscar");
    dice(opcionesPaleta.some((o) => /Search in the files|Buscar en los archivos/i.test(o)), "Ctrl+K encuentra «Search in the files» (la búsqueda dentro de los archivos de la ficha)");
    await tecla("rawKeyDown", "Escape", "Escape", 27);
    await tecla("keyUp", "Escape", "Escape", 27);
    await dormir(500);

    // ── El móvil: apagado de fábrica ───────────────────────────────────────
    await tab("ajustes");
    const mov = secciones.findIndex((k) => /Mobile|Móvil/.test(k));
    await js(`(() => { const b = document.querySelectorAll(".set-tab")[${mov}]; if (!b.hasAttribute("data-on")) b.click(); return true; })()`);
    await dormir(900);
    const interruptor = await js(`JSON.stringify([...document.querySelectorAll(".panel.settings input[type=checkbox], .panel.settings [role=switch]")].map((i) => ({ marcado: i.checked ?? i.getAttribute("aria-checked"), nombre: (i.closest("label, .set-row, section")?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 60) })))`);
    visto("los interruptores de la sección del móvil", interruptor);
    dice(JSON.parse(interruptor).length >= 1 && JSON.parse(interruptor).every((i) => i.marcado === false || i.marcado === "false"), "el móvil viene apagado (ningún interruptor de su sección está encendido)");
    await foto("22-ajustes-movil");
  } finally {
    await a.cerrar();
  }
}

/** El revisor que elige «They are not all in one folder»: las notas ya no se lo sugieren, pero lo puede pulsar. */
async function sinCarpeta(idioma, n) {
  const e = T[idioma];
  console.log(`
── ${idioma === "es" ? "Español" : "English"}: el que dice que no tiene todos los proyectos en una carpeta ──`);
  const a = await abrirAislada({
    nombre: `sincarpeta-${idioma}`,
    puertoMcp: 47_700 + (process.pid % 100) + n,
    depurar: 9800 + (process.pid % 90) + n,
    exe,
    fotos: FOTOS,
    sembrar: sembrarCasa,
    guarda: GUARDA(idioma),
    entorno: { ADEORQ_FINGIR_EMPAQUETADA: "1", PATH: PATH_LIMPIO, Path: PATH_LIMPIO },
  });
  try {
    const { v } = a;
    const js = (x) => v.js(x);
    const pulsarTexto = (sel, texto) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(texto)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await js(`localStorage.removeItem("adeorq-perfil"); location.reload(); "ok"`);
    await hasta(() => js(`!!document.querySelector(".onb")`), 20_000);
    await dormir(1500);
    await js(`(() => { const i = document.querySelector(".onb input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Reviewer"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await dormir(300);
    await pulsarTexto(".onb-pie button", e.next);
    await dormir(1200);
    dice(await pulsarTexto(".onb-cuerpo button", e.noCarpeta), `se pulsa «${e.noCarpeta}»`);
    await dormir(600);
    for (let i = 0; i < 6; i++) {
      if (await js(`[...document.querySelectorAll(".onb-pie button")].some((b) => b.textContent.trim() === ${JSON.stringify(e.entrar)})`)) break;
      await pulsarTexto(".onb-pie button", e.next);
      await dormir(500);
    }
    await pulsarTexto(".onb-pie button", e.entrar);
    await dormir(2500);
    const proyectos = await js(`document.querySelectorAll(".project-main").length`);
    dice(proyectos === 0, "tras entrar, la barra está vacía (no enseña los proyectos de la carpeta que dijo que no usaba)", `${proyectos} proyectos`);
    await js(`document.querySelector('[data-tab="lienzo"]').click(); "ok"`);
    await dormir(1800);
    const barra = JSON.parse(await js(`JSON.stringify({ proyecto: document.querySelector(".cb-proj-name")?.textContent, deshabilitados: [...document.querySelectorAll(".cb-spawn")].map((b) => b.disabled) })`));
    await a.foto(null, `recorrido-${idioma}-30-sin-carpeta-lienzo.png`);
    dice(barra.deshabilitados.length === 3 && barra.deshabilitados.every(Boolean) && /Pick a project|Elige proyecto/.test(barra.proyecto), "y el lienzo no se queda con un proyecto que ya no existe: dice «Pick a project» y sus tres botones están apagados", JSON.stringify(barra));
  } finally {
    await a.cerrar();
  }
}

let n = 0;
if (!process.env.SOLO_SINCARPETA) for (const idioma of (process.env.IDIOMAS || "en,es").split(",")) await recorrido(idioma, n++);
if (!process.env.SIN_SINCARPETA) await sinCarpeta((process.env.IDIOMAS || "en").split(",")[0], n++);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
