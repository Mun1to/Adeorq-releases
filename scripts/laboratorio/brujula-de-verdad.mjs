// La brújula de la Agenda (el panel personal de su dueño, en munito.dev) escondida
// dentro del paquete de la Microsoft Store, y la de siempre intacta, en la app de
// verdad (la Adeorq de desarrollo aislada; el paquete, con `ADEORQ_FINGIR_EMPAQUETADA=1`).
//
//   node scripts/laboratorio/brujula-de-verdad.mjs [carpeta para las fotos] [exe]
//
//  · Instalación de siempre: la Agenda tiene la cifra «ideas vivas», y al pulsarla
//    sale «Conecta tu brújula» con su correo y su contraseña; una idea de un agente
//    se puede aceptar.
//  · La Tienda: sin esa cifra, sin ninguna palabra «brújula» ni `munito.dev` en la
//    pantalla, sin cajas de correo ni de contraseña, y una idea de un agente solo se
//    puede descartar o dejar para luego (un paso sí se acepta); y no se ha leído ni
//    una vez el almacén de claves.
//
// El almacén de claves de Windows NO está aislado por las variables de la casa de
// pruebas: abrir la Agenda con el token de la brújula de VERDAD en él lo cambiaría
// (Supabase rota el token en cada uso). Por eso `secret_get`, `secret_put` y
// `secret_forget` se recogen en la página y se contestan desde ella: ninguno llega a
// Rust, y cualquier `fetch` a supabase.co se corta aquí.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const exe = resolve(process.argv[3] || EXE);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

/** Las dos notas que dejaría un agente en la bandeja: una idea y un paso. */
function sembrar(datos) {
  const notas = "- idea | demo | Probar una idea de prueba\n- paso | demo | Un paso de prueba\n";
  // La de siempre guarda sus datos en `%LOCALAPPDATA%\Adeorq`; dentro del paquete,
  // en `.adeorq` de la casa (`packaged.rs`): la bandeja se siembra en las dos.
  const casa = join(datos, "..", "..", "casa", ".adeorq");
  for (const dir of [datos, casa]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bandeja.md"), notas, "utf8");
  }
}

/** Lo del almacén de claves se recoge y se contesta desde la página; lo de Supabase se corta. */
const guarda = `(() => {
  const real = window.fetch.bind(window);
  window.__secretos = [];
  window.__red = [];
  window.fetch = (a, b) => {
    const url = decodeURIComponent(typeof a === "string" ? a : (a && a.url) || "");
    const m = /\\/(secret_get|secret_put|secret_forget)$/.exec(url);
    if (m) {
      window.__secretos.push(m[1]);
      return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    if (/supabase\\.co/.test(url)) {
      window.__red.push(url);
      return Promise.resolve(new Response("{}", { status: 503 }));
    }
    return real(a, b);
  };
  localStorage.setItem("adeorq-lang", "es");
})()`;

const leer = (v, js) => v.js(js);
const pulsar = (v, js) => v.js(`(() => { ${js} })()`);

async function pasada({ tienda, n }) {
  console.log(`\n── ${tienda ? "La Tienda" : "La instalación de siempre"} ──`);
  const a = await abrirAislada({
    nombre: `brujula-${tienda ? "tienda" : "normal"}`,
    puertoMcp: 47_800 + (process.pid % 90) + n,
    depurar: 9700 + (process.pid % 60) + n,
    exe,
    fotos: FOTOS,
    sembrar,
    guarda,
    entorno: tienda ? { ADEORQ_FINGIR_EMPAQUETADA: "1" } : {},
  });
  try {
    const { v } = a;
    await v.enviar("Page.reload");
    await dormir(1500);
    await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
    await dormir(1500);
    dice((await v.js(`window.__TAURI_INTERNALS__.invoke("esta_empaquetada")`)) === tienda, tienda ? "esta_empaquetada dice que sí (la Tienda fingida)" : "esta_empaquetada dice que no");

    await pulsar(v, `document.querySelector('[data-tab="perfil"]')?.click()`);
    await hasta(() => v.js(`!!document.querySelector('[data-seccion="agenda"]')`), 8000);
    await pulsar(v, `document.querySelector('[data-seccion="agenda"]')?.click()`);
    await hasta(() => v.js(`!!document.querySelector(".agenda .ag-cifras")`), 10_000);
    await dormir(1500);

    const cifras = JSON.parse(await leer(v, `JSON.stringify([...document.querySelectorAll(".ag-cifra .ag-q")].map((q) => q.firstChild?.textContent.trim()))`));
    const hayIdeas = cifras.includes("ideas vivas");
    dice(tienda ? !hayIdeas : hayIdeas, tienda ? "la Agenda NO tiene la cifra «ideas vivas»" : "la Agenda tiene la cifra «ideas vivas»", JSON.stringify(cifras));
    const pantalla = await leer(v, `document.querySelector(".agenda")?.textContent ?? ""`);
    if (tienda) {
      dice(!/brújula|brujula|munito\.dev/i.test(pantalla), "y en la pantalla no sale ni «brújula» ni `munito.dev`", pantalla.match(/.{0,30}(brújula|munito)/i)?.[0] ?? "");
      dice((await leer(v, `document.querySelectorAll('.agenda input[type=email], .agenda input[type=password]').length`)) === 0, "ni una caja de correo ni de contraseña");
    }
    await a.foto(null, `brujula-${tienda ? "tienda" : "normal"}-portada.png`);

    if (!tienda) {
      // La de siempre: «ideas vivas» lleva a conectar la brújula.
      await pulsar(v, `[...document.querySelectorAll(".ag-cifra")].find((c) => /ideas vivas/.test(c.textContent))?.click()`);
      await dormir(1200);
      const login = JSON.parse(await leer(v, `JSON.stringify({ titulo: document.querySelector(".agenda-login h2")?.textContent ?? "", correo: !!document.querySelector('.agenda-login input[type=email]'), clave: !!document.querySelector('.agenda-login input[type=password]') })`));
      dice(login.titulo === "Conecta tu brújula" && login.correo && login.clave, "la de siempre pide conectar la brújula (correo y contraseña), como antes", JSON.stringify(login));
      await a.foto(null, "brujula-normal-conectar.png");
      await pulsar(v, `document.querySelector(".ag-volver")?.click()`);
      await dormir(600);
    }

    // Las propuestas de los agentes: una idea (va a la brújula) y un paso (va al METAS.md).
    await pulsar(v, `[...document.querySelectorAll(".ag-cifra")].find((c) => /propuestas de tus agentes/.test(c.textContent))?.click()`);
    await hasta(() => v.js(`!!document.querySelector(".ag-caja")`), 8000);
    const vistas = [];
    for (let i = 0; i < 2; i++) {
      await dormir(400);
      vistas.push(JSON.parse(await leer(v, `JSON.stringify({ kind: document.querySelector(".ag-caja")?.getAttribute("data-kind"), aceptar: !!document.querySelector(".ag-botones .ag-si"), botones: [...document.querySelectorAll(".ag-botones button")].map((b) => b.textContent.trim()) })`)));
      if (i === 0) await a.foto(null, `brujula-${tienda ? "tienda" : "normal"}-idea-de-un-agente.png`);
      await pulsar(v, `[...document.querySelectorAll(".ag-botones button")].at(-1)?.click()`);
    }
    const idea = vistas.find((x) => x.kind === "idea");
    const paso = vistas.find((x) => x.kind === "paso");
    dice(!!idea && !!paso, "salen las dos notas sembradas (una idea y un paso)", JSON.stringify(vistas));
    dice(!!idea && idea.aceptar === !tienda, tienda ? "en la Tienda una idea NO se puede aceptar (solo descartar o dejar para luego)" : "una idea se puede aceptar, como siempre", JSON.stringify(idea));
    dice(!!paso && paso.aceptar === true, "y un paso se puede aceptar siempre (va a su METAS.md)", JSON.stringify(paso));

    const secretos = JSON.parse(await leer(v, `JSON.stringify(window.__secretos)`));
    const red = JSON.parse(await leer(v, `JSON.stringify(window.__red)`));
    if (tienda) {
      dice(secretos.length === 0, "en la Tienda no se leyó NI UNA vez el almacén de claves", JSON.stringify(secretos));
    } else {
      dice(secretos.includes("secret_get"), "la de siempre sí mira el almacén (la orden se recogió aquí, no llegó a Rust)", JSON.stringify(secretos));
    }
    dice(red.length === 0, "y no hubo ni una llamada a supabase.co", JSON.stringify(red));
  } finally {
    await a.cerrar();
  }
}

let n = 0;
for (const tienda of [false, true]) await pasada({ tienda, n: n++ });

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
