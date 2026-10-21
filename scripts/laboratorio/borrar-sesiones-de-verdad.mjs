// La papelera de la cabecera de una terminal, de verdad, con Codex y con agy.
//
// Dos fallos que se ven igual («le doy a borrar y no se borra») y uno que ni
// se veía (agy no tenía papelera):
//   - Codex: la cabecera mandaba `delete_session` sin decir de qué CLI era, y
//     Rust buscaba el transcript en la carpeta de Claude, que para Codex llega
//     vacía. Ya había vuelto una vez (2026-08-08, la barra lateral).
//   - agy: su panel no sabía su conversación (agy no acepta un id al nacer),
//     así que no había nada que borrar y el botón no salía.
//
// Una Adeorq aislada (ver `aislada.mjs`) con una casa falsa, y dos CLI de
// mentira delante en el PATH que dejan en esa casa lo mismo que los de verdad:
// Codex un rollout con su `session_meta`, agy su base en `conversations/`, su
// carpeta en `brain/` y una línea en `history.jsonl`. Se abre una terminal de
// cada uno por el MCP, se espera a que la cabecera enseñe la papelera, se
// pulsa, se confirma, y se mira el DISCO: los ficheros tienen que haberse ido
// y la terminal cerrado. Lo que se borra va a la papelera de Windows, pero son
// ficheros de la casa falsa.
//
//   cargo build --manifest-path src-tauri/Cargo.toml
//   pnpm dev
//   node scripts/laboratorio/borrar-sesiones-de-verdad.mjs
//   node scripts/laboratorio/borrar-sesiones-de-verdad.mjs --antes
//
// `--antes` imita desde la página la cabecera de antes del arreglo (borra sin
// decir el CLI, y agy no aprende su conversación) y tiene que salir en ROJO:
// es lo que demuestra que el laboratorio caza los dos fallos.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const NOMBRE = "borrar";
// La misma carpeta que va a montar `abrirAislada`: el PATH se decide antes.
const BASE = join(tmpdir(), `adeorq-${NOMBRE}-${process.pid}`);
const CASA = join(BASE, "casa");
const BIN = join(BASE, "bin");
const AGY = "5f0c9a2e-1b7d-4c3a-9e8f-0123456789ab";
const CODEX = "01a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6a7b";

// Los CLI de mentira: escriben lo suyo en la casa falsa y se quedan vivos,
// que es como está una sesión cuando le das a la papelera.
mkdirSync(BIN, { recursive: true });
writeFileSync(
  join(BIN, "falso.mjs"),
  `import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
const [cli, id] = process.argv.slice(2);
const casa = process.env.USERPROFILE;
const ahora = new Date();
if (cli === "codex") {
  const dia = join(casa, ".codex", "sessions", String(ahora.getUTCFullYear()), String(ahora.getUTCMonth() + 1).padStart(2, "0"), String(ahora.getUTCDate()).padStart(2, "0"));
  mkdirSync(dia, { recursive: true });
  const meta = { timestamp: ahora.toISOString(), type: "session_meta", payload: { session_id: id, id, timestamp: ahora.toISOString(), cwd: process.cwd() } };
  writeFileSync(join(dia, "rollout-" + ahora.toISOString().slice(0, 19).replace(/:/g, "-") + "-" + id + ".jsonl"), JSON.stringify(meta) + "\\n");
} else {
  const raiz = join(casa, ".gemini", "antigravity-cli");
  mkdirSync(join(raiz, "conversations"), { recursive: true });
  mkdirSync(join(raiz, "brain", id), { recursive: true });
  writeFileSync(join(raiz, "conversations", id + ".db"), "SQLite format 3");
  writeFileSync(join(raiz, "brain", id, "nota.md"), "borrador");
  appendFileSync(join(raiz, "history.jsonl"), JSON.stringify({ display: "hola", timestamp: Date.now(), workspace: process.cwd(), conversationId: id }) + "\\n");
}
console.log(cli + " de mentira listo, sesión " + id);
setInterval(() => {}, 1 << 30);
`,
);
writeFileSync(join(BIN, "codex.cmd"), `@node "%~dp0falso.mjs" codex ${CODEX}\r\n`);
writeFileSync(join(BIN, "agy.cmd"), `@node "%~dp0falso.mjs" agy ${AGY}\r\n`);

// Sin el agy de verdad en el PATH: si `find_agy` lo encuentra, el panel lo
// llama por su ruta y arrancaría el de verdad en la casa falsa.
const path = [BIN, ...(process.env.Path ?? process.env.PATH ?? "").split(";").filter((d) => d && !/\\agy\\bin/i.test(d))].join(";");

const rollout = () => {
  const d = new Date();
  const dia = join(CASA, ".codex", "sessions", String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0"));
  return existsSync(dia) ? dia : null;
};
const agyDb = join(CASA, ".gemini", "antigravity-cli", "conversations", `${AGY}.db`);
const agyBrain = join(CASA, ".gemini", "antigravity-cli", "brain", AGY);

const ANTES = `(() => {
  const real = window.fetch;
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/ipc\\.localhost\\/agy_session_since$/.test(url)) return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    if (/ipc\\.localhost\\/delete_session$/.test(url) && b && typeof b.body === "string") {
      const args = JSON.parse(b.body);
      delete args.fuente;
      b = { ...b, body: JSON.stringify(args) };
    }
    return real(a, b);
  };
})()`;
const a = await abrirAislada({
  nombre: NOMBRE,
  puertoMcp: 39377,
  depurar: 9377,
  entorno: { Path: path, PATH: path },
  guarda: process.argv.includes("--antes") ? ANTES : "",
});
const { v } = a;
let fallos = 0;
const ok = (bien, que) => {
  if (!bien) fallos++;
  console.log(`  ${bien ? "OK  " : "FALLA"} ${que}`);
};

/** Pulsa la papelera de la terminal `nombre`, mira que el aviso diga `programa`
 *  (decía «Claude Code» con cualquier sesión), confirma, y espera a que cierre. */
async function borrarDesdeLaCabecera(nombre, programa) {
  const sel = `[...document.querySelectorAll("[data-pane-id]")].find((p) => p.querySelector(".pane-name")?.textContent.includes(${JSON.stringify(nombre)}))`;
  const papelera = await hasta(() => v.js(`!!(${sel})?.querySelector(".pane-bin")`), 40_000, 1000);
  ok(!!papelera, `${nombre}: la cabecera enseña la papelera`);
  if (!papelera) return;
  await v.js(`(${sel}).querySelector(".pane-bin").click(); "ok"`);
  const dialogo = await hasta(() => v.js(`!!document.querySelector(".modal .modal-danger")`), 5_000);
  ok(!!dialogo, `${nombre}: sale el diálogo de borrar`);
  const aviso = await v.js(`document.querySelector(".modal .modal-text")?.textContent ?? ""`);
  ok(aviso.includes(`también de ${programa}`) && !aviso.includes("Claude Code"), `${nombre}: el aviso dice «${programa}» — «${aviso}»`);
  await v.js(`document.querySelector(".modal .modal-danger").click(); "ok"`);
  const cerrada = await hasta(() => v.js(`!(${sel})`), 15_000, 500);
  const nota = await v.js(`document.querySelector(".pane-note, .note")?.textContent ?? ""`);
  ok(!!cerrada, `${nombre}: la terminal se cierra${cerrada ? "" : ` (nota: ${nota || "ninguna"})`}`);
}

try {
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  await hasta(async () => /Arranque de Adeorq/.test((await agente.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  await dormir(1500);

  console.log("Codex:");
  console.log("  ", (await agente.llamar("open_pane", { cli: "codex", cwd: a.demo, name: "Codex de prueba", brief: "" })).texto?.split("\n")[0]);
  const dia = await hasta(rollout, 20_000, 500);
  ok(!!dia, "el Codex de mentira dejó su rollout");
  await borrarDesdeLaCabecera("Codex de prueba", "Codex");
  ok(dia && !(await import("node:fs")).readdirSync(dia).some((f) => f.includes(CODEX)), "el rollout ya no está en el disco");

  console.log("agy:");
  console.log("  ", (await agente.llamar("open_pane", { cli: "agy", cwd: a.demo, name: "Agy de prueba", brief: "" })).texto?.split("\n")[0]);
  ok(!!(await hasta(() => existsSync(agyDb), 20_000, 500)), "el agy de mentira dejó su conversación");
  await borrarDesdeLaCabecera("Agy de prueba", "Antigravity");
  ok(!existsSync(agyDb), "la base de la conversación ya no está");
  ok(!existsSync(agyBrain), "su carpeta de brain tampoco");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
