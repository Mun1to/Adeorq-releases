// Discord apagado de fábrica dentro del paquete de la Microsoft Store, en la app de
// verdad (la Adeorq de desarrollo aislada, con `ADEORQ_FINGIR_EMPAQUETADA=1`).
//
//   node scripts/laboratorio/discord-de-verdad.mjs [carpeta para las fotos] [exe]
//
//  · Con el paquete y nada guardado: Ajustes › Discord enseña el interruptor
//    APAGADO, y en esos segundos no ha salido ni una orden `discord_set`.
//  · Encenderlo a mano: sale `discord_set` y la elección queda guardada (`on: true`).
//  · Con el paquete y una elección ya guardada (encendido): arranca encendido y publica.
//
// SOLO la Tienda, y a propósito: sin el paquete Discord parte encendido y un
// arranque normal publica la línea «Programando con agentes» en el Discord REAL
// de la máquina que prueba. La instalación de siempre se mide en
// `scripts/discord-check.tsx` (`pnpm bancos discord`), con un Tauri de mentira.
// Aquí además `discord_set` y `discord_clear` NO llegan a Rust nunca: se recogen
// en la página y se contestan desde ella, así que tampoco se publica nada cuando
// se enciende a mano.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const exe = resolve(process.argv[3] || EXE);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

/** Recoge `discord_set` y `discord_clear` en `window.__discord` y no los deja pasar. */
const guardaDe = (guardado) => `(() => {
  const real = window.fetch.bind(window);
  window.__discord = [];
  window.fetch = (a, b) => {
    const url = decodeURIComponent(typeof a === "string" ? a : (a && a.url) || "");
    const m = /\\/(discord_set|discord_clear)$/.exec(url);
    if (m) {
      window.__discord.push(m[1]);
      return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return real(a, b);
  };
  localStorage.setItem("adeorq-ajustes-seccion", "discord");
  ${guardado ? `if (!localStorage.getItem("lab-discord-sembrado")) { localStorage.setItem("adeorq-discord", ${JSON.stringify(JSON.stringify(guardado))}); localStorage.setItem("lab-discord-sembrado", "1"); }` : ""}
})()`;

const ordenes = async (v) => JSON.parse(await v.js(`JSON.stringify(window.__discord)`));
const interruptor = (v) => v.js(`(() => { const i = document.querySelector(".setting-switch input[type=checkbox]"); return i ? i.checked : null; })()`);

async function pasada({ nombre, guardado, n }) {
  console.log(`\n── ${nombre} ──`);
  const a = await abrirAislada({
    nombre: `discord-${n}`,
    puertoMcp: 47_900 + (process.pid % 90) + n,
    depurar: 9900 + (process.pid % 60) + n,
    exe,
    fotos: FOTOS,
    guarda: guardaDe(guardado),
    entorno: { ADEORQ_FINGIR_EMPAQUETADA: "1" },
  });
  try {
    const { v } = a;
    await v.enviar("Page.reload");
    await dormir(1500);
    await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
    await dormir(4000);
    dice((await v.js(`window.__TAURI_INTERNALS__.invoke("esta_empaquetada")`)) === true, "esta_empaquetada dice que sí (la Tienda fingida)");
    const alArrancar = await ordenes(v);
    await v.js(`(document.querySelector('[data-tab="ajustes"]')?.click(), "ok")`);
    await hasta(() => v.js(`!!document.querySelector(".setting-switch input[type=checkbox]")`), 10_000);
    await dormir(500);
    const marcado = await interruptor(v);
    return { a, v, alArrancar, marcado };
  } catch (e) {
    await a.cerrar();
    throw e;
  }
}

// ── Con el paquete y sin nada guardado ───────────────────────────────────────
{
  const { a, v, alArrancar, marcado } = await pasada({ nombre: "La Tienda, sin nada guardado", guardado: null, n: 0 });
  try {
    dice(marcado === false, "Ajustes › Discord: «Mostrar Adeorq en mi Discord» sale APAGADO", String(marcado));
    dice(!alArrancar.includes("discord_set"), "y al arrancar no ha salido NI UNA orden `discord_set`", JSON.stringify(alArrancar));
    const guardadoAntes = await v.js(`localStorage.getItem("adeorq-discord")`);
    dice(guardadoAntes === null, "y no ha guardado nada: no se ha decidido por la persona", String(guardadoAntes));
    await a.foto(null, "discord-tienda-apagado.png");
    // Encenderlo a mano: el consentimiento.
    await v.js(`(document.querySelector(".setting-switch input[type=checkbox]").click(), "ok")`);
    await hasta(async () => (await ordenes(v)).includes("discord_set"), 8000);
    dice((await ordenes(v)).includes("discord_set"), "al encenderlo a mano sale `discord_set` (el consentimiento funciona)", JSON.stringify(await ordenes(v)));
    dice((await interruptor(v)) === true, "y el interruptor queda encendido");
    const g = JSON.parse((await v.js(`localStorage.getItem("adeorq-discord")`)) ?? "{}");
    dice(g.on === true, "y la elección queda guardada (`on: true`)", JSON.stringify(g));
    await a.foto(null, "discord-tienda-encendido-a-mano.png");
    // Y apagarlo otra vez se queda apagado.
    await v.js(`(document.querySelector(".setting-switch input[type=checkbox]").click(), "ok")`);
    await dormir(600);
    const h = JSON.parse((await v.js(`localStorage.getItem("adeorq-discord")`)) ?? "{}");
    dice(h.on === false && (await interruptor(v)) === false, "apagarlo otra vez lo deja apagado y guardado", JSON.stringify(h));
  } finally {
    await a.cerrar();
  }
}

// ── Con el paquete y una elección ya guardada (encendido) ────────────────────
{
  const { a, v, alArrancar, marcado } = await pasada({ nombre: "La Tienda, ya lo había encendido", guardado: { on: true, clientId: "", showProject: false }, n: 1 });
  try {
    dice(marcado === true, "arranca con el interruptor ENCENDIDO (lo que la persona eligió se conserva)", String(marcado));
    dice(alArrancar.includes("discord_set"), "y publica (`discord_set`)", JSON.stringify(alArrancar));
    await a.foto(null, "discord-tienda-ya-encendido.png");
  } finally {
    await a.cerrar();
  }
}

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
