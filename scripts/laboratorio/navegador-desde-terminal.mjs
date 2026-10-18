// Una terminal levanta un servidor y su web acaba en el navegador de la derecha, de punta a punta,
// en una Adeorq aislada: la terminal es de verdad (un PTY con un `node` que sirve una página y
// escribe «Local: http://localhost:<puerto>/» como Vite), `TerminalPane` ve la dirección, `WebAuto`
// pregunta si el puerto contesta y saca «¿Abro…?», se pulsa «Abrir» y la página carga en el
// Chromium nativo, sin sacarte de la vista donde estabas (`traer: false`).
//
//   node scripts/laboratorio/navegador-desde-terminal.mjs [carpeta para las fotos]
//
// Quedó NO PROBADO en la 0.9.223 y se probó el 2026-10-18. Necesita lo mismo que `aislada.mjs`
// (el binario de desarrollo y `pnpm dev`). No gasta cuota: la terminal es una consola.
import { tmpdir } from "node:os";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = process.argv[2] || tmpdir();
const PUERTO_WEB = 5600 + (process.pid % 300);
let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

const a = await abrirAislada({
  nombre: "web-de-terminal",
  puertoMcp: 39351,
  depurar: 9371,
  fotos: FOTOS,
  // Pestañas nativas aunque la carpeta de WebView2 esté forzada (`modo_nativo`).
  entorno: { ADEORQ_NAVEGADOR_LABORATORIO: "1" },
});
const { v } = a;
const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);

try {
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  await hasta(async () => /Arranque de Adeorq/.test((await agente.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  // Empezar en el Panel: la web tiene que esperarte en la Cabina sin traerte.
  await v.js(`document.querySelector('.topbar .tab[data-tab="panel"]')?.click(), true`);
  const id = numero(await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Servidor", brief: "" }));
  dice(id > 0, `una consola de verdad abierta (terminal ${id})`);
  await dormir(2500);
  const servidor = `node -e "require('http').createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end('<title>servida desde la terminal</title><h1>hola</h1>'); }).listen(${PUERTO_WEB}, '127.0.0.1', () => console.log('  Local:   http://localhost:${PUERTO_WEB}/'))"`;
  const escrito = await agente.llamar("send_command", { paneId: id, command: servidor });
  dice(!escrito.error, `le escribe el servidor (${escrito.error ?? "sin error"})`);
  // Abrir la terminal te lleva a la Cabina: al Panel, para ver que «Abrir» no te saca de ahí.
  await v.js(`document.querySelector('.topbar .tab[data-tab="panel"]')?.click(), true`);

  const pregunta = await hasta(() => v.js(`document.querySelector(".web-pregunta")?.textContent ?? null`), 20_000, 300);
  if (!pregunta) console.log(`      lo que enseña la terminal:\n${((await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "").split("\n").filter((l) => l.trim()).slice(-12).map((l) => `      | ${l}`).join("\n")}`);
  dice(new RegExp(`localhost:${PUERTO_WEB}`).test(pregunta ?? ""), `Adeorq pregunta si abre la web («${pregunta}»)`);
  const vista = await v.js(`document.querySelector('.topbar .tab[data-active="true"]')?.dataset.tab ?? "?"`);
  await a.foto(null, "1-pregunta.png");
  await v.js(`[...document.querySelectorAll(".web-pregunta button")].find((b) => /Abrir|Open/.test(b.textContent))?.click(), true`);
  await dormir(800);
  const sigue = await v.js(`document.querySelector('.topbar .tab[data-active="true"]')?.dataset.tab ?? "?"`);
  dice(sigue === vista, `«Abrir» no te saca de donde estabas (${vista} → ${sigue})`);

  // A la Cabina: ahí espera la pestaña, en el Chromium de verdad.
  await v.js(`document.querySelector('.topbar .tab[data-tab="cabina"]')?.click(), true`);
  const titulo = await hasta(() => v.js(`(() => { const t = document.querySelector('.nav-pest[data-on="true"] .nav-pest-nom')?.textContent ?? ""; return /servida/.test(t) ? t : null; })()`), 15_000, 300);
  dice(Boolean(titulo), `en la Cabina, la web de la terminal está cargada en el navegador («${titulo}»)`);
  const enMarco = await v.js(`!!document.querySelector(".nav-hueco iframe")`);
  dice(!enMarco, "en el Chromium nativo, no en un iframe");
  const dir = await v.js(`document.querySelector(".nav-url input").value`);
  dice(dir.includes(`localhost:${PUERTO_WEB}`), `con su dirección en la barra («${dir}»)`);
  await dormir(600);
  await a.foto(null, "2-en-el-navegador.png");
  await agente.llamar("close_pane", { paneId: id, rastro: "Consola de prueba del laboratorio navegador-desde-terminal: sirvió una página y se cierra; no queda nada pendiente." });
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN: la web que levanta una terminal llega al navegador de verdad");
process.exit(fallos ? 1 : 0);
