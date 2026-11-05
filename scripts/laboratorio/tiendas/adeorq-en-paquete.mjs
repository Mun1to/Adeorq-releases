// Las pruebas con la ADEORQ DE VERDAD (T9 de `docs/contexto/tiendas.md`), desde fuera.
//
//   node adeorq-en-paquete.mjs <modo> <ejecutable> <carpeta de salida>
//
// `modo`:
//   normal      el `adeorq.exe` compilado, lanzado como siempre (sin paquete): es la instalacion de
//               siempre, y lo que se mide es que NADA cambia (datos en %LOCALAPPDATA%\Adeorq,
//               actualizador presente, `esta_empaquetada` en falso).
//   empaquetada el mismo ejecutable instalado en un paquete MSIX y lanzado por su alias: datos en
//               %USERPROFILE%\.adeorq, sin actualizador, tarea de arranque de Windows, y las
//               herramientas de Adeorq llegan a un cliente de fuera POR EL ALIAS.
//
// `medir-adeorq.ps1` lo lanza dos veces, con la app ya abierta y con su ventana depurable en el
// puerto 9333. Cada medida lleva su veredicto (ESPERADO, SORPRESA o MEDIDO) como en `medir.ps1`;
// con una SORPRESA o un ERROR sale con 1. Solo corre en un runner: abre la app y, en el modo
// `empaquetada`, enciende y apaga la tarea de arranque de Windows de esa maquina.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [modo, exe, salida] = process.argv.slice(2);
if (!["normal", "empaquetada"].includes(modo) || !exe || !salida) {
  console.error("Uso: node adeorq-en-paquete.mjs <normal|empaquetada> <ejecutable> <carpeta de salida>");
  process.exit(2);
}
mkdirSync(salida, { recursive: true });
const CASA = process.env.USERPROFILE;
const LOCAL = process.env.LOCALAPPDATA;
const DEPURAR = 9333;
const PUERTO_MCP = 3012;
const etiqueta = modo === "normal" ? "T9.normal" : "T9.paquete";
// Donde Adeorq guarda SUS datos en cada modo (`dir_datos`).
const DATOS = modo === "normal" ? join(LOCAL, "Adeorq") : join(CASA, ".adeorq");

const medidas = [];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms, cada = 400) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await dormir(cada);
  }
  return null;
}
function medida(id, que, obtenido, esperado = null, nota = "") {
  let veredicto = "MEDIDO";
  if (esperado !== null) veredicto = String(obtenido) === String(esperado) ? "ESPERADO" : "SORPRESA";
  medidas.push({ id, que, obtenido: String(obtenido), esperado: esperado === null ? "" : String(esperado), veredicto, nota });
  const marca = { ESPERADO: "OK      ", SORPRESA: "SORPRESA", MEDIDO: "MEDIDO  ", ERROR: "ERROR   " }[veredicto];
  console.log(`${marca} ${id.padEnd(22)} ${que} = ${obtenido}${nota ? `   (${nota})` : ""}`);
}
async function prueba(id, cuerpo) {
  try {
    await cuerpo();
  } catch (e) {
    medidas.push({ id, que: "el guion fallo", obtenido: String(e?.message ?? e), esperado: "", veredicto: "ERROR", nota: "" });
    console.log(`ERROR    ${id}: ${e?.message ?? e}`);
  }
}

// La ventana, por el protocolo de depuracion de su WebView2.
async function ventana() {
  const destino = await hasta(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${DEPURAR}/json/list`)).json();
    return lista.find((t) => t.type === "page" && /\/\/tauri\.localhost\//.test(t.url));
  }, 45_000);
  if (!destino) throw new Error(`la ventana no abrio su puerto de depuracion (${DEPURAR})`);
  const ws = new WebSocket(destino.webSocketDebuggerUrl);
  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error("no conecta con la ventana"));
  });
  let n = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    if (m.error) p.mal(new Error(m.error.message));
    else p.ok(m.result);
  };
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      const id = ++n;
      pendientes.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const js = async (expr) => {
    const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { enviar, js, cerrar: () => ws.close() };
}

// Un comando de Tauri, con su promesa convertida en dato DENTRO de la pagina (`Runtime.evaluate` no
// lleva el motivo de un rechazo).
const invocar = (v, nombre, args = {}) =>
  v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(nombre)}, ${JSON.stringify(args)}).then((r) => ({ ok: r }), (e) => ({ error: String(e) }))`);

async function foto(v, archivo, rect = null) {
  const params = { format: "png", fromSurface: true };
  if (rect) params.clip = { ...rect, scale: 1 };
  const r = await v.enviar("Page.captureScreenshot", params);
  writeFileSync(join(salida, archivo), Buffer.from(r.data, "base64"));
}

// `adeorq preguntar <herramienta> k=v ...` desde fuera, por la ruta que se le da (el alias en el paquete).
function preguntar(...args) {
  return new Promise((ok) => {
    const p = spawn(exe, ["preguntar", ...args], { env: { ...process.env, ADEORQ_MCP_PUERTO: String(PUERTO_MCP) }, windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => p.kill(), 60_000);
    p.on("error", (e) => ok({ codigo: null, salida: "", error: String(e) }));
    p.on("close", (codigo) => {
      clearTimeout(t);
      ok({ codigo, salida: out.trim(), error: err.trim() });
    });
  });
}

const rastro = () => (existsSync(join(DATOS, "rastro.log")) ? readFileSync(join(DATOS, "rastro.log"), "utf8") : "");
let v;
try {
  console.log(`== ${etiqueta}: ${exe}`);
  v = await ventana();
  await v.enviar("Page.enable");
  // Sin la bienvenida: la app entera montada, que es donde vive el oyente del MCP (`aislada.mjs`).
  await v.js(`localStorage.setItem("adeorq-lang", "es"); localStorage.setItem("adeorq-perfil", ${JSON.stringify(
    JSON.stringify({ nombre: "Prueba", raiz: join(CASA, "proyectos-ci"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
  )}); "ok"`);
  await v.enviar("Page.reload");
  await dormir(2500);
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 30_000);
  const escucha = await hasta(async () => {
    const t = await new Promise((ok) => {
      const s = spawn("powershell", ["-NoProfile", "-Command", `if (Get-NetTCPConnection -LocalPort ${PUERTO_MCP} -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`]);
      s.on("close", (c) => ok(c === 0));
    });
    return t;
  }, 40_000, 800);
  medida(`${etiqueta}.arranca`, "la app abre su ventana y el puerto del MCP", Boolean(escucha), true);
  await dormir(2000);

  await prueba(`${etiqueta}.mundo`, async () => {
    const e = await invocar(v, "esta_empaquetada");
    medida(`${etiqueta}.esta_empaquetada`, "`esta_empaquetada` dice", e.ok ?? e.error, modo === "empaquetada");
    const hecho = await hasta(() => existsSync(DATOS) && readdirSync(DATOS).length > 0, 20_000);
    medida(`${etiqueta}.datos`, `los datos nacen en ${DATOS}`, Boolean(hecho), true, readdirSync(DATOS).slice(0, 8).join(", "));
    const dice = rastro().includes("corre desde el paquete de la Microsoft Store");
    medida(`${etiqueta}.rastro`, "el rastro dice que corre desde el paquete", dice, modo === "empaquetada");
    const otro = modo === "normal" ? join(CASA, ".adeorq") : null;
    if (otro) medida(`${etiqueta}.sin_carpeta_de_la_tienda`, "no nace %USERPROFILE%\\.adeorq", existsSync(otro), false);
  });

  await prueba(`${etiqueta}.actualizador`, async () => {
    // Con el plugin registrado, `check` contesta (o falla por la red); sin el, el IPC dice que no existe.
    const r = await invocar(v, "plugin:updater|check");
    const noExiste = Boolean(r.error && /not found|no existe|unknown|plugin/i.test(r.error) && !/network|dns|request|error sending|http/i.test(r.error));
    medida(`${etiqueta}.sin_actualizador`, "el plugin del actualizador NO esta registrado", noExiste, modo === "empaquetada", JSON.stringify(r).slice(0, 160));
  });

  await prueba(`${etiqueta}.ajustes`, async () => {
    await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
    await dormir(1500);
    let tarjeta = null;
    const cuantas = await v.js(`document.querySelectorAll(".set-tab").length`);
    for (let i = 0; i < cuantas && !tarjeta; i++) {
      await v.js(`(() => { const b = document.querySelectorAll(".set-tab")[${i}]; if (!b.hasAttribute("data-on")) b.click(); return true; })()`);
      await dormir(600);
      tarjeta = await v.js(`(() => {
        const h2 = [...document.querySelectorAll(".panel.settings h2")].find((e) => e.textContent.trim() === "Actualizaciones");
        if (!h2) return null;
        const t = h2.closest("section"); t.scrollIntoView({ block: "center" });
        const r = t.getBoundingClientRect();
        return { texto: t.textContent.replace(/\\s+/g, " ").trim(), botones: [...t.querySelectorAll("button")].map((b) => b.textContent.trim()),
                 rect: { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 } };
      })()`);
    }
    if (!tarjeta) throw new Error("no encontre la tarjeta de Actualizaciones en Ajustes");
    await dormir(400);
    await foto(v, `${etiqueta}-ajustes-actualizaciones.png`, tarjeta.rect);
    medida(`${etiqueta}.tarjeta_tienda`, "la tarjeta habla de la Microsoft Store", tarjeta.texto.includes("Microsoft Store"), modo === "empaquetada", tarjeta.texto.slice(0, 120));
    medida(`${etiqueta}.boton_buscar`, "la tarjeta trae «Buscar actualizaciones»", tarjeta.botones.includes("Buscar actualizaciones"), modo === "normal");
    await foto(v, `${etiqueta}-ventana.png`);
  });

  if (modo === "empaquetada") {
    await prueba("T9.paquete.arranque", async () => {
      // El arranque con Windows por la tarea del manifiesto, con el codigo REAL de `autostart.rs`.
      const antes = await invocar(v, "autostart_get");
      medida("T9.paquete.arranque_nace", "`autostart_get` al principio", antes.ok ?? antes.error, false);
      const puesto = await invocar(v, "autostart_set", { on: true });
      medida("T9.paquete.arranque_encender", "`autostart_set(true)`", puesto.error ?? "ok", null);
      const tras = await invocar(v, "autostart_get");
      medida("T9.paquete.arranque_tras", "`autostart_get` tras encender", tras.ok ?? tras.error, null);
      const apaga = await invocar(v, "autostart_set", { on: false });
      medida("T9.paquete.arranque_apagar", "`autostart_set(false)`", apaga.error ?? "ok", "ok");
      const fin = await invocar(v, "autostart_get");
      medida("T9.paquete.arranque_final", "`autostart_get` tras apagar", fin.ok ?? fin.error, false);
    });
    await prueba("T9.paquete.motor", async () => {
      const m = await invocar(v, "terminales_aparte_poner", { encender: true });
      medida("T9.paquete.motor_aparte", "encender las terminales aparte", /Microsoft Store/.test(m.error ?? "") ? "rechazado" : "se dejo", "rechazado");
      const e = await invocar(v, "terminales_aparte");
      medida("T9.paquete.motor_estado", "`terminales_aparte`", e.ok ?? e.error, false);
    });
  }

  // Lo de fuera llega a las herramientas de Adeorq: en el paquete, POR EL ALIAS.
  await prueba(`${etiqueta}.preguntar`, async () => {
    const r = await preguntar("get_projects");
    medida(`${etiqueta}.preguntar_proyectos`, "`adeorq preguntar get_projects` desde fuera", r.codigo === 0 && r.salida.length > 0, true, `codigo ${r.codigo}: ${(r.salida || r.error).slice(0, 140).replace(/\s+/g, " ")}`);
  });

  // Una terminal de verdad (ConPTY y el corral) dentro del paquete, y su PATH.
  await prueba(`${etiqueta}.terminal`, async () => {
    const abre = await preguntar("open_pane", "cli=shell", "name=T9", `cwd=${CASA}`);
    const id = (abre.salida.match(/pane\D{0,12}(\d+)/i) ?? abre.salida.match(/(\d+)/))?.[1];
    medida(`${etiqueta}.abre_terminal`, "`open_pane cli=shell` desde fuera", Boolean(id), true, `codigo ${abre.codigo}: ${(abre.salida || abre.error).slice(0, 160).replace(/\s+/g, " ")}`);
    if (!id) return;
    await dormir(4000);
    const manda = await preguntar("send_command", `paneId=${id}`, "command=where.exe adeorq");
    medida(`${etiqueta}.send_command`, "`send_command` a la terminal", manda.codigo === 0, true, (manda.salida || manda.error).slice(0, 140).replace(/\s+/g, " "));
    // El primer PowerShell de una maquina nueva tarda: se espera a que CONTESTE (una ruta con `adeorq.exe`, o el
    // «INFO:» de `where.exe` cuando no encuentra nada), no un rato fijo (la pasada 7 leyo la pantalla antes).
    let pantalla = { salida: "" };
    await hasta(async () => {
      pantalla = await preguntar("read_pane_screen", `paneId=${id}`);
      return /adeorq\.exe/i.test(pantalla.salida) || /INFO:/i.test(pantalla.salida);
    }, 45_000, 2000);
    const encuentra = /adeorq\.exe/i.test(pantalla.salida);
    medida(`${etiqueta}.adeorq_en_el_path`, "`where.exe adeorq` lo encuentra dentro de la terminal", encuentra, true, pantalla.salida.split("\n").filter((l) => /adeorq|WindowsApps|error|not/i.test(l)).slice(0, 4).join(" | ").slice(0, 220));
    const donde = pantalla.salida.match(/[A-Za-z]:\\[^\r\n]*adeorq\.exe/i)?.[0] ?? "";
    // Normal: la carpeta de la COPIA del motor de terminales (`terminales\motor\<version>`), porque en la Adeorq
    // publicada las terminales viven en ese proceso aparte y su `current_exe` es la copia: lo de siempre (la
    // pasada 8 esperaba la carpeta del build y era la expectativa la que estaba mal). Paquete: el alias, no la
    // carpeta del paquete.
    const buena = modo === "empaquetada" ? /\\Microsoft\\WindowsApps\\adeorq\.exe$/i.test(donde) : /\\terminales\\motor\\[^\\]+\\adeorq\.exe$/i.test(donde);
    medida(`${etiqueta}.adeorq_donde`, modo === "empaquetada" ? "y es el alias de WindowsApps" : "y es la copia del motor de terminales (lo de siempre)", buena, true, donde);
    await foto(v, `${etiqueta}-terminal.png`);
  });
} catch (e) {
  medidas.push({ id: `${etiqueta}.guion`, que: "el guion fallo", obtenido: String(e?.message ?? e), esperado: "", veredicto: "ERROR", nota: "" });
  console.log(`ERROR    ${etiqueta}: ${e?.message ?? e}`);
} finally {
  try {
    v?.cerrar();
  } catch {}
}

const md = ["| Prueba | Que | Obtenido | Esperado | Veredicto |", "|---|---|---|---|---|"];
for (const m of medidas) md.push(`| ${m.id} | ${m.que} | ${m.obtenido.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 140)} | ${m.esperado} | **${m.veredicto}** |`);
writeFileSync(join(salida, `resumen-${modo}.md`), md.join("\n") + "\n");
writeFileSync(join(salida, `resultados-${modo}.json`), JSON.stringify(medidas, null, 2));
if (rastro()) writeFileSync(join(salida, `rastro-${modo}.log`), rastro());
const malas = medidas.filter((m) => m.veredicto === "SORPRESA" || m.veredicto === "ERROR");
console.log(`\n${medidas.length} medidas, ${malas.length} sorpresas o errores.`);
for (const m of malas) console.log(`  ${m.veredicto} ${m.id}: ${m.que} -> ${m.obtenido}`);
process.exit(malas.length ? 1 : 0);
