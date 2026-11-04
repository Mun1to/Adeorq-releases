// Un plan del Capataz repartiendo terminales entre cuentas, en la pantalla de
// verdad. La lógica ya está probada (`src/lib/cuentasDelPlan.ts`,
// `scripts/capataz-cuentas-check.tsx`); esto mira lo que se VE.
//
// Una Adeorq aislada con tres cuentas de Claude de mentira y su gasto en caché
// (como `reparto-cuentas-de-verdad.mjs`), y el plan que el Capataz pediría al
// modelo contestado desde la página (`foreman_plan`): tres terminales nuevas
// con encargo en el proyecto demo. No gasta nada: no hay ninguna llamada al
// modelo. Todo lo demás es el código de verdad: `checkActions` reparte con
// `elegirCuenta` y cada terminal que abre pesa en su cuenta para la siguiente.
//
//   node scripts/laboratorio/capataz-cuentas-de-verdad.mjs [exe] [carpeta para la foto]
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

// Lanzado desde una terminal de Claude Code, el entorno trae SU cuenta.
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const nombre = "capataz-cuentas";
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
const cuentas = [
  { id: "c-pro", label: "2da MAIN", plan: "pro", semana: 17, renueva: enPunto(ahora + 2 * DIA) },
  // Cerca de la Pro a propósito, para que se vea repartir: la regla de
  // `elegirCuenta` da Pro (83/2 = 41,5) frente a 3ra (80/2 = 40); con una ya
  // abierta en la Pro (cada una pesa 10), 3ra; y con una en cada, otra vez la Pro.
  { id: "c-3ra", label: "3ra", plan: "max", semana: 20, renueva: enPunto(ahora + 2 * DIA) },
].map((c) => ({ ...c, dir: join(cuentasDir, c.id) }));
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
const PLAN = JSON.stringify({
  resumen: "Tres agentes en demo: uno arregla, otro escribe las pruebas y otro la documentación.",
  acciones: [
    { tipo: "claude_nuevo", proyecto: "demo", rol: "arreglar el fallo del login", prompt: "Arregla el fallo del login." },
    { tipo: "claude_nuevo", proyecto: "demo", rol: "escribir las pruebas", prompt: "Escribe las pruebas del login." },
    { tipo: "claude_nuevo", proyecto: "demo", rol: "documentar", prompt: "Documenta el login en el README." },
  ],
});
// Las cuentas y su gasto, y el plan que devolvería el modelo, desde la página.
const guarda = `(() => {
  localStorage.setItem("adeorq-accounts", ${JSON.stringify(JSON.stringify({ accounts: cuentas.map(({ id, label, dir }) => ({ id, label, dir, provider: "claude" })), defaultAccount: "main:claude" }))});
  const c = ${JSON.stringify(cuota)};
  for (const v of Object.values(c)) v.at = Date.now();
  localStorage.setItem("adeorq-cuota", JSON.stringify(c));
  window.__planes = 0;
  const antes = window.fetch;
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/^https?:\\/\\/ipc\\.localhost\\/foreman_plan$/.test(url)) {
      window.__planes++;
      return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(PLAN)}), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return antes(a, b);
  };
})()`;

const a = await abrirAislada({ nombre, puertoMcp: 47_000 + (process.pid % 900), depurar: 9650 + (process.pid % 100), exe, guarda, fotos: FOTOS });
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  // La guarda entra en la próxima carga: una más, para que las cuentas sembradas se lean al arrancar.
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await dormir(1500);
  const { v } = a;
  await hasta(() => v.js(`(() => { const b = document.querySelector(".foreman-call"); if (!b) return false; b.click(); return true; })()`), 10_000);
  dice(!!(await hasta(() => v.js(`!!document.querySelector(".foreman-overlay .foreman-box")`), 8000)), "el Capataz se abre");
  await v.js(`(() => {
    const t = document.querySelector(".foreman-input");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "arregla el login de demo con pruebas y documentación");
    t.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await dormir(300);
  await v.js(`document.querySelector(".foreman-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })), "ok"`);
  const filas = await hasta(async () => {
    const f = await v.js(`JSON.stringify([...document.querySelectorAll(".foreman-box .plan-item")].map((li) => li.innerText.replace(/\\s+/g, " ").trim()))`);
    const l = JSON.parse(f ?? "[]");
    return l.length >= 3 ? l : null;
  }, 20_000, 400);
  dice((await v.js(`window.__planes`)) === 1, "el plan salió de la página, sin llamar al modelo");
  dice(!!filas, `el plan enseña sus ${filas?.length ?? 0} acciones`);
  for (const f of filas ?? []) console.log(`      · ${f}`);
  const donde = (filas ?? []).map((f) => /en (2da MAIN|3ra)\b/.exec(f)?.[1] ?? "?");
  dice(donde.join(", ") === "2da MAIN, 3ra, 2da MAIN", `cada una dice en qué cuenta nace, repartidas como manda la regla (${donde.join(", ")})`);
  const r = await v.js(`JSON.stringify(document.querySelector(".foreman-box").getBoundingClientRect())`).then((x) => JSON.parse(x));
  const foto = await a.foto({ x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(1400, r.width), height: Math.min(900, r.height) }, "capataz-cuentas.png");
  console.log(`      foto: ${foto}`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
