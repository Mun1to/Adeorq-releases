// Las conversaciones que cerró un agente se archivan solas, en la app de verdad.
//
// Munir, 2026-10-21, con 36 sesiones en el proyecto Adeorq de su barra: «hay
// demasiadas… ordenar y organizar todo… que esto no vuelva a pasar». 22 de las
// 35 de los últimos treinta días eran terminales que un agente abrió, terminó y
// cerró con `close_pane`, que se lleva el panel y deja su rastro pero no la
// conversación. La regla está en `archivadasSolas` (`lib/enLaBarra.ts`, con sus
// casos en `scripts/barra-check.ts`) y la lista de cerradas la da
// `rastros::cerradas`. Esto mira lo que ninguno de los dos ve: la barra pintada.
//
// Siembra en una Adeorq aislada tres conversaciones de un proyecto «demo»:
//   · «Ajustes a lo ancho»: la cerró un agente hace una hora y nadie la tocó;
//   · «Retomada»: tiene rastro de hace tres horas, pero se escribió hace diez minutos;
//   · «La mía»: sin rastro.
// y comprueba que la barra enseña las dos últimas, que la primera está en
// «Archivadas», y que al desarchivarla vuelve y se queda.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/barra-archiva-solas.mjs [exe]
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
const ahora = Date.now();
const hace = (min) => new Date(ahora - min * 60_000);
const ID = {
  cerrada: "aaaaaaaa-1111-4111-8111-000000000001",
  retomada: "aaaaaaaa-1111-4111-8111-000000000002",
  mia: "aaaaaaaa-1111-4111-8111-000000000003",
};

function sembrar(datos) {
  const base = dirname(dirname(datos));
  const demo = join(base, "proyectos", "demo");
  const carpeta = join(base, "casa", ".claude", "projects", demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(carpeta, { recursive: true });
  const conversacion = (id, titulo, min) => {
    const ruta = join(carpeta, `${id}.jsonl`);
    const t = hace(min).toISOString();
    const l = (o) => JSON.stringify({ timestamp: t, cwd: demo, sessionId: id, isSidechain: false, ...o });
    writeFileSync(ruta, [
      l({ type: "user", message: { role: "user", content: `Encargo: ${titulo}` } }),
      l({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Hecho y subido." }] } }),
      JSON.stringify({ type: "custom-title", customTitle: titulo, sessionId: id }),
    ].join("\n") + "\n");
    utimesSync(ruta, hace(min), hace(min));
  };
  conversacion(ID.cerrada, "Ajustes a lo ancho", 120);
  conversacion(ID.retomada, "Retomada", 10);
  conversacion(ID.mia, "La mía", 30);

  const rastros = join(datos, "rastros");
  mkdirSync(rastros, { recursive: true });
  const rastro = (id, nombre, min) => {
    const ruta = join(rastros, `${nombre}.md`);
    writeFileSync(ruta, `# Rastro de «${nombre}»\n\n- Cerrada: x\n- Carpeta: \`${demo}\`\n- Conversación: \`${id}\` (se retoma con \`claude --resume ${id}\` en esa carpeta)\n\n## Qué hizo\n\nHecho y subido.\n`);
    utimesSync(ruta, hace(min), hace(min));
  };
  rastro(ID.cerrada, "ajustes-a-lo-ancho", 118);
  rastro(ID.retomada, "retomada", 180);
}

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const puerto = 9700 + (process.pid % 100);
const a = await abrirAislada({ nombre: "barra-solas", puertoMcp: 47_000 + (process.pid % 900), depurar: puerto, exe, sembrar });
try {
  // `abrirAislada` nace sin leer las conversaciones de la casa (`leerSesiones`,
  // y sin eso `scanSessions` devuelve una lista vacía): aquí son lo que se mira.
  await a.v.js(`(() => { const p = JSON.parse(localStorage.getItem("adeorq-perfil")); p.leerSesiones = true; localStorage.setItem("adeorq-perfil", JSON.stringify(p)); return "ok"; })()`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  // Nace en el Panel, que no lleva barra: a la Cabina.
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  await dormir(800);
  // El proyecto nace plegado: se despliega para ver sus filas.
  await hasta(() => a.v.js(`(() => { const b = [...document.querySelectorAll(".project-main")].find((x) => /demo/.test(x.textContent ?? "")); if (!b) return false; if (/▸/.test(b.textContent ?? "")) b.click(); return true; })()`), 15_000);
  await dormir(600);
  const cabecera = await a.v.js(`(() => { const b = [...document.querySelectorAll(".project-main")].find((x) => /demo/.test(x.textContent ?? "")); const g = b?.closest("[data-proyecto], .project, li, section") ?? b?.parentElement; return JSON.stringify({ flecha: b?.querySelector(".project-caret")?.textContent ?? null, tip: b?.getAttribute("data-tip") ?? null, texto: (g?.textContent ?? "").replace(/\\s+/g, " ").slice(0, 200) }); })()`);
  console.log(`      cabecera del proyecto: ${cabecera}`);
  const filas = () => a.v.js(`JSON.stringify([...document.querySelectorAll("[data-sesion]")].map((e) => e.getAttribute("data-sesion")))`).then((x) => JSON.parse(x ?? "[]"));
  const vistas = await hasta(async () => {
    const f = await filas();
    return f.includes(ID.mia) ? f : null;
  }, 30_000, 500);
  dice(!!vistas, "la barra lista las conversaciones sembradas", JSON.stringify(vistas));
  const f = vistas ?? [];
  dice(!f.includes(ID.cerrada), "la que cerró un agente y nadie tocó no está en la barra", JSON.stringify(f));
  dice(f.includes(ID.retomada), "la que se retomó después de su rastro sí está");
  dice(f.includes(ID.mia), "la tuya, sin rastro, sí está");

  const boton = await a.v.js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => /archivada/i.test(x.getAttribute("data-tip") ?? x.title ?? x.textContent ?? "")); return b ? (b.getAttribute("data-tip") || b.title || b.textContent) : null; })()`);
  dice(/1 /.test(boton ?? "") || /\b1\b/.test(boton ?? ""), "el botón de archivadas cuenta una", String(boton));
  await a.v.js(`[...document.querySelectorAll("button")].find((x) => /archivada/i.test(x.getAttribute("data-tip") ?? x.title ?? x.textContent ?? ""))?.click(); "ok"`);
  await dormir(600);
  const conArchivadas = await filas();
  dice(conArchivadas.includes(ID.cerrada), "con las archivadas a la vista, ahí está", JSON.stringify(conArchivadas));
  const foto = await a.foto(null, "barra-archiva-solas.png");
  console.log(`      foto: ${foto}`);

  // Restaurarla la devuelve a la lista y ahí se queda, con las archivadas ya escondidas.
  await a.v.js(`(() => { const b = document.querySelector('[data-sesion="${ID.cerrada}"] [data-tip^="Restaurar"]'); b?.click(); return !!b; })()`);
  await dormir(600);
  await a.v.js(`[...document.querySelectorAll("button")].find((x) => /archivada/i.test(x.getAttribute("data-tip") ?? x.title ?? x.textContent ?? ""))?.click(); "ok"`);
  await dormir(600);
  const restaurada = await filas();
  const quedan = await a.v.js(`[...document.querySelectorAll("button")].some((x) => /archivada/i.test(x.getAttribute("data-tip") ?? x.title ?? x.textContent ?? ""))`);
  dice(restaurada.includes(ID.cerrada), "al restaurarla vuelve a la lista normal", JSON.stringify(restaurada));
  dice(!quedan, "y ya no queda ninguna archivada");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
