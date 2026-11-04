// La app en inglés, de verdad: lo que el conserje y el router escriben en español
// por dentro, mirado en la pantalla de una Adeorq aislada con el idioma en inglés.
//
//   node scripts/laboratorio/ingles-de-verdad.mjs [exe] [carpeta para las fotos]
//
// Lo que mira, cada cosa con su cara:
//  1. El Chat del conserje, con un fallo REAL de Rust: la casa de pruebas no tiene
//     ninguna sesión de Claude, así que `conserje_enviar` vuelve con
//     «claude devolvió error: …» (o «no devolvió nada»). Con la app en inglés tiene
//     que salir en inglés, no en español en medio de un chat en inglés.
//  2. La ficha del Asistente (Capataz) con el porqué del router: tres cuentas de
//     Claude de mentira con su gasto en caché, y el encargo que devolvería el
//     modelo contestado desde la página (`foreman_prompt`). Cada línea del porqué,
//     en inglés y con los datos dentro.
//
// No gasta nada: ninguna llamada llega a un modelo con sesión. Necesita
// `cargo build --manifest-path src-tauri/Cargo.toml` y `pnpm dev` (el binario de
// desarrollo carga de http://localhost:1420), como los demás laboratorios.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] || EXE;
const FOTOS = process.argv[3] || tmpdir();
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
const ESPANOL = /[áéíóúüñ¿¡«»]/i;

// Lanzado desde una terminal de Claude Code, el entorno trae SU cuenta.
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const nombre = "ingles";
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casa = join(base, "casa");
const cuentasDir = join(base, "datos", "Adeorq", "accounts");
const HORA = 3_600_000;
const DIA = 24 * HORA;
const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const comoClaude = (ms) => {
  const f = new Date(ms);
  const h = f.getHours();
  return `${MESES[f.getMonth()]} ${f.getDate()}, ${h % 12 || 12}${h < 12 ? "am" : "pm"} (Europe/Madrid)`;
};
const enPunto = (ms) => Math.floor(ms / HORA) * HORA;
const ahora = Date.now();
const cuentas = [{ id: "c-pro", label: "2da MAIN", plan: "pro", semana: 17, renueva: enPunto(ahora + 2 * DIA) }].map((c) => ({ ...c, dir: join(cuentasDir, c.id) }));
const principal = { label: "Principal", plan: "max", semana: 60, renueva: enPunto(ahora + 5 * DIA), dir: join(casa, ".claude") };
for (const c of [...cuentas, principal]) {
  mkdirSync(c.dir, { recursive: true });
  writeFileSync(join(c.dir, ".credentials.json"), JSON.stringify({ claudeAiOauth: { subscriptionType: c.plan, accessToken: "de-mentira" } }));
}
const tarjeta = (c) => ({
  note: "",
  plan: "",
  lines: [
    { label: "Current session", percent: 5, resets: comoClaude(enPunto(ahora + 3 * HORA)), resetsAt: 0 },
    { label: "Current week (all models)", percent: c.semana, resets: comoClaude(c.renueva), resetsAt: 0 },
  ],
});
const cuota = Object.fromEntries([[`claude|`, { at: ahora, limits: tarjeta(principal) }], ...cuentas.map((c) => [`claude|${c.dir}`, { at: ahora, limits: tarjeta(c) }])]);
// Lo que el modelo devolvería al «Escribir el encargo»: oficio, con consecuencia alta y largo.
const ENCARGO = JSON.stringify({
  encargo: "Fix the login bug and leave the tests written.",
  clase: "oficio",
  consecuencia: "alta",
  largo: true,
  trabajo: "codigo",
});
const guarda = `(() => {
  localStorage.setItem("adeorq-lang", "en");
  localStorage.setItem("adeorq-accounts", ${JSON.stringify(JSON.stringify({ accounts: cuentas.map(({ id, label, dir }) => ({ id, label, dir, provider: "claude" })), defaultAccount: "main:claude" }))});
  const c = ${JSON.stringify(cuota)};
  for (const v of Object.values(c)) v.at = Date.now();
  localStorage.setItem("adeorq-cuota", JSON.stringify(c));
  const antes = window.fetch;
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/^https?:\\/\\/ipc\\.localhost\\/foreman_prompt$/.test(url)) {
      return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(ENCARGO)}), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return antes(a, b);
  };
})()`;

const a = await abrirAislada({ nombre, puertoMcp: 47_000 + (process.pid % 900), depurar: 9650 + (process.pid % 100), exe, guarda, fotos: FOTOS });
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  // La guarda entra en la próxima carga: una más, para que el idioma y las cuentas se lean al arrancar.
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await dormir(1500);
  const { v } = a;
  const pulsar = (sel, texto) =>
    v.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => ${texto ? `e.textContent.trim().startsWith(${JSON.stringify(texto)})` : "true"}); if (!b) return false; b.click(); return true; })()`);
  const escribir = (sel, texto) =>
    v.js(`(() => {
      const t = document.querySelector(${JSON.stringify(sel)});
      if (!t) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, ${JSON.stringify(texto)});
      t.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);

  dice((await v.js(`localStorage.getItem("adeorq-lang")`)) === "en", "la app está en inglés");

  // ── 1. El Chat, con un fallo real ─────────────────────────────────────────
  dice(!!(await hasta(() => pulsar("button", "Chat"), 8000)), "se abre el Chat");
  await dormir(800);
  const caja = await hasta(async () => {
    await pulsar(".cj-nueva");
    await dormir(400);
    return v.js(`!!document.querySelector(".chat-caja.cj-caja")`);
  }, 8000);
  dice(!!caja, "el hilo del conserje tiene su caja");
  await escribir(".cj-caja .chat-input", "which projects do I have?");
  await dormir(300);
  await v.js(`document.querySelector(".cj-caja .chat-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })), "ok"`);
  const fallo = await hasta(() => v.js(`(() => { const n = document.querySelector(".cj-nota[data-grave]"); return n ? n.innerText.replace(/\\s+/g, " ").trim() : null; })()`), 90_000, 500);
  dice(!!fallo, "el conserje no pudo contestar y lo dice en el chat", String(fallo));
  if (fallo) {
    dice(/^I could not answer\./i.test(fallo), "el aviso empieza en inglés", fallo);
    // Lo que va detrás del «I could not answer.» es el fallo de Rust: en inglés.
    const fallaRust = fallo.replace(/^I could not answer\.\s*/i, "").replace(/\s*Retry$/i, "");
    dice(!ESPANOL.test(fallaRust), "y el fallo de Rust sale en inglés, sin una letra española", fallaRust);
    dice(/returned|launch|installed|did not|no output/i.test(fallaRust), "es la frase traducida (no un texto cualquiera)", fallaRust);
  }
  await a.foto(null, "ingles-chat-fallo.png");
  // El control: lo que Rust devuelve sin que nadie lo toque, que es lo que la
  // ventana enseñaba antes de traducirlo. Si esto ya saliera en inglés, la prueba
  // de arriba no demostraría nada.
  const crudo = await v.js(`window.__TAURI_INTERNALS__.invoke("conserje_enviar", { id: "ctl${Date.now().toString(36)}", texto: "hello", estados: {}, quien: null }).then(() => "", (x) => String(x))`);
  dice(!!crudo && ESPANOL.test(crudo), "CONTROL: lo que devuelve Rust, sin traducir, está en español (y eso se veía antes)", String(crudo));

  // ── 2. La ficha del Asistente: el porqué del router ───────────────────────
  await hasta(() => v.js(`(() => { const b = document.querySelector(".foreman-call"); if (!b) return false; b.click(); return true; })()`), 10_000);
  dice(!!(await hasta(() => v.js(`!!document.querySelector(".foreman-overlay .foreman-box")`), 8000)), "el Asistente se abre");
  await escribir(".foreman-input", "fix the login bug and leave the tests written");
  await dormir(300);
  dice(!!(await hasta(() => pulsar(".foreman-box .np-btn.ghost", "Write the brief"), 8000)), "pulsa «Write the brief»");
  const lineas = await hasta(async () => {
    const f = await v.js(`JSON.stringify([...document.querySelectorAll(".foreman-box .fm-porque li")].map((li) => li.innerText.replace(/\\s+/g, " ").trim()))`);
    const l = JSON.parse(f ?? "[]");
    return l.length >= 2 ? l : null;
  }, 30_000, 400);
  dice(!!lineas, `la ficha enseña el porqué (${lineas?.length ?? 0} líneas)`);
  for (const l of lineas ?? []) console.log(`      · ${l}`);
  dice((lineas ?? []).every((l) => !ESPANOL.test(l) && !/\{\w+\}/.test(l)), "ninguna línea del porqué lleva una letra española ni un hueco sin rellenar");
  dice((lineas ?? []).some((l) => /2da MAIN/.test(l) && /17 %/.test(l) && /in 2 days/.test(l)), "la que elige cuenta dice cuál, cuánto lleva y cuándo se renueva, en inglés");
  const aviso = await v.js(`document.querySelector(".foreman-box .fm-aviso")?.innerText ?? ""`);
  console.log(`      aviso: ${aviso || "(ninguno)"}`);
  const r = await v.js(`JSON.stringify(document.querySelector(".foreman-box").getBoundingClientRect())`).then((x) => JSON.parse(x));
  const foto = await a.foto({ x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(1400, r.width), height: Math.min(900, r.height) }, "ingles-ficha.png");
  console.log(`      foto: ${foto}`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
