// El «a todas» de Adeo con un Codex y un Gemini de verdad: que la orden se ENVÍE
// en cada uno y no se quede escrita en su caja (t208, 2026-11-16).
//
// El plan de Adeo se contesta desde la página (`foreman_plan`, como en
// `capataz-cuentas-de-verdad.mjs`): una sola acción `a_todas` con `/init`, que
// es una orden de los dos y lo único que hace es mandarle un turno al modelo.
// Todo lo demás es la app de verdad: el botón «Ejecutar» y `onAll` en `App.tsx`.
// Se cuenta, en cada vuelta, si a cada API le llega un turno nuevo.
//
// Sin gastar: Codex y Gemini del PATH, con casa y claves falsas, contra dos API
// de mentira en este proceso que contestan «Hecho.» (la receta sale de
// `vuelta-arriba-otros-cli-de-verdad.mjs`). `/init` crea GEMINI.md vacío en
// Gemini y Codex se niega si ya hay AGENTS.md: se borran entre vueltas.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   node node_modules/vite/bin/vite.js --port 1420 --strictPort --host 127.0.0.1   (y apagarlo al acabar)
//   node scripts/laboratorio/a-todas-de-verdad.mjs [exe]
//
// Sale con 1 si alguna orden se queda sin enviar.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const nombre = "at";
const PUERTO = 44_000 + (process.pid % 800);
const DEPURAR = 9_450 + (process.pid % 40);
const VUELTAS = 3;
const ORDEN = "/init";
for (const k of Object.keys(process.env)) {
  if (/^CLAUDE/i.test(k) || /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_GENAI_USE_GCA|OPENAI_API_KEY|OPENAI_BASE_URL|CODEX_API_KEY|ANTHROPIC_API_KEY|CODEX_HOME|GEMINI_CLI_HOME|HTTPS?_PROXY|ALL_PROXY)$/i.test(k)) delete process.env[k];
}

/** Los turnos que llegan a cada API: uno nuevo es una orden ENVIADA. */
const recibido = { gemini: [], codex: [] };
const api = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
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

// El plan que devolvería el modelo, desde la página: lo mismo en todas.
const PLAN = JSON.stringify({ resumen: "La misma orden en todas.", acciones: [{ tipo: "a_todas", comando: ORDEN, motivo: "laboratorio" }] });
const guarda = `(() => {
  window.__planes = 0;
  const antes = window.fetch;
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/^https?:\\/\\/ipc\\.localhost\\/foreman_plan$/.test(url)) {
      window.__planes++;
      return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(PLAN)}), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return antes(a, b);
  };
})()`;

// Nombre corto a propósito: Codex deja el socket de su servidor de fondo dentro
// de su carpeta, y una ruta larga no le cabe («path must be shorter than SUN_LEN»).
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casaCodex = join(base, "casa", ".codex");
const demo = join(base, "proyectos", "demo");
const a = await abrirAislada({
  nombre,
  puertoMcp: PUERTO,
  depurar: DEPURAR,
  exe: process.argv[2] ?? EXE,
  guarda,
  sembrar: () => {
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

/** Un módulo de la app tal como lo cargó la ventana (con su `?t=` si lo tiene). */
const urlDe = (archivo) => `(performance.getEntriesByType("resource").map((e) => e.name).find((n) => new URL(n).pathname === "/src/lib/${archivo}") ?? "/src/lib/${archivo}")`;
const pantalla = (id) =>
  a.v.js(`import(${urlDe("terminales.ts")}).then((m) => {
    const t = m.xtermDe(${id});
    if (!t) return "";
    const b = t.buffer.active;
    const filas = [];
    for (let i = 0; i < b.length; i++) filas.push(b.getLine(i)?.translateToString(true) ?? "");
    return filas.join("\\n");
  })`);
const abajo = (t) => t.split("\n").filter((l) => l.trim()).slice(-8).map((l) => `        ${l}`).join("\n");
const CAJA = { codex: "? for shortcuts", gemini: "Type your message or @path/to/file" };

/** Adeo: se le pide el plan y se pulsa «Ejecutar», como haría Munir. */
async function aTodasPorAdeo() {
  const { v } = a;
  // Flotando (`.foreman-overlay`) o en el panel de la derecha (`.foreman-lateral`).
  const abierto = () => v.js(`!!document.querySelector(".foreman-box")`);
  if (!(await abierto())) await v.js(`document.querySelector(".foreman-call").click()`);
  if (!(await hasta(abierto, 8000))) throw new Error("Adeo no se abre");
  // Un plan de la vuelta anterior a la vista se descarta antes de pedir otro.
  await v.js(`(() => { const b = document.querySelector(".foreman-box .modal-cancel"); if (b && !document.querySelector(".foreman-input")) b.click(); return true; })()`);
  if (!(await hasta(() => v.js(`!!document.querySelector(".foreman-input")`), 8000))) throw new Error("Adeo no enseña su caja");
  await v.js(`(() => {
    const caja = document.querySelector(".foreman-input");
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(caja), "value").set.call(caja, "pon ${ORDEN} en todas las terminales");
    caja.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await dormir(300);
  const planes = await v.js(`window.__planes`);
  await v.js(`document.querySelector(".foreman-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })), "ok"`);
  const boton = `[...document.querySelectorAll(".foreman-box button")].find((b) => /^Ejecutar 1 acci/.test(b.textContent.trim()) && !b.disabled)`;
  if (!(await hasta(() => v.js(`!!${boton}`), 15_000, 300))) {
    const filas = await v.js(`[...document.querySelectorAll(".foreman-box .plan-item")].map((li) => li.innerText.replace(/\\s+/g, " ").trim()).join(" | ")`);
    throw new Error(`el plan no deja ejecutar (planes pedidos: ${(await v.js(`window.__planes`)) - planes}; filas: ${filas || "ninguna"})`);
  }
  await v.js(`${boton}.click(), "ok"`);
}

const mira = a.puente(null);
let fallo = "";
const sinEnviar = [];
const enviadas = { codex: 0, gemini: 0 };
try {
  await mira.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await mira.llamar("get_active_panes", {})).texto || ""), 15_000, 500);
  const abrir = async (cli) => {
    const r = await mira.llamar("open_pane", { cli, cwd: demo, name: `${cli}-a-todas` });
    const id = Number(/Terminal\s+(\d+)/.exec(r.texto ?? "")?.[1]);
    if (!Number.isFinite(id)) throw new Error(`open_pane ${cli}: ${r.texto ?? r.error}`);
    return id;
  };
  const paneles = { codex: await abrir("codex"), gemini: await abrir("gemini") };
  // Lo tecleado antes de que acaben de arrancar se pierde: hasta su caja.
  for (const cli of ["codex", "gemini"]) {
    if (!(await hasta(async () => (await pantalla(paneles[cli])).includes(CAJA[cli]), 60_000, 1000))) throw new Error(`${cli} no llegó a su caja\n${abajo(await pantalla(paneles[cli]))}`);
  }
  await dormir(3000);

  for (let vuelta = 1; vuelta <= VUELTAS; vuelta++) {
    for (const f of ["AGENTS.md", "GEMINI.md"]) if (existsSync(join(demo, f))) rmSync(join(demo, f), { force: true });
    const antes = { codex: recibido.codex.length, gemini: recibido.gemini.length };
    await aTodasPorAdeo();
    for (const cli of ["codex", "gemini"]) {
      const llego = await hasta(() => recibido[cli].length > antes[cli], 15_000, 250);
      console.log(`${llego ? "enviada  " : "SIN ENVIAR"} vuelta ${vuelta}: ${ORDEN} en ${cli}`);
      if (llego) {
        enviadas[cli]++;
        continue;
      }
      sinEnviar.push(`${cli} ${vuelta}`);
      console.log(abajo(await pantalla(paneles[cli])));
      // Se vacía su caja para que no se junte con la vuelta siguiente.
      await mira.llamar("send_keys", { paneId: paneles[cli], keys: Array(12).fill("backspace") });
    }
    // Que acaben su turno («Hecho.») y vuelvan a su caja vacía.
    for (const cli of ["codex", "gemini"]) await hasta(async () => (await pantalla(paneles[cli])).includes(CAJA[cli]), 20_000, 500);
    await dormir(2000);
  }
} catch (e) {
  fallo = String(e?.stack ?? e);
} finally {
  mira.cerrar();
  await a.cerrar();
  api.close();
}
if (fallo) console.log(`FALLO ${fallo}`);
console.log(`\nCodex ${enviadas.codex} de ${VUELTAS}, Gemini ${enviadas.gemini} de ${VUELTAS} enviadas con un solo «a todas».${sinEnviar.length ? ` Sin enviar: ${sinEnviar.join(", ")}` : ""}`);
process.exitCode = fallo || sinEnviar.length ? 1 : 0;
