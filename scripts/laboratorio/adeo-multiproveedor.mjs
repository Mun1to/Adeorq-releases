// Adeo pensando con otro programa, de verdad: una Adeorq aislada (la de
// `aislada.mjs`) con un solo proyecto, «demo», y a cada programa se le pregunta
// qué proyectos hay. Solo puede saberlo mirando con `get_projects`, que es una
// de las siete manos de Adeorq: sin consola ni disco no tiene otro camino. Si
// contesta «demo» y por el evento `conserje-paso` sale «Mirando tus proyectos»,
// las manos le llegan y el resto no (la línea de cada uno la prueban los
// `cargo test --lib conserje`).
//
// Después fotografía lo que eligió Munir el 2026-10-21: el menú del cerebro con
// el programa arriba y el escalón debajo, la pastilla «Sesiones» y su menú, y
// las dos cajas de Adeo, quietas y con el filo de luz.
//
// GASTA un tiro barato de cada programa (el escalón rápido). Necesita:
//   cargo build --manifest-path src-tauri/Cargo.toml   y   pnpm dev
//   node scripts/laboratorio/adeo-multiproveedor.mjs [codex gemini claude] [--fotos <carpeta>]
//
// El login de cada CLI es el de Munir: la casa de la app aislada es de mentira,
// así que se les señala su carpeta de siempre (`CODEX_HOME`, `GEMINI_CLI_HOME`).
// Codex piensa con `--ephemeral` y no deja sesión; Gemini sí deja la suya en
// `~/.gemini/tmp`, igual que cuando piensa en la app de verdad.
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, carceles, dormir, hasta } from "./aislada.mjs";

const args = process.argv.slice(2);
const iFotos = args.indexOf("--fotos");
const fotos = iFotos >= 0 ? args[iFotos + 1] : join(tmpdir(), "adeo-multiproveedor");
const programas = args.filter((a, i) => !a.startsWith("--") && i !== iFotos + 1);
// `--sin-gastar`: solo la cara, sin preguntarle a ningún programa.
const quienes = args.includes("--sin-gastar") ? [] : programas.length ? programas : ["codex", "gemini"];
mkdirSync(fotos, { recursive: true });

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
};

const casa = process.env.USERPROFILE;
const a = await abrirAislada({
  nombre: "adeo-multi",
  puertoMcp: 3097,
  depurar: 9337,
  fotos,
  entorno: { CODEX_HOME: join(casa, ".codex"), GEMINI_CLI_HOME: casa },
});
const { v } = a;
const invoke = (cmd, datos) => v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(datos ?? {})})`);

try {
  const lista = await invoke("conserje_pensadores");
  console.log("pensadores:", lista.map((p) => `${p.id}${p.instalado ? "" : " (no instalado)"}`).join(", "));
  ok("el menú ofrece a Claude, Codex y Gemini", ["claude", "codex", "gemini"].every((id) => lista.some((p) => p.id === id)));

  // Los pasos mientras piensa, por el mismo evento que pinta el chat.
  await v.js(`(() => {
    window.__pasos = [];
    const I = window.__TAURI_INTERNALS__;
    return I.invoke("plugin:event|listen", { event: "conserje-paso", target: { kind: "Any" }, handler: I.transformCallback((e) => window.__pasos.push(e.payload)) });
  })()`);

  for (const quien of quienes) {
    const id = `lab${quien}${Date.now().toString(36)}`;
    await invoke("conserje_pensador", { id, pensador: quien });
    await invoke("conserje_cerebro", { id, cerebro: "haiku" });
    const inicio = Date.now();
    let r;
    try {
      r = await invoke("conserje_enviar", { id, texto: "¿Qué proyectos tengo? Dime solo sus nombres y no abras nada.", estados: {}, quien: null });
    } catch (e) {
      ok(`${quien}: contesta`, false, String(e).slice(0, 300));
      continue;
    }
    const pasos = (await v.js(`window.__pasos.filter((p) => p.id === ${JSON.stringify(id)}).map((p) => p.paso)`)) ?? [];
    console.log(`  ${quien} en ${((Date.now() - inicio) / 1000).toFixed(1)} s · pasos: ${pasos.join(" | ") || "ninguno"}\n  dice: ${r.texto.replace(/\s+/g, " ").slice(0, 200)}`);
    ok(`${quien}: mira con las manos de Adeorq`, pasos.some((p) => /proyectos/i.test(p)), pasos.join(" | "));
    ok(`${quien}: y contesta lo que hay («demo»)`, /demo/i.test(r.texto), r.texto.slice(0, 120));
    ok(`${quien}: sin abrir nada`, r.acciones.length === 0, JSON.stringify(r.acciones));
    const conv = await invoke("conserje_leer", { id });
    ok(`${quien}: la conversación recuerda con qué piensa`, conv.pensador === (quien === "claude" ? undefined : quien), String(conv.pensador));
  }

  // ── La cara ───────────────────────────────────────────────────────────────
  // Pulsa el primero que case: con `texto`, el que empiece por él.
  const pulsar = (sel, texto) =>
    v.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => ${texto ? `e.textContent.trim().startsWith(${JSON.stringify(texto)})` : "true"}); if (!b) return false; b.click(); return true; })()`);
  ok("se abre el Chat", await hasta(() => pulsar("button", "Chat"), 8000));
  await dormir(800);
  const conId = await hasta(async () => {
    await pulsar(".cj-nueva");
    await dormir(400);
    return v.js(`document.querySelector(".chat-caja.cj-caja") ? true : false`);
  }, 8000);
  ok("el hilo de Adeo tiene su caja con halo", !!conId);
  const sombra = await v.js(`getComputedStyle(document.querySelector(".cj-caja")).boxShadow`);
  ok("la caja del Chat lleva el halo del acento", (sombra.match(/rgb/g) ?? []).length >= 3, sombra.slice(0, 120));
  await a.foto(null, "1-chat-reposo.png");

  ok("se abre el menú del cerebro", await pulsar(".cj-pastilla", "Conserje:"));
  await dormir(500);
  const progs = await v.js(`[...document.querySelectorAll(".cj-prog")].map((b) => b.textContent.trim())`);
  ok("arriba los programas", progs.includes("Codex") && progs.includes("Gemini"), progs.join(", "));
  const filas = await v.js(`[...document.querySelectorAll(".cj-menu-cerebro .chat-menu-fila strong")].map((s) => s.textContent)`);
  ok("debajo los tres escalones", filas.length === 3, filas.join(", "));
  const presos = await carceles(v, ".cj-menu-cerebro");
  ok("el menú del cerebro sin cárceles", presos.fallos.length === 0, JSON.stringify(presos.fallos).slice(0, 300));
  await a.foto(null, "2-menu-cerebro.png");
  await pulsar(".cj-prog", "Codex");
  await dormir(700);
  const filasCodex = await v.js(`[...document.querySelectorAll(".cj-menu-cerebro .chat-menu-fila strong")].map((s) => s.textContent)`);
  ok("con Codex, sus nombres de modelo", filasCodex.join() === "gpt-5.6-luna,gpt-5.6-terra,gpt-6-luna", filasCodex.join(", "));
  await a.foto(null, "3-menu-cerebro-codex.png");
  await pulsar(".cj-escalon", "Normal");
  await dormir(500);
  const pastilla = await v.js(`[...document.querySelectorAll(".cj-pastilla")].map((b) => b.textContent.trim()).find((t) => t.startsWith("Conserje:"))`);
  ok("la pastilla dice programa y escalón", pastilla === "Conserje: Codex · Normal", pastilla);

  ok("se abre el menú de Sesiones", await pulsar(".cj-pastilla", "Sesiones:"));
  await dormir(500);
  const sesiones = await v.js(`[...document.querySelectorAll(".cj-menu-ancho .chat-menu-fila strong")].map((s) => s.textContent)`);
  ok("Router primero y luego los programas", sesiones[0] === "Router" && sesiones.includes("Claude"), sesiones.join(", "));
  const presos2 = await carceles(v, ".cj-menu-ancho");
  ok("el menú de Sesiones sin cárceles", presos2.fallos.length === 0, JSON.stringify(presos2.fallos).slice(0, 300));
  await a.foto(null, "4-menu-sesiones.png");
  const pastillas = () => v.js(`[...document.querySelectorAll(".cj-pastillas .cj-pastilla")].map((b) => b.textContent.trim())`);
  // La conversación que se está tocando: la última escrita en su carpeta (la
  // lista del Chat no enseña las que aún no tienen turnos).
  const leer = () => {
    const dir = join(a.base, "datos", "Adeorq", "conserje");
    const [ultima] = readdirSync(dir)
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((x, y) => y.t - x.t);
    return JSON.parse(readFileSync(join(dir, ultima.f), "utf8"));
  };
  await pulsar(".cj-menu-ancho .chat-menu-fila", "Codex");
  await dormir(700);
  let ps = await pastillas();
  ok("con Codex forzado, «Sesiones: Codex» y al lado el modelo", ps.includes("Sesiones: Codex") && ps.includes("Modelo: lo elige el router"), ps.join(" | "));
  let c = await leer();
  ok("y se guarda: programa codex con el router eligiendo el modelo", c.programa === "codex" && c.router === true, JSON.stringify({ programa: c.programa, router: c.router }));
  await pulsar(".cj-pastilla", "Modelo:");
  await dormir(400);
  await a.foto(null, "4b-menu-modelo.png");
  await pulsar(".chat-menu-fila", "A fondo");
  await dormir(700);
  ps = await pastillas();
  c = await leer();
  ok("fijar «A fondo» lo dice con el nombre de Codex", ps.includes("Modelo: gpt-6-luna"), ps.join(" | "));
  ok("y es el router apagado con el modelo fijo de antes", c.router === false && c.fijo === "opus", JSON.stringify({ router: c.router, fijo: c.fijo }));
  await pulsar(".cj-pastilla", "Sesiones:");
  await dormir(400);
  await pulsar(".cj-menu-ancho .chat-menu-fila", "Router");
  await dormir(700);
  ps = await pastillas();
  c = await leer();
  ok("Router lo devuelve todo al router", ps.includes("Sesiones: Router") && !ps.some((p) => p.startsWith("Modelo:")) && c.router === true && !c.programa, ps.join(" | "));

  // El filo, encendido a mano sobre la caja de verdad: se mide que gire.
  const gira = await v.js(`(async () => {
    const c = document.querySelector(".cj-caja");
    c.setAttribute("data-trabajando", "true");
    const ang = () => getComputedStyle(c, "::before").getPropertyValue("--adeo-ang");
    const a1 = ang(); await new Promise((r) => setTimeout(r, 700)); const a2 = ang();
    return { a1, a2, anim: getComputedStyle(c, "::before").animationName };
  })()`);
  ok("trabajando, el filo da la vuelta", gira.anim === "adeo-filo" && gira.a1 !== gira.a2, JSON.stringify(gira));
  await a.foto(null, "5-chat-trabajando.png");

  ok("se abre el Panel", await hasta(() => pulsar("button", "Panel"), 8000));
  await dormir(1200);
  const panel = await v.js(`(() => { const c = document.querySelector(".inicio-caja"); return c ? getComputedStyle(c).boxShadow : null; })()`);
  ok("la caja del Panel lleva el halo", !!panel && (panel.match(/rgb/g) ?? []).length >= 4, String(panel).slice(0, 120));
  await a.foto(null, "6-panel-reposo.png");
  await v.js(`document.querySelector(".inicio-caja")?.setAttribute("data-trabajando", "true")`);
  await dormir(1500);
  await a.foto(null, "7-panel-trabajando.png");
} finally {
  await a.cerrar();
}
console.log(`\nfotos en ${fotos}`);
console.log(fallos ? `${fallos} FALLAN` : "Todo en verde.");
process.exit(fallos ? 1 : 0);
