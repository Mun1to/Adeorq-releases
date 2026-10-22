// Las conversaciones traídas a mano que llevan un mes sin tocarse se archivan
// solas, en la app de verdad.
//
// Munir, 2026-10-22 (D5, «que se archiven solas»): diecisiete conversaciones de
// hace dos meses seguían en su barra porque un día las trajo con el ＋, y ser
// traída las libraba de todo. La regla está en `archivadasSolas`
// (`lib/enLaBarra.ts`, casos en `scripts/barra-check.ts`); esto mira la barra
// pintada.
//
// En una Adeorq aislada, con el estado de la barra sembrado por la guarda (la
// app aislada nunca lee ni escribe el de Munir), dos conversaciones de hace 60
// días, las dos traídas:
//   · «Traída vieja», sin fecha de traída: pasa sola a «Archivadas»;
//   · «Traída ayer», con su fecha de ayer: se queda en la barra.
// Y al restaurar la vieja vuelve a la lista y se queda.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/barra-traidas-viejas.mjs [exe]
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
const ahora = Date.now();
const DIA = 24 * 3_600_000;
const ID = { vieja: "bbbbbbbb-2222-4222-8222-000000000001", ayer: "bbbbbbbb-2222-4222-8222-000000000002" };

function sembrar(datos) {
  const base = dirname(dirname(datos));
  const demo = join(base, "proyectos", "demo");
  const carpeta = join(base, "casa", ".claude", "projects", demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(carpeta, { recursive: true });
  for (const [id, titulo] of [[ID.vieja, "Traída vieja"], [ID.ayer, "Traída ayer"]]) {
    const t = new Date(ahora - 60 * DIA);
    const ruta = join(carpeta, `${id}.jsonl`);
    const l = (o) => JSON.stringify({ timestamp: t.toISOString(), cwd: demo, sessionId: id, isSidechain: false, ...o });
    writeFileSync(ruta, [
      l({ type: "user", message: { role: "user", content: `Encargo: ${titulo}` } }),
      l({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Hecho." }] } }),
      JSON.stringify({ type: "custom-title", customTitle: titulo, sessionId: id }),
    ].join("\n") + "\n");
    utimesSync(ruta, t, t);
  }
}

// El estado de la barra que contesta la guarda: las dos traídas, solo la de ayer con fecha.
const estado = { traidas: [ID.vieja, ID.ayer], traidasEn: { [ID.ayer]: ahora - DIA } };
const guarda = `(() => {
  const antes = window.fetch;
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/^https?:\\/\\/ipc\\.localhost\\/load_ui_state$/.test(url)) {
      return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(JSON.stringify(estado))}), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return antes(a, b);
  };
})()`;

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const a = await abrirAislada({ nombre: "barra-traidas", puertoMcp: 47_000 + (process.pid % 900), depurar: 9600 + (process.pid % 100), exe, sembrar, guarda });
try {
  await a.v.js(`(() => { const p = JSON.parse(localStorage.getItem("adeorq-perfil")); p.leerSesiones = true; localStorage.setItem("adeorq-perfil", JSON.stringify(p)); return "ok"; })()`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  await dormir(800);
  await hasta(() => a.v.js(`(() => { const b = [...document.querySelectorAll(".project-main")].find((x) => /demo/.test(x.textContent ?? "")); if (!b) return false; if (/▸/.test(b.textContent ?? "")) b.click(); return true; })()`), 15_000);
  const filas = () => a.v.js(`JSON.stringify([...document.querySelectorAll("[data-sesion]")].map((e) => e.getAttribute("data-sesion")))`).then((x) => JSON.parse(x ?? "[]"));
  const vistas = await hasta(async () => ((await filas()).includes(ID.ayer) ? await filas() : null), 30_000, 500);
  dice(!!vistas, "la traída con fecha de ayer sale en la barra", JSON.stringify(vistas));
  dice(!(vistas ?? []).includes(ID.vieja), "la traída sin fecha, de hace 60 días, ya no está en la lista", JSON.stringify(vistas));
  const archivadas = () => a.v.js(`[...document.querySelectorAll("button")].find((x) => /archivada/i.test(x.getAttribute("data-tip") ?? x.title ?? x.textContent ?? ""))?.click(); "ok"`);
  await archivadas();
  await dormir(600);
  dice((await filas()).includes(ID.vieja), "está en «Archivadas»");
  await a.v.js(`(() => { const b = document.querySelector('[data-sesion="${ID.vieja}"] [data-tip^="Restaurar"]'); b?.click(); return !!b; })()`);
  await dormir(600);
  await archivadas();
  await dormir(600);
  const tras = await filas();
  dice(tras.includes(ID.vieja), "al restaurarla vuelve a la lista", JSON.stringify(tras));
  await dormir(2000);
  dice((await filas()).includes(ID.vieja), "y se queda: restaurarla le pone fecha nueva");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
