// «Conectar tu Claude Code», de verdad (E21, decisión B1 de Munir, 2026-11-04).
//
//   cargo build --manifest-path src-tauri/Cargo.toml     (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                              (el binario de desarrollo carga de :1420)
//   node scripts/laboratorio/claude-conexion-de-verdad.mjs [exe] [--fotos <carpeta>]
//
// Una Adeorq aislada (casa, datos y navegador de usar y tirar, su MCP en otro puerto) y
// el Claude Code de verdad contra ella, sin gastar nada: una clave falsa y un proxy muerto
// en su entorno, y su casa es la de la prueba, nunca el `~/.claude.json` de nadie.
//
// Lo que mide, con los comandos de Rust llamados por la propia ventana:
//  1. Un `.claude.json` real de ejemplo con otros servidores, números que un lector de
//     JSON corriente cambia y un orden que no es el alfabético: conectar solo añade la
//     entrada (el resto, byte a byte), `claude mcp list` dice «Connected», un agente
//     de ahí ve las herramientas (el evento `init` de Claude Code las lista antes de
//     llamar a ningún modelo), y desconectar devuelve el archivo EXACTO.
//  2. Desconectar y volver a conectar.
//  3. Sin archivo: se crea con solo lo nuestro y Claude Code lo acepta; y tras correr
//     Claude Code (que lo reescribe a su manera), desconectar quita solo la entrada.
//  4. Un archivo raro (vacío, roto, con comentarios, con BOM, de solo lectura, con una
//     `adeorq` que no es la nuestra): no se toca ni un byte y se dice por qué.
//  5. Una cuenta extra (`accounts\claude-*`): solo se toca su archivo.
//  6. Claude Code reescribiendo el archivo a la vez que se conecta: nunca queda roto.
//  7. La bienvenida y la tarjeta de Ajustes, en foto, en claro y oscuro, en español e inglés.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";

const args = process.argv.slice(2);
const iFotos = args.indexOf("--fotos");
const carpetaFotos = iFotos >= 0 ? args[iFotos + 1] : null;
const exeOrigen = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--fotos") || EXE;

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

// Lanzado desde una terminal de Claude Code, el entorno trae SU cuenta y SU panel.
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k) || /^ADEORQ_PANE/i.test(k)) delete process.env[k];

const PUERTO = 47_000 + (process.pid % 900);
const DEPURAR = 9650 + (process.pid % 100);
const fotos = carpetaFotos ?? join(tmpdir(), `adeorq-claude-conexion-fotos-${process.pid}`);
mkdirSync(fotos, { recursive: true });

// Una copia del ejecutable fuera de C:\ct: otra sesión puede recompilar mientras tanto.
const copia = join(tmpdir(), `adeorq-claude-conexion-${process.pid}.exe`);
copyFileSync(exeOrigen, copia);

/** Un `.claude.json` con la forma del de verdad. Los servidores no hacen nada de red:
 *  son programas que salen al instante. */
const EJEMPLO = `{
  "numStartups": 482,
  "installMethod": "native",
  "autoUpdates": false,
  "tipsHistory": {
    "new-user-warmup": 12,
    "plan-mode-tip": 3
  },
  "cachedGrowthBookFeatures": {
    "tengu_x": true,
    "big": 12345678901234567890,
    "frac": 0.30000000000000004,
    "exp": 1.5e300
  },
  "userID": "d57dccec613dc6109ce9d9e41a8dc8d20bb2e14655e94aeb6636140c0d5a52eb",
  "mcpServers": {
    "uno": {
      "type": "stdio",
      "command": "node",
      "args": [
        "-e",
        "process.exit(0)"
      ],
      "env": {}
    },
    "remoto": {
      "type": "http",
      "url": "http://127.0.0.1:9/mcp",
      "headers": {
        "X-Test": "ñandú ✓ } , \\" {"
      }
    }
  },
  "projects": {
    "C:/proyectos/Adeorq": {
      "allowedTools": [],
      "mcpServers": {},
      "hasTrustDialogAccepted": true
    }
  },
  "oauthAccount": {
    "emailAddress": "x@example.com"
  }
}
`;

/** Lo que cambió entre dos textos: se quita `quitado` y se pone `puesto`, sin tocar los lados. */
function diferencia(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { quitado: a.slice(p, a.length - s), puesto: b.slice(p, b.length - s) };
}

const a = await abrirAislada({ nombre: "claude-conexion", puertoMcp: PUERTO, depurar: DEPURAR, exe: copia, fotos });
const casa = join(a.base, "casa");
const principal = join(casa, ".claude.json");
const cuentas = join(a.base, "datos", "Adeorq", "accounts");

// El entorno del Claude Code de verdad: su casa es la de la prueba y no llega a ningún modelo.
const entorno = {
  ...process.env,
  USERPROFILE: casa,
  HOME: casa,
  DISABLE_AUTOUPDATER: "1",
  HTTPS_PROXY: "http://127.0.0.1:9",
  HTTP_PROXY: "http://127.0.0.1:9",
  ALL_PROXY: "http://127.0.0.1:9",
  ANTHROPIC_API_KEY: `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA`,
};
delete entorno.NoDefaultCurrentDirectoryInExePath;
delete entorno.CLAUDE_CONFIG_DIR;

const claude = (argumentos, extra = {}, plazo = 90_000) => {
  const t0 = Date.now();
  const r = spawnSync("claude.exe", argumentos, { env: { ...entorno, ...extra }, encoding: "utf8", timeout: plazo, cwd: join(a.base, "proyectos", "demo") });
  return { ms: Date.now() - t0, status: r.status, texto: `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "").trim() };
};

/** Un comando de Rust, llamado como lo llama la ventana. */
const rust = (comando, parametros = {}) =>
  a.v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(comando)}, ${JSON.stringify(parametros)}).then((x) => ({ ok: x }), (e) => ({ error: String(e) }))`);

const leer = (ruta) => readFileSync(ruta, "utf8");
const copiasDe = (carpeta) => (existsSync(carpeta) ? readdirSync(carpeta).filter((n) => n.includes("antes-de-adeorq")) : []);
const limpiarCopias = (carpeta) => copiasDe(carpeta).forEach((n) => rmSync(join(carpeta, n), { force: true }));

/** Claude Code arranca el enlace de Adeorq y le habla: lo que Adeorq vio de él. */
const vistos = () => {
  try {
    return JSON.parse(leer(join(a.base, "datos", "Adeorq", "mcp_clientes.json"))).vistos ?? {};
  } catch {
    return {};
  }
};

/** Lo que ve un agente de Claude Code al arrancar: el evento `init` lista sus herramientas
 *  y el estado de cada servidor MCP ANTES de llamar a ningún modelo. Se lee y se corta. */
function lo_que_ve_un_agente(extra = {}) {
  return new Promise((ok) => {
    const p = spawn("claude.exe", ["-p", "hola", "--output-format", "stream-json", "--verbose"], { env: { ...entorno, ...extra }, cwd: join(a.base, "proyectos", "demo") });
    let buf = "";
    let hecho = false;
    const cierra = (r) => {
      if (hecho) return;
      hecho = true;
      p.kill();
      ok(r);
    };
    p.stdout.on("data", (d) => {
      buf += d;
      for (const l of buf.split("\n")) {
        try {
          const m = JSON.parse(l);
          if (m.type === "system" && m.subtype === "init") return cierra({ herramientas: (m.tools ?? []).filter((t) => t.startsWith("mcp__adeorq__")), servidores: m.mcp_servers ?? [] });
        } catch {}
      }
    });
    setTimeout(() => cierra({ herramientas: [], servidores: [], sinInit: buf.slice(0, 300) }), 60_000);
  });
}

try {
  await dormir(1500);
  mkdirSync(join(casa, ".claude"), { recursive: true });

  // ── 1. Un .claude.json real de ejemplo ──────────────────────────────────
  console.log("\n== 1. Un .claude.json real de ejemplo ==");
  writeFileSync(principal, EJEMPLO);
  let plan = await rust("claude_conexiones");
  const fila0 = plan.ok?.cuentas?.find((c) => c.id === "principal");
  dice(fila0?.estado === "libre" && fila0.existe && fila0.archivo === principal, "la cuenta de siempre sale «libre» y dice qué archivo toca", JSON.stringify(fila0));
  dice(plan.ok?.instalado === true, "dice que Claude Code está instalado", String(plan.ok?.instalado));
  dice(plan.ok?.comando === `"${copia}" --mcp`, "dice el comando que va a apuntar", plan.ok?.comando);

  // En rojo: sin conectar, un agente de Claude Code NO tiene las herramientas de Adeorq.
  const sinNada = await lo_que_ve_un_agente();
  dice(sinNada.herramientas.length === 0, "ROJO: antes de conectar, un agente de Claude Code no ve ninguna herramienta de Adeorq", JSON.stringify(sinNada.servidores));
  writeFileSync(principal, EJEMPLO); // Claude Code lo reescribe al arrancar: vuelta al ejemplo

  let r = await rust("claude_conectar", { cuenta: "principal" });
  dice(!r.error && r.ok?.plan?.cuentas?.[0]?.estado === "conectado", "conectar dice que está conectado", r.error ?? "");
  const conectado = leer(principal);
  const d = diferencia(EJEMPLO, conectado);
  dice(d.quitado === "" && d.puesto.includes('"adeorq"'), "es un único trozo añadido: no se quita ni se cambia ni un byte de lo demás", `puesto ${d.puesto.length} caracteres, quitado ${JSON.stringify(d.quitado)}`);
  const antesJson = JSON.parse(EJEMPLO);
  const despuesJson = JSON.parse(conectado);
  const esperado = structuredClone(antesJson);
  esperado.mcpServers.adeorq = { type: "stdio", command: copia, args: ["--mcp"], env: { ADEORQ_MCP_PUERTO: String(PUERTO) } };
  dice(JSON.stringify(Object.keys(despuesJson)) === JSON.stringify(Object.keys(antesJson)) && JSON.stringify(despuesJson.mcpServers.adeorq) === JSON.stringify(esperado.mcpServers.adeorq) && JSON.stringify(despuesJson.projects) === JSON.stringify(antesJson.projects), "las demás claves, en su mismo orden, y la entrada con la forma de Claude Code", JSON.stringify(despuesJson.mcpServers.adeorq));
  dice(conectado.includes("12345678901234567890") && conectado.includes("1.5e300") && conectado.includes('"autoUpdates": false'), "el entero de 20 cifras, 1.5e300 y autoUpdates siguen como estaban (Claude Code los cambia)");
  dice(r.ok?.copia && leer(r.ok.copia) === EJEMPLO, "queda una copia al lado y es el archivo de antes, igual", r.ok?.copia ?? "sin copia");

  const lista = claude(["mcp", "list"]);
  dice(/adeorq[^\n]*Connected/i.test(lista.texto), "`claude mcp list` dice «Connected» para adeorq", `${lista.ms} ms · ${lista.texto.split("\n").filter((l) => /adeorq/.test(l)).join(" | ")}`);
  const verdad = await lo_que_ve_un_agente();
  dice(verdad.herramientas.length >= 10 && verdad.servidores.some((s) => s.name === "adeorq" && /connected/i.test(s.status)), "VERDE: un agente de Claude Code ve las herramientas de Adeorq", `${verdad.herramientas.length} herramientas, p. ej. ${verdad.herramientas.slice(0, 3).join(", ")} · ${JSON.stringify(verdad.servidores)}`);
  // Un Claude Code que no corre en una terminal de Adeorq llega como «fuera de Adeorq».
  const vio = vistos().fuera;
  dice(!!vio && vio.veces > 0 && /^\d+\.\d+/.test(vio.version), "y Adeorq, por su lado, vio a Claude Code presentarse en su puerto (como «fuera de Adeorq»)", JSON.stringify(vio ?? vistos()));

  // Claude Code ha corrido y habrá reescrito el archivo: lo nuestro sigue ahí y lo de los demás también.
  const trasClaude = JSON.parse(leer(principal));
  dice(trasClaude.mcpServers?.adeorq && trasClaude.mcpServers.uno && trasClaude.mcpServers.remoto, "tras correr Claude Code (que reescribe el archivo) la entrada y los otros servidores siguen", Object.keys(trasClaude.mcpServers ?? {}).join(", "));

  // ── 2. Desconectar y volver a conectar ──────────────────────────────────
  console.log("\n== 2. Desconectar y volver a conectar ==");
  writeFileSync(principal, conectado);
  r = await rust("claude_desconectar", { cuenta: "principal" });
  dice(!r.error && leer(principal) === EJEMPLO, "desconectar deja el archivo EXACTAMENTE como estaba antes de conectar", r.error ?? "");
  dice(r.ok?.plan?.cuentas?.[0]?.estado === "libre", "y la cuenta vuelve a salir «libre»");
  const sinEntrada = claude(["mcp", "list"]);
  dice(!/adeorq/i.test(sinEntrada.texto), "`claude mcp list` ya no nombra a adeorq", sinEntrada.texto.split("\n").slice(0, 3).join(" | "));
  writeFileSync(principal, EJEMPLO);
  r = await rust("claude_conectar", { cuenta: "principal" });
  dice(!r.error && leer(principal) === conectado, "volver a conectar da exactamente lo mismo que la primera vez", r.error ?? "");
  r = await rust("claude_conectar", { cuenta: "principal" });
  dice(!!r.error && /Ya está conectado/.test(r.error) && leer(principal) === conectado, "conectar otra vez dice «Ya está conectado» y no toca nada", r.error ?? "");
  r = await rust("claude_desconectar", { cuenta: "principal" });
  r = await rust("claude_desconectar", { cuenta: "principal" });
  dice(!!r.error && /Ya estaba desconectado/.test(r.error) && leer(principal) === EJEMPLO, "desconectar otra vez dice «Ya estaba desconectado» y no toca nada", r.error ?? "");
  // Cada clic dejaba otra copia entera del archivo al lado, sin límite: es la
  // configuración de la cuenta repetida.
  const quedan = copiasDe(casa).filter((n) => n.startsWith(".claude.json."));
  dice(quedan.length === 1 && leer(join(casa, quedan[0])) === conectado, "tras cuatro escrituras queda UNA copia, la de antes del último cambio", quedan.join(", "));
  // Claude Code guarda con la carpeta `.claude.json.lock` puesta (`proper-lockfile`):
  // mientras la tenga, escribir pisaría lo que está guardando.
  const candado = join(casa, ".claude.json.lock");
  mkdirSync(candado);
  const t0 = Date.now();
  r = await rust("claude_conectar", { cuenta: "principal" });
  dice(!!r.error && /Vuelve a pulsar/.test(r.error) && leer(principal) === EJEMPLO && existsSync(candado), "con el candado de Claude Code puesto no escribe, lo dice y no se lo quita", `${r.error ?? "sin error"} (${Date.now() - t0} ms)`);
  rmSync(candado, { recursive: true, force: true });
  r = await rust("claude_conectar", { cuenta: "principal" });
  dice(!r.error && leer(principal) === conectado && !existsSync(candado), "en cuanto lo suelta, conecta y no deja candado", r.error ?? "");
  r = await rust("claude_desconectar", { cuenta: "principal" });

  // ── 3. Sin archivo ──────────────────────────────────────────────────────
  console.log("\n== 3. Sin archivo ==");
  rmSync(principal, { force: true });
  limpiarCopias(casa);
  plan = await rust("claude_conexiones");
  const sinArchivo = plan.ok?.cuentas?.find((c) => c.id === "principal");
  dice(sinArchivo?.estado === "libre" && sinArchivo.existe === false, "sin archivo sale «libre» y dice que no existe todavía", JSON.stringify(sinArchivo));
  r = await rust("claude_conectar", { cuenta: "principal" });
  dice(!r.error && r.ok?.copia === null && existsSync(principal), "conectar lo crea, sin copia de lo que no había", r.error ?? "");
  const nuevo = JSON.parse(leer(principal));
  dice(Object.keys(nuevo).join() === "mcpServers" && nuevo.mcpServers.adeorq?.args?.[0] === "--mcp", "con solo lo nuestro dentro", leer(principal).replace(/\s+/g, " "));
  const lista2 = claude(["mcp", "list"]);
  dice(/adeorq[^\n]*Connected/i.test(lista2.texto), "Claude Code acepta ese archivo mínimo y conecta", lista2.texto.split("\n").filter((l) => /adeorq/.test(l)).join(" | "));
  const reescrito = JSON.parse(leer(principal));
  dice(reescrito.mcpServers?.adeorq && Object.keys(reescrito).length > 1, "Claude Code lo reescribe a su manera (añade lo suyo) y la entrada sigue", Object.keys(reescrito).join(", "));
  r = await rust("claude_desconectar", { cuenta: "principal" });
  const trasQuitar = JSON.parse(leer(principal));
  const sinAdeorq = structuredClone(reescrito);
  delete sinAdeorq.mcpServers.adeorq;
  dice(!r.error && JSON.stringify(trasQuitar) === JSON.stringify(sinAdeorq), "desconectar quita solo la entrada del archivo que reescribió Claude Code", r.error ?? "");

  // ── 4. Un archivo raro: no se toca ni un byte ───────────────────────────
  console.log("\n== 4. Un archivo raro no se toca ==");
  const raros = [
    ["vacío", ""],
    ["solo espacios", "  \n"],
    ["roto", "{ esto no es json"],
    ["con comentarios", '{\n  // los míos\n  "a": 1\n}\n'],
    ["con BOM", "\ufeff{}\n"],
    ["una lista", "[1, 2]"],
    ["mcpServers que no es una lista", '{"mcpServers": 3}'],
    ["dos mcpServers", '{"mcpServers": {}, "mcpServers": {"a": {}}}'],
  ];
  for (const [que, contenido] of raros) {
    writeFileSync(principal, contenido);
    limpiarCopias(casa);
    const fila = (await rust("claude_conexiones")).ok?.cuentas?.find((c) => c.id === "principal");
    const intento = await rust("claude_conectar", { cuenta: "principal" });
    dice(fila?.estado === "noentendido" && !!intento.error && leer(principal) === contenido && copiasDe(casa).length === 0, `«${que}»: sale «noentendido», no se escribe ni un byte y no deja copia`, `${fila?.detalle ?? ""} → ${intento.error ?? "sin error"}`);
  }
  const ajena = '{\n  "mcpServers": {\n    "adeorq": {\n      "type": "http",\n      "url": "https://example.com/otro"\n    }\n  }\n}\n';
  writeFileSync(principal, ajena);
  const filaAjena = (await rust("claude_conexiones")).ok?.cuentas?.find((c) => c.id === "principal");
  const alConectar = await rust("claude_conectar", { cuenta: "principal" });
  const alQuitar = await rust("claude_desconectar", { cuenta: "principal" });
  dice(filaAjena?.estado === "ajena" && !!alConectar.error && !!alQuitar.error && leer(principal) === ajena, "una `adeorq` que no es la nuestra: ni se pisa ni se quita", `${alConectar.error} / ${alQuitar.error}`);
  writeFileSync(principal, EJEMPLO);
  chmodSync(principal, 0o444);
  limpiarCopias(casa);
  const soloLectura = await rust("claude_conectar", { cuenta: "principal" });
  chmodSync(principal, 0o666);
  dice(!!soloLectura.error && /solo lectura/.test(soloLectura.error) && leer(principal) === EJEMPLO && copiasDe(casa).length === 0, "un archivo de solo lectura: se dice y no se toca", soloLectura.error ?? "sin error");
  const raro = await rust("claude_conectar", { cuenta: "../../Windows" });
  dice(!!raro.error && /No conozco la cuenta/.test(raro.error), "una cuenta que Adeorq no conoce no se escribe, venga del texto que venga", raro.error ?? "");

  // ── 5. Una cuenta extra ─────────────────────────────────────────────────
  console.log("\n== 5. Una cuenta extra ==");
  const cuentaDir = join(cuentas, "claude-2da-main");
  mkdirSync(cuentaDir, { recursive: true });
  const deLaCuenta = EJEMPLO.replace("482", "9");
  writeFileSync(join(cuentaDir, ".claude.json"), deLaCuenta);
  writeFileSync(principal, EJEMPLO);
  plan = await rust("claude_conexiones");
  const ids = plan.ok?.cuentas?.map((c) => c.id);
  dice(JSON.stringify(ids) === JSON.stringify(["principal", "claude-2da-main"]), "salen la de siempre y la extra", JSON.stringify(ids));
  r = await rust("claude_conectar", { cuenta: "claude-2da-main" });
  dice(!r.error && leer(principal) === EJEMPLO, "conectar la extra no toca el archivo de la principal ni un byte", r.error ?? "");
  const extra = diferencia(deLaCuenta, leer(join(cuentaDir, ".claude.json")));
  dice(extra.quitado === "" && extra.puesto.includes('"adeorq"'), "y en la suya añade solo la entrada");
  const listaExtra = claude(["mcp", "list"], { CLAUDE_CONFIG_DIR: cuentaDir });
  dice(/adeorq[^\n]*Connected/i.test(listaExtra.texto), "`CLAUDE_CONFIG_DIR=<cuenta> claude mcp list` dice «Connected»", listaExtra.texto.split("\n").filter((l) => /adeorq/.test(l)).join(" | "));
  const listaPrincipal = claude(["mcp", "list"]);
  dice(!/adeorq/i.test(listaPrincipal.texto), "y la principal sigue sin ella", listaPrincipal.texto.split("\n").slice(0, 3).join(" | "));
  r = await rust("claude_desconectar", { cuenta: "claude-2da-main" });
  dice(!r.error && JSON.parse(leer(join(cuentaDir, ".claude.json"))).mcpServers.adeorq === undefined, "desconectar la extra la deja sin entrada", r.error ?? "");

  // ── 6. Claude Code reescribiendo a la vez ───────────────────────────────
  console.log("\n== 6. Claude Code reescribiendo a la vez ==");
  let rotos = 0;
  let sinPerder = 0;
  let quedoConectado = 0;
  let aviso = 0;
  const VUELTAS = 12;
  for (let i = 0; i < VUELTAS; i++) {
    writeFileSync(principal, EJEMPLO);
    const hijo = spawn("claude.exe", ["mcp", "list"], { env: entorno, cwd: join(a.base, "proyectos", "demo"), stdio: "ignore" });
    await dormir(i * 120);
    const res = await rust("claude_conectar", { cuenta: "principal" });
    await new Promise((ok) => hijo.on("exit", ok));
    try {
      const j = JSON.parse(leer(principal));
      if (j.mcpServers?.uno && j.mcpServers?.remoto && j.projects?.["C:/proyectos/Adeorq"]) sinPerder++;
      if (j.mcpServers?.adeorq) quedoConectado++;
      else if (res.error) aviso++;
    } catch {
      rotos++;
    }
  }
  dice(rotos === 0 && sinPerder === VUELTAS, `en ${VUELTAS} vueltas con Claude Code escribiendo a la vez, el archivo siempre se lee y no pierde los otros servidores`, `${rotos} rotos · ${sinPerder} sin perder nada · ${quedoConectado} con la entrada · ${aviso} avisaron de que no se quedó`);
  dice(quedoConectado + aviso === VUELTAS, "y cuando la entrada no se quedó, se dijo (nunca un «conectado» que no lo es)", `${quedoConectado} + ${aviso} de ${VUELTAS}`);

  // ── 7. Las fotos ────────────────────────────────────────────────────────
  console.log("\n== 7. La bienvenida y la tarjeta de Ajustes, en foto ==");
  const poner = async (lang, tema) => {
    await a.v.js(`localStorage.setItem("adeorq-lang", ${JSON.stringify(lang)}); localStorage.setItem("adeorq-theme", ${JSON.stringify(tema)}); "ok"`);
  };
  const perfil = (hecho) => JSON.stringify({ nombre: "Prueba", raiz: join(a.base, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: ["claude"], hecho, tour: true });
  for (const [lang, tema] of [["es", "azul"], ["es", "claro"], ["en", "azul"], ["en", "claro"]]) {
    // El estado de partida de cada foto: sin conectar, con la principal y una cuenta extra.
    writeFileSync(principal, EJEMPLO);
    rmSync(join(cuentaDir, ".claude.json"), { force: true });
    writeFileSync(join(cuentaDir, ".claude.json"), deLaCuenta);
    await poner(lang, tema);

    // La bienvenida: el paso nuevo.
    await a.v.js(`localStorage.setItem("adeorq-perfil", ${JSON.stringify(perfil(false))}); "ok"`);
    await a.v.enviar("Page.reload");
    await dormir(2500);
    await hasta(() => a.v.js(`!!document.querySelector(".onb")`), 20_000);
    await a.v.js(`document.querySelector(".onb-campo input")?.focus(); "ok"`);
    const empuja = (n) => a.v.js(`(() => { for (let i = 0; i < ${n}; i++) document.querySelector(".onb-pie .np-btn:not([disabled])")?.click(); return "ok"; })()`);
    for (let i = 0; i < 3; i++) {
      await empuja(1);
      await dormir(700);
    }
    const titulo = await a.v.js(`document.querySelector(".onb-tit")?.textContent`);
    dice(titulo === (lang === "es" ? "Conectar tu Claude Code" : "Connect your Claude Code"), `bienvenida (${lang}, ${tema}): tras «Tus agentes» sale el paso de conectar`, String(titulo));
    await dormir(800);
    const antesFoto = await a.v.js(`({ boton: !!document.querySelector(".onb-ruta .np-btn"), ruta: document.querySelector(".onb-ruta code")?.textContent })`);
    dice(antesFoto.boton && antesFoto.ruta === principal, "con su botón «Conectar» y el archivo que se toca", JSON.stringify(antesFoto));
    dice(await a.v.js(`(() => { const c = document.querySelector(".onb-ruta code"); return !!c && c.scrollWidth <= c.clientWidth + 1 && getComputedStyle(c).textOverflow !== "ellipsis" || (getComputedStyle(c).whiteSpace === "normal"); })()`), "y la ruta se lee entera, sin puntos suspensivos");
    await a.foto(null, `bienvenida-${lang}-${tema}-1-sin-conectar.png`);
    // Seguir lo salta sin escribir nada.
    const intacto = leer(principal) === EJEMPLO;
    dice(intacto, "el paso por sí solo no escribe nada");
    await a.v.js(`document.querySelector(".onb-ruta .np-btn")?.click(); "ok"`);
    await hasta(() => a.v.js(`!!document.querySelector(".onb-bien")`), 15_000);
    await dormir(600);
    dice(await a.v.js(`!!document.querySelector(".onb-bien")`), "al pulsar «Conectar» dice que ya está", String(await a.v.js(`document.querySelector(".onb-bien")?.textContent`)));
    await a.foto(null, `bienvenida-${lang}-${tema}-2-conectado.png`);
    dice(JSON.parse(leer(principal)).mcpServers?.adeorq !== undefined, "y el archivo lo lleva");

    // Ajustes › Terminales.
    await a.v.js(`localStorage.setItem("adeorq-perfil", ${JSON.stringify(perfil(true))}); localStorage.setItem("adeorq-ajustes-seccion", "terminales"); "ok"`);
    writeFileSync(principal, EJEMPLO);
    await a.v.enviar("Page.reload");
    await dormir(3000);
    await hasta(() => a.v.js(`!!document.querySelector(".app, #root > *")`), 20_000);
    await a.v.js(`(() => { const t = [...document.querySelectorAll("[data-tab]")].find((x) => x.getAttribute("data-tab") === "ajustes"); t?.click(); return "ok"; })()`);
    await dormir(1200);
    const hay = await hasta(() => a.v.js(`!!document.querySelector(".claude-cuenta")`), 15_000);
    dice(!!hay, `Ajustes (${lang}, ${tema}): sale la tarjeta con una fila por cuenta`, String(await a.v.js(`[...document.querySelectorAll(".claude-cuenta b")].map((b) => b.textContent).join(", ")`)));
    await a.v.js(`document.querySelector(".claude-cuenta")?.closest(".panel-card")?.scrollIntoView({ block: "center" }); "ok"`);
    await dormir(500);
    await a.foto(null, `ajustes-${lang}-${tema}-1-sin-conectar.png`);
    if (lang === "es") {
      // Los detectores de la casa, dentro de la tarjeta: ni cárceles ni rótulos en mayúsculas espaciadas.
      const jaulas = await carceles(a.v, ".panel-card:has(.claude-cuenta)");
      const letras = await mayusculas(a.v, ".panel-card:has(.claude-cuenta)");
      dice(jaulas.fallos.length === 0 && letras.fallos.length === 0, `la tarjeta (${tema}) sin cárceles ni mayúsculas espaciadas`, JSON.stringify([...jaulas.fallos, ...letras.fallos]).slice(0, 300));
    }
    await a.v.js(`document.querySelector(".claude-cuenta[data-cuenta='principal'] .np-btn")?.click(); "ok"`);
    await hasta(() => a.v.js(`document.querySelector(".claude-cuenta[data-cuenta='principal'] .mini") !== null`), 15_000);
    await dormir(600);
    await a.foto(null, `ajustes-${lang}-${tema}-2-conectada.png`);
    const nombres = await a.v.js(`[...document.querySelectorAll(".claude-cuenta b")].map((b) => b.textContent)`);
    dice(nombres?.length === 2 && nombres[0] === (lang === "es" ? "Principal" : "Main"), "la tarjeta, ya conectada la principal, sigue con sus dos filas", JSON.stringify(nombres));
    await rust("claude_desconectar", { cuenta: "principal" });
  }
  console.log(`      fotos en ${fotos}`);
} catch (e) {
  dice(false, `el laboratorio se cayó: ${e.stack ?? e}`);
} finally {
  await a.cerrar();
  rmSync(copia, { force: true });
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
