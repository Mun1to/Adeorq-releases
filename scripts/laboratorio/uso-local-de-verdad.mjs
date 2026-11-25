// El registro de uso local en una Adeorq de verdad (`src-tauri/src/uso_local.rs`,
// `src/lib/usoLocal.ts`, decisión d1a213fec659). Lo que mide:
//
//   · SIN `uso-local.on` en la carpeta de datos, cambiar de pantalla no escribe
//     ningún `uso-local-*.jsonl` (la promesa de que no se apunta nada);
//   · CON el archivo, cada cambio queda en `uso-local-AAAA-MM.jsonl` con su hora,
//     la versión, de dónde, a dónde y el rato;
//   · `node scripts/uso-local.mjs --carpeta <datos>` lo resume.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   node scripts/laboratorio/uso-local-de-verdad.mjs [exe]
//
// No abre terminales ni gasta cuota. Sale con 1 si algo falla.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir } from "./aislada.mjs";

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
const usoDe = (datos) => readdirSync(datos).filter((n) => /^uso-local-.*\.jsonl$/.test(n));

/** Abre una aislada, pasa por tres pantallas y devuelve lo que dejó en su carpeta de datos. */
async function pasada(nombre, encendido) {
  const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
  mkdirSync(join(base, "lab-bin"), { recursive: true });
  const exe = join(base, "lab-bin", "adeorq.exe");
  copyFileSync(process.argv[2] ?? EXE, exe);
  const aislada = await abrirAislada({
    nombre,
    puertoMcp: 42_000 + (process.pid % 900) + (encendido ? 1 : 0),
    depurar: 9_700 + (process.pid % 100) + (encendido ? 1 : 0),
    exe,
    sembrar: (datos) => encendido && writeFileSync(join(datos, "uso-local.on"), ""),
  });
  const datos = join(aislada.base, "datos", "Adeorq");
  try {
    for (const tab of ["cabina", "ajustes", "panel"]) {
      await aislada.v.js(`document.querySelector('[data-tab="${tab}"]')?.click(), "ok"`);
      await dormir(700);
    }
    await dormir(800);
    const archivos = usoDe(datos);
    const lineas = archivos.flatMap((n) => readFileSync(join(datos, n), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)));
    const resumen = encendido ? spawnSync(process.execPath, ["scripts/uso-local.mjs", "--carpeta", datos], { encoding: "utf8" }).stdout : "";
    return { archivos, lineas, resumen };
  } finally {
    await aislada.cerrar();
  }
}

console.log("\n── Sin uso-local.on");
const apagada = await pasada("uso-local-apagado", false);
dice(apagada.archivos.length === 0, "cambiar de pantalla no escribe nada", apagada.archivos.join(", "));

console.log("\n── Con uso-local.on");
const encendida = await pasada("uso-local-encendido", true);
const mes = new Date().toISOString().slice(0, 7);
dice(encendida.archivos.length === 1 && encendida.archivos[0] === `uso-local-${mes}.jsonl`, `un archivo del mes (${mes})`, encendida.archivos.join(", "));
const pasos = encendida.lineas.filter((e) => e.ev === "vista").map((e) => `${e.de}>${e.a}`);
dice(pasos.join(" ") === "panel>cabina cabina>ajustes ajustes>panel", "los tres cambios, en orden", pasos.join(" "));
const conTodo = encendida.lineas.filter((e) => e.ev === "vista").every((e) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e.t) && /^\d+\.\d+\.\d+$/.test(e.v) && e.ms >= 500);
dice(conTodo, "cada uno con su hora, la versión y el rato (medio segundo o más)", JSON.stringify(encendida.lineas.slice(0, 2)));
dice(encendida.lineas.some((e) => e.ev === "abre" && e.a === "panel"), "y dónde se abrió");
dice(/cabina\s+1\s/.test(encendida.resumen) && /Nunca abiertas:/.test(encendida.resumen), "el script lo resume", encendida.resumen.split("\n").slice(0, 8).join(" | "));

console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
