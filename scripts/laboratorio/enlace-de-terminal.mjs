// Pinchar un enlace dentro de una terminal, en una Adeorq aislada.
//
// Los programas de las terminales (Claude Code el primero) pintan sus enlaces
// con OSC 8: un texto que lleva una dirección dentro. xterm los hace pinchables
// y, si nadie le da un `linkHandler`, pregunta con `confirm()`. En Tauri ese
// `confirm` lo cambia el plugin de diálogos por uno asíncrono, y la ventana no
// tiene permiso para él: el rastro de Munir lo apuntó 22 veces entre el 19 y el
// 26-nov («promesa sin capturar · Command plugin:dialog|confirm not allowed by
// ACL»). Y como una promesa cuenta como «sí», xterm seguía con un `window.open`
// a ciegas.
//
// Lo que mira: con el ratón encima de un enlace pintado por PowerShell sale la
// mano; con un clic se pide abrir ESA dirección en el navegador del sistema
// (`plugin:opener|open_url`), sin `confirm`, sin `window.open` y sin nada nuevo
// en el rastro. La apertura se intercepta en la página: no se abre ningún
// navegador en la pantalla de nadie.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/enlace-de-terminal.mjs [exe]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const DIRECCION = "https://example.com/adeorq-enlace-de-prueba";
const TEXTO = "ENLACE-DE-PRUEBA-".repeat(4);
let fallos = 0;
const ok = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `\n      ${String(detalle).slice(0, 500)}` : ""}`);
};

const a = await abrirAislada({ nombre: "enlace-terminal", puertoMcp: 39_541, depurar: 9_541, exe: process.argv[2] ?? EXE });
const { v } = a;
try {
  const agente = a.puente(null);
  const r = await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Enlace", brief: "" });
  const id = Number(/^Terminal (\d+) abierta/.exec(r.texto ?? "")?.[1]);
  if (!id) throw new Error(`open_pane no dio un número: ${r.texto ?? r.error}`);
  const pantalla = `[data-pane-id="${id}"] .xterm-screen`;
  await hasta(() => v.js(`!!document.querySelector(${JSON.stringify(pantalla)})`), 30_000, 500);
  await hasta(async () => /PS .*>/.test((await agente.llamar("read_pane_screen", { paneId: id })).texto ?? ""), 30_000, 500);

  // Lo que la página pide a los plugins de diálogos y de abrir, y sus `window.open`.
  // La apertura de verdad no sale: se apunta y se contesta que sí.
  const espia = await v.js(`(() => {
    window.__visto = [];
    // El \`invoke\` de Tauri no se deja pisar ni redefinir (ni su objeto), pero
    // cada llamada sale por un \`fetch\` a ipc.localhost que se lee en el momento.
    const original = window.fetch;
    const nuevo = function (url, init) {
      const cmd = decodeURIComponent(String(url).replace(/^.*ipc\\.localhost\\//, ""));
      if (/^plugin:(dialog|opener)\\|/.test(cmd)) window.__visto.push(cmd + " " + String(init?.body ?? ""));
      if (cmd === "plugin:opener|open_url") return Promise.resolve(new Response("null", { headers: { "Content-Type": "application/json", "Tauri-Response": "ok" } }));
      return original.apply(this, arguments);
    };
    window.fetch = nuevo;
    window.open = (...x) => { window.__visto.push("window.open " + JSON.stringify(x)); return null; };
    return window.fetch === nuevo;
  })()`);
  ok(espia === true, "se puede mirar lo que pide la página sin abrir nada de verdad", espia);

  const rastro = join(a.base, "datos", "Adeorq", "rastro.log");
  const rastroAntes = existsSync(rastro) ? readFileSync(rastro, "utf8").length : 0;

  // Tres renglones con el enlace, recién limpia la pantalla.
  const e = "$([char]27)";
  const linea = `cls; 1..3 | % { Write-Host "${e}]8;;${DIRECCION}${e}\\${TEXTO}${e}]8;;${e}\\" }`;
  await v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(linea + "\r")} }).then(() => "ok")`);
  ok(!!(await hasta(async () => ((await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "").includes(TEXTO), 20_000, 500)), "PowerShell pinta el enlace");
  await dormir(800);

  // Se pasa el ratón de arriba abajo por el principio de los renglones hasta que sale la mano.
  const caja = await v.js(`(() => { const r = document.querySelector(${JSON.stringify(pantalla)}).getBoundingClientRect(); return { x: r.left, y: r.top, h: r.height }; })()`);
  const raton = (type, x, y, extra = {}) => v.enviar("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });
  let donde = null;
  for (let dy = 3; dy < Math.min(caja.h, 160) && !donde; dy += 4) {
    const x = caja.x + 60;
    const y = caja.y + dy;
    await raton("mouseMoved", x, y);
    await dormir(120);
    const mano = await v.js(`!!document.querySelector(${JSON.stringify(pantalla)})?.classList.contains("xterm-cursor-pointer")`);
    if (mano) donde = { x, y };
  }
  ok(!!donde, "con el ratón encima del enlace sale la mano", JSON.stringify(caja));

  if (donde) {
    await raton("mousePressed", donde.x, donde.y, { button: "left", clickCount: 1 });
    await raton("mouseReleased", donde.x, donde.y, { button: "left", clickCount: 1 });
    await dormir(1500);
    const visto = (await v.js(`JSON.stringify(window.__visto)`)) ?? "[]";
    const pedidos = JSON.parse(visto);
    ok(pedidos.some((p) => p.startsWith("plugin:opener|open_url") && p.includes(DIRECCION)), "un clic pide abrir esa dirección en el navegador del sistema", visto);
    ok(!pedidos.some((p) => p.startsWith("plugin:dialog|")), "sin preguntar con un confirm que esta ventana no puede enseñar", visto);
    ok(!pedidos.some((p) => p.startsWith("window.open")), "sin un window.open a ciegas", visto);
    const nuevo = existsSync(rastro) ? readFileSync(rastro, "utf8").slice(rastroAntes) : "";
    ok(!/plugin:dialog|promesa sin capturar/.test(nuevo), "y el rastro no apunta nada", nuevo);
  }
  agente.cerrar();
} catch (err) {
  ok(false, "el laboratorio llegó al final", err?.stack ?? err);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} fallos` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
