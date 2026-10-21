// Las terminales que abrió otra sesión se archivan al cerrarse, con la app
// abierta: por tu X o por el `close_pane` de su agente.
//
// Munir, 2026-10-21: «que esto no vuelva a pasar», con la barra llena de
// terminales terminadas. `barra-archiva-solas.mjs` mira la regla con los rastros
// ya en el disco al arrancar; esto mira lo que pasa EN VIVO, que es donde
// fallaba: la barra solo releía los rastros al montarse, y su latido de 45 s
// releía las sesiones pero no los rastros.
//
// En una Adeorq aislada con un `claude.cmd` de mentira delante en el `Path`: una
// consola «Madre» abre dos hijas de Claude por `open_pane`; se siembra la
// conversación de cada una, y
//   · la primera se cierra con la X de su cabecera: deja un rastro «la cerró
//     Munir con la X» y sale de la barra al momento;
//   · la segunda la cierra la madre con `close_pane` y su rastro: sale de la
//     barra en el siguiente latido, sin recargar.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/x-archiva-la-delegada.mjs [exe]
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
const NOMBRE = "x-delegada";
const BASE = join(tmpdir(), `adeorq-${NOMBRE}-${process.pid}`);
const BIN = join(BASE, "bin");
const RASTROS = join(BASE, "datos", "Adeorq", "rastros");

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const sembrar = () => {
  mkdirSync(BIN, { recursive: true });
  writeFileSync(join(BIN, "claude.cmd"), `@echo off\r\necho [claude de mentira] %*\r\npause >nul\r\n`);
};
const clave = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "Path";
const path = `${BIN};${process.env[clave] ?? ""}`;
const a = await abrirAislada({ nombre: NOMBRE, puertoMcp: 47_000 + (process.pid % 900), depurar: 9900 + (process.pid % 90), exe, sembrar, entorno: { [clave]: path } });

/** La conversación de una hija, como la escribiría Claude Code, de hace un minuto. */
const conversacion = (sid, titulo) => {
  const carpeta = join(BASE, "casa", ".claude", "projects", a.demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `${sid}.jsonl`);
  const t = new Date(Date.now() - 60_000);
  const l = (o) => JSON.stringify({ timestamp: t.toISOString(), cwd: a.demo, sessionId: sid, isSidechain: false, ...o });
  writeFileSync(ruta, [
    l({ type: "user", message: { role: "user", content: `Encargo: ${titulo}` } }),
    l({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Hecho." }] } }),
    JSON.stringify({ type: "custom-title", customTitle: titulo, sessionId: sid }),
  ].join("\n") + "\n");
  utimesSync(ruta, t, t);
};

try {
  await a.v.js(`(() => { const p = JSON.parse(localStorage.getItem("adeorq-perfil")); p.leerSesiones = true; localStorage.setItem("adeorq-perfil", JSON.stringify(p)); return "ok"; })()`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);

  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const idDe = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
  const madre = idDe(await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Madre", brief: "" }));
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${madre}"]')`), 15_000, 400);
  const desdeMadre = a.puente(madre);
  await desdeMadre.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const hijaX = idDe(await desdeMadre.llamar("open_pane", { cli: "claude", cwd: a.demo, name: "Hija de la X", brief: "" }));
  const hijaMcp = idDe(await desdeMadre.llamar("open_pane", { cli: "claude", cwd: a.demo, name: "Hija del agente", brief: "" }));
  dice(Number.isFinite(hijaX) && Number.isFinite(hijaMcp), "la madre abre dos hijas de Claude");

  const sidDe = async (id) => {
    const txt = (await agente.llamar("get_active_panes", {})).texto ?? "";
    const linea = txt.split("\n").find((l) => l.startsWith(`ID: ${id},`)) ?? "";
    return /--session-id ([0-9a-f-]{36})/.exec(linea)?.[1];
  };
  const sidX = await hasta(() => sidDe(hijaX), 15_000, 500);
  const sidMcp = await hasta(() => sidDe(hijaMcp), 15_000, 500);
  dice(!!sidX && !!sidMcp, "cada hija nace con su conversación", `${sidX} ${sidMcp}`);
  conversacion(sidX, "Hija de la X");
  conversacion(sidMcp, "Hija del agente");
  // La barra las lee al releer: el botón de releer, como haría Munir.
  await a.v.js(`document.querySelector('[data-tip="Releer proyectos y sesiones"]')?.click(); "ok"`);
  await hasta(() => a.v.js(`(() => { const b = [...document.querySelectorAll(".project-main")].find((x) => /demo/.test(x.textContent ?? "")); if (!b) return false; if (/▸/.test(b.textContent ?? "")) b.click(); return true; })()`), 15_000);
  const enBarra = (sid) => a.v.js(`!!document.querySelector('[data-sesion="${sid}"]')`);
  dice(!!(await hasta(async () => (await enBarra(sidX)) && (await enBarra(sidMcp)), 20_000, 500)), "las dos salen en la barra mientras trabajan");

  // 1. La X de la cabecera.
  await a.v.js(`document.querySelector('[data-pane-id="${hijaX}"] .pane-close')?.click(); "ok"`);
  const rastroX = await hasta(() => {
    if (!existsSync(RASTROS)) return null;
    const f = readdirSync(RASTROS).map((n) => readFileSync(join(RASTROS, n), "utf8")).find((t) => t.includes(sidX));
    return f ?? null;
  }, 15_000, 400);
  dice(!!rastroX && /la cerró Munir con la X/.test(rastroX) && /«Madre»/.test(rastroX), "la X deja un rastro que dice quién la abrió y que la cerraste tú", (rastroX ?? "").slice(0, 200));
  const fueraX = await hasta(async () => !(await enBarra(sidX)), 10_000, 400);
  dice(!!fueraX, "y sale de la barra al momento, sin recargar");

  // 2. El close_pane del agente que la abrió, con su rastro.
  const r = await desdeMadre.llamar("close_pane", { paneId: hijaMcp, rastro: "Hizo su parte y la dejó en el BUZON.md del proyecto; no queda nada pendiente." });
  dice(!r.error, "la madre la cierra con close_pane y su rastro", r.error ?? "");
  const t0 = Date.now();
  const fueraMcp = await hasta(async () => !(await enBarra(sidMcp)), 60_000, 1000);
  dice(!!fueraMcp, "sale de la barra en el siguiente latido, sin recargar", `${Math.round((Date.now() - t0) / 1000)} s`);
  if (fueraMcp) console.log(`      tardó ${Math.round((Date.now() - t0) / 1000)} s`);
  dice(await enBarra(sidX) === false && (await a.v.js(`!!document.querySelector('[data-pane-id="${madre}"]')`)), "la madre sigue abierta y nada vuelve a la barra");
  agente.cerrar();
  desdeMadre.cerrar();
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
