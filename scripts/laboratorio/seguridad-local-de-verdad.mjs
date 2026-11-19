// Los dos agujeros locales del puerto del MCP en una Adeorq aislada: vistos
// pasar en el S1 (2026-11-03) y cerrados en el S2 y el S3 con lo que eligió
// Munir (`docs/contexto/propuesta-seguridad-local.md`, caminos 1 y 4). Queda
// UNA línea AGUJERO a propósito, la del Gestor de Credenciales: es lo que no
// para ningún arreglo del puerto.
//
// Quien ataca aquí es «un programa cualquiera» que ya corre en el ordenador:
// un socket de Node, no el puente de Adeorq. Se mira:
//
//   Agujero 1 · coger una clave guardada sin preguntar
//     · Munir guarda una clave de mentira con el `adeorq secreto` de verdad
//       (sale la ventana, se «pega», queda en el Gestor de Credenciales);
//     · desde el S3, un programa de fuera de Adeorq que la pide saca la ventana
//       «Un programa de fuera de Adeorq pide una clave»: con «No» se queda sin
//       ella, con «Dársela esta vez» se la lleva y queda en el rastro, sin el valor;
//     · `adeorq secreto … -- comando` desde una terminal de Adeorq (la de un
//       `claude` de mentira, más abajo) va sin ventana, y Ajustes dice cuál la usó;
//     · con `LAB_CLIENTE_VIEJO=<copia de un adeorq.exe anterior a la 0.9.239>`, ese
//       cliente, que no presenta su panel: desde dentro de una terminal llega sin
//       ventana, y desde fuera de cualquiera, con ventana. Se usa una COPIA: el del
//       motor de una Adeorq instalada no se ejecuta ni se toca;
//     · y hasta dónde llega: la misma clave se lee del Gestor de Credenciales
//       sin hablar con Adeorq (CredReadW desde PowerShell). Sigue siendo AGUJERO.
//
//   Agujero 2 · hacerse pasar por otro para tener más permisos
//     · hasta el S3, el escalón salía del nombre del cliente: diciendo
//       «claude-code» (o «claude-code-2») cualquiera tenía «auto». Ahora lo de
//       fuera de una terminal de Adeorq va en «Fuera de Adeorq», se llame como
//       se llame, y abre y mira;
//     · un `claude` y un `codex` de mentira en el PATH de la app abren dos
//       terminales y apuntan su contraseña: el agente de dentro de la de Claude
//       escribe en otra, el de la de Codex no aunque diga «claude-code», y la
//       línea `panel` sin contraseña o con la de otra terminal no se cree;
//     · bajar Claude Code en Ajustes vale para sus terminales, y subir «Fuera
//       de Adeorq», para lo de fuera;
//     · la línea `{"adeorq":"de-casa"}` y `adeorq.exe --mcp --de-casa` sin la
//       contraseña de casa (S2) se niegan;
//     · con `LAB_TERMINALES_APARTE=1`, la trampa de actualizar: la terminal con
//       Claude sobrevive, su puente se reengancha con la misma contraseña y
//       sigue escribiendo.
//
//   C1 · abrir una terminal desde fuera de Adeorq
//     · sin encargo, en el modo de Ajustes, sin ventana y sin marcar la carpeta;
//     · con encargo, la ventana de verdad: con «No» un error y nada nace, con
//       «Abrir» nace en el modo de Ajustes y con su encargo, y si nadie contesta
//       se rinde a los dos minutos. La carpeta no queda de confianza;
//     · con «Fuera de Adeorq» subido a «auto», no pregunta. `LAB_SOLO_C1=1` para
//       aquí, y `LAB_FOTOS=<carpeta>` deja las fotos de la ventana.
//
//   A1 · lo de fuera solo ve la lista y el uso, hasta que se suba en Ajustes
//     · de fábrica ve justo la lista sin comandos, el uso y los proyectos, abre, y lee
//       y cierra lo que abrió. Terminal ajena, memoria, agenda, decisiones, mods y
//       flechas se le niegan, y el mensaje dice dónde se sube;
//     · «Leer y abrir» (`plan`) y «Todo» (`auto`) le devuelven lo de siempre, «Solo
//       mirar» guardado sigue siendo lo que era, y «Como de fábrica» lo baja;
//     · lo que no puede cambiar: una terminal con su contraseña, y un cliente sin
//       contraseña que cuelga de una terminal (socket, puente con el entorno limpio
//       como Codex y, con `LAB_CLIENTE_VIEJO`, el puente de otra versión). Una
//       contraseña mala no se arregla por colgar de una terminal;
//     · con `LAB_MOTOR_VIEJO=<copia de un adeorq.exe>` (y `LAB_TERMINALES_APARTE=1`),
//       una terminal de antes de actualizar, recogida de ese motor sin contraseña.
//     · `LAB_SOLO_A1=1` para aquí, y `LAB_FOTOS=<carpeta>` deja la foto de la tarjeta.
//
//   S2 · los de casa siguen en casa, y la contraseña no se escapa
//     · una terminal de Adeorq no la hereda (su entorno, leído desde dentro);
//     · Codex y Gemini del conserje, SIN sesión iniciada (no gastan cuota: su
//       servidor MCP arranca igual y falla después, al pedir al modelo): su
//       puente de casa se ve correr y NO queda apuntado como cliente;
//     · con `LAB_CLAUDE_CUENTA=<carpeta de una cuenta de Claude>`, un Capataz y
//       un conserje de Claude de verdad (haiku, unos céntimos de esa cuenta):
//       con Claude Code y lo de fuera en «solo mirar», el Capataz escribe en una terminal
//       y ninguno de los dos queda apuntado como cliente. Sin la variable se
//       dice SALTADO;
//     · ninguna línea de órdenes de esos procesos lleva 64 cifras hex.
//
// «OK» quiere decir «lo que se quería medir se ha medido»: cada línea AGUJERO
// es un agujero que SIGUE ABIERTO, visto pasar. El día que se arregle, esa
// línea tiene que dar la vuelta (y el laboratorio se actualiza con el arreglo).
//
// La clave de mentira va al Gestor de Credenciales de Windows de verdad (es
// del usuario, no de la carpeta de datos), con un nombre de esta pasada
// (`lab-s1-<pid>`), y se borra al acabar pase lo que pase.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   node scripts/laboratorio/seguridad-local-de-verdad.mjs [exe]
//   LAB_TERMINALES_APARTE=1 node scripts/laboratorio/seguridad-local-de-verdad.mjs
//   LAB_CLAUDE_CUENTA=C:\...\accounts\<cuenta> node scripts/laboratorio/seguridad-local-de-verdad.mjs
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";

const nombre = "seguridad-local";
// Por pasada: con un número fijo, dos sesiones que lo corren a la vez se hablan a la
// app de la otra, y cada una ve terminales y topes que no son suyos (2026-11-04).
const PUERTO = 39_000 + (process.pid % 900);
const DEPURAR = 9_100 + (process.pid % 400);
const CLAVE = `lab-s1-${process.pid}`;
const VALOR = `clave-de-mentira-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

let fallos = 0;
const ok = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK      " : "FALLO   "} ${texto}${!bien && detalle ? `\n         ${detalle}` : ""}`);
};
/** Un agujero visto pasar: es lo que se quería medir, así que no es un fallo del laboratorio. */
const agujero = (visto, texto, detalle = "") => {
  if (!visto) fallos++;
  console.log(`${visto ? "AGUJERO " : "FALLO   "} ${texto}${detalle ? `\n         ${detalle}` : ""}`);
};

// Ningún CLI de la app aislada gasta cuota sin querer: fuera las claves de API
// del entorno (con `GEMINI_API_KEY` puesta, Gemini sin sesión piensa con ella)
// y la cuenta de Claude de quien lanza esto, salvo la que se pida a propósito.
const CUENTA_CLAUDE = process.env.LAB_CLAUDE_CUENTA ?? "";
for (const k of Object.keys(process.env)) {
  if (/^CLAUDE/i.test(k) || /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_USE_VERTEXAI|OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY)$/i.test(k)) delete process.env[k];
}

// Una copia del binario fuera de C:\ct, para que otra sesión pueda recompilar
// mientras corre esto. Va dentro de la carpeta de la aislada, que se borra al cerrar.
const origen = process.argv[2] ?? EXE;
const binDir = join(tmpdir(), `adeorq-${nombre}-${process.pid}`, "lab-bin");
mkdirSync(binDir, { recursive: true });
const exe = join(binDir, "adeorq.exe");
copyFileSync(origen, exe);

// Un `claude` y un `codex` de mentira delante en el PATH de la app: no gastan
// nada, solo apuntan en qué terminal nacieron y con qué contraseña (de esta app
// aislada), para que el laboratorio pueda hablar «desde dentro» de ellas.
const doble = join(tmpdir(), `adeorq-${nombre}-${process.pid}`, "doble");
mkdirSync(doble, { recursive: true });
for (const prog of ["claude", "codex"]) {
  writeFileSync(join(doble, `${prog}.cmd`), ["@echo off", `>>"%~dp0paneles.txt" echo ${prog} %ADEORQ_PANE_ID% %ADEORQ_PANE_CLAVE%`, ""].join("\r\n"));
}

// ── El Gestor de Credenciales, sin Adeorq ──────────────────────────────────
const CRED = `
Add-Type -Namespace S1 -Name Cred -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
  public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
  public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
[DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool CredReadW(string target, int type, int flags, out IntPtr cred);
[DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool CredDeleteW(string target, int type, int flags);
[DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
'@`;
/** Lo que guarda Adeorq con ese nombre, leído directamente, como lo leería cualquier programa tuyo. */
/** La fila de `get_active_panes` de la terminal cuyo comando lleva esa marca: la lista ya no
    repite el encargo, así que se pregunta a la ventana por el comando entero. */
async function filaConEncargo(v, vigia, marca) {
  for (const fila of ((await vigia.llamar("get_active_panes", {})).texto ?? "").split("\n")) {
    const id = fila.match(/^ID: (\d+),/)?.[1];
    if (!id) continue;
    const comando = await v.js(`window.__TAURI_INTERNALS__.invoke("datos_panel", { id: ${id} }).then((d) => (d.command ?? []).join(" "))`);
    if (String(comando).includes(marca)) return fila;
  }
  return null;
}

function leerSinAdeorq(nombreClave) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${CRED}
$p = [IntPtr]::Zero
if (-not [S1.Cred]::CredReadW('Adeorq/agente:${nombreClave}', 1, 0, [ref]$p)) { 'NO-ESTA'; exit 0 }
$c = [Runtime.InteropServices.Marshal]::PtrToStructure($p, [type][S1.Cred+CREDENTIAL])
$b = New-Object byte[] $c.CredentialBlobSize
[Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $b, 0, $c.CredentialBlobSize)
[S1.Cred]::CredFree($p)
[Text.Encoding]::UTF8.GetString($b)`], { encoding: "utf8" });
  return (r.stdout ?? "").trim();
}
function borrarSinAdeorq(nombreClave) {
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${CRED}
[void][S1.Cred]::CredDeleteW('Adeorq/agente:${nombreClave}', 1, 0)`], { stdio: "ignore" });
}

// ── Un programa cualquiera que habla con el puerto ──────────────────────────
/** Una conexión cruda al puerto: manda líneas y devuelve las que llegan. */
function socket() {
  const s = connect(PUERTO, "127.0.0.1");
  let buf = "";
  const lineas = [];
  const esperan = [];
  s.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!l) continue;
      lineas.push(l);
      for (const e of esperan.splice(0)) e();
    }
  });
  const listo = new Promise((ok, mal) => {
    s.once("connect", ok);
    s.once("error", mal);
  });
  const linea = async (ms = 15_000) => {
    const fin = Date.now() + ms;
    while (!lineas.length) {
      if (Date.now() > fin) return null;
      await new Promise((r) => {
        esperan.push(r);
        setTimeout(r, 200);
      });
    }
    return lineas.shift();
  };
  return { listo, escribir: (o) => s.write(JSON.stringify(o) + "\n"), linea, cerrar: () => s.destroy() };
}

/** Un cliente MCP crudo que se presenta como `quien` (y, si `casa`, con la línea de casa delante). */
async function cliente(quien, { casa = null } = {}) {
  const s = socket();
  await s.listo;
  if (casa) s.escribir(casa);
  let n = 0;
  const pedir = async (method, params, ms = 15_000) => {
    const id = ++n;
    s.escribir({ jsonrpc: "2.0", id, method, params });
    for (;;) {
      const l = await s.linea(ms);
      if (l == null) return { error: { message: `sin respuesta en ${ms / 1000} s` } };
      const m = JSON.parse(l);
      if (m.id === id) return m;
    }
  };
  await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: quien, version: "9.9.9" } });
  s.escribir({ jsonrpc: "2.0", method: "notifications/initialized" });
  const llamar = async (name, args, ms) => {
    const r = await pedir("tools/call", { name, arguments: args }, ms);
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.map((c) => c.text).join("\n") ?? "" };
  };
  const herramientas = async () => ((await pedir("tools/list", {})).result?.tools ?? []).map((t) => t.name);
  return { pedir, llamar, herramientas, cerrar: s.cerrar };
}

/** El puente de verdad con `--mcp --de-casa`, como lo lanzaría un agente desde su terminal. */
function puenteDeCasa(env) {
  return puenteReal(env, ["--mcp", "--de-casa"]);
}

/** El puente de Adeorq de verdad (`adeorq.exe --mcp`), con el entorno que se le dé. */
function puenteReal(env, args = ["--mcp"]) {
  const p = spawn(exe, args, { env });
  let buf = "";
  const pend = new Map();
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(l);
        pend.get(m.id)?.(m);
      } catch {}
    }
  });
  let n = 0;
  const pedir = (method, params) =>
    new Promise((ok) => {
      const id = ++n;
      pend.set(id, ok);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => ok({ error: { message: "sin respuesta en 15 s" } }), 15_000);
    });
  const llamar = async (name, args) => {
    const r = await pedir("tools/call", { name, arguments: args });
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.map((c) => c.text).join("\n") ?? "" };
  };
  return { pedir, llamar, cerrar: () => p.kill() };
}

const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
const corto = (r) => (r.error ?? r.texto ?? "").replace(/\s+/g, " ").slice(0, 160);

// Las marcas de lo que A1 no deja leer desde fuera: si salen en una respuesta, se ha leído.
const MARCA_MEMORIA = `A1NOTAMEMORIA${process.pid}`;
const MARCA_AGENDA = `A1METAAGENDA${process.pid}`;
const MARCA_PANTALLA = `A1PANTALLAAJENA${process.pid}`;
const MARCA_ENCARGO = `A1ENCARGOSECRETO${process.pid}`;
const sembrarMarcas = (datos) => {
  const base = join(datos, "..", "..");
  const memoria = join(base, "casa", ".claude", "projects", "C--demo", "memory");
  mkdirSync(memoria, { recursive: true });
  writeFileSync(join(memoria, "nota-a1.md"), `---\nname: nota-a1\ndescription: una nota del laboratorio\nmetadata:\n  type: project\n---\n\nEsta nota dice ${MARCA_MEMORIA} para ver quién la lee.\n`);
  const metas = join(base, "proyectos", "demo", "docs");
  mkdirSync(metas, { recursive: true });
  writeFileSync(join(metas, "METAS.md"), `# METAS de demo\n\n> Metas, no fechas.\n\n## META 1 — ${MARCA_AGENDA}\n\n**Hecho cuando:** se lea.\n`);
};

// Un cliente DESDE DENTRO de una terminal, que es lo que mira `quien_conecta`: lo que
// importa es de quién cuelga el proceso, y un socket del laboratorio no cuelga de ninguna.
const clienteDentro = join(doble, "cliente-dentro.cjs");
writeFileSync(clienteDentro, `
const net = require("net");
const fs = require("fs");
const { spawn } = require("child_process");
const [modo, puerto, salida, leer, exe] = process.argv.slice(2);
const id = process.env.ADEORQ_PANE_ID;
const acabar = (o) => { fs.writeFileSync(salida + ".tmp", JSON.stringify(o)); fs.renameSync(salida + ".tmp", salida); process.exit(0); };
setTimeout(() => acabar({ error: "sin respuesta en 20 s" }), 20000);
let escribir;
const esperan = new Map();
let n = 0;
const alLeer = (l) => { try { const m = JSON.parse(l); esperan.get(m.id)?.(m); } catch {} };
let buf = "";
const trocear = (d) => { buf += d; let i; while ((i = buf.indexOf("\\n")) >= 0) { alLeer(buf.slice(0, i)); buf = buf.slice(i + 1); } };
const pedir = (method, params) => new Promise((ok) => { const k = ++n; esperan.set(k, ok); escribir(JSON.stringify({ jsonrpc: "2.0", id: k, method, params }) + "\\n"); });
const hablar = async () => {
  await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cliente-dentro", version: "1" } });
  const tools = ((await pedir("tools/list", {})).result?.tools ?? []).map((t) => t.name).sort();
  await pedir("tools/call", { name: "get_active_panes", arguments: {} });
  const l = await pedir("tools/call", { name: "read_pane_transcript", arguments: { paneId: Number(leer) } });
  const lista = await pedir("tools/call", { name: "get_active_panes", arguments: {} });
  acabar({ tools, lee: !l.error, porque: l.error?.message ?? "", comandos: /Command:/.test(lista.result?.content?.[0]?.text ?? "") });
};
if (modo === "puente-limpio" || modo === "puente-tal-cual") {
  const env = { ...process.env, ADEORQ_MCP_PUERTO: puerto };
  if (modo === "puente-limpio") { delete env.ADEORQ_PANE_ID; delete env.ADEORQ_PANE_CLAVE; }
  const p = spawn(exe, ["--mcp"], { env });
  p.stdout.on("data", trocear);
  escribir = (s) => p.stdin.write(s);
  hablar();
} else {
  const s = net.connect(Number(puerto), "127.0.0.1", () => {
    escribir = (t) => s.write(t);
    if (modo === "panel-sin") escribir(JSON.stringify({ adeorq: "panel", id: Number(id) }) + "\\n");
    if (modo === "panel-mala") escribir(JSON.stringify({ adeorq: "panel", id: Number(id), clave: "0".repeat(64) }) + "\\n");
    hablar();
  });
  s.on("data", trocear);
}
`);

let aislada;
const sueltos = [];
try {
  const MOTOR_VIEJO = process.env.LAB_MOTOR_VIEJO;
  aislada = await abrirAislada({ nombre, fueraConTodo: false, puertoMcp: PUERTO, depurar: DEPURAR, exe, fotos: process.env.LAB_FOTOS ?? tmpdir(), sembrar: sembrarMarcas, motorDeAntes: MOTOR_VIEJO ?? null, entorno: { PATH: `${doble};${process.env.PATH}`, ...(CUENTA_CLAUDE ? { CLAUDE_CONFIG_DIR: CUENTA_CLAUDE } : {}) } });
  const { env, demo } = aislada;
  let { v } = aislada;
  const puenteDentro = (extra) => puenteReal({ ...env, ...extra });
  const rastro = join(aislada.base, "datos", "Adeorq", "rastro.log");
  const lineasRastro = () => (existsSync(rastro) ? readFileSync(rastro, "utf8").split(/\r?\n/).filter(Boolean).length : 0);

  // Cada `secreto-pedido` que emita Rust (el que abre la ventana para pegar) se apunta en la página.
  await v.js(`(async () => {
    window.__s1 = [];
    const I = window.__TAURI_INTERNALS__;
    const h = I.transformCallback((e) => window.__s1.push(e.payload));
    await I.invoke("plugin:event|listen", { event: "secreto-pedido", target: { kind: "Any" }, handler: h });
    return "ok";
  })()`);

  // ════ Agujero 1 · la clave ════════════════════════════════════════════════
  console.log("\n── Agujero 1 · coger una clave guardada sin preguntar");
  ok(leerSinAdeorq(CLAVE) === "NO-ESTA", `la clave «${CLAVE}» no existe antes de empezar`);

  // Munir la guarda: el `adeorq secreto` de verdad, la ventana sale y él la pega.
  const guardar = spawn(exe, ["secreto", CLAVE, "para el laboratorio S1"], { env });
  let salidaGuardar = "";
  guardar.stderr.on("data", (d) => (salidaGuardar += d));
  const termino = new Promise((r) => guardar.on("exit", r));
  const ventana = await hasta(() => v.js(`!!document.querySelector(".secreto-modal")`), 15_000);
  ok(!!ventana, "con la clave sin guardar, `adeorq secreto` abre la ventana para pegarla");
  // Se pega por la ventana misma (con «Guardarla para la próxima vez», que viene marcada) y se pulsa «Dársela».
  await v.js(`(() => {
    const caja = document.querySelector(".secreto-modal .secreto-caja");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(caja, ${JSON.stringify(VALOR)});
    caja.dispatchEvent(new Event("input", { bubbles: true }));
    return "ok";
  })()`);
  await dormir(300);
  ok(await v.js(`document.querySelector(".secreto-modal .secreto-guardar input").checked`), "«Guardarla para la próxima vez» viene marcada");
  await v.js(`document.querySelector(".secreto-modal .np-btn").click(), "ok"`);
  const codigo = await Promise.race([termino, dormir(15_000).then(() => "colgado")]);
  ok(codigo === 0 && /está guardada/.test(salidaGuardar), `Munir la pega y queda guardada (salida ${codigo})`, salidaGuardar.trim());
  const pedidosAntes = await v.js(`window.__s1.length`);
  ok(pedidosAntes === 1, `la ventana se pidió una vez (${pedidosAntes} eventos «secreto-pedido»)`);

  // Un programa de fuera de Adeorq la pide (S3, decisión A1): ya no se la lleva
  // sin más, la ventana pregunta antes, y cada entrega queda apuntada.
  ok(!!(await hasta(() => v.js(`!document.querySelector(".secreto-modal")`), 5_000)), "la ventana se cierra al dársela");
  const rastroAntes = lineasRastro();
  const pideDeFuera = async (contestar) => {
    const s = socket();
    await s.listo;
    s.escribir({ adeorq: "secreto", nombre: CLAVE, motivo: "" });
    await s.linea();
    // La pregunta es la ventana sin caja para pegar: solo «Dársela esta vez» o «No».
    const pregunta = await hasta(
      () => v.js(`(() => { const m = document.querySelector(".secreto-modal"); return m && !m.querySelector(".secreto-caja") ? m.querySelector(".modal-title").textContent : null; })()`),
      10_000,
    );
    if (pregunta) await v.js(`document.querySelector(".secreto-modal ${contestar === "dar" ? ".np-btn" : ".modal-cancel"}").click(), "ok"`);
    const respuesta = await s.linea();
    s.cerrar();
    let r = {};
    try {
      r = JSON.parse(respuesta ?? "{}");
    } catch {}
    return { pregunta, r };
  };
  const conNo = await pideDeFuera("no");
  ok(!!conNo.pregunta && !conNo.r.valor && /no se la has dado/.test(conNo.r.error ?? ""), `un programa de fuera que pide una clave guardada saca la ventana «${conNo.pregunta}», y con «No» se queda sin ella`, JSON.stringify(conNo.r).replace(VALOR, "<la clave>"));
  ok(lineasRastro() === rastroAntes, "con «No» no se apunta ninguna entrega");
  const conSi = await pideDeFuera("dar");
  ok(conSi.r.valor === VALOR, "con «Dársela esta vez» se la lleva");
  const elRastro = existsSync(rastro) ? readFileSync(rastro, "utf8") : "";
  ok(lineasRastro() > rastroAntes && /entregada a un programa de fuera de Adeorq/.test(elRastro) && !elRastro.includes(VALOR), "la entrega queda en el rastro, con quién y sin el valor");

  // Hasta dónde llega: la misma clave, sin pasar por Adeorq. Esto no lo para ningún arreglo del puerto.
  const directa = leerSinAdeorq(CLAVE);
  agujero(directa === VALOR, "y sin hablar con Adeorq: CredReadW de «Adeorq/agente:…» la da igual (Gestor de Credenciales)", "lo que no se para: un programa que corre como Munir lee el almacén directamente");

  // ════ Agujero 2 · hacerse pasar por otro ══════════════════════════════════
  console.log("\n── Agujero 2 · hacerse pasar por otro para tener más permisos");
  // La terminal de otro: la abre un agente cualquiera, como abriría Munir una suya.
  let duenio = await cliente("dueño-de-la-terminal");
  sueltos.push(duenio);
  await hasta(async () => /Arranque de Adeorq/.test((await duenio.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  await dormir(1000);
  const P = numero(await duenio.llamar("open_pane", { cli: "shell", cwd: demo, name: "La de Munir", brief: "" }));
  ok(P > 0, `hay una terminal de otro, la ${P}`);
  await dormir(2500);

  // La vigía: una terminal con Claude y su contraseña. Lee lo que desde fuera ya no se
  // lee (los comandos, las terminales ajenas), y de paso prueba que eso no ha cambiado.
  const apuntados = () =>
    existsSync(join(doble, "paneles.txt"))
      ? Object.fromEntries(readFileSync(join(doble, "paneles.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 3).map(([prog, id, clave]) => [Number(id), { prog, clave }]))
      : {};
  const abreClaude = await duenio.llamar("open_pane", { cli: "claude", cwd: demo, name: "Un Claude", brief: "" });
  const C = numero(abreClaude);
  ok(C > 0 && !!(await hasta(() => apuntados()[C] ?? null, 20_000, 300)), `hay una terminal con Claude y su contraseña (${C})`, corto(abreClaude));
  const vigia = await cliente("claude-code", { casa: { adeorq: "panel", id: C, clave: apuntados()[C]?.clave } });
  sueltos.push(vigia);

  // ════ A1 · lo de fuera solo ve la lista y el uso ═════════════════════════
  console.log("\n── A1 · lo de fuera solo ve la lista y el uso, hasta que se suba en Ajustes");
  {
    const ponerFuera = (nivel) => v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: ${JSON.stringify(nivel)} }).then(() => "ok", (e) => "error: " + e)`);
    const filaFuera = async () => (await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_leer")`)).find((c) => c.nombre === "fuera");
    const texto = (r) => JSON.stringify(r);
    const marcas = [MARCA_MEMORIA, MARCA_AGENDA, MARCA_PANTALLA, MARCA_ENCARGO];
    const sinMarcas = (r) => !marcas.some((m) => texto(r).includes(m));
    const leeMemoria = (c) => c.llamar("buscar_memoria", { pregunta: MARCA_MEMORIA });
    const leeAgenda = (c) => c.llamar("get_agenda", { project: "demo" });
    const leePantalla = (c) => c.llamar("read_pane_screen", { paneId: P });

    // Lo que se va a intentar leer desde fuera, puesto por quien sí puede.
    await vigia.llamar("get_active_panes", {});
    await vigia.llamar("send_command", { paneId: P, command: `echo ${MARCA_PANTALLA}` });
    ok(!!(await hasta(async () => ((await leePantalla(vigia)).texto ?? "").includes(MARCA_PANTALLA), 20_000, 500)), "la terminal de otro tiene algo en pantalla");
    const conEncargo = numero(await vigia.llamar("open_pane", { cli: "claude", cwd: demo, name: "Con encargo", brief: MARCA_ENCARGO }));
    const verLista = (c) => c.llamar("get_active_panes", {});
    ok(conEncargo > 0 && !!(await hasta(async () => /Command:/.test((await filaConEncargo(v, vigia, MARCA_ENCARGO)) ?? ""), 15_000, 300)) && !((await verLista(vigia)).texto ?? "").includes(MARCA_ENCARGO), "una terminal de Adeorq con su contraseña ve los comandos, sin repetir el encargo");
    ok((await vigia.herramientas()).length >= 17, "y sigue viendo todas las herramientas", (await vigia.herramientas()).join());
    ok((await leeMemoria(vigia)).texto?.includes(MARCA_MEMORIA) ?? false, "y la memoria", corto(await leeMemoria(vigia)));
    ok((await leeAgenda(vigia)).texto?.includes(MARCA_AGENDA) ?? false, "y la agenda", corto(await leeAgenda(vigia)));

    // ── De fábrica ───────────────────────────────────────────────────────
    const fila = await filaFuera();
    ok(fila?.nivel === "lista" && fila?.fabrica === true, "«Fuera de Adeorq» nace en «lista», de fábrica", JSON.stringify(fila));
    const ajeno = await cliente("un-programa-de-fuera-a1");
    sueltos.push(ajeno);
    const vistas = (await ajeno.herramientas()).sort();
    const justas = ["close_pane", "get_active_panes", "get_projects", "get_usage", "open_pane", "read_pane_screen", "read_pane_transcript"];
    ok(JSON.stringify(vistas) === JSON.stringify(justas), "ve justo la lista, el uso, los proyectos, abrir, y leer y cerrar", vistas.join());
    const lista = await verLista(ajeno);
    ok(new RegExp(`ID: ${P}\\b`).test(lista.texto ?? "") && /CWD:/.test(lista.texto ?? ""), "la lista dice qué terminales hay", corto(lista));
    ok(!/Command:/.test(lista.texto ?? "") && sinMarcas(lista), "sin el comando de ninguna, que lleva el encargo entero", corto(lista));
    ok(!(await ajeno.llamar("get_usage", {})).error, "ve el uso");
    ok(/demo/.test((await ajeno.llamar("get_projects", {})).texto ?? ""), "y los proyectos");

    const negadas = [
      ["read_pane_screen", { paneId: P }],
      ["read_pane_transcript", { paneId: P }],
      ["buscar_memoria", { pregunta: MARCA_MEMORIA }],
      ["leer_memoria", { id: "x" }],
      ["leer_turno", { paneId: P }],
      ["get_agenda", { project: "demo" }],
      ["get_decision", { id: "x" }],
      ["ask_decision", { title: "¿Seguimos?", questions: [{ title: "¿Seguimos?", options: [{ text: "Sí" }, { text: "No" }] }] }],
      ["get_mods", {}],
      ["link_panes", { from: P, to: C }],
      ["send_command", { paneId: P, command: "echo A1-NO" }],
      ["send_keys", { paneId: P, keys: "x" }],
      ["compactar_terminal", { paneId: P }],
      ["close_pane", { paneId: P, rastro: "Prueba del laboratorio A1: esto no debería cerrarse, porque no la abrió quien lo pide." }],
    ];
    for (const [h, args] of negadas) {
      const r = await ajeno.llamar(h, args);
      ok(!!r.error && /Ajustes > Terminales/.test(r.error) && sinMarcas(r), `${h}, no, y dice dónde se sube`, corto(r));
    }
    ok(!!(await hasta(async () => (await verLista(vigia)).texto?.includes(`ID: ${P},`), 3_000, 200)), "y la terminal ajena sigue abierta");
    const unNegado = await ajeno.llamar("get_agenda", { project: "demo" });
    ok(/Leer y abrir/.test(unNegado.error ?? "") && /Fuera de Adeorq/.test(unNegado.error ?? ""), "el mensaje dice qué fila y qué paso", corto(unNegado));

    // Lee y cierra lo que abrió él, y no lo de otro programa de fuera.
    const suya = numero(await ajeno.llamar("open_pane", { cli: "shell", cwd: demo, name: "La de A1" }));
    ok(suya > 0 && !(await v.js(`!!document.querySelector(".abrir-modal")`)), `abre sin encargo y sin ventana (${suya})`);
    ok(!!(await hasta(async () => !(await ajeno.llamar("read_pane_screen", { paneId: suya })).error, 15_000, 300)), "lee la pantalla de la que abrió");
    ok(!(await ajeno.llamar("read_pane_transcript", { paneId: suya })).error, "y su historia");
    ok(new RegExp(`ID: ${suya}\\b[^\\n]*Abierta por: ti`).test((await verLista(ajeno)).texto ?? ""), "la lista le dice cuál abrió él");
    const otroDeFuera = await cliente("otro-programa-a1");
    sueltos.push(otroDeFuera);
    await verLista(otroDeFuera);
    ok(!!(await otroDeFuera.llamar("read_pane_screen", { paneId: suya })).error, "otro programa de fuera no la lee");
    ok(!new RegExp(`ID: ${suya}\\b[^\\n]*Abierta por: ti`).test((await verLista(otroDeFuera)).texto ?? ""), "ni la lista se la da por suya");
    ok(!!(await otroDeFuera.llamar("close_pane", { paneId: suya, rastro: "Prueba del laboratorio A1: esto no debería cerrarse, porque es de otro programa." })).error, "ni la cierra");
    ok(!(await ajeno.llamar("close_pane", { paneId: suya, rastro: "Prueba del laboratorio A1: no hizo nada más que nacer, y no queda nada pendiente." })).error, "él sí cierra la suya");

    // ── Subirlo y bajarlo en Ajustes ─────────────────────────────────────
    await ponerFuera("plan");
    ok((await filaFuera())?.nivel === "plan", "se sube a «Leer y abrir»");
    ok(((await leePantalla(ajeno)).texto ?? "").includes(MARCA_PANTALLA), "ya lee la terminal ajena, en la misma conexión");
    ok(((await leeMemoria(ajeno)).texto ?? "").includes(MARCA_MEMORIA), "y la memoria");
    ok(((await leeAgenda(ajeno)).texto ?? "").includes(MARCA_AGENDA), "y la agenda");
    ok(((await verLista(ajeno)).texto ?? "").includes(MARCA_ENCARGO), "y los comandos de la lista");
    ok(!!(await ajeno.llamar("send_command", { paneId: P, command: "echo A1-NO" })).error, "y sigue sin escribir");
    await ponerFuera("auto");
    ok(!(await ajeno.llamar("send_command", { paneId: P, command: `echo A1-TODO-${process.pid}` })).error, "se sube a «Todo» y ya escribe");
    await ponerFuera("mirar");
    ok(((await leePantalla(ajeno)).texto ?? "").includes(MARCA_PANTALLA), "«Solo mirar» guardado sigue leyendo");
    ok(!(await ajeno.herramientas()).includes("open_pane"), "y sigue sin abrir, que es lo que era");
    await ponerFuera(null);
    const vuelta = await filaFuera();
    ok(vuelta?.nivel === "lista" && vuelta?.fabrica === true, "«Como de fábrica» lo baja", JSON.stringify(vuelta));
    ok(!!(await leePantalla(ajeno)).error, "y en esa misma conexión deja de leer");
    await ponerFuera("plan");
    await ponerFuera("lista");
    const elegida = await filaFuera();
    ok(elegida?.nivel === "lista" && elegida?.fabrica === true, "elegir «Ver la lista y abrir» es lo mismo que de fábrica", JSON.stringify(elegida));
    const enOtraFila = await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "codex", nivel: "lista" }).then(() => "ok", (e) => "error: " + e)`);
    ok(/^error/.test(enOtraFila), "«lista» no se puede poner en otra fila", enOtraFila);

    // ── Lo que cuelga de una terminal, sin presentar su contraseña ───────
    // Como hoy: una contraseña que no llega no es lo mismo que una que no vale.
    const desdeDentro = async (modo, extra = "") => {
      const salida = join(doble, `dentro-${modo}.json`);
      rmSync(salida, { force: true });
      await vigia.llamar("send_command", { paneId: P, command: `node "${clienteDentro}" ${modo} ${PUERTO} "${salida}" ${P} ${extra}` });
      const s = await hasta(() => (existsSync(salida) ? readFileSync(salida, "utf8") : null), 30_000, 300);
      return s ? JSON.parse(s) : { error: "no contestó" };
    };
    const comoHoy = (r) => r.tools?.includes("get_agenda") && r.tools?.includes("open_pane") && !r.tools?.includes("send_command") && r.lee && r.comandos;
    const enLista = (r) => JSON.stringify(r.tools) === JSON.stringify(justas) && !r.lee && !r.comandos;
    const sinPanel = await desdeDentro("socket");
    ok(comoHoy(sinPanel), "un cliente sin panel que cuelga de una terminal sigue como hoy: lee y ve los comandos", JSON.stringify(sinPanel).slice(0, 300));
    const limpio = await desdeDentro("puente-limpio", `"${exe}"`);
    ok(comoHoy(limpio), "el puente de verdad con el entorno limpio, como el de un Codex sin `env_vars`: igual", JSON.stringify(limpio).slice(0, 300));
    const panelSin = await desdeDentro("panel-sin");
    ok(comoHoy(panelSin), "uno que dice su número sin contraseña desde dentro (el puente de antes de la 0.9.239): igual", JSON.stringify(panelSin).slice(0, 300));
    const panelMala = await desdeDentro("panel-mala");
    ok(enLista(panelMala), "una contraseña mala no se arregla por colgar de una terminal: de fábrica", JSON.stringify(panelMala).slice(0, 300));
    if (process.env.LAB_CLIENTE_VIEJO && existsSync(process.env.LAB_CLIENTE_VIEJO)) {
      const viejo = await desdeDentro("puente-tal-cual", `"${process.env.LAB_CLIENTE_VIEJO}"`);
      ok(comoHoy(viejo), "el puente de otra versión de verdad, en esa terminal: como hoy", JSON.stringify(viejo).slice(0, 300));
    } else {
      console.log("SALTADO  el puente de otra versión: lanza también con LAB_CLIENTE_VIEJO=<copia de un adeorq.exe>");
    }

    // ── Una terminal de antes de actualizar ──────────────────────────────
    if (MOTOR_VIEJO) {
      console.log(`      Motor de antes: ${(await aislada.motor()).ruta}`);
      ok(/motor-de-antes/.test(aislada.motor().ruta), "las terminales corren en el motor de antes");
      for (const c of [vigia, ajeno, otroDeFuera, duenio]) c.cerrar();
      await aislada.reiniciar({ actualizando: true });
      v = aislada.v;
      const deAntes = await cliente("claude-code", { casa: { adeorq: "panel", id: C } });
      sueltos.push(deAntes);
      await hasta(async () => new RegExp(`ID: ${C}\\b`).test((await verLista(deAntes)).texto ?? ""), 20_000, 500);
      ok((await deAntes.herramientas()).includes("send_command"), "una terminal recogida de ese motor, sin contraseña, sigue por su nombre: Claude escribe en otras");
      const escrito = `A1-DE-ANTES-${process.pid}`;
      ok(!(await deAntes.llamar("send_command", { paneId: P, command: `echo ${escrito}` })).error, "y escribe de verdad");
      ok(!!(await hasta(async () => ((await deAntes.llamar("read_pane_transcript", { paneId: P })).texto ?? "").includes(escrito), 15_000, 300)), "y lee las demás");
      const codexDeAntes = await cliente("codex-mcp-client", { casa: { adeorq: "panel", id: C } });
      sueltos.push(codexDeAntes);
      await verLista(codexDeAntes);
      ok(!(await codexDeAntes.llamar("read_pane_transcript", { paneId: P })).error, "un Codex de esa terminal sigue leyendo");
      ok(!(await codexDeAntes.herramientas()).includes("send_command"), "y sigue sin escribir");
      const sinPanelDeAntes = await hasta(async () => {
        const salida = join(doble, "dentro-de-antes.json");
        rmSync(salida, { force: true });
        await deAntes.llamar("send_command", { paneId: P, command: `node "${clienteDentro}" socket ${PUERTO} "${salida}" ${P}` });
        return await hasta(() => (existsSync(salida) ? JSON.parse(readFileSync(salida, "utf8")) : null), 15_000, 300);
      }, 40_000, 500);
      ok(comoHoy(sinPanelDeAntes ?? {}), "y uno sin panel, colgando de esa terminal, sigue como hoy", JSON.stringify(sinPanelDeAntes).slice(0, 300));
      throw new Error("LAB_SOLO_A1: el motor de antes no sigue con el resto");
    }
    console.log("SALTADO  la terminal de antes de actualizar: lanza también con LAB_MOTOR_VIEJO=<copia de un adeorq.exe> y LAB_TERMINALES_APARTE=1");

    // ── La tarjeta ───────────────────────────────────────────────────────
    if (process.env.LAB_FOTOS) {
      const tarjeta = async (archivo) => {
        await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
        await dormir(900);
        await v.js(`(() => { const b = [...document.querySelectorAll(".set-tab")].find((x) => x.querySelector(".set-tab-nom")?.textContent.trim() === "Terminales"); if (b && !b.hasAttribute("data-on")) b.click(); return !!b; })()`);
        ok(!!(await hasta(() => v.js(`[...document.querySelectorAll(".panel-card h2")].some((h) => /cada cliente por el MCP/.test(h.textContent))`), 10_000, 300)), "la tarjeta sale en Ajustes › Terminales");
        await dormir(400);
        const rect = await v.js(`(() => { const c = [...document.querySelectorAll(".panel-card")].find((x) => /cada cliente por el MCP/.test(x.querySelector("h2")?.textContent ?? "")); c.scrollIntoView({ block: "center" }); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
        await dormir(300);
        return aislada.foto(rect, archivo);
      };
      const opciones = () => v.js(`(() => { const c = [...document.querySelectorAll(".panel-card")].find((x) => /cada cliente por el MCP/.test(x.querySelector("h2")?.textContent ?? "")); const f = [...c.querySelectorAll(".mcp-cliente")].find((x) => /Fuera de Adeorq/.test(x.textContent)); return JSON.stringify({ todas: [...f.querySelectorAll(".choice")].map((b) => b.textContent.trim()), on: [...f.querySelectorAll('.choice[data-on="true"]')].map((b) => b.textContent.trim()) }); })()`).then(JSON.parse);
      await ponerFuera(null);
      await tarjeta("a1-tarjeta-fabrica.png");
      const deFabrica = await opciones();
      ok(JSON.stringify(deFabrica.todas) === JSON.stringify(["Ver la lista y abrir", "Leer y abrir", "Todo"]) && JSON.stringify(deFabrica.on) === JSON.stringify(["Ver la lista y abrir"]), "la fila de fuera ofrece los tres pasos, con el de fábrica marcado", JSON.stringify(deFabrica));
      // Se pulsa de verdad: subirlo por el botón de la tarjeta, y volver por «Como de fábrica».
      const pulsarFila = (rotulo) => v.js(`(() => { const c = [...document.querySelectorAll(".panel-card")].find((x) => /cada cliente por el MCP/.test(x.querySelector("h2")?.textContent ?? "")); const f = [...c.querySelectorAll(".mcp-cliente")].find((x) => /Fuera de Adeorq/.test(x.textContent)); [...f.querySelectorAll(".choice")].find((b) => b.textContent.trim() === ${JSON.stringify(rotulo)})?.click(); return "ok"; })()`);
      await pulsarFila("Leer y abrir");
      await dormir(400);
      ok((await filaFuera())?.nivel === "plan" && ((await leePantalla(ajeno)).texto ?? "").includes(MARCA_PANTALLA), "pulsar «Leer y abrir» en la tarjeta lo sube de verdad");
      await pulsarFila("Como de fábrica");
      await dormir(400);
      ok((await filaFuera())?.nivel === "lista" && !!(await leePantalla(ajeno)).error, "pulsar «Como de fábrica» lo baja de verdad");
      // Quien tenía «Solo mirar» guardado lo sigue viendo, y solo él.
      await ponerFuera("mirar");
      await v.js(`document.querySelector('.topbar .tab[data-tab="cabina"]')?.click(); "ok"`);
      await dormir(300);
      await tarjeta("a1-tarjeta-mirar.png");
      const conMirar = await opciones();
      ok(conMirar.todas.includes("Solo mirar") && JSON.stringify(conMirar.on) === JSON.stringify(["Solo mirar"]), "«Solo mirar» sale si es lo que tenía guardado", JSON.stringify(conMirar));
      await pulsarFila("Como de fábrica");
      await dormir(400);
      ok(!(await opciones()).todas.includes("Solo mirar"), "y deja de salir en cuanto se cambia");
      await v.js(`document.querySelector('.topbar .tab[data-tab="cabina"]')?.click(); "ok"`);
      await dormir(300);
    }
    // Lo que se abrió aquí no ocupa el tope de lo que viene.
    const cerrada = await vigia.llamar("close_pane", { paneId: conEncargo, rastro: "Prueba del laboratorio A1: nació para llevar un encargo en su comando, y no queda nada pendiente." });
    if (cerrada.error) console.log(`         (la ${conEncargo} no se cerró: ${corto(cerrada)})`);
    ajeno.cerrar();
    otroDeFuera.cerrar();
    if (process.env.LAB_SOLO_A1) throw new Error("LAB_SOLO_A1: hasta aquí");
  }

  // ════ C1 · abrir desde fuera ═════════════════════════════════════════════
  // Un programa de fuera, con el permiso de fábrica, y un `claude` de mentira del
  // PATH: no gasta cuota. Sin encargo abre en el modo de Ajustes; con encargo, la
  // ventana decide. La carpeta no queda nunca de confianza por esto.
  console.log("\n── C1 · abrir una terminal desde fuera de Adeorq");
  {
  const cualquiera = join(aislada.base, "una-carpeta-cualquiera");
  mkdirSync(cualquiera, { recursive: true });
  // Un `.claude.json` como el de cualquier instalación: sin él no hay dónde marcar la confianza.
  const deConfianza = CUENTA_CLAUDE ? join(CUENTA_CLAUDE, ".claude.json") : join(aislada.base, "casa", ".claude.json");
  if (!CUENTA_CLAUDE && !existsSync(deConfianza)) writeFileSync(deConfianza, JSON.stringify({ projects: {} }));
  const deConfianzaAhora = (carpeta) => {
    const p = JSON.parse(readFileSync(deConfianza, "utf8")).projects ?? {};
    return !!(p[carpeta.replace(/\\/g, "/")] ?? p[carpeta])?.hasTrustDialogAccepted;
  };
  // Por la vigía: desde fuera, de fábrica, la lista va sin comandos (A1).
  const filas = async () => ((await vigia.llamar("get_active_panes", {})).texto ?? "").split("\n").filter((l) => l.startsWith("ID: "));
  const filaDe = (id) => hasta(async () => (await filas()).find((l) => l.startsWith(`ID: ${id},`)) ?? null, 15_000, 500);
  const enAuto = (fila) => /--permission-mode\s+auto/.test(fila ?? "");
  const textoVentana = () => v.js(`document.querySelector(".abrir-modal")?.innerText ?? null`);
  const ventanaAbierta = () => hasta(textoVentana, 10_000, 100);
  const pulsar = async (selector) => {
    // «Abrir» tarda un momento en dejarse pulsar: un clic que iba a otra cosa no puede caerle encima.
    await hasta(() => v.js(`(() => { const b = document.querySelector(".abrir-modal ${selector}"); return !!b && !b.disabled; })()`), 5_000, 50);
    await v.js(`document.querySelector(".abrir-modal ${selector}").click(), "ok"`);
  };
  const ENCARGO = "ENCARGO-DE-PRUEBA-C1: no hagas nada.";

  const fueraDeFabrica = await cliente("un-programa-de-fuera");
  sueltos.push(fueraDeFabrica);

  // Sin encargo: abre, en el modo de Ajustes, sin ventana y sin marcar la carpeta.
  const sinEncargo = numero(await fueraDeFabrica.llamar("open_pane", { cli: "claude", cwd: cualquiera, name: "Sin encargo", brief: "" }));
  const filaSin = sinEncargo > 0 ? await filaDe(sinEncargo) : null;
  ok(sinEncargo > 0 && !!filaSin && !enAuto(filaSin) && /--permission-mode\s+acceptEdits/.test(filaSin), "sin encargo abre, en el modo de Ajustes y no en auto", filaSin ?? "no nació");
  ok(!(await textoVentana()), "sin encargo no sale ninguna ventana");
  ok(!deConfianzaAhora(cualquiera), "sin encargo la carpeta no queda de confianza");

  // Con encargo: mientras nadie contesta, no hay terminal ni confianza.
  const antesDeLaVentana = (await filas()).length;
  const conNoAbrir = fueraDeFabrica.llamar("open_pane", { cli: "claude", cwd: cualquiera, name: "Con encargo", brief: ENCARGO }, 30_000);
  const enLaVentana = await ventanaAbierta();
  ok(!!enLaVentana && enLaVentana.includes(ENCARGO) && enLaVentana.includes("un-programa-de-fuera") && enLaVentana.includes(cualquiera), "con encargo sale la ventana, con el texto, quién lo pide y la carpeta", enLaVentana ?? "no salió");
  if (process.env.LAB_FOTOS) await aislada.foto(null, "abrir-ventana.png");
  ok((await filas()).length === antesDeLaVentana && !deConfianzaAhora(cualquiera), "mientras nadie contesta no nace nada ni se marca la carpeta");

  // Otra petición con la ventana abierta se rinde, en vez de abrir otra encima.
  const otroDeFuera = await cliente("otro-programa-de-fuera");
  sueltos.push(otroDeFuera);
  const encima = await otroDeFuera.llamar("open_pane", { cli: "claude", cwd: cualquiera, name: "Encima", brief: ENCARGO });
  ok(!!encima.error && /ventana/.test(encima.error), "otra con la ventana abierta se rinde", corto(encima));

  await pulsar(".modal-cancel");
  const conNo = await conNoAbrir;
  ok(!!conNo.error && /dicho que no/.test(conNo.error), "con «No», open_pane contesta un error que lo dice", corto(conNo));
  ok((await filas()).length === antesDeLaVentana && !deConfianzaAhora(cualquiera), "con «No» no nace nada ni se marca la carpeta");
  ok(!!(await hasta(async () => !(await textoVentana()), 3_000, 100)), "con «No» la ventana se va");

  // Insistir justo después de un «No» no saca otra ventana: un bucle no secuestra la app.
  const insiste = await fueraDeFabrica.llamar("open_pane", { cli: "claude", cwd: cualquiera, name: "Insiste", brief: ENCARGO });
  ok(!!insiste.error && /no insistas/.test(insiste.error) && !(await textoVentana()), "insistir justo después de un «No» se niega sin ventana", corto(insiste));
  await dormir(31_000);

  // Con «Abrir»: nace con el encargo, en el modo de Ajustes, sin marcar la carpeta.
  const conAbrirEspera = fueraDeFabrica.llamar("open_pane", { cli: "claude", cwd: cualquiera, name: "Con clic", brief: ENCARGO }, 30_000);
  ok(!!(await ventanaAbierta()), "la ventana vuelve pasado ese rato");
  await pulsar(".np-btn");
  const conAbrir = await conAbrirEspera;
  const idAbrir = numero(conAbrir);
  const filaAbrir = idAbrir > 0 ? await filaDe(idAbrir) : null;
  ok(idAbrir > 0 && !!filaAbrir && !enAuto(filaAbrir) && /--permission-mode\s+acceptEdits/.test(filaAbrir), "con «Abrir» nace en el modo de Ajustes", filaAbrir ?? corto(conAbrir));
  ok(!!filaAbrir && !!(await filaConEncargo(v, vigia, "ENCARGO-DE-PRUEBA-C1"))?.startsWith(`ID: ${idAbrir},`), "con «Abrir» nace con su encargo", filaAbrir ?? "");
  ok(!deConfianzaAhora(cualquiera), "con «Abrir» la carpeta tampoco queda de confianza");

  // Un CLI que no acepta el encargo al arrancar no tiene texto que enseñar: abre sin ventana.
  const consola = await fueraDeFabrica.llamar("open_pane", { cli: "shell", cwd: cualquiera, name: "Consola", brief: "echo nada" });
  ok(numero(consola) > 0 && !(await textoVentana()), "una consola, que no recibe encargo, abre sin ventana", corto(consola));

  // Nadie contesta: no se abre, y la llamada no se queda colgada.
  const sinContestar = Date.now();
  const antesDeNadie = (await filas()).length;
  const nadieEspera = fueraDeFabrica.llamar("open_pane", { cli: "claude", cwd: cualquiera, name: "Nadie", brief: `${ENCARGO}\n${"una línea más del encargo\n".repeat(300)}‮FINAL-DEL-ENCARGO` }, 150_000);
  // Un encargo largo se lee entero, sin que la ventana se salga de la pantalla, y lo que da la vuelta al texto se ve marcado.
  await ventanaAbierta();
  const medida = await v.js(`(() => {
    const m = document.querySelector(".abrir-modal").getBoundingClientRect();
    const e = document.querySelector(".abrir-modal .abrir-encargo");
    e.scrollTop = e.scrollHeight;
    const fin = e.getBoundingClientRect();
    return JSON.stringify({ cabe: m.top >= 0 && m.bottom <= innerHeight, baja: e.scrollHeight > e.clientHeight, alFinal: e.scrollTop > 0 && fin.height > 0, marcado: e.textContent.endsWith("\\uFFFDFINAL-DEL-ENCARGO"), sinRay: getComputedStyle(e).overflowX !== "scroll" });
  })()`).then(JSON.parse);
  ok(medida.cabe && medida.baja && medida.alFinal && medida.marcado, "un encargo largo se lee entero dentro de la pantalla, y lo que da la vuelta al texto sale marcado", JSON.stringify(medida));
  if (process.env.LAB_FOTOS) await aislada.foto(null, "abrir-ventana-largo.png");
  const sinCarceles = await carceles(v, ".abrir-modal");
  const sinMayusculas = await mayusculas(v, ".abrir-modal");
  ok(sinCarceles.fallos.length === 0 && sinMayusculas.fallos.length === 0, "la ventana no lleva cárceles ni mayúsculas espaciadas", JSON.stringify({ c: sinCarceles.fallos, m: sinMayusculas.fallos }).slice(0, 300));
  const nadie = await nadieEspera;
  const tardo = Math.round((Date.now() - sinContestar) / 1000);
  ok(!!nadie.error && /nadie/.test(nadie.error) && tardo >= 110 && tardo <= 135, `si nadie contesta, se rinde a los ${tardo} s con un error que lo dice`, corto(nadie));
  ok((await filas()).length === antesDeNadie && !(await textoVentana()), "y no nace nada, y la ventana se va");

  // Con «Fuera de Adeorq» subido a «auto», no pregunta: lo decidió quien lo subió.
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: "auto" }).then(() => "ok")`);
  const subidoAbre = await fueraDeFabrica.llamar("open_pane", { cli: "claude", cwd: cualquiera, name: "Subido", brief: ENCARGO });
  const filaSubido = numero(subidoAbre) > 0 ? await filaDe(numero(subidoAbre)) : null;
  ok(enAuto(filaSubido) && deConfianzaAhora(cualquiera), "con «Fuera de Adeorq» en «auto» no pregunta, nace en auto y marca la carpeta", filaSubido ?? corto(subidoAbre));
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: null }).then(() => "ok")`);
  // Las abiertas aquí no pueden ocupar el tope de terminales de lo que viene.
  for (const id of [sinEncargo, idAbrir, numero(consola), numero(subidoAbre)]) {
    const cerrada = await fueraDeFabrica.llamar("close_pane", { paneId: id, rastro: "Prueba de la C1 del laboratorio: no hizo nada y no deja nada detrás, se cierra para no ocupar el tope." });
    if (cerrada.error) console.log(`         (la ${id} no se cerró: ${corto(cerrada)})`);
  }
  if (process.env.LAB_SOLO_C1) throw new Error("LAB_SOLO_C1: hasta aquí");
  }

  const pantalla = async (marca) =>
    hasta(async () => {
      const r = await duenio.llamar("read_pane_screen", { paneId: P });
      // La línea del eco, no la del comando: el comando lleva «echo» delante.
      return (r.texto ?? "").split("\n").some((l) => l.trim() === marca) ? true : null;
    }, 20_000, 500);
  const escribe = async (c, marca) => {
    await c.llamar("get_active_panes", {});
    const r = await c.llamar("send_command", { paneId: P, command: `echo ${marca}` });
    return { r, salio: !r.error && !!(await pantalla(marca)) };
  };

  // Desde el S3 (2026-11-03) lo que no viene de una terminal de Adeorq con su
  // contraseña es «fuera de Adeorq», y de fábrica abre y mira, nada más. El
  // nombre que diga ya no cuenta.
  for (const [quien, marca] of [["codex-cli", "S1-CODEX"], ["claude-code", "S1-IMPOSTOR-1"], ["claude-code-2", "S1-IMPOSTOR-2"]]) {
    const c = await cliente(quien);
    sueltos.push(c);
    const ve = await c.herramientas();
    const r = await escribe(c, marca);
    ok(!ve.includes("send_command") && !!r.r.error && !r.salio, `un programa de fuera que se llama «${quien}» no ve send_command (${ve.length} herramientas) y escribir se le niega`, corto(r.r));
  }

  // Dos terminales de agente de verdad, con un `claude` y un `codex` de mentira
  // delante en el PATH de la app: apuntan su terminal y su contraseña, y desde
  // ahí un puente de Adeorq de verdad hace de agente que vive dentro. La de Claude
  // ya está: es la vigía.
  // Las de la C1 tardan unos segundos en irse: un Claude se despide antes de cerrarse.
  const abrirCuandoQuepa = (args) =>
    hasta(async () => {
      const r = await duenio.llamar("open_pane", args);
      return /Tope alcanzado/.test(r.error ?? "") ? null : r;
    }, 40_000, 1000);
  const abreCodex = await abrirCuandoQuepa({ cli: "codex", cwd: demo, name: "Un Codex", brief: "" });
  const X = numero(abreCodex);
  ok(C > 0 && X > 0, `hay una terminal con Claude (${C}) y otra con Codex (${X})`, `${corto(abreClaude)} · ${corto(abreCodex)}`);
  const deDentro = await hasta(() => {
    if (!existsSync(join(doble, "paneles.txt"))) return null;
    const m = Object.fromEntries(
      readFileSync(join(doble, "paneles.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 3).map(([prog, id, clave]) => [Number(id), { prog, clave }]),
    );
    return m[C] && m[X] ? m : null;
  }, 20_000, 500);
  // Lo que apuntaron los dobles, con la contraseña tapada, por si no llega.
  const apuntado = () =>
    existsSync(join(doble, "paneles.txt")) ? readFileSync(join(doble, "paneles.txt"), "utf8").replace(/[0-9a-f]{64}/g, "<64 hex>").replace(/\r?\n/g, " | ") : "nada";
  if (!deDentro) throw new Error(`los dobles no apuntaron su terminal y su contraseña en 20 s: ${apuntado()}`);
  ok(/^[0-9a-f]{64}$/.test(deDentro[C].clave) && deDentro[C].clave !== deDentro[X].clave, "cada terminal nace con su contraseña, distinta de la de las otras", apuntado());
  const dentro = (id) => puenteDentro({ ADEORQ_PANE_ID: String(id), ADEORQ_PANE_CLAVE: deDentro[id].clave });

  // S3 · la clave del agujero 1, desde dentro de la terminal con Claude: `adeorq
  // secreto … -- comando`, como lo usa Munir a diario, sin ventana ni clic.
  const pedidosAntesDentro = await v.js(`window.__s1.length`);
  const desdeDentro = spawnSync(exe, ["secreto", CLAVE, "--env", "LAB_X", "--", "cmd", "/c", "echo", "hecho"], {
    env: { ...env, ADEORQ_PANE_ID: String(C), ADEORQ_PANE_CLAVE: deDentro[C].clave },
    encoding: "utf8",
    timeout: 30_000,
  });
  ok(
    desdeDentro.status === 0 && /hecho/.test(desdeDentro.stdout ?? "") && (await v.js(`window.__s1.length`)) === pedidosAntesDentro,
    `\`adeorq secreto … -- comando\` desde la terminal con Claude: sin ventana y sin clic`,
    `salida ${desdeDentro.status} · ${(desdeDentro.stdout ?? "").trim()} ${(desdeDentro.stderr ?? "").trim()}`.slice(0, 160),
  );
  const fila = (await v.js(`window.__TAURI_INTERNALS__.invoke("secretos_de_agente")`)).find((c) => c.nombre === CLAVE);
  ok(fila?.uso?.terminal === C, `Ajustes dice que la usó la terminal ${C}`, JSON.stringify(fila));

  // E16 · el `adeorq` de otra versión en el PATH de una terminal, que pide la clave
  // sin presentar su panel. El puerto se pone también en el guion: nunca a la de verdad.
  const VIEJO = process.env.LAB_CLIENTE_VIEJO;
  if (VIEJO && existsSync(VIEJO)) {
    console.log("\n── E16 · un cliente de otra versión pide la clave");
    const llegada = join(doble, "viejo-llegada.txt");
    const comprueba = join(doble, "viejo-comprueba.cmd");
    const guion = join(doble, "viejo-dentro.cmd");
    writeFileSync(comprueba, ["@echo off", `if "%LAB_X%"=="${VALOR}" (>"${llegada}" echo LLEGO) else (>"${llegada}" echo OTRA)`, ""].join("\r\n"));
    writeFileSync(guion, ["@echo off", `set ADEORQ_MCP_PUERTO=${PUERTO}`, `"${VIEJO}" secreto ${CLAVE} --env LAB_X -- cmd /c "${comprueba}"`, ""].join("\r\n"));
    const modal = () => v.js(`(() => { const m = document.querySelector(".secreto-modal"); return m ? m.querySelector(".modal-title").textContent : null; })()`);
    const pedidosAntesViejo = await v.js(`window.__s1.length`);
    const agente = dentro(C);
    sueltos.push(agente);
    await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "1" } });
    await agente.llamar("get_active_panes", {});
    const lanzada = await agente.llamar("send_command", { paneId: P, command: `cmd /c "${guion}"` });
    const leida = await hasta(() => (existsSync(llegada) ? readFileSync(llegada, "utf8").trim() || null : null), 8_000, 200);
    const tituloDentro = await modal();
    ok(leida === "LLEGO" && !tituloDentro && (await v.js(`window.__s1.length`)) === pedidosAntesViejo, "el cliente viejo, dentro de una terminal: la clave llega y no hay ventana", `llegada: ${leida} · ventana: ${tituloDentro} · ${corto(lanzada)}`);
    if (tituloDentro) {
      await v.js(`document.querySelector(".secreto-modal .modal-cancel").click(), "ok"`);
      await hasta(() => v.js(`!document.querySelector(".secreto-modal")`), 5_000);
    }
    const filaViejo = (await v.js(`window.__TAURI_INTERNALS__.invoke("secretos_de_agente")`)).find((c) => c.nombre === CLAVE);
    ok(filaViejo?.uso?.terminal === P, `Ajustes dice que la usó la terminal ${P}, no un programa de fuera`, JSON.stringify(filaViejo));
    ok(readFileSync(rastro, "utf8").includes(`«${CLAVE}» entregada a la terminal ${P}.`), "el rastro dice qué terminal fue");

    rmSync(llegada, { force: true });
    const deFueraViejo = spawn(VIEJO, ["secreto", CLAVE, "--env", "LAB_X", "--", "cmd", "/c", comprueba], { env });
    const acabo = new Promise((r) => deFueraViejo.on("exit", r));
    const preguntaViejo = await hasta(modal, 10_000);
    ok(/fuera de Adeorq/.test(preguntaViejo ?? ""), "el mismo cliente viejo, fuera de cualquier terminal: sale la ventana", preguntaViejo ?? "sin ventana");
    if (preguntaViejo) await v.js(`document.querySelector(".secreto-modal .modal-cancel").click(), "ok"`);
    const salidaViejo = await Promise.race([acabo, dormir(15_000).then(() => "colgado")]);
    ok(salidaViejo !== 0 && !existsSync(llegada), `con «No» se queda sin ella (salida ${salidaViejo})`);
    if (salidaViejo === "colgado") deFueraViejo.kill();
    await hasta(() => v.js(`!document.querySelector(".secreto-modal")`), 5_000);
    agente.cerrar();
  } else {
    console.log("SALTADO  el cliente de otra versión: lanza también con LAB_CLIENTE_VIEJO=<copia de un adeorq.exe anterior a la 0.9.239>");
  }

  await v.js(`window.__TAURI_INTERNALS__.invoke("secreto_de_agente_olvidar", { nombre: ${JSON.stringify(CLAVE)} }).then(() => "ok")`);
  ok(leerSinAdeorq(CLAVE) === "NO-ESTA", "la clave de mentira, olvidada desde Ajustes, ya no está en el Gestor");

  const enClaude = dentro(C, "claude-code");
  sueltos.push(enClaude);
  await enClaude.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "1" } });
  const deClaude = await escribe(enClaude, "S3-DENTRO-CLAUDE");
  const pantallaP = async () => ((await duenio.llamar("read_pane_screen", { paneId: P })).texto ?? "").split(/\n/).filter((l) => l.trim()).slice(-4).join(" / ");
  ok(deClaude.salio, `un agente dentro de la terminal con Claude escribe en la de otro, como hoy`, `${corto(deClaude.r)} · pantalla: ${deClaude.salio ? "" : await pantallaP()}`);
  // C1: una terminal de Adeorq con su contraseña sigue abriendo con encargo sin preguntar, y en auto.
  const delegada = numero(await enClaude.llamar("open_pane", { cli: "claude", cwd: demo, name: "Delegada", brief: "ENCARGO-DESDE-DENTRO" }));
  const filaDelegada = delegada > 0 ? await hasta(async () => ((await vigia.llamar("get_active_panes", {})).texto ?? "").split("\n").find((l) => l.startsWith(`ID: ${delegada},`)) ?? null, 15_000, 500) : null;
  ok(/--permission-mode\s+auto/.test(filaDelegada ?? "") && !!filaDelegada && !!(await filaConEncargo(v, vigia, "ENCARGO-DESDE-DENTRO"))?.startsWith(`ID: ${delegada},`) && !(await v.js(`!!document.querySelector(".abrir-modal")`)), "desde una terminal de Adeorq, abrir con encargo no pregunta y nace en auto", filaDelegada ?? "no nació");
  // Y un encargo programado, que nadie abre a mano, tampoco: se lanza con su botón de probar.
  const programado = { nombre: "Programado C1", encargo: "ENCARGO-PROGRAMADO", cwd: demo, cli: "claude", cuando: { tipo: "cada", horas: 24 } };
  const idProgramado = await v.js(`window.__TAURI_INTERNALS__.invoke("programado_guardar", { pedido: ${JSON.stringify(programado)} }).then((e) => e.encargos.find((x) => x.nombre === "Programado C1").id)`);
  await v.js(`window.__TAURI_INTERNALS__.invoke("programado_probar", { id: ${JSON.stringify(idProgramado)} }).then(() => "ok")`);
  const filaProgramado = await hasta(() => filaConEncargo(v, vigia, "ENCARGO-PROGRAMADO"), 15_000, 500);
  ok(/--permission-mode\s+auto/.test(filaProgramado ?? "") && !(await v.js(`!!document.querySelector(".abrir-modal")`)), "un encargo programado no pregunta y nace en auto", filaProgramado ?? "no nació");
  await v.js(`window.__TAURI_INTERNALS__.invoke("programado_borrar", { id: ${JSON.stringify(idProgramado)} }).then(() => "ok")`);
  // Un Codex que dice ser Claude, desde SU terminal: manda el programa de la terminal.
  const enCodex = dentro(X, "claude-code");
  sueltos.push(enCodex);
  await enCodex.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "1" } });
  const deCodexDentro = await escribe(enCodex, "S3-CODEX-QUE-DICE-CLAUDE");
  ok(!!deCodexDentro.r.error && !deCodexDentro.salio, "desde la terminal con Codex, decir «claude-code» no da nada: manda lo que se abrió en ella", corto(deCodexDentro.r));
  // A1: lo de fuera baja, y eso no le quita nada a una terminal de Adeorq con otro programa.
  const leeCodex = await enCodex.llamar("read_pane_transcript", { paneId: P });
  ok(!leeCodex.error, "y una terminal con Codex, con su contraseña, sigue leyendo las demás", corto(leeCodex));
  // Decir que es la terminal de Claude sin su contraseña, o con otra, tampoco.
  for (const [panel, marca] of [[{ adeorq: "panel", id: C }, "S3-PANEL-SIN"], [{ adeorq: "panel", id: C, clave: deDentro[X].clave }, "S3-PANEL-OTRA"]]) {
    const c = await cliente("claude-code", { casa: panel });
    sueltos.push(c);
    const r = await escribe(c, marca);
    ok(!!r.r.error && !r.salio, `la línea ${panel.clave ? "panel con la contraseña de otra terminal" : "panel sin contraseña"} no se cree`, corto(r.r));
  }

  // S2: la contraseña de casa no llega a una terminal (si llegara, cualquier agente la heredaría).
  await enClaude.llamar("send_command", { paneId: P, command: `node -e "console.log('CASA=['+(process.env.ADEORQ_CASA||'')+']')"` });
  const enElPanel = await hasta(async () => {
    const t = (await duenio.llamar("read_pane_screen", { paneId: P })).texto ?? "";
    return t.split("\n").map((l) => l.trim()).find((l) => /^CASA=\[[0-9a-f]*\]$/.test(l)) ?? null;
  }, 15_000, 500);
  ok(enElPanel === "CASA=[]", `una terminal de Adeorq no hereda la contraseña de casa (su entorno dice «${enElPanel}»)`);

  // Munir baja a Claude Code en Ajustes: vale para sus terminales.
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "claude", nivel: "mirar" }).then(() => "ok")`);
  const bajado = dentro(C, "claude-code");
  sueltos.push(bajado);
  await bajado.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "1" } });
  const deBajado = await escribe(bajado, "S3-BAJADO");
  ok(!!deBajado.r.error && !deBajado.salio, "con Claude Code en «solo mirar» en Ajustes, su terminal ya no escribe", corto(deBajado.r));
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "claude", nivel: null }).then(() => "ok")`);
  // Y sube «fuera de Adeorq»: entonces sí, cualquiera de fuera (B1, «hasta que lo subas tú»).
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: "auto" }).then(() => "ok")`);
  const subido = await cliente("lo-que-sea");
  sueltos.push(subido);
  const deSubido = await escribe(subido, "S3-FUERA-SUBIDO");
  ok(deSubido.salio, "con «fuera de Adeorq» subido en Ajustes, uno de fuera escribe", corto(deSubido.r));
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: null }).then(() => "ok")`);

  // La línea de casa (S2) sigue sin servir sin su contraseña.
  for (const [quien, casa, marca] of [
    ["cualquiera", { adeorq: "de-casa" }, "S1-IMPOSTOR-3"],
    ["cualquiera-con-clave", { adeorq: "de-casa", clave: "0".repeat(64) }, "S1-IMPOSTOR-3B"],
  ]) {
    const c = await cliente(quien, { casa });
    sueltos.push(c);
    const ve = await c.herramientas();
    const r = await c.llamar("send_command", { paneId: P, command: `echo ${marca}` });
    ok(!ve.includes("send_command") && !!r.error && !(await pantalla(marca)), `la línea ${JSON.stringify(casa).replace(/0{64}/, "0…0")} ya no se salta la puerta: ${ve.length} herramientas y escribir se le niega`, corto(r));
  }

  // Y sin escribir un socket: el puente de Adeorq con --de-casa, al alcance de cualquier agente.
  const puente = puenteDeCasa(env);
  sueltos.push(puente);
  await puente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "un-codex-en-plan", version: "1" } });
  const r4 = await puente.llamar("send_command", { paneId: P, command: "echo S1-IMPOSTOR-4" });
  ok(!!r4.error && !(await pantalla("S1-IMPOSTOR-4")), "`adeorq.exe --mcp --de-casa` sin la contraseña es un cliente más: escribir se le niega", corto(r4));
  // En Ajustes, una fila por programa y la de fuera: los nombres ya no hacen filas.
  const filas = await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_leer")`);
  const nombres = filas.map((c) => c.nombre);
  const fuera = filas.find((c) => c.nombre === "fuera");
  ok(nombres.includes("claude") && nombres.includes("codex") && !nombres.some((n) => /claude-code|codex-cli|cualquiera/.test(n)) && fuera?.veces >= 6, `Ajustes enseña programas y «fuera de Adeorq» (${fuera?.veces} conexiones de fuera), no nombres`, nombres.join(", "));

  // La trampa de actualizar: con las terminales en su proceso aparte, la de
  // Claude sobrevive, su puente se reengancha con la misma contraseña y sigue
  // teniendo sus manos.
  if (aislada.aparte) {
    await aislada.reiniciar({ actualizando: true });
    // La ventana es otra: la de antes ya no contesta.
    v = aislada.v;
    // Lo que se mire desde aquí, desde la terminal con Claude: una conexión nueva de
    // fuera no es dueña de nada, y de fábrica ya no lee lo ajeno (A1).
    duenio = enClaude;
    await hasta(async () => /Arranque de Adeorq/.test((await duenio.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
    let ultimoError = "sin respuesta";
    const tras = await hasta(async () => {
      await enClaude.llamar("get_active_panes", {});
      const r = await enClaude.llamar("send_command", { paneId: P, command: "echo S3-TRAS-ACTUALIZAR" });
      if (r.error) ultimoError = r.error;
      return r.error ? null : r;
    }, 30_000, 1000);
    // Lo que dijo la terminal, de lo que guarda Rust: la ventana nueva puede no
    // haber vuelto a montar ese panel todavía, y su pantalla no es lo que se mide.
    const enSuHistoria = await hasta(async () => {
      const t = ((await duenio.llamar("read_pane_transcript", { paneId: P })).texto ?? "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
      return t.split(/\r?\n/).some((l) => l.trim() === "S3-TRAS-ACTUALIZAR") ? true : null;
    }, 20_000, 500);
    ok(!!tras && !!enSuHistoria, "tras actualizar, el puente de la terminal con Claude se reengancha y sigue escribiendo", `${corto(tras ?? { error: ultimoError })} · en su historia: ${!!enSuHistoria}`);
    const trasCodex = await escribe(enCodex, "S3-CODEX-TRAS");
    ok(!!trasCodex.r.error && !trasCodex.salio, "y el de la terminal con Codex sigue sin poder", corto(trasCodex.r));
  } else {
    console.log("SALTADO  la trampa de actualizar: lanza también con LAB_TERMINALES_APARTE=1");
  }

  // ════ S2 · los de casa siguen en casa ════════════════════════════════════
  console.log("\n── S2 · el Capataz y el conserje siguen siendo de casa, y la contraseña no se escapa");
  const clientes = async () => Object.fromEntries((await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_leer")`)).map((c) => [c.nombre, c.veces]));
  /** Mientras `trabajo` corre, mira las líneas de órdenes de los procesos de casa:
   *  si vio el puente de casa de ESTA app y si alguna lleva 64 cifras hex. */
  // 64 cifras hex sueltas, no una carpeta: la ruta de Codex instalado con pnpm
  // lleva un hash de 64 en el almacén (`…\links\@openai\codex\…\80149a06…\node_modules`).
  const HEX = /(?<![0-9a-f\\/])[0-9a-f]{64}(?![0-9a-f\\/])/i;
  const vigilar = async (trabajo) => {
    let fin = false;
    const hecho = trabajo.finally(() => (fin = true));
    const visto = { puentes: 0, conHex: [] };
    const guion = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '--de-casa|mcp_servers\\.adeorq|adeorq-capataz-mcp|adeorq-conserje-gemini|--mcp-config' } | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`;
    while (!fin) {
      const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { encoding: "utf8" });
      for (const l of (r.stdout ?? "").split(/\r?\n/).filter(Boolean)) {
        // Las configuraciones escriben la ruta con barras normales.
        if (l.replace(/\\/g, "/").toLowerCase().includes(binDir.replace(/\\/g, "/").toLowerCase()) && l.includes("--de-casa")) visto.puentes++;
        if (HEX.test(l)) visto.conHex.push(l.slice(0, 160));
      }
      await dormir(300);
    }
    return { ...visto, resultado: await hecho.then((r) => ({ r }), (e) => ({ e: String(e?.message ?? e) })) };
  };

  // Codex y Gemini del conserje, sin sesión: su puente arranca y no se apunta como cliente.
  for (const pensador of ["codex", "gemini"]) {
    const id = `lab-s2-${pensador}-${process.pid}`;
    await v.js(`window.__TAURI_INTERNALS__.invoke("conserje_pensador", { id: ${JSON.stringify(id)}, pensador: "${pensador}" }).then(() => "ok")`);
    const antes = await clientes();
    const w = await vigilar(
      Promise.race([
        v.js(`window.__TAURI_INTERNALS__.invoke("conserje_enviar", { id: ${JSON.stringify(id)}, texto: "hola", estados: {} }).then((r) => "contestó: " + r.texto, (e) => "falló: " + e)`),
        dormir(120_000).then(() => "sin acabar en 2 minutos"),
      ]),
    );
    const despues = await clientes();
    const nuevos = Object.keys(despues).filter((n) => (despues[n] ?? 0) !== (antes[n] ?? 0));
    ok(w.puentes > 0 && nuevos.length === 0, `el conserje con ${pensador}, sin sesión: su puente de casa corrió y no quedó apuntado como cliente`, `puente visto ${w.puentes} veces · nuevos en Ajustes: ${nuevos.join(", ") || "ninguno"} · ${String(w.resultado.r ?? w.resultado.e).slice(0, 120)}`);
    ok(w.conHex.length === 0, `ninguna línea de órdenes del conserje con ${pensador} lleva la contraseña`, w.conHex.join(" | "));
  }

  if (!CUENTA_CLAUDE) {
    console.log("SALTADO  el Capataz y el conserje de Claude de verdad: pon LAB_CLAUDE_CUENTA=<carpeta de una cuenta de Claude> (gasta unos céntimos de esa cuenta)");
  } else {
    // Claude Code y lo de fuera, en «solo mirar»: si el Capataz escribe, es que entró como de casa.
    for (const p of ["claude", "fuera"]) await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "${p}", nivel: "mirar" }).then(() => "ok")`);
    const antes = await clientes();
    const capataz = await vigilar(
      v.js(`window.__TAURI_INTERNALS__.invoke("foreman_agente", {
        request: ${JSON.stringify(`Llama UNA vez a send_command con paneId ${P} y command "echo S2-CAPATAZ". No hagas nada más y contesta «hecho».`)},
        context: "", manos: ["mcp__adeorq__send_command"], modelo: "haiku", quien: null,
      }).then((r) => "contestó: " + r, (e) => "falló: " + e)`),
    );
    const escribio = await pantalla("S2-CAPATAZ");
    const tras = await clientes();
    const sinApuntar = JSON.stringify(tras) === JSON.stringify(antes);
    ok(!!escribio && sinApuntar, `un Capataz de Claude de verdad, con Claude Code y lo de fuera en «solo mirar», escribe en la terminal ${P}: entró como de casa`, `${String(capataz.resultado.r ?? capataz.resultado.e).slice(0, 160)} · puente visto ${capataz.puentes} veces · apuntado como cliente: ${!sinApuntar}`);
    ok(capataz.conHex.length === 0, "ninguna línea de órdenes del Capataz lleva la contraseña", capataz.conHex.join(" | "));

    const id = `lab-s2-claude-${process.pid}`;
    await v.js(`window.__TAURI_INTERNALS__.invoke("conserje_cerebro", { id: ${JSON.stringify(id)}, cerebro: "haiku" }).then(() => "ok")`);
    const antesC = await clientes();
    const conserje = await vigilar(
      v.js(`window.__TAURI_INTERNALS__.invoke("conserje_enviar", { id: ${JSON.stringify(id)}, texto: "¿Qué terminales hay abiertas ahora? Míralo con get_active_panes y dime sus nombres.", estados: {} }).then((r) => "contestó: " + r.texto, (e) => "falló: " + e)`),
    );
    const texto = String(conserje.resultado.r ?? conserje.resultado.e);
    const trasC = await clientes();
    const nuevosC = Object.keys(trasC).filter((n) => (trasC[n] ?? 0) !== (antesC[n] ?? 0));
    ok(/La de Munir/i.test(texto) && conserje.puentes > 0 && nuevosC.length === 0, "un conserje de Claude de verdad mira las terminales por su puente de casa y no queda apuntado como cliente", `${texto.slice(0, 160)} · nuevos en Ajustes: ${nuevosC.join(", ") || "ninguno"}`);
    ok(conserje.conHex.length === 0, "ninguna línea de órdenes del conserje de Claude lleva la contraseña", conserje.conHex.join(" | "));
  }

  // Lo que queda escrito en disco: el MCP del Capataz (en %TEMP%, compartido con la Adeorq de Munir), los ajustes de Gemini y el rastro.
  const enDisco = [join(tmpdir(), "adeorq-capataz-mcp.json"), join(tmpdir(), "adeorq-conserje-gemini.json"), rastro].filter((f) => existsSync(f));
  const conClave = enDisco.filter((f) => HEX.test(readFileSync(f, "utf8")));
  ok(enDisco.length > 0 && conClave.length === 0, `ni el MCP del Capataz, ni los ajustes de Gemini, ni el rastro llevan 64 cifras hex (${enDisco.length} archivos mirados)`, conClave.join(", "));
} catch (e) {
  if (!/^LAB_SOLO_(C1|A1)/.test(e.message)) {
    fallos++;
    console.log(`FALLO    el laboratorio se cayó: ${e.stack || e}`);
  }
} finally {
  for (const s of sueltos) s.cerrar();
  // La clave de mentira no se queda en el Gestor de Munir, pase lo que pase.
  borrarSinAdeorq(CLAVE);
  await aislada?.cerrar();
  // Si la aislada no llegó a abrir, su carpeta (con la copia del binario) no la borra nadie.
  rmSync(join(tmpdir(), `adeorq-${nombre}-${process.pid}`), { recursive: true, force: true });
}
console.log(fallos ? `\n${fallos} fallos del laboratorio` : "\nMedido entero: lo que sigue abierto sale como AGUJERO, y lo cerrado, como OK.");
process.exit(fallos ? 1 : 0);
