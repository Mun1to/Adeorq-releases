// Actualizar con terminales abiertas, con un motor de terminales VIEJO de
// verdad: el binario de una versión abre dos terminales en su proceso aparte,
// se cierra como la cierra la tarjeta de actualizar (el motor sigue vivo), y
// el binario de la versión siguiente arranca en la MISMA casa. Hasta ahora
// solo estaba probada la función (`al_dia` en `terminales.rs`,
// `panel_creible` en `mcp.rs`); aquí hablan dos versiones de verdad.
//
// Lo que mira, cada cosa con su línea OK / FALLO / DATO:
//   · las dos terminales siguen vivas, en el MISMO motor, con su marca;
//   · la versión nueva las ve (`get_active_panes`) y `send_command` les escribe;
//   · el puente de una terminal vieja (el `--mcp` de la versión de antes, con
//     su número y sin contraseña, como el de un Claude que nació allí) se
//     reengancha y qué puede hacer;
//   · una terminal NUEVA: qué motor la lleva, si nace con contraseña y si el
//     puerto la reconoce con ella y sin ella;
//   · si el motor viejo se apaga al cerrar la última, y qué pasa con la
//     siguiente que se abra;
//   · pánicos o errores en el rastro.
//
// Los binarios, cada uno con su frontal (`custom-protocol`), compilados de un
// worktree por versión (en E1 del buzón, 2026-11-03: 0.9.238 y 0.9.239):
//   git worktree add --detach <dir> <commit>
//   CI=true pnpm install --frozen-lockfile && node node_modules/vite/bin/vite.js build
//   CARGO_TARGET_DIR=C:\ct\csp cargo build --features tauri/custom-protocol --manifest-path <dir>/src-tauri/Cargo.toml
// y se copian fuera de C:\ct antes de lanzar esto:
//   node scripts/laboratorio/motor-viejo-de-verdad.mjs <exe viejo> <exe nuevo>
//
// Va en debug: el motor corre desde el ejecutable de la app (la copia de la
// pasada) y no desde `terminales\motor\<versión>` como en la publicada; esa
// copia la cubre `la_copia_del_motor`.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const [VIEJO, NUEVO] = process.argv.slice(2);
if (!VIEJO || !NUEVO || !existsSync(VIEJO) || !existsSync(NUEVO)) {
  console.error("uso: node scripts/laboratorio/motor-viejo-de-verdad.mjs <exe viejo> <exe nuevo>");
  process.exit(2);
}
const nombre = "motor-viejo";
const PUERTO = 3400 + (process.pid % 300);
const DEPURAR = 9700 + (process.pid % 200);

let fallos = 0;
const ok = (cond, texto, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "OK   " : "FALLO"} ${texto}${detalle ? `\n        ${detalle}` : ""}`);
  return cond;
};
const dato = (texto) => console.log(`DATO  ${texto}`);
const corto = (r) => (r.error ? `error: ${r.error}` : r.texto ?? "").replace(/\s+/g, " ").slice(0, 220);
const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);

// Un `claude` de mentira delante en el PATH de la app: apunta en qué terminal
// nació y con qué contraseña, y se queda como una consola viva para que se le
// pueda escribir. No gasta nada.
const doble = join(tmpdir(), `adeorq-${nombre}-${process.pid}`, "doble");
mkdirSync(doble, { recursive: true });
// Un fichero por terminal: dos `>>` al mismo fichero a la vez, en cmd, pierden
// una línea (el segundo lo encuentra abierto y falla).
writeFileSync(join(doble, "claude.cmd"), ["@echo off", `>"%~dp0panel-%ADEORQ_PANE_ID%.txt" echo claude %ADEORQ_PANE_ID% %ADEORQ_PANE_CLAVE%`, "cmd /q /k", ""].join("\r\n"));
const apuntado = () =>
  Object.fromEntries(
    readdirSync(doble)
      .filter((f) => /^panel-\d+\.txt$/.test(f))
      .map((f) => readFileSync(join(doble, f), "utf8").trim().split(/\s+/))
      .filter((p) => p.length >= 2)
      .map(([, id, clave]) => [Number(id), clave ?? ""]),
  );

/** El puente de verdad (`<exe> --mcp`), con el entorno que se le dé: el de un
 *  agente dentro de una terminal. No lo cierra `reiniciar`: sobrevive como el
 *  de un Claude vivo. */
function puenteReal(exe, env) {
  const p = spawn(exe, ["--mcp"], { env });
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
    new Promise((resolver) => {
      const id = ++n;
      pend.set(id, resolver);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => resolver({ error: { message: "sin respuesta en 15 s" } }), 15_000);
    });
  const llamar = async (name, args) => {
    const r = await pedir("tools/call", { name, arguments: args });
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.map((c) => c.text).join("\n") ?? "" };
  };
  const herramientas = async () => ((await pedir("tools/list", {})).result?.tools ?? []).map((t) => t.name);
  return { pedir, llamar, herramientas, cerrar: () => p.kill() };
}
const presentarse = (c, quien) => c.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: quien, version: "1" } });

let aislada;
const sueltos = [];
try {
  console.log(`── 1 · la versión de antes (${VIEJO})`);
  aislada = await abrirAislada({ nombre, puertoMcp: PUERTO, depurar: DEPURAR, exe: VIEJO, aparte: true, entorno: { PATH: `${doble};${process.env.PATH}` } });
  const { demo, env } = aislada;
  const exeViejo = aislada.exe;
  const fuera = aislada.puente(null);
  // La 0.9.238 da el escalón por el nombre del cliente: con otro, «plan» y sin escribir.
  await presentarse(fuera, "claude-code");
  await hasta(async () => /Arranque de Adeorq/.test((await fuera.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  const A = numero(await fuera.llamar("open_pane", { cli: "claude", cwd: demo, name: "Vieja A", brief: "" }));
  const B = numero(await fuera.llamar("open_pane", { cli: "claude", cwd: demo, name: "Vieja B", brief: "" }));
  ok(A > 0 && B > 0, `la versión de antes abre dos terminales, la ${A} y la ${B}`);
  const nacidas = await hasta(() => (apuntado()[A] !== undefined && apuntado()[B] !== undefined ? apuntado() : null), 20_000, 500);
  ok(!!nacidas, "las dos arrancaron su «claude»", JSON.stringify(apuntado()).replace(/[0-9a-f]{64}/g, "<64 hex>"));
  dato(`contraseña con la que nacieron en la versión de antes: A=${nacidas?.[A] ? "sí" : "ninguna"}, B=${nacidas?.[B] ? "sí" : "ninguna"}`);
  // Que su consola ya esté esperando (el prompt), o el `echo` se pierde mientras arranca.
  const conPrompt = (id) => hasta(async () => /demo>\s*$/.test(((await fuera.llamar("read_pane_screen", { paneId: id })).texto ?? "").trimEnd() + " ") || /demo>$/.test(((await fuera.llamar("read_pane_screen", { paneId: id })).texto ?? "").trimEnd()), 20_000, 500);
  await conPrompt(A);
  await conPrompt(B);
  for (const [id, marca] of [[A, "MARCA-VIEJA-A"], [B, "MARCA-VIEJA-B"]]) {
    const r = await fuera.llamar("send_command", { paneId: id, command: `echo ${marca}` });
    if (r.error || !/Intro/.test(r.texto ?? "")) dato(`marca en la ${id}: ${corto(r)}`);
  }
  const historia = async (c, id, marca) => {
    let ultima = "";
    const r = await hasta(async () => {
      // La pantalla: con `cli: "claude"`, el transcript es la conversación de Claude, que el doble no tiene.
      const t = ((await c.llamar("read_pane_screen", { paneId: id })).texto ?? "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
      ultima = t;
      return t.split(/\r?\n/).some((l) => l.trim() === marca) ? true : null;
    }, 20_000, 500);
    if (!r) dato(`no sale «${marca}» en la ${id}; su pantalla: ${ultima.replace(/\s+/g, " ").slice(-300)}`);
    return r;
  };
  ok(!!(await historia(fuera, A, "MARCA-VIEJA-A")) && !!(await historia(fuera, B, "MARCA-VIEJA-B")), "cada una lleva su marca");
  const antes = aislada.motor();
  ok(antes.pid > 0 && antes.terminales >= 2, `el motor de antes (pid ${antes.pid}) lleva las dos`, `${antes.terminales} consolas colgando de él, ${antes.enLaApp} de la app`);

  // El puente de una terminal vieja: el `--mcp` de la versión de antes con su
  // número y sin contraseña, como el de un Claude que nació en ella.
  const deA = puenteReal(exeViejo, { ...env, ADEORQ_PANE_ID: String(A), ADEORQ_PANE_CLAVE: nacidas?.[A] ?? "" });
  sueltos.push(deA);
  await presentarse(deA, "claude-code");
  await deA.llamar("get_active_panes", {});
  ok(!(await deA.llamar("send_command", { paneId: B, command: "echo DESDE-A-ANTES" })).error, "antes de actualizar, el agente de la A escribe en la B");

  console.log(`\n── 2 · se cierra como al actualizar y arranca la versión nueva (${NUEVO})`);
  await aislada.reiniciar({ actualizando: true, exe: NUEVO });
  const exeNuevo = aislada.exe;
  const tras = aislada.motor();
  ok(tras.pid === antes.pid && tras.ruta.toLowerCase() === exeViejo.toLowerCase(), `la versión nueva se engancha al MISMO motor de antes (pid ${tras.pid})`, tras.ruta);
  ok(tras.terminales >= 2, `y siguen vivas las dos (${tras.terminales} consolas en él)`);
  let nuevo = aislada.puente(null);
  await presentarse(nuevo, "laboratorio");
  const lista = await hasta(async () => {
    const t = (await nuevo.llamar("get_active_panes", {})).texto || "";
    return t.includes("Vieja A") && t.includes("Vieja B") ? t : null;
  }, 30_000, 1000);
  ok(!!lista, "get_active_panes de la versión nueva las ve por su nombre", (lista ?? "").replace(/\s+/g, " ").slice(0, 220));
  ok(!!(await historia(nuevo, A, "MARCA-VIEJA-A")) && !!(await historia(nuevo, B, "MARCA-VIEJA-B")), "y con la marca de antes en su historia");
  // Nadie le ha escrito nada todavía a la versión nueva: la última línea de
  // cada una tiene que ser su prompt vacío, sin nada tecleado de más.
  await dormir(3000);
  for (const id of [A, B]) {
    const ult = ((await nuevo.llamar("read_pane_screen", { paneId: id })).texto ?? "").trimEnd().split(/\r?\n/).at(-1) ?? "";
    // El prompt puede partirse en dos renglones (la ruta es larga): lo que cuenta es que no haya nada detrás.
    ok(/>$/.test(ult) && !/echo/i.test(ult), `tras actualizar, en la ${id} nadie ha tecleado nada`, JSON.stringify(ult.slice(-120)));
  }
  const env2 = aislada.env;
  for (const [id, marca] of [[A, "TRAS-ACTUALIZAR-A"], [B, "TRAS-ACTUALIZAR-B"]]) {
    const r = await nuevo.llamar("send_command", { paneId: id, command: `echo ${marca}` });
    ok(!r.error && !!(await historia(nuevo, id, marca)), `send_command de la versión nueva escribe en la ${id}`, corto(r));
  }

  // El puente viejo de la A: se reengancha solo con la app nueva.
  const deAtras = await hasta(async () => {
    await deA.llamar("get_active_panes", {});
    const r = await deA.llamar("send_command", { paneId: B, command: "echo DESDE-A-TRAS" });
    return r.error ? null : r;
  }, 30_000, 1000);
  ok(!!deAtras && !!(await historia(nuevo, B, "DESDE-A-TRAS")), "el puente viejo de la A se reengancha y sigue escribiendo en la B (va con las reglas de antes)", corto(deAtras ?? { error: "sin respuesta" }));
  dato(`herramientas que ve el agente de la A tras actualizar: ${(await deA.herramientas()).length}`);
  // Y un impostor: sin ser la A, diciendo que lo es (lo que S3 cierra con la contraseña).
  const impostorA = puenteReal(exeNuevo, { ...env2, ADEORQ_PANE_ID: String(A) });
  sueltos.push(impostorA);
  await presentarse(impostorA, "claude-code");
  await impostorA.llamar("get_active_panes", {});
  const rImp = await impostorA.llamar("send_command", { paneId: B, command: "echo IMPOSTOR-A" });
  dato(`un programa que dice ser la A sin contraseña: ${rImp.error ? "se le niega" : "escribe"} (esperado mientras la A viva: es de antes)`);

  console.log("\n── 3 · una terminal NUEVA con el motor de antes vivo");
  const C = numero(await nuevo.llamar("open_pane", { cli: "claude", cwd: demo, name: "Nueva C", brief: "" }));
  ok(C > 0 && C !== A && C !== B, `la versión nueva abre la ${C}`);
  const claveC = await hasta(() => (apuntado()[C] !== undefined ? apuntado()[C] : null), 20_000, 500);
  const conMotor = aislada.motor();
  dato(`la ${C} la lleva el motor ${conMotor.pid === antes.pid ? "DE ANTES" : `nuevo (pid ${conMotor.pid})`} · ${conMotor.terminales} consolas en él`);
  // La app la manda también en el entorno, que el motor de antes sí aplica.
  ok(/^[0-9a-f]{64}$/.test(claveC ?? ""), `la ${C} nace CON contraseña aunque la lleve el motor de antes`);
  const deC = puenteReal(exeNuevo, { ...env2, ADEORQ_PANE_ID: String(C), ADEORQ_PANE_CLAVE: claveC ?? "" });
  sueltos.push(deC);
  await presentarse(deC, "claude-code");
  await deC.llamar("get_active_panes", {});
  const rC = await deC.llamar("send_command", { paneId: A, command: "echo DESDE-C" });
  ok(!rC.error && !!(await historia(nuevo, A, "DESDE-C")), `el agente de la ${C}, con lo que trae su entorno, escribe en la A`, corto(rC));
  // Lo de fuera, a su escalón de fábrica (mirar y abrir): si no, el impostor
  // escribiría igual por ser «fuera de Adeorq» con manos, y no se mediría nada.
  const fueraA = (nivel) => aislada.v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: ${JSON.stringify(nivel)} }).then(() => "ok")`);
  await fueraA(null);
  const impostorC =puenteReal(exeNuevo, { ...env2, ADEORQ_PANE_ID: String(C) });
  sueltos.push(impostorC);
  await presentarse(impostorC, "claude-code");
  await impostorC.llamar("get_active_panes", {});
  const rImpC = await impostorC.llamar("send_command", { paneId: A, command: "echo IMPOSTOR-C" });
  ok(!!rImpC.error, `un programa que dice ser la ${C} sin su contraseña no escribe`, corto(rImpC));
  // Y la A, nacida en la versión de antes, sigue «de antes»: quien diga ser ella escribe (aceptado).
  const impostorA2 = puenteReal(exeNuevo, { ...env2, ADEORQ_PANE_ID: String(A) });
  sueltos.push(impostorA2);
  await presentarse(impostorA2, "claude-code");
  await impostorA2.llamar("get_active_panes", {});
  dato(`con «fuera» en su escalón, quien dice ser la A (de antes) sin contraseña ${(await impostorA2.llamar("send_command", { paneId: B, command: "echo IMPOSTOR-A2" })).error ? "no escribe" : "escribe"}`);

  // Un segundo reinicio (Munir cierra y abre otra vez, con el motor de antes
  // aún vivo): la app nueva recoge la C de `Listar`, que en ese motor no trae
  // contraseña, y va «de antes» hasta que se cierre. Aceptado (2026-11-03).
  await aislada.reiniciar({ actualizando: true });
  const nuevo2 = aislada.puente(null);
  await presentarse(nuevo2, "laboratorio");
  await hasta(async () => ((await nuevo2.llamar("get_active_panes", {})).texto ?? "").includes("Nueva C"), 30_000, 1000);
  const impostorC2 = puenteReal(aislada.exe, { ...aislada.env, ADEORQ_PANE_ID: String(C) });
  sueltos.push(impostorC2);
  await presentarse(impostorC2, "claude-code");
  await impostorC2.llamar("get_active_panes", {});
  const rImpC2 = await impostorC2.llamar("send_command", { paneId: A, command: "echo IMPOSTOR-C2" });
  dato(`tras un segundo reinicio, quien dice ser la ${C} sin contraseña ${rImpC2.error ? "no escribe" : "escribe (va «de antes», aceptado)"}`);
  nuevo = nuevo2;
  await fueraA("auto");

  console.log("\n── 4 · se cierran las tres");
  const RASTRO = "Consola de prueba del laboratorio del motor viejo; no hizo nada y no queda nada pendiente.";
  for (const id of [A, B, C]) {
    const r = await nuevo.llamar("close_pane", { paneId: id, rastro: RASTRO });
    if (r.error) dato(`close_pane ${id}: ${corto(r)}`);
  }
  const vacio = await hasta(() => (aislada.motor().terminales === 0 ? true : null), 20_000, 500);
  ok(!!vacio, "cerradas las tres, ya no cuelga ninguna consola del motor");
  await dormir(3000);
  const despues = aislada.motor();
  dato(`el motor de antes ${despues.pid === antes.pid ? "SIGUE vivo y enganchado" : "se ha apagado"} tras cerrar la última`);
  const D = numero(await nuevo.llamar("open_pane", { cli: "claude", cwd: demo, name: "Nueva D", brief: "" }));
  const claveD = await hasta(() => (apuntado()[D] !== undefined ? apuntado()[D] : null), 20_000, 500);
  const conD = aislada.motor();
  dato(`la ${D} la lleva el motor ${conD.pid === antes.pid ? "DE ANTES" : conD.pid ? `nuevo (pid ${conD.pid}, ${conD.ruta})` : "¿ninguno?"} y nace ${/^[0-9a-f]{64}$/.test(claveD ?? "") ? "CON" : "SIN"} contraseña`);

  console.log("\n── 5 · el rastro");
  const rastro = join(aislada.base, "datos", "Adeorq", "rastro.log");
  const texto = existsSync(rastro) ? readFileSync(rastro, "utf8") : "";
  const malas = texto.split(/\r?\n/).filter((l) => /panic|pánico|error|fall[óo]/i.test(l));
  ok(!/panic|pánico/i.test(texto), `ningún pánico en el rastro (${texto.split(/\r?\n/).length} líneas)`);
  for (const l of malas.slice(0, 12)) dato(`rastro: ${l.slice(0, 200)}`);
  for (const l of texto.split(/\r?\n/).filter((l) => /terminales/.test(l)).slice(-8)) dato(`rastro: ${l.slice(0, 200)}`);
} catch (e) {
  fallos++;
  console.log(`FALLO el laboratorio se cayó: ${e.stack ?? e}`);
} finally {
  for (const s of sueltos) s.cerrar();
  await aislada?.cerrar();
}
console.log(fallos ? `\n${fallos} FALLO(S).` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
