// Cambiar de modelo solo en esa sesión, con un Claude Code de verdad dentro de una
// Adeorq aislada y sin gastar nada.
//
// El fallo (bandeja de la Agenda): `/model sonnet` tecleado cambia la sesión Y
// guarda «sonnet» como el modelo de todas las nuevas (Claude Code lo dice:
// «Set model to … and saved as your default for new sessions»). Un toque en
// «Sonnet» en el móvil, o el router repartiendo, le cambiaba a Munir el modelo de
// fábrica. `teclearOrden` ahora lleva el `/model <alias>` por el selector
// (`selectorDeModelo.ts`: `/model`, cursor a la fila, `s`). Esto lo mide:
//   1. el control, de la forma de antes: `/model opus` con Intro cambia el `model`
//      de los ajustes (se ve fallar);
//   2. la forma de ahora, por la función de la propia app (`teclearOrden`, importada
//      de la página): la sesión pasa a Opus y el `model` de los ajustes sigue como
//      estaba; y a Haiku (dos filas hacia el otro lado) igual.
//
//   3. con un turno en marcha, el cambio no lo corta; con un borrador en la caja, ni
//      una tecla (el Intro se lo mandaba al modelo: «mi borrador a medias/model»); y
//      `/model` + `/effort` + mensaje van uno detrás de otro (a tiempo fijo, el Intro de
//      `/effort` caía en el selector abierto y guardaba el modelo de fábrica).
//
// Hermético: Claude Code corre con una carpeta de configuración PROPIA
// (`CLAUDE_CONFIG_DIR`), una clave de API de mentira ya «aprobada» y una API de
// mentira en este proceso (`ANTHROPIC_BASE_URL`), así que no toca los ajustes ni las
// credenciales de ninguna cuenta y ningún mensaje sale de la máquina (no gasta
// nada). Se cierra por las buenas, con dos Ctrl+C.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/modelo-de-sesion-de-verdad.mjs [exe]
//
// Con el MCP en el 39496: no toca la Adeorq de Munir. Sale con 1 si algo falla.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const TRABAJO = join(tmpdir(), `adeorq-modelo-sesion-${process.pid}`);
const CONFIG = join(TRABAJO, "claude");
const CARPETA = join(TRABAJO, "proyecto");
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "OK  " : "MAL "} ${que}`);
  if (!ok) fallos.push(que);
};
const modeloGuardado = () => {
  try {
    return JSON.parse(readFileSync(join(CONFIG, "settings.json"), "utf8")).model ?? null;
  } catch {
    return null;
  }
};
const ajustes = (model) => writeFileSync(join(CONFIG, "settings.json"), JSON.stringify({ model }));

// La API de mentira: contesta con un error, salvo que se le pida colgar el turno.
const MARCA = /hola de prueba|mi borrador|sube esto/;
const api = { colgar: false, colgados: new Set(), cortados: 0, mensajes: [] };
const servidor = http.createServer((pet, res) => {
  let cuerpo = "";
  pet.on("data", (d) => (cuerpo += d));
  pet.on("end", () => {
    const error = () => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "laboratorio" } }));
    };
    if (!pet.url.includes("/v1/messages")) return error();
    let texto = "";
    try {
      const j = JSON.parse(cuerpo);
      const u = (j.messages ?? []).filter((m) => m.role === "user").at(-1);
      texto = typeof u?.content === "string" ? u.content : (u?.content ?? []).map((c) => c.text ?? "").join(" ");
    } catch {}
    // El título de la conversación también lleva el texto: no es el turno.
    if (!MARCA.test(texto) || /Write the title/.test(texto)) return error();
    api.mensajes.push(texto.slice(-120));
    if (!api.colgar) return error();
    const e = { soltar: error, hecho: false };
    api.colgados.add(e);
    res.on("close", () => {
      if (!e.hecho) api.cortados++;
      api.colgados.delete(e);
    });
  });
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const soltarColgados = () => {
  for (const e of api.colgados) {
    e.hecho = true;
    e.soltar();
  }
};

mkdirSync(CONFIG, { recursive: true });
mkdirSync(CARPETA, { recursive: true });
// Ya pasado el asistente de primera vez, la clave de mentira aprobada y la carpeta de confianza.
writeFileSync(
  join(CONFIG, ".claude.json"),
  JSON.stringify({
    hasCompletedOnboarding: true,
    theme: "dark",
    customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] },
    projects: { [CARPETA.replace(/\\/g, "/")]: { hasTrustDialogAccepted: true, allowedTools: [] }, [CARPETA]: { hasTrustDialogAccepted: true, allowedTools: [] } },
  }),
);
ajustes("sonnet");

const a = await abrirAislada({ nombre: "modelo-sesion", puertoMcp: 39496, depurar: 9496, exe: process.argv[2] || undefined });
const agente = a.puente(null);
const CASA = homedir();
const paneles = [];
const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
const teclear = (id, data) => a.v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);
/** `teclearOrden` de la propia app, por la página (el mismo módulo que usa el router). */
const orden = (id, linea) =>
  a.v.js(`import("/src/lib/pty.ts").then((m) => m.teclearOrden(${id}, ${JSON.stringify(linea)})).then(() => "ok", (e) => "ERROR: " + (e && e.message || e))`);

/** Abre un panel y arranca un Claude Code de verdad en él, hasta ver su caja. */
async function claudeNuevo(nombre) {
  const r = await agente.llamar("open_pane", { cli: "shell", cwd: CARPETA, name: nombre, brief: "" });
  const id = Number(/^Terminal (\d+) abierta/.exec(r.texto ?? "")?.[1]);
  if (!id) throw new Error(`no abrió el panel: ${r.texto ?? r.error}`);
  paneles.push(id);
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${id}"] .xterm-helper-textarea')`), 30_000, 500);
  await dormir(2500);
  await teclear(id, `$env:USERPROFILE='${CASA}'; $env:HOME='${CASA}'; $env:CLAUDE_CONFIG_DIR='${CONFIG}'; $env:ANTHROPIC_API_KEY='${CLAVE}'; $env:ANTHROPIC_BASE_URL='http://127.0.0.1:${servidor.address().port}'; claude --strict-mcp-config\r`);
  const caja = await hasta(async () => {
    const p = await pantalla(id);
    return /for shortcuts|to cycle\)|Try "/i.test(p) && !/trust this folder/.test(p) ? p : null;
  }, 90_000, 1000);
  if (!caja) throw new Error(`Claude Code no llegó a su caja:\n${await pantalla(id)}`);
  await dormir(1500);
  return id;
}
/** La línea de arriba de Claude Code: el modelo con el que va ESTA sesión. */
const modeloDeLaSesion = async (id) => /(Opus|Sonnet|Haiku|Fable)\s[\d.]+/.exec((await pantalla(id)).split("\n").slice(0, 6).join("\n"))?.[0] ?? "(no se ve)";

try {
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });

  // 1. Lo de antes.
  const viejo = await claudeNuevo("Claude, a la antigua");
  console.log(`  arranca con: ${await modeloDeLaSesion(viejo)} · ajustes: model=${modeloGuardado()}`);
  await teclear(viejo, "/model opus");
  await dormir(150);
  await teclear(viejo, "\r");
  await hasta(() => modeloGuardado() !== "sonnet", 8000, 300);
  console.log(`  tras «/model opus» + Intro: ${await modeloDeLaSesion(viejo)} · ajustes: model=${modeloGuardado()}`);
  debe(modeloGuardado() === "opus", "CONTROL: de la forma de antes, `/model opus` cambia el modelo de fábrica de los ajustes (el fallo)");
  await teclear(viejo, "\x03");
  await dormir(600);
  await teclear(viejo, "\x03");
  await dormir(2500);
  ajustes("sonnet");

  // 2. Lo de ahora.
  const nuevo = await claudeNuevo("Claude, por el selector");
  console.log(`  arranca con: ${await modeloDeLaSesion(nuevo)} · ajustes: model=${modeloGuardado()}`);
  const r1 = await orden(nuevo, "/model opus");
  await dormir(1500);
  const tras1 = await modeloDeLaSesion(nuevo);
  console.log(`  tras teclearOrden(«/model opus»): ${r1} · ${tras1} · ajustes: model=${modeloGuardado()}`);
  if (r1 !== "ok") console.log(`  pantalla:\n${(await pantalla(nuevo)).split("\n").filter((l) => l.trim()).slice(-18).join("\n")}`);
  debe(r1 === "ok", "teclearOrden vuelve sin error");
  debe(/^Opus/.test(tras1), `la sesión pasa a Opus (arriba dice «${tras1}»)`);
  debe(modeloGuardado() === "sonnet", "y el modelo de fábrica de los ajustes sigue siendo sonnet");
  debe(!/saved as your default/.test(await pantalla(nuevo)), "y Claude Code no dice que lo haya guardado como el de siempre");
  debe(!/Select model/.test(await pantalla(nuevo)), "el selector queda cerrado y la caja vacía");

  const r2 = await orden(nuevo, "/model haiku");
  await dormir(1500);
  const tras2 = await modeloDeLaSesion(nuevo);
  console.log(`  tras teclearOrden(«/model haiku»): ${r2} · ${tras2} · ajustes: model=${modeloGuardado()}`);
  debe(r2 === "ok" && /^Haiku/.test(tras2), `ahora a Haiku, hacia el otro lado (arriba dice «${tras2}»)`);
  debe(modeloGuardado() === "sonnet", "y los ajustes siguen igual");

  const r3 = await orden(nuevo, "/model gpt");
  console.log(`  tras teclearOrden(«/model gpt»): ${r3}`);
  debe(/ERROR/.test(r3) && /gpt/.test(r3), "un modelo que no existe da un error que lo dice");
  await dormir(1000);
  const tras3 = await pantalla(nuevo);
  const sigue = !/Select model/.test(tras3) && /^Haiku/.test(await modeloDeLaSesion(nuevo));
  if (!sigue) console.log(`  pantalla:\n${tras3.split("\n").filter((l) => l.trim()).slice(0, 20).join("\n")}`);
  debe(sigue, "y no deja el selector abierto ni cambia nada");
  for (const id of [nuevo]) {
    await teclear(id, "\x03");
    await dormir(600);
    await teclear(id, "\x03");
    await dormir(2500);
  }

  // 3. Lo que hay alrededor de un Claude vivo.
  ajustes("sonnet");
  const conTurno = await claudeNuevo("Claude, trabajando");
  api.colgar = true;
  await teclear(conTurno, "hola de prueba");
  await dormir(200);
  await teclear(conTurno, "\r");
  debe(!!(await hasta(async () => /to interrupt/.test(await pantalla(conTurno)), 20_000, 300)), "un turno en marcha (la API de mentira no contesta)");
  const r4 = await orden(conTurno, "/model opus");
  await dormir(800);
  const conTurnoP = await pantalla(conTurno);
  console.log(`  con el turno en marcha: ${r4} · ${await modeloDeLaSesion(conTurno)} · ajustes: model=${modeloGuardado()}`);
  debe(/to interrupt/.test(conTurnoP) && api.cortados === 0, "cambiar de modelo no corta el turno");
  debe(!/Select model/.test(conTurnoP), "y no deja el selector abierto");
  debe(modeloGuardado() === "sonnet", "y el modelo de fábrica sigue igual");
  api.colgar = false;
  soltarColgados();
  await dormir(1500);

  ajustes("sonnet");
  const conBorrador = await claudeNuevo("Claude, con un borrador");
  await teclear(conBorrador, "mi borrador a medias");
  await dormir(500);
  const antes = api.mensajes.length;
  const r5 = await orden(conBorrador, "/model opus");
  await dormir(1500);
  const conBorradorP = await pantalla(conBorrador);
  console.log(`  con un borrador: ${r5}`);
  debe(/ERROR/.test(r5), "con un borrador en la caja, un error que lo dice");
  debe(api.mensajes.length === antes, `y el borrador NO se envía al modelo (enviados: ${JSON.stringify(api.mensajes.slice(antes))})`);
  debe(/^❯\s+mi borrador a medias\s*$/m.test(conBorradorP) && !/Select model/.test(conBorradorP), "y sigue en la caja como estaba");

  ajustes("sonnet");
  // Es la cuarta de la cuadrícula: el selector no le cabe entero, y en la baja se ve
  // solo una parte de sus filas (`Opus` queda por encima de lo que se ve al abrir).
  const enFila = await claudeNuevo("Claude, en fila");
  const sigue2 = await a.v.js(`import("/src/lib/pty.ts").then(async (m) => {
    const sigue = await m.teclearOrdenes(${enFila}, ["/model opus", "/effort high"]);
    await new Promise((r) => setTimeout(r, 500));
    await m.sendPty(${enFila}, "sube esto sin prisas");
    return sigue;
  })`);
  await dormir(2500);
  const enFilaP = await pantalla(enFila);
  console.log(`  en fila: ${sigue2} · ${await modeloDeLaSesion(enFila)} · ajustes: ${readFileSync(join(CONFIG, "settings.json"), "utf8").replace(/\s+/g, " ")}`);
  debe(sigue2 === true && /^Opus/.test(await modeloDeLaSesion(enFila)), "/model y /effort seguidos: la sesión pasa a Opus");
  debe(modeloGuardado() === "sonnet", "y el Intro de /effort no guarda el modelo como el de fábrica");
  debe(!/modelSettings|effortLevel/.test(readFileSync(join(CONFIG, "settings.json"), "utf8")), "ni el esfuerzo (`/effort high` escrito lo guarda en `modelSettings`)");
  debe(/this session only with high effort/.test(enFilaP.replace(/\s+/g, " ")), "Claude Code dice que el esfuerzo es solo de esta sesión");
  debe(!/saved as your default/.test(enFilaP), "y no dice que haya guardado nada");
  debe(api.mensajes.some((m) => m.endsWith("sube esto sin prisas")), "y el mensaje de detrás llega entero al modelo");
} catch (e) {
  debe(false, `se cayó: ${e.message}`);
} finally {
  soltarColgados();
  await a.cerrar();
  servidor.close();
  rmSync(TRABAJO, { recursive: true, force: true });
}
console.log(fallos.length ? `\n${fallos.length} fallos` : "\nTodo bien.");
process.exit(fallos.length ? 1 : 0);
