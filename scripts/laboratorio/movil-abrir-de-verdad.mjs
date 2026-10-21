// Abrir y seguir sesiones del PC desde el móvil, en la ventana de verdad
// (Munir, 2026-10-21). El doble del móvil contesta como la ventana, pero no
// ES la ventana: esto le manda a una Adeorq aislada (ver `aislada.mjs`) los
// mismos pedidos que le manda `movil.rs` (`movil:pedido`) y lee lo que contesta
// (`movil_reply`), con su lista de proyectos, su lectura de sesiones y sus
// terminales de verdad.
//
// Delante en el PATH van un `claude` y un `codex` de mentira que apuntan en la
// casa falsa con qué se les llamó y desde dónde, y se quedan vivos: así se ve
// que el PC recibió el proyecto, el primer mensaje y el `resume <id>`, no solo
// que dijo «abierta». La casa trae un rollout de Codex en «demo» para seguirlo.
//
//   cargo build --manifest-path src-tauri/Cargo.toml
//   pnpm dev
//   node scripts/laboratorio/movil-abrir-de-verdad.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const NOMBRE = "movil-abrir";
// La misma carpeta que va a montar `abrirAislada`: el PATH y la casa se deciden antes.
const BASE = join(tmpdir(), `adeorq-${NOMBRE}-${process.pid}`);
const CASA = join(BASE, "casa");
const BIN = join(BASE, "bin");
const PROYECTOS = join(BASE, "proyectos");
const DEMO = join(PROYECTOS, "demo");
const OTRO = join(PROYECTOS, "otro");
const LLAMADAS = join(CASA, "llamadas.jsonl");
const CODEX = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";

mkdirSync(BIN, { recursive: true });
mkdirSync(OTRO, { recursive: true });
writeFileSync(
  join(BIN, "falso.mjs"),
  `import { appendFileSync } from "node:fs";
import { join } from "node:path";
const [cli, ...args] = process.argv.slice(2);
appendFileSync(join(process.env.USERPROFILE, "llamadas.jsonl"), JSON.stringify({ cli, args, cwd: process.cwd(), encargo: process.env.ADEORQ_ENCARGO ?? null }) + "\\n");
console.log(cli + " de mentira, con " + JSON.stringify(args));
setInterval(() => {}, 1 << 30);
`,
);
writeFileSync(join(BIN, "claude.cmd"), `@node "%~dp0falso.mjs" claude %*\r\n`);
writeFileSync(join(BIN, "codex.cmd"), `@node "%~dp0falso.mjs" codex %*\r\n`);
const path = [BIN, ...(process.env.Path ?? process.env.PATH ?? "").split(";").filter(Boolean)].join(";");

// Una sesión de Codex de antes, en «demo», como la deja el de verdad.
const ayer = new Date(Date.now() - 86_400_000);
const dia = join(CASA, ".codex", "sessions", String(ayer.getUTCFullYear()), String(ayer.getUTCMonth() + 1).padStart(2, "0"), String(ayer.getUTCDate()).padStart(2, "0"));
mkdirSync(dia, { recursive: true });
writeFileSync(
  join(dia, `rollout-${ayer.toISOString().slice(0, 19).replace(/:/g, "-")}-${CODEX}.jsonl`),
  [
    { timestamp: ayer.toISOString(), type: "session_meta", payload: { session_id: CODEX, id: CODEX, timestamp: ayer.toISOString(), cwd: DEMO, originator: "codex_cli_rs" } },
    { timestamp: ayer.toISOString(), type: "event_msg", payload: { type: "user_message", message: "mira por qué se cae el radar" } },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n",
);

const a = await abrirAislada({ nombre: NOMBRE, puertoMcp: 39378, depurar: 9378, raiz: PROYECTOS, entorno: { Path: path, PATH: path } });
const { v } = a;
let fallos = 0;
const ok = (bien, que) => {
  if (!bien) fallos++;
  console.log(`  ${bien ? "OK  " : "FALLA"} ${que}`);
};
const llamadas = () => (existsSync(LLAMADAS) ? readFileSync(LLAMADAS, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const paneles = () => v.js(`[...document.querySelectorAll("[data-pane-id]")].map((p) => Number(p.dataset.paneId))`);

try {
  // Con permiso para leer sesiones, que la casa aislada nace sin él.
  await v.js(`(() => { const p = JSON.parse(localStorage.getItem("adeorq-perfil")); p.leerSesiones = true; localStorage.setItem("adeorq-perfil", JSON.stringify(p)); return "ok"; })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app")`), 20_000);
  await dormir(2500);

  // Lo que contesta la ventana a `movil_reply` se queda en la página, y los
  // pedidos llegan por el mismo evento que les pone `movil.rs`.
  // Por `fetch`, que es por donde la ventana le habla a Rust (lo mismo que
  // `GUARDA` en aislada.mjs); envolver `invoke` no lo ve.
  await v.js(`(() => {
    const real = window.fetch;
    window.__respuestas = {};
    window.fetch = (a, b) => {
      const url = typeof a === "string" ? a : (a && a.url) || "";
      if (/ipc\\.localhost\\/movil_reply$/.test(url) && b && typeof b.body === "string") {
        const args = JSON.parse(b.body);
        window.__respuestas[args.peticion] = args.datos;
        return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
      }
      return real(a, b);
    };
    return "ok";
  })()`);
  let n = 1000;
  const pedir = async (clase, datos = {}) => {
    const peticion = ++n;
    await v.js(`window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "movil:pedido", payload: ${JSON.stringify({ peticion, clase, ...datos })} }).then(() => "ok")`);
    return hasta(() => v.js(`window.__respuestas[${peticion}] ?? null`), 20_000, 200);
  };

  console.log("Proyectos:");
  const vp = await pedir("proyectos");
  const nombres = (vp?.proyectos || []).map((p) => `${p.nombre}${p.cuando ? "·con sesión" : ""}`);
  ok(nombres[0] === "demo·con sesión" && nombres.includes("otro"), `los de la carpeta madre, el de la sesión de ayer primero: ${nombres.join(" | ")}`);

  console.log("Abrir:");
  const antes = await paneles();
  const r1 = await pedir("abrir", { carpeta: OTRO, cli: "claude", texto: "hola desde el móvil" });
  ok(typeof r1?.panel === "number", `abre y dice en qué terminal: ${JSON.stringify(r1)}`);
  const nace = await hasta(async () => (await paneles()).includes(r1?.panel), 15_000, 500);
  ok(!!nace, `la terminal ${r1?.panel} está en la ventana`);
  const llamada = await hasta(() => llamadas().find((x) => x.cli === "claude"), 20_000, 500);
  ok(llamada && llamada.cwd.toLowerCase() === OTRO.toLowerCase(), `el claude de mentira arrancó en «otro» (${llamada?.cwd})`);
  ok(llamada && (llamada.args.join(" ").includes("hola desde el móvil") || llamada.encargo === "hola desde el móvil"), `y le llegó el primer mensaje (${JSON.stringify(llamada?.args)} / ${llamada?.encargo})`);

  const fuera = await pedir("abrir", { carpeta: "C:\\Windows", cli: "claude" });
  ok(/no es uno de tus proyectos/.test(fuera?.error || ""), `una carpeta que no es un proyecto, no: ${JSON.stringify(fuera)}`);
  const inventado = await pedir("abrir", { carpeta: DEMO, cli: "inventado" });
  ok(/no está instalado/.test(inventado?.error || ""), `un programa que no hay, no: ${JSON.stringify(inventado)}`);
  await dormir(1500);
  ok((await paneles()).length === antes.length + 1, "y esas dos no abrieron nada");

  console.log("Seguir:");
  const vs = await pedir("sesiones");
  const suya = (vs?.sesiones || []).find((s) => s.id === CODEX);
  ok(suya && suya.carpeta.toLowerCase() === DEMO.toLowerCase() && suya.programa === "Codex", `la sesión de Codex de ayer está en la lista: ${JSON.stringify(suya)}`);
  const r2 = await pedir("seguir", { id: CODEX });
  ok(typeof r2?.panel === "number", `seguirla abre una terminal: ${JSON.stringify(r2)}`);
  const resume = await hasta(() => llamadas().find((x) => x.cli === "codex"), 20_000, 500);
  ok(resume && resume.args.join(" ") === `resume ${CODEX}` && resume.cwd.toLowerCase() === DEMO.toLowerCase(), `el codex de mentira recibió «resume ${CODEX}» en «demo» (${JSON.stringify(resume)})`);
  await hasta(async () => (await paneles()).includes(r2?.panel), 10_000, 500);
  // La ventana sabe su sesión cuando el panel la aprende; hasta entonces, por el comando.
  const otra = await hasta(async () => {
    const r = await pedir("seguir", { id: CODEX });
    return r?.panel === r2?.panel ? r : null;
  }, 20_000, 2000);
  ok(!!otra, `seguirla otra vez entra en la misma, no abre otra (${JSON.stringify(otra)})`);
  ok(llamadas().filter((x) => x.cli === "codex").length === 1, "y el codex no se lanzó dos veces");
  const nada = await pedir("seguir", { id: "no-existe" });
  ok(/ya no está/.test(nada?.error || ""), `una que no está, lo dice: ${JSON.stringify(nada)}`);
  await a.foto(null, "movil-abrir-de-verdad.png");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
