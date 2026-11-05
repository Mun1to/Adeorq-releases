// La Adeorq de la Microsoft Store, simulada en la de desarrollo, contra la de siempre.
//
// Lo que se rompe dentro de un paquete MSIX (`docs/contexto/tiendas.md`) está detrás de
// `packaged::is_packaged()`. Instalar un paquete de verdad no se hace aquí (solo en el
// runner de GitHub, `.github/workflows/tiendas.yml`), pero una compilación de DESARROLLO
// puede fingirlo con `ADEORQ_FINGIR_EMPAQUETADA=1` (en release esa variable no se lee).
// Esto abre la misma Adeorq aislada dos veces y mide las dos caras de lo mismo:
//
//   1. SIN la variable (la instalación de siempre): la carpeta de datos es
//      `%LOCALAPPDATA%\Adeorq`, no nace `%USERPROFILE%\.adeorq`, `esta_empaquetada`
//      dice que no y Ajustes enseña la tarjeta de siempre con «Buscar actualizaciones».
//   2. CON la variable (el paquete): los datos nacen en `%USERPROFILE%\.adeorq`, no se
//      escribe nada nuevo en `%LOCALAPPDATA%\Adeorq`, el rastro cuenta en qué mundo
//      corre, las terminales aparte no se pueden encender y Ajustes dice que la Tienda
//      la actualiza sola, sin botón de buscar.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/tienda-simulada.mjs [carpeta para las fotos] [exe]
//
// Sale con 1 si algo no se cumple. Deja una foto de la tarjeta de actualizaciones por pasada.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

// `resolve` deja la ruta con las barras de Windows: `abrirAislada` la compara con la del proceso.
const FOTOS = resolve(process.argv[2] || tmpdir());
const exe = resolve(process.argv[3] || EXE);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

// Busca en Ajustes la sección que lleva la tarjeta «Actualizaciones», la deja a la vista
// y dice qué hay en ella.
const TARJETA = `(() => {
  const h2 = [...document.querySelectorAll(".panel.settings h2")].find((e) => e.textContent.trim() === "Actualizaciones");
  if (!h2) return null;
  const tarjeta = h2.closest("section");
  tarjeta.scrollIntoView({ block: "center" });
  const r = tarjeta.getBoundingClientRect();
  return {
    texto: tarjeta.textContent.replace(/\\s+/g, " ").trim(),
    botones: [...tarjeta.querySelectorAll("button")].map((b) => b.textContent.trim()),
    rect: { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 },
  };
})()`;

async function tarjeta(a, archivo) {
  const { v } = a;
  await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
  await dormir(1200);
  const cuantas = await v.js(`document.querySelectorAll(".set-tab").length`);
  for (let i = 0; i < cuantas; i++) {
    await v.js(`(() => { const b = document.querySelectorAll(".set-tab")[${i}]; if (!b.hasAttribute("data-on")) b.click(); return true; })()`);
    await dormir(600);
    const t = await v.js(TARJETA);
    if (t) {
      await dormir(400);
      await a.foto(t.rect, archivo);
      return t;
    }
  }
  return null;
}

/** Lo que Adeorq dejó en una carpeta, sin lo que sembró el laboratorio. */
const ls = (d) => (existsSync(d) ? readdirSync(d) : []);

// ── 1. La instalación de siempre ───────────────────────────────────────────────
console.log("— La instalación de siempre (sin fingir el paquete)");
{
  const a = await abrirAislada({ nombre: "tienda-normal", puertoMcp: 39331, depurar: 9361, fotos: FOTOS, exe });
  try {
    const { v } = a;
    dice((await v.js(`window.__TAURI_INTERNALS__.invoke("esta_empaquetada")`)) === false, "`esta_empaquetada` dice que no");
    const datos = join(a.base, "datos", "Adeorq");
    const casa = join(a.base, "casa");
    // El rastro y el estado nacen donde siempre.
    const nace = await hasta(() => ls(datos).some((n) => !["raiz.txt", "mcp_clientes.json"].includes(n)), 15_000);
    dice(!!nace, "la app escribe en %LOCALAPPDATA%\\Adeorq, donde siempre", ls(datos).join(", "));
    dice(!existsSync(join(casa, ".adeorq")), "y no nace %USERPROFILE%\\.adeorq", ls(casa).join(", "));
    const t = await tarjeta(a, "tienda-normal-actualizaciones.png");
    dice(!!t && t.botones.includes("Buscar actualizaciones"), "Ajustes enseña «Buscar actualizaciones»", t ? t.botones.join(" | ") : "no hay tarjeta");
    dice(!!t && !t.texto.includes("Microsoft Store"), "y no habla de la Tienda", t?.texto.slice(0, 120));
    const rastro = existsSync(join(datos, "rastro.log")) ? readFileSync(join(datos, "rastro.log"), "utf8") : "";
    dice(!rastro.includes("Microsoft Store"), "el rastro no dice que corra desde un paquete");
  } finally {
    await a.cerrar();
  }
}

// ── 2. El paquete, fingido ─────────────────────────────────────────────────────
console.log("— El paquete (ADEORQ_FINGIR_EMPAQUETADA=1)");
{
  const a = await abrirAislada({
    nombre: "tienda-sim",
    puertoMcp: 39332,
    depurar: 9362,
    fotos: FOTOS,
    exe,
    entorno: { ADEORQ_FINGIR_EMPAQUETADA: "1" },
  });
  try {
    const { v } = a;
    dice((await v.js(`window.__TAURI_INTERNALS__.invoke("esta_empaquetada")`)) === true, "`esta_empaquetada` dice que sí");
    const datos = join(a.base, "datos", "Adeorq");
    const nueva = join(a.base, "casa", ".adeorq");
    const nace = await hasta(() => existsSync(join(nueva, "rastro.log")), 15_000);
    dice(!!nace, "los datos nacen en %USERPROFILE%\\.adeorq", ls(nueva).join(", "));
    const rastro = existsSync(join(nueva, "rastro.log")) ? readFileSync(join(nueva, "rastro.log"), "utf8") : "";
    dice(rastro.includes("corre desde el paquete de la Microsoft Store"), "el rastro cuenta en qué mundo corre", rastro.trim().split("\n").slice(-2).join(" / "));
    const sobra = ls(datos).filter((n) => !["raiz.txt", "mcp_clientes.json"].includes(n));
    dice(sobra.length === 0, "no se escribe nada nuevo en %LOCALAPPDATA%\\Adeorq", sobra.join(", "));
    // Que la promesa rechazada se convierta en texto DENTRO de la página: `Runtime.evaluate` no lleva el motivo.
    const motivo = await v.js(`window.__TAURI_INTERNALS__.invoke("terminales_aparte_poner", { encender: true }).then(() => "se dejó", (e) => String(e))`);
    dice(/Microsoft Store/.test(motivo), "las terminales aparte no se dejan encender", motivo.slice(0, 120));
    dice(!existsSync(join(nueva, "terminales", "encendido")), "y no queda escrito el «1» de encendido");
    dice((await v.js(`window.__TAURI_INTERNALS__.invoke("terminales_aparte")`)) === false, "y `terminales_aparte` dice que no");
    const t = await tarjeta(a, "tienda-sim-actualizaciones.png");
    dice(!!t && /Microsoft Store/.test(t.texto), "Ajustes dice que la Tienda la actualiza sola", t?.texto.slice(0, 160));
    dice(!!t && t.botones.length === 0, "y no hay ningún botón de buscar ni de poner", t ? t.botones.join(" | ") : "");
  } finally {
    await a.cerrar();
  }
}

console.log(fallos ? `\n${fallos} cosas que no se cumplen.` : "\nTodo se cumple.");
console.log(`Fotos en ${FOTOS}`);
process.exit(fallos ? 1 : 0);
