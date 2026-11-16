// La vuelta hacia arriba con una madre Codex y otra Gemini de verdad: que reciban
// tecleada la línea `[adeorq]` de su hija, y que no les caiga encima de un
// borrador. Medido así lo que `lib/cajaDeEntrada.ts` lee de su pantalla.
//
// Sin gastar: Codex y Gemini de verdad (los del PATH), con casa y claves falsas,
// contra dos API de mentira en este mismo proceso (un proveedor propio en el
// `config.toml` de Codex, sin WebSocket, y `GOOGLE_GEMINI_BASE_URL`). Contestan
// «Hecho.» a todo. Codex 0.165 prueba antes la API por WebSocket y tarda en
// rendirse: con `supports_websockets = false` va directo a HTTP.
//
// Las hijas son dos consolas: lo que se prueba es la madre. La entrega se hace
// desde la propia ventana (`alEntregar`, lo mismo que llama Rust al recibir un
// `entregar`), con quién es hija de quién apuntado como lo hace `open_pane`. Y
// con el módulo que cargó la ventana: si cambió con Vite en marcha, la app lo
// importa con `?t=…`, y uno importado a pelo es OTRA copia, sin su bucle.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   node scripts/laboratorio/vuelta-arriba-otros-cli-de-verdad.mjs [exe]
//
// Sale con 1 si algo falla.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const nombre = "vo";
const PUERTO = 42_000 + (process.pid % 800);
const DEPURAR = 9_700 + (process.pid % 100);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
for (const k of Object.keys(process.env)) {
  if (/^CLAUDE/i.test(k) || /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_GENAI_USE_GCA|OPENAI_API_KEY|OPENAI_BASE_URL|CODEX_API_KEY|ANTHROPIC_API_KEY|CODEX_HOME|GEMINI_CLI_HOME|HTTPS?_PROXY|ALL_PROXY)$/i.test(k)) delete process.env[k];
}

/** Lo que han recibido las dos API: el texto de cada turno, para ver que la línea se ENVIÓ. */
const recibido = { gemini: [], codex: [] };
const pedidos = [];
const api = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    pedidos.push(`${req.method} ${req.url} ${cuerpo.length}`);
    const json = (v) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(v));
    };
    if (/:streamGenerateContent/.test(req.url)) {
      recibido.gemini.push(cuerpo);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const r = { candidates: [{ content: { role: "model", parts: [{ text: "Hecho." }] }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } };
      return res.end(`data: ${JSON.stringify(r)}\r\n\r\n`);
    }
    if (/:generateContent/.test(req.url)) return json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ reasoning: "simple", model_choice: "flash" }) }] }, finishReason: "STOP", index: 0 }] });
    if (/:countTokens/.test(req.url)) return json({ totalTokens: 10 });
    if (req.method === "POST" && /\/responses$/.test(req.url.split("?")[0])) {
      recibido.codex.push(cuerpo);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const id = `resp_${recibido.codex.length}`;
      const eventos = [
        { type: "response.created", response: { id } },
        { type: "response.output_item.done", item: { type: "message", role: "assistant", id: `msg_${recibido.codex.length}`, content: [{ type: "output_text", text: "Hecho." }] } },
        { type: "response.completed", response: { id, usage: { input_tokens: 10, input_tokens_details: null, output_tokens: 2, output_tokens_details: null, total_tokens: 12 } } },
      ];
      return res.end(eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""));
    }
    if (/\/models/.test(req.url)) return json({ models: [] });
    json({});
  });
});
await new Promise((ok) => api.listen(0, "127.0.0.1", ok));
const URL_API = `http://127.0.0.1:${api.address().port}`;

const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
// En la casa de la pasada, que es donde Adeorq lee sus sesiones (`codex_dir`: la
// `.codex` de la casa, no `CODEX_HOME`). Y con el nombre de la pasada corto a
// propósito: Codex 0.165 deja el socket de su servidor de fondo dentro de su
// carpeta, y con «vuelta-otros» la ruta pasaba del tope de un socket («path must
// be shorter than SUN_LEN») y Codex no arrancaba.
const casaCodex = join(base, "casa", ".codex");
const a = await abrirAislada({
  nombre,
  puertoMcp: PUERTO,
  depurar: DEPURAR,
  exe: process.argv[2] ?? EXE,
  sembrar: () => {
    const demo = join(base, "proyectos", "demo");
    mkdirSync(casaCodex, { recursive: true });
    writeFileSync(join(casaCodex, "auth.json"), JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-laboratorio-falsa-0000000000000000" }));
    writeFileSync(
      join(casaCodex, "config.toml"),
      [
        `model_provider = "laboratorio"`,
        `check_for_update_on_startup = false`,
        ``,
        `[model_providers.laboratorio]`,
        `name = "Laboratorio"`,
        `base_url = "${URL_API}/v1"`,
        `env_key = "OPENAI_API_KEY"`,
        `wire_api = "responses"`,
        `supports_websockets = false`,
        ``,
        `[projects."${demo.replace(/\\/g, "\\\\")}"]`,
        `trust_level = "trusted"`,
        ``,
      ].join("\r\n"),
    );
    const gem = join(base, "casa", ".gemini");
    mkdirSync(gem, { recursive: true });
    writeFileSync(join(gem, "settings.json"), JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } }, ui: { theme: "Default" }, general: { disableAutoUpdate: true, disableUpdateNag: true }, privacy: { usageStatisticsEnabled: false } }));
    writeFileSync(join(gem, "trustedFolders.json"), JSON.stringify({ [demo]: "TRUST_FOLDER" }));
  },
  entorno: { CODEX_HOME: casaCodex, OPENAI_API_KEY: "sk-laboratorio-falsa-0000000000000000", GEMINI_API_KEY: "laboratorio-falsa-0000000000000000", GOOGLE_GEMINI_BASE_URL: URL_API },
});

const LINEA = "[adeorq] Aviso de tus terminales";
/** Un módulo de la app tal como lo cargó la ventana (con su `?t=` si lo tiene). */
const urlDe = (archivo) => `(performance.getEntriesByType("resource").map((e) => e.name).find((n) => new URL(n).pathname === "/src/lib/${archivo}") ?? "/src/lib/${archivo}")`;
const importar = (archivo) => `import(${urlDe(archivo)})`;
const pantalla = (id) =>
  a.v.js(`${importar("terminales.ts")}.then((m) => {
    const t = m.xtermDe(${id});
    if (!t) return "";
    const b = t.buffer.active;
    const filas = [];
    for (let i = 0; i < b.length; i++) filas.push(b.getLine(i)?.translateToString(true) ?? "");
    return filas.join("\\n");
  })`);
const estadoDe = (id) => a.v.js(`${importar("cabina.ts")}.then((m) => m.useCabina.getState().estados[${id}]?.state ?? null)`);
const vuelta = (cuerpo) => a.v.js(`${importar("vueltaArribaVivo.ts")}.then((m) => ${cuerpo})`);
/** Cuántas veces sale `que` en la pantalla. Sin espacios ni saltos: el CLI parte
    las líneas largas a su manera (Gemini, por palabras y con relleno). */
const veces = (texto, que) => texto.replace(/\s+/g, "").split(que.replace(/\s+/g, "")).length - 1;
const enviadas = (cli) => recibido[cli].filter((c) => c.includes(LINEA)).length;
/** Lo de abajo de una pantalla, para contar un fallo. */
const abajo = (t) => t.split("\n").filter((l) => l.trim()).slice(-12).map((l) => `        ${l}`).join("\n");

const mira = a.puente(null);
try {
  await mira.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await mira.llamar("get_active_panes", {})).texto || ""), 15_000, 500);
  const abrir = async (cli, nombrePanel) => {
    const r = await mira.llamar("open_pane", { cli, cwd: a.demo, name: nombrePanel });
    const id = Number(/Terminal\s+(\d+)/.exec(r.texto ?? "")?.[1]);
    if (!Number.isFinite(id)) throw new Error(`open_pane ${cli}: ${r.texto ?? r.error}`);
    return id;
  };
  const madres = { gemini: await abrir("gemini", "madre-gemini"), codex: await abrir("codex", "madre-codex") };
  const hijas = { gemini: await abrir("shell", "hija-de-gemini"), codex: await abrir("shell", "hija-de-codex") };

  // Las dos madres, paradas en su caja. Codex necesita un turno para que el panel
  // aprenda su sesión del disco y su estado diga «lista», como una madre de verdad
  // que ya habló antes de repartir.
  const geminiLista = await hasta(async () => (await pantalla(madres.gemini)).includes("Type your message or @path/to/file"), 40_000, 1000);
  dice(!!geminiLista, "Gemini arranca y se para en su caja");
  // Lo tecleado antes de que acabe de arrancar se pierde: hasta su pie de atajos.
  await hasta(async () => (await pantalla(madres.codex)).includes("? for shortcuts"), 40_000, 1000);
  await dormir(3000);
  await mira.llamar("send_command", { paneId: madres.codex, command: "hola" });
  // Con el equipo cargado, el Intro de justo al arrancar a veces se pierde y el
  // «hola» se queda escrito en la caja: se vuelve a pulsar.
  for (let i = 0; i < 3 && !(await hasta(() => recibido.codex.length > 0, 10_000, 500)); i++) {
    await mira.llamar("send_keys", { paneId: madres.codex, keys: ["enter"] });
  }
  const codexLista = await hasta(async () => (await estadoDe(madres.codex)) === "lista", 60_000, 1000);
  dice(!!codexLista && recibido.codex.length > 0, "Codex contesta su primer turno y su panel dice «lista» (lo lee del disco)", `turnos en la API: ${recibido.codex.length}, estado: ${await estadoDe(madres.codex)}`);
  if (!codexLista) console.log(`      pedidos: ${pedidos.slice(-6).join(" · ") || "ninguno"}\n      pantalla:\n${(await pantalla(madres.codex)).split("\n").filter((l) => l.trim()).slice(-10).map((l) => `        ${l}`).join("\n")}`);

  for (const cli of ["gemini", "codex"]) {
    await vuelta(`(m.apuntarHija(${hijas[cli]}, ${madres[cli]}), "ok")`);
  }
  await dormir(2000);

  for (const cli of ["gemini", "codex"]) {
    const m = madres[cli];
    const r = await vuelta(`m.alEntregar({ hija: ${hijas[cli]}, madre: ${m}, estado: "hecho", resumen: "Primera entrega de prueba para ${cli}" })`);
    dice(r === "aceptado", `${cli}: la entrega se acepta (antes salía «sin_caja»)`, `sale ${r}`);
    const llego = await hasta(() => enviadas(cli) >= 1, 40_000, 1000);
    const t = await pantalla(m);
    dice(!!llego, `${cli}: le llega la línea tecleada y la envía a su modelo`, `turnos con la línea: ${enviadas(cli)}${llego ? "" : `\n${abajo(t)}`}`);
    dice(veces(t, "Primera entrega de prueba") >= 1, `${cli}: se ve en su pantalla`);
  }

  // Con un borrador en la caja, la línea espera; al vaciarla, llega.
  for (const cli of ["gemini", "codex"]) {
    const m = madres[cli];
    await hasta(async () => {
      const t = await pantalla(m);
      return !/esc to (cancel|interrupt)/.test(t.split("\n").slice(-12).join("\n")) && (cli === "gemini" || (await estadoDe(m)) === "lista");
    }, 40_000, 1000);
    await dormir(3000);
    await a.v.js(`${importar("pty.ts")}.then((p) => p.sendPty(${m}, "borrador de Munir", false)).then(() => "ok")`);
    await dormir(1500);
    const antes = enviadas(cli);
    await vuelta(`m.alEntregar({ hija: ${hijas[cli]}, madre: ${m}, estado: "hecho", resumen: "Segunda entrega de prueba para ${cli}" })`);
    await dormir(15_000);
    const t = await pantalla(m);
    dice(enviadas(cli) === antes && veces(t, "Segunda entrega de prueba") === 0, `${cli}: con un borrador en la caja, no se le teclea nada en 15 s`);
    dice(t.includes("borrador de Munir"), `${cli}: y su borrador sigue ahí`);
    await mira.llamar("send_keys", { paneId: m, keys: Array(17).fill("backspace") });
    const despues = await hasta(() => enviadas(cli) > antes, 40_000, 1000);
    dice(!!despues, `${cli}: al vaciar la caja, la línea llega`, `turnos con la línea: ${enviadas(cli)}`);
  }
} catch (e) {
  dice(false, "el laboratorio terminó", String(e?.stack ?? e));
} finally {
  mira.cerrar();
  await a.cerrar();
  api.close();
}
console.log(fallos ? `\n${fallos} fallos` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
