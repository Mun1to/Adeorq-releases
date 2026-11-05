// En pantalla todo es Adeo: la bola, la ventana del plan y el Chat son la misma
// pieza y no se llaman «Asistente», «Capataz» ni «conserje» (ni sus nombres en
// inglés). Lo mira en la app de verdad, aislada, en los dos idiomas.
//
//   node scripts/laboratorio/adeo-un-solo-nombre-de-verdad.mjs [exe] [carpeta para las fotos]
//
// Recorre todas las pestañas, cada apartado de Ajustes, el Chat con su hilo de
// Adeo, la ventana del plan y la paleta de comandos, y de cada pantalla recoge
// lo que se lee (el texto y los atributos que se leen: `data-tip`, `title`,
// `aria-label`, `placeholder`). Falla si en alguna sale uno de los tres nombres.
// Y mira lo que SÍ tiene que salir: «Adeo» en la primera pestaña del Chat, en el
// título de la ventana y en el globo de la bola.
//
// No gasta nada: no se escribe a ningún modelo. Necesita `cargo build` y
// `pnpm dev` (el binario de desarrollo carga de http://localhost:1420), como los
// demás laboratorios.
import { tmpdir } from "node:os";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] || EXE;
const FOTOS = process.argv[3] || tmpdir();
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

// Lanzado desde una terminal de Claude Code, el entorno trae SU cuenta.
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const VIEJOS = /capataz|asistente|conserje|foreman|concierge|\bassistant\b/i;
// Lo único que puede seguir diciéndolos, y por qué: el nombre de una carpeta de datos (`conserje`, que no se
// renombra) y la línea del glosario de la guía que cuenta que las notas de versiones antiguas usan los nombres de antes.
const JUSTIFICADO = /decisiones, conserje (y|and) chats|versiones antiguas|old release notes/;

// Todo lo que lee una persona en lo que está pintado ahora mismo.
const LEER = `(() => {
  const s = new Set();
  for (const l of document.body.innerText.split("\\n")) if (l.trim()) s.add(l.trim());
  for (const e of document.querySelectorAll("[data-tip],[title],[aria-label],[placeholder]"))
    for (const a of ["data-tip", "title", "aria-label", "placeholder"]) { const v = e.getAttribute(a); if (v && v.trim()) s.add(v.trim()); }
  return JSON.stringify([...s]);
})()`;

for (const idioma of ["es", "en"]) {
  console.log(`\n── ${idioma === "es" ? "Español" : "English"} ──`);
  const guarda = `(() => { localStorage.setItem("adeorq-lang", ${JSON.stringify(idioma)}); })()`;
  const a = await abrirAislada({
    nombre: `adeo-nombre-${idioma}`,
    puertoMcp: 47_000 + (process.pid % 900) + (idioma === "en" ? 1 : 0),
    depurar: 9650 + (process.pid % 100) + (idioma === "en" ? 1 : 0),
    exe,
    guarda,
    fotos: FOTOS,
  });
  try {
    // La guarda entra en la próxima carga: una más, para que el idioma se lea al arrancar.
    await a.v.enviar("Page.reload");
    await dormir(1500);
    await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
    await dormir(1500);
    const { v } = a;
    let movilVisto = false;
    const vistos = new Map(); // texto -> en qué pantalla
    const leer = async (donde) => {
      const l = JSON.parse((await v.js(LEER)) ?? "[]");
      for (const t of l) if (!vistos.has(t)) vistos.set(t, donde);
      return l;
    };
    const pulsar = (sel, i = 0) =>
      v.js(`(() => { const b = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!b) return false; b.click(); return true; })()`);

    dice((await v.js(`localStorage.getItem("adeorq-lang")`)) === idioma, `la app está en ${idioma === "es" ? "español" : "inglés"}`);

    // ── La bola ──────────────────────────────────────────────────────────
    const globo = await v.js(`document.querySelector(".foreman-call")?.getAttribute("data-tip") ?? ""`);
    dice(idioma === "es" ? /^Llamar a Adeo \(/.test(globo) : /^Call Adeo \(/.test(globo), "el globo de la bola dice Adeo", globo);

    // ── Todas las pestañas ───────────────────────────────────────────────
    const pestanas = JSON.parse((await v.js(`JSON.stringify([...new Set([...document.querySelectorAll("[data-tab]")].map((e) => e.getAttribute("data-tab")))])`)) ?? "[]");
    console.log(`      pestañas: ${pestanas.join(", ")}`);
    for (const p of pestanas) {
      if (!(await pulsar(`[data-tab="${p}"]`))) continue;
      await dormir(900);
      await leer(`pestaña ${p}`);
      if (p === "chat") {
        // El Chat: la primera pestaña y el hilo de Adeo.
        await hasta(async () => {
          await pulsar(".cj-nueva");
          await dormir(400);
          return v.js(`!!document.querySelector(".chat-caja.cj-caja")`);
        }, 8000);
        await dormir(500);
        const primera = await v.js(`document.querySelector(".cj-pestana")?.textContent.trim() ?? ""`);
        dice(primera === "Adeo", "la primera pestaña del Chat se llama Adeo", primera);
        const cab = await v.js(`document.querySelector(".chat-cab-id strong")?.textContent.trim() ?? ""`);
        dice(cab === "Adeo", "la cabecera de la conversación nueva dice Adeo", cab);
        const pastilla = await v.js(`[...document.querySelectorAll(".cj-pastilla")].map((b) => b.textContent.trim()).find((x) => /^Adeo: /.test(x)) ?? ""`);
        dice(/^Adeo: /.test(pastilla), "la pastilla del cerebro dice «Adeo: …»", pastilla);
        await leer("chat, el hilo de Adeo");
        await a.foto(null, `adeo-nombre-${idioma}-chat.png`);
      }
      if (p === "ajustes") {
        // Cada apartado de Ajustes, uno a uno y por su nombre (los grupos se abren al pulsarlos y
        // con ellos cambian los números de los botones). Se repite hasta que no salen botones nuevos.
        const pasados = new Set();
        for (let ronda = 0; ronda < 4; ronda++) {
          const nombres = JSON.parse((await v.js(`JSON.stringify([...document.querySelectorAll(".set-nav button")].map((b) => b.textContent.trim()))`)) ?? "[]");
          const nuevos = nombres.filter((n) => n && !pasados.has(n));
          if (!nuevos.length) break;
          for (const n of nuevos) {
            pasados.add(n);
            await v.js(`(() => { const b = [...document.querySelectorAll(".set-nav button")].find((x) => x.textContent.trim() === ${JSON.stringify(n)}); if (!b) return false; b.click(); return true; })()`);
            await dormir(500);
            await leer(`ajustes › ${n}`);
            const tarjetaMovil = await v.js(`!![...document.querySelectorAll(".movil-cab h2")].find((h) => /^(Adeo en el móvil|Adeo on your phone)$/.test(h.textContent.trim()))`);
            if (tarjetaMovil) {
              dice(true, "la tarjeta del móvil se llama Adeo");
              await a.foto(null, `adeo-nombre-${idioma}-ajustes-movil.png`);
              movilVisto = true;
            }
          }
        }
        console.log(`      apartados de Ajustes recorridos: ${[...pasados].join(", ")}`);
        dice(movilVisto, "se llegó a la tarjeta del móvil de Ajustes");
      }
    }

    // ── La ventana del plan ──────────────────────────────────────────────
    await pulsar(`[data-tab="${pestanas.includes("cabina") ? "cabina" : pestanas[0]}"]`);
    await dormir(600);
    await hasta(() => pulsar(".foreman-call"), 10_000);
    const abierta = await hasta(() => v.js(`!!document.querySelector(".foreman-overlay .foreman-box")`), 8000);
    dice(!!abierta, "la ventana del plan se abre");
    await dormir(500);
    const titulo = await v.js(`document.querySelector(".foreman-title")?.textContent.trim() ?? ""`);
    dice(titulo === "Adeo", "la ventana del plan se titula Adeo", titulo);
    await leer("la ventana del plan");
    await a.foto(null, `adeo-nombre-${idioma}-ventana.png`);
    await v.js(`document.querySelector(".foreman-overlay")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), "ok"`);
    await dormir(500);

    // ── La paleta de comandos (Ctrl+K de verdad, por el puerto de depuración) ──
    for (const tipo of ["rawKeyDown", "keyUp"]) {
      await v.enviar("Input.dispatchKeyEvent", { type: tipo, modifiers: 2, key: "k", code: "KeyK", windowsVirtualKeyCode: 75 });
    }
    await dormir(700);
    const paleta = await v.js(`!!document.querySelector(".paleta")`);
    if (paleta) {
      for (const q of ["Adeo", idioma === "es" ? "llamar" : "call"]) {
        await v.js(`(() => { const t = document.querySelector(".paleta-input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(t, ${JSON.stringify(q)}); t.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        await dormir(400);
        await leer(`la paleta, «${q}»`);
      }
      await a.foto(null, `adeo-nombre-${idioma}-paleta.png`);
    } else console.log("      (la paleta no se abrió con Ctrl+K: no se mira)");

    // ── El veredicto ─────────────────────────────────────────────────────
    const malos = [...vistos].filter(([t]) => VIEJOS.test(t) && !JUSTIFICADO.test(t));
    console.log(`      ${vistos.size} textos distintos leídos en pantalla`);
    dice(malos.length === 0, "ningún texto de la pantalla lleva Asistente, Capataz, conserje ni sus nombres en inglés");
    for (const [t, donde] of malos) console.log(`      · [${donde}] ${t.slice(0, 200)}`);
  } finally {
    await a.cerrar();
  }
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
