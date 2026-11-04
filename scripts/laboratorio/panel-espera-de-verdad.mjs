// El Panel (la pestaña de inicio) y una sesión que espera un permiso, en la app de verdad.
//
//   node scripts/laboratorio/panel-espera-de-verdad.mjs [exe] [carpeta para las fotos]
//
// E10 vio en sus capturas que el Panel decía «Una sesión en marcha y nada
// pendiente de ti.» con un permiso esperando en la Cabina. Con sesiones grabadas
// no se sabía si era del montaje o del código. Es del código: el Panel solo leía
// el transcript del disco (`scanSessions`), y un permiso («Do you want to
// proceed?») NO está en el transcript hasta que lo contestas: ahí lo último es
// la herramienta (`a_medias`, «sigue trabajando»). Lo sabe la pantalla del panel,
// que es de donde lo lee la Cabina (`estadoDelPanel`).
//
// Lo que monta, sin gastar nada ni llamar a ningún modelo:
//  · una sesión «viva» de Claude en la casa de pruebas (`sessions/<pid>.json` con
//    el pid de este mismo proceso, y su transcript terminado en un `tool_use`);
//  · una terminal de la Cabina que imprime la pantalla de un permiso de Claude
//    Code, que es lo que lee `parseAsk`.
// Y mira qué dicen la Cabina y el Panel.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] || EXE;
const FOTOS = process.argv[3] || tmpdir();
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const nombre = "panel-espera";
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casa = join(base, "casa");
const sid = "0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8";
const cwd = join(casa, "proyecto-lab");
mkdirSync(cwd, { recursive: true });

// La sesión «viva» y su transcript: lo último que dijo Claude es una herramienta (un `Bash`
// que pide permiso), que es todo lo que el disco sabe de un permiso pendiente.
const raizClaude = join(casa, ".claude");
const carpeta = cwd.replace(/[^A-Za-z0-9]/g, "-");
mkdirSync(join(raizClaude, "sessions"), { recursive: true });
mkdirSync(join(raizClaude, "projects", carpeta), { recursive: true });
writeFileSync(join(raizClaude, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: sid, cwd }));
const ahora = new Date().toISOString();
const linea = (o) => JSON.stringify({ cwd, sessionId: sid, timestamp: ahora, ...o });
writeFileSync(
  join(raizClaude, "projects", carpeta, `${sid}.jsonl`),
  [
    linea({ type: "user", message: { role: "user", content: "borra la carpeta de pruebas" } }),
    linea({
      type: "assistant",
      message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "rm -rf pruebas" } }] },
    }),
  ].join("\n") + "\n",
);

// La pantalla de un permiso de Claude Code, tal como la lee `parseAsk` (`PREGUNTAS`).
const PANTALLA = [
  "$c = [char]0x276F",
  "Write-Host ''",
  "Write-Host ' Bash command'",
  "Write-Host '   rm -rf pruebas'",
  "Write-Host ''",
  "Write-Host ' Do you want to proceed?'",
  'Write-Host " $c 1. Yes"',
  "Write-Host '   2. Yes, and do not ask again for rm commands'",
  "Write-Host '   3. No, and tell Claude what to do differently (esc)'",
].join("; ");

const guarda = `(() => {
  localStorage.setItem("adeorq-lang", "es");
  // La casa de pruebas nace sin permiso para leer sesiones; el Panel solo las ve con él.
  const perfil = JSON.parse(localStorage.getItem("adeorq-perfil") || "{}");
  localStorage.setItem("adeorq-perfil", JSON.stringify({ ...perfil, leerSesiones: true }));
  localStorage.setItem("adeorq-layout", JSON.stringify({
    panes: [{ name: "lab · permiso", cwd: ${JSON.stringify(cwd)}, command: ["powershell.exe", "-NoLogo", "-NoExit", "-Command", ${JSON.stringify(PANTALLA)}] }],
    cols: [{ w: 1, hs: [1], idx: [0] }],
  }));
})()`;

const a = await abrirAislada({ nombre, puertoMcp: 47_000 + (process.pid % 900), depurar: 9650 + (process.pid % 100), exe, guarda, fotos: FOTOS });
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  const { v } = a;
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector('[data-tab="cabina"]')`), 20_000);

  const estados = () =>
    v.js(`import("/src/lib/cabina.ts").then((m) => JSON.stringify(Object.values(m.useCabina.getState().estados).map((s) => ({ id: s.id, nombre: s.name, agente: s.agent, estado: s.state, porque: s.porque }))))`).then((s) => JSON.parse(s));
  const vista = (clave) => v.js(`(() => { const b = document.querySelector('[data-tab="${clave}"]'); if (!b) return false; b.click(); return true; })()`);
  const texto = (sel) => v.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText.replace(/\\s+/g, " ").trim() : null; })()`);

  // 1. La Cabina SÍ sabe que el panel espera: lo lee de su pantalla.
  const cabina = await hasta(async () => {
    const l = await estados();
    return l.find((s) => s.estado === "pregunta") ? l : null;
  }, 40_000, 500);
  console.log(`      la Cabina: ${JSON.stringify(cabina)}`);
  dice(!!cabina, "la Cabina marca el panel como «te pregunta» (lo lee de su pantalla)");

  // 2. El disco no: lo último es una herramienta.
  const disco = await v.js(`window.__TAURI_INTERNALS__.invoke("scan_sessions", {}).then((l) => JSON.stringify(l.map((s) => ({ id: s.id.slice(0, 8), live: s.live, state: s.state, fresh: s.fresh, title: s.title, project: s.project }))))`).then((s) => JSON.parse(s));
  console.log(`      el disco: ${JSON.stringify(disco)}`);
  dice(disco.some((s) => s.live && s.state === "a_medias"), "para el disco la sesión está viva y «a medias» (sigue trabajando): un permiso pendiente no sale en el transcript", JSON.stringify(disco));
  dice(!!(await vista("panel")), "se abre el Panel");
  await dormir(2500);
  const resumen = await texto(".inicio-estado");
  const aviso = await texto(".inicio-aviso");
  console.log(`      el Panel, resumen: ${resumen}`);
  console.log(`      el Panel, aviso: ${aviso}`);
  dice(!!aviso && /te pregunta algo|te esperan/.test(aviso), "el Panel avisa de que hay una pregunta esperando, y no dice «nada pendiente de ti»", `resumen=${resumen} · aviso=${aviso}`);
  dice(!resumen || !/nada pendiente de ti/.test(resumen), "y el resumen no afirma que no hay nada pendiente");
  await a.foto(null, "panel-espera.png");

  // 3. «Contestar» lleva a esa terminal.
  if (aviso) {
    await v.js(`document.querySelector(".inicio-aviso .np-btn")?.click(), true`);
    await dormir(1200);
    const activa = await v.js(`document.querySelector(".app")?.getAttribute("data-view") ?? document.querySelector('[data-tab][aria-selected="true"], [data-tab][data-active="true"]')?.getAttribute("data-tab") ?? null`);
    const enfocado = await v.js(`document.querySelector("[data-pane-id][data-focused='true']")?.getAttribute("data-pane-id") ?? null`);
    console.log(`      tras «Contestar»: vista=${activa} panel enfocado=${enfocado}`);
    dice(enfocado != null, "«Contestar» deja enfocada la terminal que pregunta", `enfocado=${enfocado}`);

    // 4. Y si estaba minimizada, la trae: si no, lleva a una Cabina sin ella.
    const suya = `[data-pane-id="${enfocado}"]`;
    const seVe = () => v.js(`(() => { const e = document.querySelector(${JSON.stringify(suya)}); return !!e && e.offsetParent !== null && e.offsetWidth > 0; })()`);
    await v.js(`document.querySelector(${JSON.stringify(`${suya} .pane-btn[data-tip^="Minimizar"]`)})?.click(), true`);
    await dormir(600);
    dice(!(await seVe()), "minimizada, en la Cabina no se ve");
    await vista("panel");
    await dormir(1500);
    await v.js(`document.querySelector(".inicio-aviso .np-btn")?.click(), true`);
    await dormir(1200);
    dice(await seVe(), "«Contestar» trae la terminal que estaba minimizada");
  }
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
