// El relevo por cuota de punta a punta, en una Adeorq aislada y sin gastar.
//
// Munir, 2026-11-14: una terminal que abrió un agente y se queda sin cuota en su
// cuenta sigue sola en la cuenta que tenga, con la MISMA conversación. Aquí:
//   · una madre (un agente por el puerto) abre una delegada con `open_pane` sin
//     `account`: nace en la «2da MAIN», que es la que más cuota perdería;
//   · su Claude de mentira (`relevo-cuota-falso.mjs`) se queda sin cuota como la
//     2.1.323: el 429 de cuota en su transcript, y parado;
//   · Adeorq lo ve solo (`mcp/relevo_cuota.rs`, mirando cada 3 s aquí), cierra la
//     vieja, muda su conversación a la principal y abre la nueva con `--resume`,
//     su modelo, `auto` y el «sigue» como primer mensaje;
//   · a la madre le llega el aviso con el número nuevo en su siguiente llamada,
//     la nueva es suya («Abierta por: ti»), la vieja dice dónde sigue, hay rastro,
//     no se releva dos veces, y el siguiente `open_pane` ya no va a la agotada.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario carga de ahí)
//   node scripts/laboratorio/relevo-cuota-de-verdad.mjs [exe]
//
// Sale con 1 si algo falla.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `\n      ${String(detalle).slice(0, 900)}` : ""}`);
};

for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const nombre = "relevo-cuota";
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casa = join(base, "casa");
const doble = join(base, "doble");
const cuentasDir = join(base, "datos", "Adeorq", "accounts");
mkdirSync(doble, { recursive: true });
copyFileSync(join(import.meta.dirname, "relevo-cuota-falso.mjs"), join(doble, "relevo-cuota-falso.mjs"));
writeFileSync(join(doble, "claude.cmd"), ["@echo off", 'node "%~dp0relevo-cuota-falso.mjs" %*', ""].join("\r\n"));

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
// La 2da, como la terminal 19: su lectura dice 81 % del tope de 5 horas, no 100.
const segunda = { id: "c-pro", label: "2da MAIN", plan: "pro", semana: 17, renueva: enPunto(ahora + 2 * DIA), sesion: 81, dir: join(cuentasDir, "c-pro") };
const principal = { label: "Principal", plan: "max", semana: 60, renueva: enPunto(ahora + 5 * DIA), sesion: 20, dir: join(casa, ".claude") };
const credenciales = (plan) => JSON.stringify({ claudeAiOauth: { subscriptionType: plan, accessToken: "de-mentira" } });
for (const c of [segunda, principal]) {
  mkdirSync(c.dir, { recursive: true });
  writeFileSync(join(c.dir, ".credentials.json"), credenciales(c.plan));
}
writeFileSync(join(segunda.dir, ".claude.json"), JSON.stringify({ projects: {} }));
writeFileSync(join(casa, ".claude.json"), JSON.stringify({ projects: {} }));

const tarjeta = (c) => ({
  note: "",
  plan: "",
  lines: [
    { label: "Current session", percent: c.sesion, resets: comoClaude(enPunto(ahora + 3 * HORA)), resetsAt: 0 },
    { label: "Current week (all models)", percent: c.semana, resets: comoClaude(c.renueva), resetsAt: 0 },
  ],
});
const cuota = { "claude|": { at: ahora, limits: tarjeta(principal) }, [`claude|${segunda.dir}`]: { at: ahora, limits: tarjeta(segunda) } };
const guarda = `(() => {
  localStorage.setItem("adeorq-accounts", ${JSON.stringify(JSON.stringify({ accounts: [{ id: segunda.id, label: segunda.label, dir: segunda.dir, provider: "claude" }], defaultAccount: "main:claude" }))});
  const c = ${JSON.stringify(cuota)};
  for (const v of Object.values(c)) v.at = Date.now();
  localStorage.setItem("adeorq-cuota", JSON.stringify(c));
})()`;

const a = await abrirAislada({
  nombre,
  puertoMcp: 47_000 + (process.pid % 900),
  depurar: 9650 + (process.pid % 100),
  exe,
  guarda,
  entorno: { PATH: `${doble};${process.env.PATH}`, ADEORQ_RELEVO_CADA_S: "3" },
});
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  const madre = a.puente(null);
  await madre.pedir("initialize", { clientInfo: { name: "claude-code" } });
  // `llamar` se queda con la primera parte de la respuesta, y los avisos de
  // Adeorq van detrás, en otra: aquí se leen todas.
  const entera = async (name, args) => {
    const r = await madre.pedir("tools/call", { name, arguments: args });
    if (r.timeout) return { error: "sin respuesta en 15 s" };
    return r.error ? { error: r.error.message } : { texto: (r.result?.content ?? []).map((p) => p.text ?? "").join("\n") };
  };

  // 1. La delegada nace en la 2da y se queda sin cuota.
  const r = await madre.llamar("open_pane", { cli: "claude", cwd: a.demo, brief: "Tarea de laboratorio: relevo por cuota", name: "Delegada sin cuota" });
  const viejo = Number(/Terminal\s+(\d+)/.exec(r.texto || "")?.[1]);
  console.log(`\n--- open_pane ---\n${r.texto ?? r.error}\n`);
  dice(Number.isFinite(viejo) && /2da MAIN/.test(r.texto ?? ""), "la delegada nace en la «2da MAIN»", r.texto ?? r.error);
  const enc = a.demo.replace(/[^A-Za-z0-9]/g, "-");
  const enLa2da = join(segunda.dir, "projects", enc);
  const enLaPrincipal = join(principal.dir, "projects", enc);
  const sesion = await hasta(() => (existsSync(enLa2da) ? readdirSync(enLa2da).find((f) => f.endsWith(".jsonl"))?.replace(/\.jsonl$/, "") : null), 20_000, 300);
  dice(!!sesion, "su Claude escribe en la 2da el transcript con el 429 de cuota", enLa2da);

  // 2. Adeorq la releva sola; la madre se entera en su siguiente llamada.
  let aviso = "";
  const lista = await hasta(async () => {
    const t = (await entera("get_active_panes", {})).texto ?? "";
    const m = /Aviso de Adeorq: la terminal \d+ que abriste[^\n]*relevado sola[^\n]*/.exec(t);
    if (m) aviso = m[0];
    return m ? t : null;
  }, 60_000, 1500);
  console.log(`--- el aviso ---\n${aviso || "(no llegó)"}\n`);
  const nuevo = Number(/ahora es la terminal (\d+)/.exec(aviso)?.[1]);
  dice(!!aviso && Number.isFinite(nuevo) && nuevo !== viejo, "a la madre le llega el aviso con el número nuevo", lista);
  dice(aviso.includes(`la terminal ${viejo} que abriste`) && aviso.includes("«2da MAIN»") && aviso.includes("«Principal»") && aviso.includes("tope de 5 horas") && aviso.includes("MISMA conversación"), "el aviso dice la vieja, las dos cuentas, el tope y que es la misma conversación", aviso);
  const bloque = (lista ?? "").split(/\n(?=ID: )/).find((b) => b.startsWith(`ID: ${nuevo},`)) ?? "";
  dice(/Abierta por: ti/.test(bloque), "la nueva es de la madre («Abierta por: ti»)", bloque || lista);
  dice(!(lista ?? "").split(/\n(?=ID: )/).some((b) => b.startsWith(`ID: ${viejo},`)), "la vieja ya no está entre las abiertas", lista);

  // 3. La conversación se mudó a la principal y la nueva la retomó.
  const movida = join(enLaPrincipal, `${sesion}.jsonl`);
  dice(existsSync(movida) && !existsSync(join(enLa2da, `${sesion}.jsonl`)), "la conversación se mudó de la 2da a la principal (no se copió)", `${movida}`);
  const pantalla = await hasta(async () => {
    const t = ((await madre.llamar("read_pane_screen", { paneId: nuevo })).texto ?? "").replace(/\r?\n/g, "");
    return /FALSO (RETOMA|NO ENCUENTRA)/.test(t) ? t.replace(/FALSO/g, "\nFALSO").replace(/SIGUE=/g, "\nSIGUE=") : null;
  }, 20_000, 700);
  console.log(`--- la nueva ---\n${(pantalla ?? "").split("\n").filter((l) => /FALSO|SIGUE/.test(l)).join("\n")}\n`);
  dice(new RegExp(`FALSO RETOMA CONFIG=\\[\\] SESION=${sesion} HISTORIA=\\d+ VIEJA=SI`).test(pantalla ?? ""), "la nueva retoma ESA conversación en la principal, con la historia de la vieja", pantalla);
  dice(/SIGUE=.*Sigue la tarea/.test(pantalla ?? "") || readFileSync(movida, "utf8").includes("Sigue la tarea por donde la dejaste"), "y su primer mensaje es el «sigue»", pantalla);
  const diario = readFileSync(join(doble, "diario.txt"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const suya = diario.find((d) => d.args.includes("--resume"));
  dice(!!suya && suya.config === "" && suya.args.includes(sesion) && suya.args.join(" ").includes("--permission-mode auto") && suya.args.join(" ").includes("--model opus"), "nace sin CLAUDE_CONFIG_DIR (la principal), con --resume, auto y su modelo", JSON.stringify(suya));
  dice(suya?.resumeMin === "525600", "y sin el «Resume from summary» que la pararía", JSON.stringify(suya));
  const confianza = JSON.parse(readFileSync(join(casa, ".claude.json"), "utf8")).projects ?? {};
  dice(Object.entries(confianza).some(([k, v]) => k.toLowerCase() === a.demo.replace(/\\/g, "/").toLowerCase() && v.hasTrustDialogAccepted), "la carpeta queda de confianza en la principal", JSON.stringify(confianza));

  // 4. La vieja dice dónde sigue, y hay rastro.
  const deLaVieja = await madre.llamar("read_pane_screen", { paneId: viejo });
  dice(new RegExp(`sigue abierta en el panel ${nuevo}`).test(deLaVieja.error ?? deLaVieja.texto ?? ""), "preguntar por la vieja dice en qué panel sigue su conversación", JSON.stringify(deLaVieja));
  const rastros = join(base, "datos", "Adeorq", "rastros");
  const rastro = existsSync(rastros) ? readdirSync(rastros).map((f) => readFileSync(join(rastros, f), "utf8")).find((t) => t.includes("Relevada por cuota")) : undefined;
  dice(!!rastro && rastro.includes(`Siguió en la terminal ${nuevo}`) && rastro.includes(String(sesion)) && !rastro.includes("- La abrió el panel"), "deja su rastro de relevo (que la papelera no toma por una cerrada)", rastro);

  // 5. Una sola vez, y el siguiente open_pane ya no va a la agotada.
  await dormir(9000);
  const otra = (await entera("get_active_panes", {})).texto ?? "";
  dice(!/relevado sola/.test(otra) && otra.includes(`ID: ${nuevo},`), "no se releva otra vez, y la nueva sigue abierta", otra);
  const siguiente = await madre.llamar("open_pane", { cli: "claude", cwd: a.demo, brief: "", name: "Después del relevo" });
  console.log(`--- open_pane después ---\n${siguiente.texto ?? siguiente.error}\n`);
  dice(/Con «Principal»/.test(siguiente.texto ?? "") && /«2da MAIN» está parada por su tope de 5 horas/.test(siguiente.texto ?? ""), "el siguiente open_pane salta la 2da aunque su lectura dijera 81 %", siguiente.texto ?? siguiente.error);
  console.log(`      foto: ${await a.foto(null, "relevo-cuota-cabina.png")}`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} en rojo` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
