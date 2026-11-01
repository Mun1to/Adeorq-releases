// ¿Cuánto tarda un Ctrl+V en llegar al programa de la terminal?
//
// Munir, 2026-11-01: «hay a veces que no deja copiar y pegar texto de manera
// sencilla y hay que esperar tiempo para que se pegue bien el texto. A veces
// van lag las terminales». Esto lo mide en una Adeorq aislada, con el motor de
// terminales aparte como en la publicada de Windows:
//   - seis consolas; en `--ruido` cinco de ellas sueltan texto sin parar;
//   - en la sexta corre una sonda (node, stdin en crudo) que apunta cuándo le
//     llega el primer byte y cuándo el último del pegado;
//   - el Ctrl+V es un `keydown` de verdad en el textarea de xterm, y el
//     portapapeles es un doble con el texto ya dentro (el de verdad es el de
//     Munir, no se pisa): lo medido es Adeorq de la tecla al programa, sin
//     contar lo que tarde Windows en dar el portapapeles.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/pegar-de-verdad.mjs [--ruido] [--dentro]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const RUIDO = process.argv.includes("--ruido");
const APARTE = !process.argv.includes("--dentro");
// `--directo`: el mismo texto por `pty_write` a pelo, sin xterm ni el pegado.
const DIRECTO = process.argv.includes("--directo");
const RONDAS = 3;
const TAMANOS = (process.env.LAB_TAMANOS ?? "5000,200000").split(",").map(Number);

const casa = join(tmpdir(), `adeorq-pegar-sonda-${process.pid}`);
mkdirSync(casa, { recursive: true });
const SONDA = join(casa, "sonda.cjs");
const ANOTA = join(casa, "llegadas.jsonl");
writeFileSync(
  SONDA,
  `const fs = require("fs");
process.stdin.setRawMode(true);
process.stdin.resume();
let primero = 0, bytes = 0;
process.stdin.on("data", (d) => {
  const s = d.toString("utf8");
  if (!primero) primero = Date.now();
  bytes += s.length;
  if (s.includes("FIN_PEGADO")) {
    fs.appendFileSync(${JSON.stringify(ANOTA)}, JSON.stringify({ primero, ultimo: Date.now(), bytes }) + "\\n");
    primero = 0; bytes = 0;
  }
  if (s.includes("\\x03")) process.exit(0);
});
console.log("SONDA_LISTA");
`,
);

// El portapapeles de mentira: tiene que estar ANTES de que nazca el panel,
// porque `crearPegado` se queda con `navigator.clipboard` al crearse.
const GUARDA_PEGAR = `(() => {
  window.__pegarTexto = "";
  const doble = {
    read: async () => [{ types: ["text/plain"], getType: async () => new Blob([window.__pegarTexto]) }],
    readText: async () => window.__pegarTexto,
    writeText: async () => {},
  };
  Object.defineProperty(Navigator.prototype, "clipboard", { get: () => doble, configurable: true });
})()`;

const a = await abrirAislada({ nombre: "pegar", puertoMcp: 39411, depurar: 9411, guarda: GUARDA_PEGAR, aparte: APARTE });
const { v } = a;
try {
  const agente = a.puente(null);
  const ids = [];
  for (let i = 0; i < 6; i++) {
    const r = await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: `Consola ${i + 1}`, brief: "" });
    const m = /^Terminal (\d+) abierta/.exec(r.texto ?? "");
    if (!m) throw new Error(`open_pane no dio un número: ${r.texto ?? r.error}`);
    ids.push(Number(m[1]));
  }
  await hasta(() => v.js(`document.querySelectorAll("[data-pane-id] .xterm-helper-textarea").length >= 6`), 30_000, 500);
  await dormir(4000);
  const sonda = ids[5];
  // Un agente desconocido está en «plan» y no puede escribir: se teclea desde
  // la página, por el mismo `pty_write` que usa el teclado.
  const teclear = (id, linea) =>
    v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(linea + "\r")} }).then(() => "ok")`);
  await teclear(sonda, `node "${SONDA}"`);
  if (RUIDO) {
    for (const id of ids.slice(0, 5)) {
      await teclear(id, `node -e "setInterval(()=>console.log(Date.now()+' '+'ruido '.repeat(20)),4)"`);
    }
  }
  const lista = await hasta(async () => {
    const t = (await agente.llamar("read_pane_screen", { paneId: sonda })).texto ?? "";
    return t.includes("SONDA_LISTA");
  }, 20_000, 500);
  if (!lista) throw new Error(`la sonda no arrancó:\n${(await agente.llamar("read_pane_screen", { paneId: sonda })).texto ?? ""}`);
  await dormir(1500);

  console.log(`motor ${APARTE ? "aparte" : "dentro"} · ${RUIDO ? "5 consolas soltando texto" : "sin ruido"}`);
  // Cuánto trabaja la página en 10 s: el hilo de la página, en tanto por ciento.
  await v.enviar("Performance.enable", {});
  const metrica = async () => Object.fromEntries((await v.enviar("Performance.getMetrics", {})).metrics.map((m) => [m.name, m.value]));
  const m0 = await metrica();
  await dormir(10_000);
  const m1 = await metrica();
  const pct = (k) => (((m1[k] - m0[k]) / 10) * 100).toFixed(0);
  const animando = await v.js(`JSON.stringify(document.getAnimations().filter((a) => a.playState === "running").map((a) => (a.animationName ?? a.transitionProperty ?? "?") + " en " + (a.effect?.target?.className?.toString?.() ?? "?").slice(0, 60)).slice(0, 15))`);
  console.log(`  animándose en reposo: ${animando}`);
  console.log(`  página en 10 s: tareas ${pct("TaskDuration")} % · script ${pct("ScriptDuration")} % · maquetación ${pct("LayoutDuration")} % · estilos ${pct("RecalcStyleDuration")} %`);
  for (const tam of TAMANOS) {
    const veces = [];
    for (let r = 0; r < RONDAS; r++) {
      const antes = existsSync(ANOTA) ? readFileSync(ANOTA, "utf8").trim().split("\n").filter(Boolean).length : 0;
      const texto = "x".repeat(tam - 12) + "FIN_PEGADO";
      const t0 = await v.js(`(() => {
        window.__pegarTexto = ${JSON.stringify(texto)};
        const ta = document.querySelector('[data-pane-id="${sonda}"] .xterm-helper-textarea');
        ta.focus();
        const t0 = Date.now();
        if (${DIRECTO}) window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${sonda}, data: window.__pegarTexto });
        else ta.dispatchEvent(new KeyboardEvent("keydown", { key: "v", code: "KeyV", ctrlKey: true, bubbles: true, cancelable: true }));
        return t0;
      })()`);
      const llegada = await hasta(() => {
        const l = existsSync(ANOTA) ? readFileSync(ANOTA, "utf8").trim().split("\n").filter(Boolean) : [];
        return l.length > antes ? JSON.parse(l[l.length - 1]) : null;
      }, 30_000, 20);
      if (!llegada) {
        console.log(`  ${tam} B: NO LLEGÓ en 30 s`);
        continue;
      }
      veces.push([llegada.primero - t0, llegada.ultimo - t0]);
      await dormir(800);
    }
    console.log(`  ${(tam / 1000).toFixed(0)} KB: primer byte ${veces.map((x) => x[0]).join(" / ")} ms · último ${veces.map((x) => x[1]).join(" / ")} ms`);
  }
} finally {
  await a.cerrar();
}
