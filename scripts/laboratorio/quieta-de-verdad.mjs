// Una terminal de Claude Code DE VERDAD, quieta casi una hora con 150k de
// contexto, en una Adeorq aislada y minimizada: a los 55-58 minutos Adeorq le
// teclea `/compact <qué conservar>` sola, Claude Code compacta, y después nada.
//
// Lo que `tope-de-contexto-de-verdad.mjs` (paso Q) no puede ver, porque allí el
// Claude es de mentira y la hora la pone el transcript: los relojes de la página
// corriendo una hora de verdad con la ventana minimizada (el WebView frena los
// temporizadores de una página escondida), la caja de un Claude Code real tras
// una hora parado, y el `/compact` tecleado en su caja de verdad (con su menú de
// órdenes abierto al escribir la barra). Munir, 2026-11-23: «lo de las sesiones
// que estén inactivas por una hora o así, compactarlas»; antes de publicar la
// 0.9.266 faltaba esto.
//
// Hermético, como `modelo-de-sesion-de-verdad.mjs`: Claude Code corre con su
// carpeta de configuración PROPIA dentro de la casa falsa (`CLAUDE_CONFIG_DIR`),
// una clave de API de mentira ya «aprobada» y una API de mentira en este proceso
// (`ANTHROPIC_BASE_URL`). Lo demás que quisiera salir va a un proxy muerto. No
// gasta cuota ni toca ninguna cuenta. La API cuenta 150k en el turno (148k leídos
// de una caché de una hora, como los de una cuenta de Claude) y contesta el
// resumen de la compactación.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/quieta-de-verdad.mjs
//
// Tarda unos 65 minutos. Con el MCP en el 39533 y la depuración en el 9533: no
// toca la Adeorq de Munir. Sale con 1 si algo falla.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const NOMBRE = "quieta";
const PUERTO_MCP = 39533;
const DEPURAR = 9533;
/** La misma carpeta que arma `abrirAislada` con este nombre. */
const BASE = join(tmpdir(), `adeorq-${NOMBRE}-${process.pid}`);
const DEMO = join(BASE, "proyectos", "demo");
const CONFIG = join(BASE, "casa", ".claude");
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
const SID = randomUUID();
const CLAUDE = process.env.LAB_CLAUDE ?? join(homedir(), ".local", "bin", "claude.exe");
const MARCA = "hola de prueba, luego me quedo quieta";
/** Hasta cuándo se espera el /compact, en minutos desde el turno. */
const TOPE_MIN = 62;
const MUERTO = "http://127.0.0.1:9";

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${String(detalle).slice(0, 600)})` : ""}`);
};
const hora = () => new Date().toTimeString().slice(0, 8);

// ── La API de mentira ──────────────────────────────────────────────────────
const textoDe = (m) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c) => c.text ?? "").join(" "));
/** Cada petición: cuándo, de qué tipo y el final de lo último que dijo el usuario. */
const peticiones = [];
const USO_TURNO = {
  input_tokens: 5,
  cache_creation_input_tokens: 2000,
  cache_read_input_tokens: 148_000,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2000 },
  service_tier: "standard",
};
const USO_SUELTO = { input_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, service_tier: "standard" };
const RESUMEN =
  "<analysis>Prueba de laboratorio.</analysis>\n<summary>1. El usuario saludó para probar que una terminal quieta se compacta sola. No hay trabajo pendiente ni archivos tocados.</summary>";

function responder(res, j, n, texto, uso) {
  const cab = { "request-id": `req_lab_quieta_${n}` };
  const msg = { id: `msg_lab_${n}`, type: "message", role: "assistant", model: j.model ?? "claude-sonnet", content: [], stop_reason: null, stop_sequence: null, usage: { ...uso, output_tokens: 1 } };
  if (!j.stream) {
    res.writeHead(200, { ...cab, "content-type": "application/json" });
    res.end(JSON.stringify({ ...msg, content: [{ type: "text", text: texto }], stop_reason: "end_turn", usage: { ...uso, output_tokens: 24 } }));
    return;
  }
  res.writeHead(200, { ...cab, "content-type": "text/event-stream", "cache-control": "no-cache" });
  const ev = (type, datos) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...datos })}\n\n`);
  ev("message_start", { message: msg });
  ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } });
  ev("content_block_stop", { index: 0 });
  ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 24 } });
  ev("message_stop", {});
  res.end();
}

const servidor = http.createServer((pet, res) => {
  let cuerpo = "";
  pet.on("data", (d) => (cuerpo += d));
  pet.on("end", () => {
    if (pet.url.includes("count_tokens")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ input_tokens: 150_000 }));
    }
    if (!pet.url.startsWith("/v1/messages")) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "laboratorio" } }));
    }
    let j = {};
    try {
      j = JSON.parse(cuerpo);
    } catch {}
    const mensajes = j.messages ?? [];
    const historia = mensajes.some((m) => textoDe(m).includes(MARCA));
    const ultimo = textoDe(mensajes.filter((m) => m.role === "user").at(-1));
    // El turno: lo último que dijo es la marca. La compactación: lleva la
    // conversación y pide un resumen. Lo demás (el título, sugerencias): suelto.
    const tipo = ultimo.includes(MARCA) ? "turno" : historia && /summar|resum/i.test(ultimo) ? "compactar" : historia ? "con-historia" : "suelta";
    const n = peticiones.length + 1;
    peticiones.push({ n, ms: Date.now(), tipo, modelo: j.model, ultimo: ultimo.replace(/\s+/g, " ").slice(-160) });
    if (tipo === "turno") return responder(res, j, n, "Hecho. Me quedo quieta.", USO_TURNO);
    if (tipo === "compactar") return responder(res, j, n, RESUMEN, USO_TURNO);
    if (tipo === "con-historia") return responder(res, j, n, "Hecho.", USO_TURNO);
    return responder(res, j, n, "Prueba quieta", USO_SUELTO);
  });
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));

// ── El transcript de la sesión ─────────────────────────────────────────────
const transcript = () => {
  const dir = join(CONFIG, "projects");
  if (!existsSync(dir)) return null;
  for (const c of readdirSync(dir)) {
    const f = join(dir, c, `${SID}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
};
const lineas = () => {
  const f = transcript();
  if (!f) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};
const textoUsuario = (l) => (l.type === "user" ? textoDe(l.message) : "");
/** Lo que se le tecleó: las líneas del usuario que no son de Claude Code. */
const tecleado = () =>
  lineas()
    .filter((l) => l.type === "user" && !l.isMeta && !l.isCompactSummary && !l.toolUseResult)
    .map((l) => ({ ms: Date.parse(l.timestamp), texto: textoUsuario(l).replace(/\s+/g, " ").slice(0, 300) }))
    .filter((x) => x.texto && !/^<local-command-(stdout|stderr)>/.test(x.texto));

// ── La Adeorq aislada, con el entorno hermético para sus terminales ─────────
// Lo que la propia sesión que lanza esto le pasaría a Claude Code (que se crea
// anidado, o la cuenta de quien lo lanza) fuera, sin leerlo.
for (const k of Object.keys(process.env)) if (/^(CLAUDE|ANTHROPIC)/i.test(k)) delete process.env[k];
const entorno = {
  CLAUDE_CONFIG_DIR: CONFIG,
  ANTHROPIC_API_KEY: CLAVE,
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${servidor.address().port}`,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_AUTOUPDATER: "1",
  HTTPS_PROXY: MUERTO,
  HTTP_PROXY: MUERTO,
  ALL_PROXY: MUERTO,
  NO_PROXY: "127.0.0.1,localhost",
};
const sembrar = () => {
  mkdirSync(CONFIG, { recursive: true });
  const confianza = { hasTrustDialogAccepted: true, allowedTools: [] };
  writeFileSync(
    join(CONFIG, ".claude.json"),
    JSON.stringify({
      hasCompletedOnboarding: true,
      theme: "dark",
      customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] },
      projects: { [DEMO.replace(/\\/g, "/")]: confianza, [DEMO]: confianza },
    }),
  );
  writeFileSync(join(CONFIG, "settings.json"), JSON.stringify({ model: "sonnet" }));
};

/** La ventana minimizada SIN quitarle el foco a nadie (SW_SHOWMINNOACTIVE),
 *  mirando antes que es la MÍA: el padre del navegador con mi puerto. Se mira
 *  que quede minimizada (`IsIconic`): en la primera vuelta, el 24-nov, el
 *  primer `ShowWindow` volvió bien y la ventana seguía abierta. */
const minimizar = () =>
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
    $w = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -match 'remote-debugging-port=${DEPURAR}' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
    if (-not $w) { exit 1 }
    $p = Get-Process -Id $w.ParentProcessId -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne 'C:\\ct\\debug\\adeorq.exe' -or $p.MainWindowHandle -eq 0) { exit 2 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);'
    for ($i = 0; $i -lt 10; $i++) {
      [void][W.U]::ShowWindow($p.MainWindowHandle, 7)
      Start-Sleep -Milliseconds 700
      if ([W.U]::IsIconic($p.MainWindowHandle)) { exit 0 }
    }
    exit 3
  `,
    ],
    { stdio: "ignore" },
  ).status;

console.log(`${hora()} Claude Code ${CLAUDE}, sesión ${SID}`);
const a = await abrirAislada({ nombre: NOMBRE, puertoMcp: PUERTO_MCP, depurar: DEPURAR, entorno, sembrar });
try {
  // Una terminal de Munir (no la abre un agente), con el Claude Code de verdad.
  await a.v.js(`localStorage.setItem("adeorq-layout", ${JSON.stringify(
    JSON.stringify({ panes: [{ name: "demo · claude", cwd: DEMO, command: ["cmd.exe", "/c", CLAUDE, "--session-id", SID] }], cols: [{ w: 1, hs: [1], idx: [0] }], ocultos: [] }),
  )}); "ok"`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(
    () => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!document.querySelector("[data-pane-id]"); })()`),
    30_000,
    500,
  );
  const id = Number(await a.v.js(`document.querySelector("[data-pane-id]")?.getAttribute("data-pane-id")`));
  const agente = a.puente(null);
  // El MCP no deja leer una pantalla por número sin haber mirado antes la lista.
  await hasta(async () => ((await agente.llamar("get_active_panes")).texto ?? "").includes(`ID: ${id},`), 30_000, 1000);
  const pantalla = async () => {
    const r = await agente.llamar("read_pane_screen", { paneId: id });
    return r.texto || (r.error ? `(read_pane_screen: ${r.error})` : "");
  };
  const teclear = (data) => a.v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);

  const caja = await hasta(async () => {
    const p = await pantalla();
    return /for shortcuts|to cycle\)|Try "/i.test(p) && !/trust this folder/i.test(p) ? p : null;
  }, 90_000, 1000);
  dice(!!caja, "un Claude Code de verdad arranca en su caja, en una terminal de Munir", `panel ${id}: ${await pantalla()}`);
  if (!caja) {
    console.log(`      paneles: ${((await agente.llamar("get_active_panes")).texto ?? "").slice(0, 800)}`);
    console.log(`      lo que escribió: ${((await agente.llamar("read_pane_transcript", { paneId: id })).texto ?? "").slice(-1500)}`);
    throw new Error("sin Claude Code no hay prueba");
  }
  await dormir(1500);

  // El turno: la API de mentira lo cuenta en 150k, con su caché de una hora.
  await teclear(MARCA);
  await dormir(500);
  await teclear("\r");
  const turno = await hasta(() => {
    const l = lineas().filter((x) => x.type === "assistant" && x.message?.usage?.cache_read_input_tokens === 148_000);
    return l.length ? l.at(-1) : null;
  }, 60_000, 500);
  const u = turno?.message?.usage ?? {};
  dice(
    !!turno && u.cache_creation?.ephemeral_1h_input_tokens === 2000,
    "su turno queda en el transcript con 150k y la caché escrita para una hora",
    JSON.stringify({ usage: u, peticiones }),
  );
  if (!turno) throw new Error("sin el turno no hay prueba");
  const desde = tecleado().find((x) => x.texto.includes(MARCA))?.ms ?? Date.now();
  const minutos = (ms) => ((ms - desde) / 60_000).toFixed(1);
  await hasta(async () => /for shortcuts|to cycle\)/i.test(await pantalla()) && !/esc to interrupt/i.test(await pantalla()), 60_000, 1000);
  const lista = (await agente.llamar("get_active_panes")).texto ?? "";
  const suya = lista.split("\n").find((l) => l.startsWith(`ID: ${id},`)) ?? "";
  dice(/Contexto: 150\.0\d\d tokens/.test(suya), "Adeorq le cuenta los 150k a esa terminal", suya || lista.slice(0, 400));

  // Nada al acabar el turno: ni la raya ni la sugerencia teclean con 150k.
  await dormir(120_000);
  dice(tecleado().length === 1, "al acabar el turno no se le teclea nada", JSON.stringify(tecleado()));

  // Minimizada, como quien la deja abajo mientras hace otra cosa. Ojo: el
  // WebView2 no siempre se da por escondido al minimizar la ventana (medido el
  // 24-nov: minimizada 45 s y la página seguía «visible»), así que no se exige
  // «hidden»: se cuenta lo que dice en cada vistazo, y en cada uno se vuelve a
  // minimizar (algo la devolvía a veces, sin saberse qué).
  const min = minimizar();
  const escondida = await a.v.js(`document.visibilityState`);
  dice(min === 0, `la ventana minimizada sin quitarle el foco a nadie (la página dice «${escondida}»)`, `código ${min}`);
  await a.v.js(`window.__labSinRecargar = true; "ok"`);

  // La espera: un vistazo cada 30 s, y una línea cada cinco minutos.
  let compactar = null;
  let ultimoAviso = 0;
  /** Lo que dice la página en cada vistazo: { visible: n, hidden: n }. */
  const estados = {};
  const cuenta = () => Object.entries(estados).map(([k, n]) => `${k} ${n}`).join(", ");
  while (Date.now() - desde < TOPE_MIN * 60_000) {
    await dormir(30_000);
    const t = tecleado().slice(1);
    if (t.length) {
      compactar = t[0];
      break;
    }
    minimizar();
    const e = await a.v.js(`document.visibilityState`).catch(() => "?");
    estados[e] = (estados[e] ?? 0) + 1;
    if (Date.now() - ultimoAviso > 5 * 60_000) {
      ultimoAviso = Date.now();
      console.log(`      ${hora()} · ${minutos(Date.now())} min quieta, nada tecleado · la página dijo: ${cuenta()}`);
    }
  }
  const recargada = !(await a.v.js(`window.__labSinRecargar === true`).catch(() => false));
  const m = compactar ? Number(minutos(compactar.ms)) : null;
  dice(
    !!compactar && m >= 54.9 && m <= 59.5 && /^\/compact\b/.test(compactar.texto.replace(/<command-name>|<\/command-name>/g, "")),
    `a los ${m ?? "—"} minutos se le teclea /compact (entre 55 y 59)`,
    JSON.stringify(compactar),
  );
  dice(!!compactar && /Conserva el estado real del repo/.test(compactar.texto), "con qué conservar en el /compact", compactar?.texto);

  // Claude Code compacta: la API recibe el resumen y el transcript lo marca.
  const hecha = await hasta(() => lineas().some((l) => l.type === "system" && l.subtype === "compact_boundary"), 180_000, 1000);
  const resumen = peticiones.filter((p) => p.tipo === "compactar");
  dice(!!hecha && resumen.length >= 1, "Claude Code compacta de verdad (la API recibe la compactación y el transcript la marca)", JSON.stringify(peticiones.slice(-4)));

  // Y nada detrás: ni «sigue», ni otro /compact para la misma llamada.
  const antes = tecleado().length;
  const turnosAntes = peticiones.filter((p) => p.tipo === "turno" || p.tipo === "con-historia").length;
  await dormir(4 * 60_000);
  dice(tecleado().length === antes, "en los 4 minutos siguientes no se le teclea nada", JSON.stringify(tecleado().slice(antes - 1)));
  dice(peticiones.filter((p) => p.tipo === "turno" || p.tipo === "con-historia").length === turnosAntes, "ni Claude Code empieza otro turno", JSON.stringify(peticiones.slice(-4)));
  console.log(`      en la espera la página dijo: ${cuenta()}${recargada ? ", y SE RECARGÓ por el camino (vite)" : ", sin recargarse"}`);
  console.log(`      peticiones a la API: ${peticiones.map((p) => `${p.tipo}@${minutos(p.ms)}`).join(" ")}`);
  if (fallos) console.log(`      pantalla al acabar:\n${await pantalla()}`);
} catch (e) {
  fallos++;
  console.log(`FALLO ${e?.message ?? e}`);
} finally {
  await a.cerrar();
  servidor.close();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
