// La Cabina vacía con TUS datos de uso: que las cifras estén al día.
//
// La tarjeta leía el `stats-cache.json` de Claude Code, que el CLI dejó de
// rehacer: en octubre decía «calculado el 2026-08-18», con el mapa de nueve
// semanas vacío entero y la racha en 0 (Munir, 2026-10-21). Ahora lee lo mismo
// que el Perfil (`lib/historiaDeUso.ts`). Esto lo mira en la app de verdad:
//   · una copia (nunca el original) de tu `uso-historia-2.json` en la carpeta
//     de datos de una Adeorq aislada (`aislada.mjs`), y las cuentas que viajan
//     en `uso_historia` cambiadas por las que esa caché conoce, como hace
//     `perfil-de-verdad.mjs`: Rust solo LEE tus transcripts;
//   · ninguna terminal abierta, así que la Cabina enseña su pantalla vacía;
//   · se espera la tarjeta y se mira: ni rastro de la frase vieja, casillas con
//     uso en el mapa, y una cifra de días activos. Foto en `--fotos`.
//
//   cargo build --manifest-path src-tauri/Cargo.toml
//   pnpm dev
//   node scripts/laboratorio/cabina-vacia-de-verdad.mjs [--fotos <carpeta>]
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirAislada, hasta } from "./aislada.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const iFotos = args.indexOf("--fotos");
const FOTOS = resolve(iFotos >= 0 ? args[iFotos + 1] : join(RAIZ, ".playwright-mcp", "cabina-vacia"));
const CACHE = join(process.env.LOCALAPPDATA ?? "", "Adeorq", "uso-historia-2.json");

/** Las carpetas de cuenta que tu caché ya conoce (igual que `perfil-de-verdad.mjs`). */
function cuentasDeLaCache() {
  const raices = new Map();
  for (const clave of Object.keys(JSON.parse(readFileSync(CACHE, "utf8")))) {
    const ruta = clave.replace(/^\\\\\?\\/, "");
    const i = ruta.search(/\\(projects|sessions|archived_sessions)\\/);
    if (i <= 0) continue;
    const dir = ruta.slice(0, i);
    raices.set(dir.toLowerCase(), { provider: /codex/i.test(dir.split("\\").pop()) ? "codex" : "claude", dir });
  }
  return [...raices.values()];
}

const guarda = (cuentas) => `(() => {
  const antes = window.fetch;
  const CUENTAS = ${JSON.stringify(cuentas)};
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/ipc\\.localhost\\/uso_historia$/.test(url) && b && typeof b.body === "string") {
      const pedido = JSON.parse(b.body);
      pedido.cuentas = CUENTAS;
      return antes(a, { ...b, body: JSON.stringify(pedido) });
    }
    return antes(a, b);
  };
})()`;

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

mkdirSync(FOTOS, { recursive: true });
// Una copia del binario: otra sesión puede estar recompilando C:\ct.
const exe = join(tmpdir(), `adeorq-cabina-vacia-${process.pid}.exe`);
copyFileSync("C:\\ct\\debug\\adeorq.exe", exe);
const a = await abrirAislada({
  nombre: "cabina-vacia",
  exe,
  puertoMcp: 39460 + (process.pid % 20),
  depurar: 9460 + (process.pid % 20),
  fotos: FOTOS,
  sembrar: (datos) => copyFileSync(CACHE, join(datos, "uso-historia-2.json")),
  guarda: guarda(cuentasDeLaCache()),
});
try {
  const { v } = a;
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await hasta(() => v.js(`!!document.querySelector('[data-tab="cabina"]')`), 20_000);
  await v.js(`document.querySelector('[data-tab="cabina"]').click(); "ok"`);
  const leida = await hasta(() => v.js(`!!document.querySelector(".empty .repaso")`), 180_000, 1000);
  dice(!!leida, "la Cabina vacía enseña la tarjeta de tu uso");
  if (leida) {
    const r = await v.js(`(() => {
      const t = document.querySelector(".empty .repaso");
      const datos = Object.fromEntries([...t.querySelectorAll(".repaso-dato")].map((d) => [d.querySelector(".repaso-tag").textContent, d.querySelector(".repaso-val").textContent]));
      const dias = [...t.querySelectorAll(".repaso-dia")];
      return { datos, casillas: dias.length, conUso: dias.filter((d) => d.dataset.n !== "0").length, pie: t.querySelector(".repaso-pie").textContent };
    })()`);
    console.log("      ", JSON.stringify(r.datos));
    console.log(`       casillas: ${r.casillas}, con uso: ${r.conUso}; pie: «${r.pie}»`);
    dice(!/2026-08-18|calculó|worked this out/.test(r.pie), "ya no dice que los datos son de agosto");
    dice(r.conUso > 0, "el mapa de las últimas semanas tiene días con uso");
    dice(Object.keys(r.datos).length >= 6, "salen las cifras");
    const caja = await v.js(`(() => { const b = document.querySelector(".empty").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`);
    const f = await v.enviar("Page.captureScreenshot", { format: "png", clip: { ...caja, scale: 1 } });
    writeFileSync(join(FOTOS, "cabina-vacia.png"), Buffer.from(f.data, "base64"));
    console.log(`       foto: ${join(FOTOS, "cabina-vacia.png")}`);
  }
} finally {
  await a.cerrar();
  rmSync(exe, { force: true });
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
