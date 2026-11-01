// Copiar y pegar en un Claude Code DE VERDAD, dentro de una Adeorq aislada.
//
// Munir, 2026-11-01: «hay a veces que no deja copiar y pegar texto de manera
// sencilla y hay que esperar tiempo para que se pegue bien el texto». Él trabaja
// casi siempre dentro de un Claude Code, en pantalla completa (`"tui":
// "fullscreen"` en sus ajustes), así que esto lo mide ahí:
//   1. pegar 5 KB y 50 KB: cuánto pasa del Ctrl+V a que su pantalla lo enseña,
//      y si un segundo Ctrl+V y una tecla pulsados mientras tanto se pierden o
//      se cuelan en otro orden;
//   2. arrastrar con el ratón y pulsar Ctrl+C, en una consola que suelta texto
//      y en el Claude Code: qué acaba en el portapapeles (uno falso, el de
//      Munir no se toca) y qué le llega al programa.
//
// NUNCA se envía un mensaje (no gasta cuota): no se escribe ningún Intro, y lo
// tecleado se borra con un Ctrl+C. Claude Code corre con la casa de verdad (es
// donde tiene la sesión iniciada) y sin MCP (`--strict-mcp-config`), y se cierra
// SIEMPRE por las buenas, con dos Ctrl+C: matarlo deja `fullscreenBootPending`
// en `~/.claude.json`, y a la tercera vez Claude Code apaga la pantalla
// completa en todo el equipo (ver `despedir` en `pty.rs`).
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/copiar-pegar-claude.mjs [carpeta para las fotos]
import { mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = process.argv[2] ?? tmpdir();
const CASA = process.env.USERPROFILE ?? homedir();
const CARPETA = join(tmpdir(), `adeorq-claude-pegar-${process.pid}`);
mkdirSync(CARPETA, { recursive: true });

// El portapapeles falso: lo que se pega sale de `__pegarTexto` y lo que se
// copia queda en `__copiado`. Antes de que nazca ningún panel.
const GUARDA_PORTAPAPELES = `(() => {
  window.__pegarTexto = "";
  window.__copiado = [];
  const doble = {
    read: async () => [{ types: ["text/plain"], getType: async () => new Blob([window.__pegarTexto]) }],
    readText: async () => window.__pegarTexto,
    writeText: async (t) => { window.__copiado.push(t); },
    write: async () => { window.__copiado.push("(write)"); },
  };
  Object.defineProperty(Navigator.prototype, "clipboard", { get: () => doble, configurable: true });
})()`;

const a = await abrirAislada({ nombre: "claude-pegar", puertoMcp: 39412, depurar: 9412, guarda: GUARDA_PORTAPAPELES, aparte: true, fotos: FOTOS });
const { v } = a;
const ids = [];
const teclear = (id, data) => v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);
const historial = (id) => v.js(`window.__TAURI_INTERNALS__.invoke("pty_historial", { id: ${id}, bytes: 3000000 })`);
const agente = a.puente(null);
const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
const area = (id) => v.js(`(() => { const r = document.querySelector('[data-pane-id="${id}"] .xterm-screen').getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height }); })()`).then(JSON.parse);
const ctrl = (id, key) => v.js(`(() => {
  const ta = document.querySelector('[data-pane-id="${id}"] .xterm-helper-textarea');
  ta.focus();
  const t0 = Date.now();
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "${key}", code: "Key${key.toUpperCase()}", ctrlKey: true, bubbles: true, cancelable: true }));
  return t0;
})()`);
/** Arrastrar con el ratón de verdad (eventos de entrada del WebView, no del DOM). */
async function arrastrar(id) {
  const r = await area(id);
  const y = r.y + Math.min(60, r.h / 3);
  const x0 = r.x + 10, x1 = r.x + Math.min(400, r.w - 10);
  await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y });
  await v.enviar("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + ((x1 - x0) * i) / 8, y: y + i * 2, button: "left", buttons: 1 });
    await dormir(30);
  }
  await v.enviar("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y + 16, button: "left", buttons: 0, clickCount: 1 });
}
const resumir = (s) => JSON.stringify(s.length > 80 ? s.slice(0, 80) + `… (${s.length} car.)` : s);

let claude = 0;
try {

  for (const nombre of ["Consola con ruido", "Claude de verdad", "Consola de fondo"]) {
    const r = await agente.llamar("open_pane", { cli: "shell", cwd: CARPETA, name: nombre, brief: "" });
    ids.push(Number(/^Terminal (\d+) abierta/.exec(r.texto ?? "")?.[1]));
  }
  await hasta(() => v.js(`document.querySelectorAll("[data-pane-id] .xterm-helper-textarea").length >= 3`), 30_000, 500);
  await dormir(3000);
  const [consola, panelClaude, deFondo] = ids;
  await teclear(consola, `node -e "let n=0;setInterval(()=>console.log(String(++n).padStart(6)+' linea que el programa suelta sin parar'),20)"\r`);
  await teclear(panelClaude, `$env:USERPROFILE='${CASA}'; $env:HOME='${CASA}'; claude --strict-mcp-config\r`);
  claude = panelClaude;

  // La carpeta es nueva: Claude Code pregunta si se fía de ella. Se le dice
  // que sí (la opción de fábrica), que no envía nada.
  // Ojo: la opción marcada de fábrica es «No, exit»; hay que bajar a la otra.
  let fiado = false;
  const listo = await hasta(async () => {
    const p = await pantalla(panelClaude);
    if (!fiado && /Yes, I trust this folder/.test(p)) {
      fiado = true;
      await teclear(panelClaude, "\x1b[B");
      await dormir(500);
      await teclear(panelClaude, "\r");
      await dormir(2500);
      return null;
    }
    // Su caja de texto, no el prompt de PowerShell (que también acaba en «>»).
    return /for shortcuts|to cycle\)|Try "/i.test(p) && !/trust this folder/.test(p) ? p : null;
  }, 90_000, 1000);
  if (!listo) throw new Error(`Claude Code no llegó a su caja de texto:\n${await pantalla(panelClaude)}`);
  await dormir(2000);
  const alternativa = (await historial(panelClaude)).lastIndexOf("\x1b[?1049h") > (await historial(panelClaude)).lastIndexOf("\x1b[?1049l");
  console.log(`Claude Code listo · pantalla ${alternativa ? "alternativa (fullscreen)" : "normal"}`);

  // ── 1. Pegar ──────────────────────────────────────────────────────────
  const texto = (kb, marca) => {
    const linea = `${marca} linea de prueba para pegar, sin enviar nada `.padEnd(79, ".") + "\n";
    return linea.repeat(Math.ceil((kb * 1000) / 80)).slice(0, kb * 1000 - 1);
  };
  /** Cuántas veces sale «Pasted text» en la pantalla de ahora. */
  const pegadosEnPantalla = async () => ((await pantalla(panelClaude)).match(/Pasted text/g) ?? []).length;
  if (process.env.LAB_SOLO_MIRAR) {
    await v.js(`window.__pegarTexto = ${JSON.stringify(texto(5, "PRIMERO"))}; "ok"`);
    const t0 = await ctrl(panelClaude, "v");
    for (const s of [2, 8, 25]) {
      await dormir(s * 1000 - (Date.now() - t0) > 0 ? s * 1000 - (Date.now() - t0) : 0);
      const h = await historial(panelClaude);
      console.log(`--- a los ${s} s · historial ${h.length} car. · ${h.includes("PRIMERO") ? "lleva PRIMERO" : "sin PRIMERO"}\n${await pantalla(panelClaude)}`);
    }
    await a.foto(null, "claude-tras-pegar.png");
    throw new Error("solo mirar");
  }
  for (const kb of [5, 50]) {
    for (let ronda = 0; ronda < 3; ronda++) {
      await v.js(`window.__pegarTexto = ${JSON.stringify(texto(kb, "PRIMERO"))}; "ok"`);
      const t0 = await ctrl(panelClaude, "v");
      const visto = await hasta(async () => ((await pegadosEnPantalla()) >= 1 ? Date.now() : null), 60_000, 50);
      console.log(`  pegar ${kb} KB, ronda ${ronda + 1}: ${visto ? `${visto - t0} ms hasta que Claude Code lo enseña` : "NO SALIÓ en 60 s"}`);
      // Un Ctrl+C con la caja VACÍA es el primero de los dos que lo cierran:
      // solo se manda si hay algo que borrar.
      if (visto) await teclear(panelClaude, "\x03");
      await hasta(async () => ((await pegadosEnPantalla()) === 0 ? true : null), 10_000, 200);
      await dormir(1500);
    }
  }
  // Un segundo Ctrl+V y una tecla mientras el primero aún no ha entrado.
  await v.js(`window.__pegarTexto = ${JSON.stringify(texto(50, "PRIMERO"))}; "ok"`);
  await ctrl(panelClaude, "v");
  await dormir(150);
  await v.js(`(() => { const ta = document.querySelector('[data-pane-id="${panelClaude}"] .xterm-helper-textarea'); ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Z", code: "KeyZ", shiftKey: true, bubbles: true, cancelable: true })); ta.dispatchEvent(new KeyboardEvent("keypress", { key: "Z", code: "KeyZ", charCode: 90, keyCode: 90, shiftKey: true, bubbles: true, cancelable: true })); return "ok"; })()`);
  await dormir(150);
  await v.js(`window.__pegarTexto = ${JSON.stringify(texto(5, "SEGUNDO"))}; "ok"`);
  await ctrl(panelClaude, "v");
  await hasta(async () => ((await pegadosEnPantalla()) >= 2 ? true : null), 60_000, 200);
  await dormir(1500);
  const caja = (await pantalla(panelClaude)).split("\n").filter((l) => /Pasted text|Z/.test(l) && !/linea que/.test(l)).join(" ⏎ ");
  console.log(`  dos Ctrl+V y una «Z» por medio, en la caja de Claude Code: ${resumir(caja.replace(/\s+/g, " "))}`);
  await a.foto(null, "claude-dos-pegados.png");
  await teclear(panelClaude, "\x03");
  await dormir(800);

  // ── 2. Copiar ─────────────────────────────────────────────────────────
  // La ventana aislada vive al fondo y sin foco, y la de Munir lo tiene cuando
  // arrastra: se emula eso, que si no `document.hasFocus()` es siempre falso y
  // el OSC 52 (que solo copia en la terminal con el foco) no copiaría nunca.
  await v.enviar("Emulation.setFocusEmulationEnabled", { enabled: true });
  const dondeFoco = () => v.js(`(() => { const p = document.activeElement?.closest("[data-pane-id]"); return (document.hasFocus() ? "ventana con foco" : "ventana SIN foco") + " · foco en " + (p ? "el panel " + p.dataset.paneId : "ningún panel"); })()`);
  for (const [id, quien] of [[consola, "consola que suelta texto"], [panelClaude, "Claude Code"]]) {
    const antesHist = (await historial(id)).length;
    await v.js(`window.__copiado = []; "ok"`);
    console.log(`  ${quien} (panel ${id}), antes de arrastrar: ${await dondeFoco()}`);
    await arrastrar(id);
    await a.foto(null, `copiar-${id}-tras-arrastrar.png`);
    await dormir(800);
    console.log(`    tras soltar: ${await dondeFoco()} · portapapeles falso ANTES del Ctrl+C: ${resumir(JSON.stringify(await v.js(`JSON.stringify(window.__copiado)`).then(JSON.parse)))}`);
    const delArrastre = (await historial(id)).slice(antesHist);
    // ¿Tiene el programa el ratón? Lo pide en su salida (`ESC[?1000h`, 1002 o 1003) y lo suelta con la `l`.
    const todo = await historial(id);
    const raton = Math.max(...["1000", "1002", "1003"].map((m) => todo.lastIndexOf(`\x1b[?${m}h`))) > Math.max(...["1000", "1002", "1003"].map((m) => todo.lastIndexOf(`\x1b[?${m}l`)));
    const osc52 = /\x1b\]52;/.test(delArrastre);
    await ctrl(id, "c");
    await dormir(1200);
    const copiado = await v.js(`JSON.stringify(window.__copiado)`).then(JSON.parse);
    const tras = (await pantalla(id)).trim().split("\n").slice(-3).join(" ⏎ ");
    console.log(`  ${quien}: ${raton ? "el programa tiene el ratón: el arrastre es suyo, no de xterm" : "el arrastre es de xterm"} · OSC 52 del programa: ${osc52 ? "sí" : "no"}`);
    console.log(`    portapapeles falso tras Ctrl+C: ${copiado.length ? copiado.map(resumir).join(" | ") : "NADA"}`);
    console.log(`    pantalla tras Ctrl+C: ${resumir(tras.replace(/\s+/g, " "))}`);
  }

  // Otro panel manda un OSC 52 mientras estás en Claude Code: no puede pisar nada.
  for (let i = 0; i < 2; i++) {
    await teclear(consola, "\x03");
    await dormir(1500);
  }
  await v.js(`(() => { document.querySelector('[data-pane-id="${panelClaude}"] .xterm-helper-textarea').focus(); window.__copiado = []; return "ok"; })()`);
  await teclear(deFondo, `node -e "setTimeout(()=>process.stdout.write(String.fromCharCode(27)+']52;c;'+Buffer.from('PISADO desde otro panel').toString('base64')+String.fromCharCode(7)),1500)"\r`);
  await dormir(4000);
  const llego = (await historial(deFondo)).includes("\x1b]52;c;");
  const pisado = await v.js(`JSON.stringify(window.__copiado)`).then(JSON.parse);
  if (!llego) console.log(`  lo último de la consola: ${JSON.stringify((await historial(deFondo)).slice(-400))}`);
  console.log(`  otro panel manda un OSC 52 (${llego ? "llegó a su terminal" : "NO llegó, la prueba no vale"}) con el foco en Claude Code (${await dondeFoco()}): portapapeles falso ${pisado.length ? pisado.map(resumir).join(" | ") : "intacto"}`);
} finally {
  if (claude) {
    // Por las buenas: dos Ctrl+C, y esperar a que vuelva el prompt de PowerShell.
    for (let i = 0; i < 3; i++) {
      await teclear(claude, "\x03").catch(() => {});
      await dormir(400);
      await teclear(claude, "\x03").catch(() => {});
      const fuera = await hasta(async () => (/PS [A-Z]:\\.*>\s*$/m.test(await pantalla(claude)) ? true : null), 8000, 400);
      if (fuera) break;
    }
    console.log(`  Claude Code cerrado por las buenas: ${/PS [A-Z]:\\/.test(await pantalla(claude)) ? "sí" : "NO, mirar ~/.claude.json"}`);
  }
  await a.cerrar();
}
