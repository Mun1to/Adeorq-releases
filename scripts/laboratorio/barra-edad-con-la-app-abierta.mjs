// La edad de una conversación avanza con la app abierta, y la que cerró un
// agente se archiva aunque la app lleve rato encendida.
//
// Munir, 2026-10-22, con su Adeorq abierta desde la tarde anterior: la barra
// decía «5 h» de una conversación de hacía doce y seguía llena de terminales
// cerradas con su rastro. El caché de `sessions.rs` devolvía la foto de la
// primera lectura, edad incluida, y `archivadasSolas` mira esa edad para saber
// si se escribió después del rastro. Los otros laboratorios de la barra abren la
// app y miran enseguida, así que nunca llegaban a ver una foto vieja.
//
// En una Adeorq aislada: se siembra una conversación de hace 30 minutos, se deja
// la app abierta nueve, se escribe su rastro con la hora de su cierre y se mira
//   · que la fila ya no dice la edad del arranque;
//   · que en el siguiente latido pasa sola a «Archivadas».
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/barra-edad-con-la-app-abierta.mjs [exe]
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
const NOMBRE = "barra-edad";
const BASE = join(tmpdir(), `adeorq-${NOMBRE}-${process.pid}`);
const RASTROS = join(BASE, "datos", "Adeorq", "rastros");
const ESPERA_MIN = 9;
const SID = "33333333-3333-4333-8333-333333333333";

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `  (${detalle})` : ""}`);
};

const a = await abrirAislada({ nombre: NOMBRE, puertoMcp: 47_000 + (process.pid % 900), depurar: 9900 + (process.pid % 90), exe });
const nacio = new Date(Date.now() - 30 * 60_000);
try {
  const carpeta = join(BASE, "casa", ".claude", "projects", a.demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `${SID}.jsonl`);
  const l = (o) => JSON.stringify({ timestamp: nacio.toISOString(), cwd: a.demo, sessionId: SID, isSidechain: false, ...o });
  writeFileSync(ruta, [
    l({ type: "user", message: { role: "user", content: "Encargo: la edad" } }),
    l({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Hecho." }] } }),
    JSON.stringify({ type: "custom-title", customTitle: "Delegada que se cierra", sessionId: SID }),
  ].join("\n") + "\n");
  utimesSync(ruta, nacio, nacio);

  await a.v.js(`(() => { const p = JSON.parse(localStorage.getItem("adeorq-perfil")); p.leerSesiones = true; localStorage.setItem("adeorq-perfil", JSON.stringify(p)); return "ok"; })()`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  await hasta(() => a.v.js(`(() => { const b = [...document.querySelectorAll(".project-main")].find((x) => /demo/.test(x.textContent ?? "")); if (!b) return false; if (/▸/.test(b.textContent ?? "")) b.click(); return true; })()`), 15_000);
  const fila = () => a.v.js(`document.querySelector('[data-sesion="${SID}"]')?.textContent ?? ""`);
  const edad = (t) => Number(/(\d+)\s*min/.exec(t)?.[1] ?? NaN);
  const antes = await hasta(async () => (await fila()) || null, 20_000, 500);
  dice(!!antes, "la conversación sale en la barra", antes ? `«${edad(antes)} min»` : "");

  console.log(`      … la app se queda abierta ${ESPERA_MIN} minutos`);
  await dormir(ESPERA_MIN * 60_000);
  // El latido es de 45 s: se espera a que pase al menos uno con la edad nueva.
  const despues = await hasta(async () => {
    const t = await fila();
    return edad(t) >= edad(antes) + ESPERA_MIN - 2 ? t : null;
  }, 60_000, 1000);
  dice(!!despues, "la edad de la fila avanza con el reloj", `antes «${edad(antes)} min», ahora «${edad(despues ?? (await fila()))} min»`);

  // El rastro, seis minutos antes de su última línea: dentro del margen de diez
  // que tiene un CLI para soltar lo último al morir. Con la edad buena se
  // archiva; con la del arranque (nueve minutos más joven) se pasa del margen,
  // que es lo que le pasaba a Munir.
  mkdirSync(RASTROS, { recursive: true });
  const rastro = join(RASTROS, `${NOMBRE}.md`);
  writeFileSync(rastro, `# Rastro de «Delegada que se cierra»\n\n- Conversación: \`${SID}\`\n\n## Qué hizo\n\nSu parte.\n`);
  const cierre = new Date(nacio.getTime() - 6 * 60_000);
  utimesSync(rastro, cierre, cierre);
  const t0 = Date.now();
  const fuera = await hasta(async () => !(await fila()), 60_000, 1000);
  dice(!!fuera, "con su rastro, sale sola de la barra en el siguiente latido", fuera ? `${Math.round((Date.now() - t0) / 1000)} s` : "sigue a la vista");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
