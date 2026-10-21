// Todos los bancos de la página del móvil, cada uno contra un doble recién
// arrancado, y un resumen al final. Muchos cambian el estado del doble
// (contestan, mandan, abren terminales), así que no se pueden encadenar contra
// el mismo: hasta el 2026-10-21 se arrancaba y se paraba a mano para cada uno.
//
//   node scripts/laboratorio/bancos-movil.mjs              (todos)
//   node scripts/laboratorio/bancos-movil.mjs chat ingles   (los que contienen eso)
//
// `movil-ingles.js` va contra el doble en inglés (4392); el resto, contra el
// 4390. Los que comparan con la página de antes en el 4391 (`movil-arranque`,
// `movil-historial`) miden solo la de ahora: la otra sale «sin servidor».
// Se niega si alguno de esos puertos ya está cogido: un doble viejo haría que
// el banco hablara con él y fallara por cosas ajenas. Sale con 1 si alguno falla.
// Desde un agente, en segundo plano y con la salida a un fichero: lanzado en
// primer plano, la herramienta lo cortó dos veces a los tres o cuatro bancos.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const filtros = process.argv.slice(2);
const bancos = readdirSync(AQUI)
  .filter((f) => /^movil-.*\.js$/.test(f))
  .filter((f) => !filtros.length || filtros.some((x) => f.includes(x)))
  .sort();

const ocupado = (puerto) =>
  new Promise((listo) => {
    const s = net.connect({ host: "127.0.0.1", port: puerto });
    s.once("connect", () => { s.destroy(); listo(true); });
    s.once("error", () => listo(false));
    s.setTimeout(3000, () => { s.destroy(); listo(false); });
  });

for (const puerto of [4390, 4392]) {
  if (await ocupado(puerto)) {
    console.error(`El ${puerto} ya está cogido: para ese doble antes de lanzar los bancos.`);
    process.exit(2);
  }
}

async function esperar(puerto) {
  for (let i = 0; i < 50; i++) {
    if (await ocupado(puerto)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const resultados = [];
for (const banco of bancos) {
  const ingles = banco === "movil-ingles.js";
  const puerto = ingles ? 4392 : 4390;
  const doble = spawn(process.execPath, [join(AQUI, "doble-movil.mjs"), String(puerto)], {
    env: { ...process.env, ...(ingles ? { IDIOMA: "en" } : {}) },
    stdio: "ignore",
  });
  try {
    if (!(await esperar(puerto))) {
      resultados.push({ banco, ok: false, que: "el doble no arrancó" });
      continue;
    }
    const salida = await new Promise((listo) => {
      let texto = "";
      const b = spawn(process.execPath, [join(AQUI, "banco-sin-mcp.mjs"), join(AQUI, banco)], { stdio: ["ignore", "pipe", "pipe"] });
      b.stdout.on("data", (d) => (texto += d));
      b.stderr.on("data", (d) => (texto += d));
      b.on("close", (codigo) => listo({ codigo, texto }));
    });
    // Lo que el banco dice que falló, si lo dice; si reventó, su última línea.
    let que = "";
    if (salida.codigo !== 0) {
      const m = /"fallos":\s*(\[[\s\S]*?\n \])/.exec(salida.texto);
      que = m ? m[1].replace(/\s+/g, " ") : salida.texto.trim().split("\n").slice(-3).join(" ");
    }
    resultados.push({ banco, ok: salida.codigo === 0, que });
    console.log(`${salida.codigo === 0 ? "bien" : "MAL "}  ${banco}${que ? `\n      ${que.slice(0, 600)}` : ""}`);
  } finally {
    doble.kill();
    // Que el puerto quede libre antes del siguiente.
    for (let i = 0; i < 25 && (await ocupado(puerto)); i++) await new Promise((r) => setTimeout(r, 200));
  }
}

const mal = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - mal.length} de ${resultados.length} bancos del móvil en verde${mal.length ? `; fallan: ${mal.map((r) => r.banco).join(", ")}` : "."}`);
process.exit(mal.length ? 1 : 0);
