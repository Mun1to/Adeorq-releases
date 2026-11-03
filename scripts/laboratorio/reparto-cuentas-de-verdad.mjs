// `open_pane` con y sin cuenta, y `get_usage` con todas, en una Adeorq aislada.
//
// Munir, 2026-11-02: «tengo una cuenta pro de claude que no le han delegado
// casi ninguna tarea, va por el 17 % de la semana y se resetea en 2 días». Las
// delegadas iban todas a la misma cuenta porque `open_pane` no pasaba
// `account`, y `get_usage` no enseñaba la principal ni cuándo se renovaba nada.
//
// Sin gastar cuota de nadie: una casa de pruebas con cuatro cuentas de Claude
// de mentira (credenciales falsas, su cuota sembrada en la caché de la ventana)
// y un `claude` DOBLE delante en el PATH que solo escribe su `CLAUDE_CONFIG_DIR`
// y sus argumentos. Se mira:
//   · `get_usage` lista la principal y las otras, con cuándo se renuevan en
//     palabras, el tope de 5 horas aparte y a dónde va la siguiente;
//   · `open_pane` sin `account` nace en la Pro al 17 % que se renueva en 2 días
//     (su `CLAUDE_CONFIG_DIR`, en modo auto), lo dice, su carpeta queda de
//     confianza EN ESA cuenta y su cabecera lleva sus iniciales;
//   · con `account: "principal"`, sin `CLAUDE_CONFIG_DIR` y la confianza en la
//     casa; con una que no existe, error; con una llena, esa, a la fuerza.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/reparto-cuentas-de-verdad.mjs [exe]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `\n      ${detalle}` : ""}`);
};

// Lanzado desde una terminal de Claude Code, el entorno trae SU cuenta: la app
// aislada la heredaría y la principal no sería la principal.
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const nombre = "reparto-cuentas";
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casa = join(base, "casa");
const doble = join(base, "doble");
// Donde las crea Adeorq (`accounts.rs`): ahí busca también los transcripts de
// cada cuenta (`raices_claude`), y sin eso un panel de otra cuenta no tendría
// conversación que retomar.
const cuentasDir = join(base, "datos", "Adeorq", "accounts");
mkdirSync(doble, { recursive: true });
writeFileSync(
  join(doble, "claude.cmd"),
  [
    "@echo off",
    "echo DOBLE CONFIG=[%CLAUDE_CONFIG_DIR%]",
    "echo DOBLE ARGS=%*",
    '>>"%~dp0diario.txt" echo [%CLAUDE_CONFIG_DIR%] %*',
    "",
  ].join("\r\n"),
);
// Y uno de Codex: en el Lienzo una terminal de Codex es la pieza «shell», y aun
// así tiene que volver a su `CODEX_HOME`.
writeFileSync(
  join(doble, "codex.cmd"),
  ['@echo off', '>>"%~dp0diario.txt" echo CODEX[%CODEX_HOME%] %*', ""].join("\r\n"),
);

const HORA = 3_600_000;
const DIA = 24 * HORA;
const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Como lo escribe Claude en su tarjeta: «Nov 4, 8am (Europe/Madrid)». */
const comoClaude = (ms) => {
  const f = new Date(ms);
  const h = f.getHours();
  return `${MESES[f.getMonth()]} ${f.getDate()}, ${h % 12 || 12}${h < 12 ? "am" : "pm"} (Europe/Madrid)`;
};
// A la hora en punto, que es como renueva Claude y como lo escribe sin minutos.
const enPunto = (ms) => Math.floor(ms / HORA) * HORA;
const ahora = Date.now();
const cuentas = [
  { id: "c-pro", label: "2da MAIN", plan: "pro", semana: 17, renueva: enPunto(ahora + 2 * DIA), sesion: 10 },
  { id: "c-llena", label: "Llena", plan: "max", semana: 95, renueva: enPunto(ahora + 3 * HORA), sesion: 0 },
  { id: "c-parada", label: "Parada", plan: "max", semana: 5, renueva: enPunto(ahora + DIA), sesion: 100 },
  // Sin suscripción y casi llena: nunca la elige sola; se pide a propósito para
  // ver que el Opus de fábrica baja al techo de su plan (R3.3).
  { id: "c-gratis", label: "Gratis", plan: "free", semana: 90, renueva: enPunto(ahora + 6 * DIA), sesion: 0 },
].map((c) => ({ ...c, dir: join(cuentasDir, c.id) }));
const principal = { label: "Principal", plan: "max", semana: 60, renueva: enPunto(ahora + 5 * DIA), sesion: 20, dir: join(casa, ".claude") };

const cuentaCodex = { id: "c-codex", label: "Codex 2", dir: join(cuentasDir, "c-codex"), provider: "codex" };
mkdirSync(cuentaCodex.dir, { recursive: true });
const credenciales = (plan) => JSON.stringify({ claudeAiOauth: { subscriptionType: plan, accessToken: "de-mentira" } });
for (const c of [...cuentas, principal]) {
  mkdirSync(c.dir, { recursive: true });
  writeFileSync(join(c.dir, ".credentials.json"), credenciales(c.plan));
}
for (const c of cuentas) writeFileSync(join(c.dir, ".claude.json"), JSON.stringify({ projects: {} }));
// Las barreras de la principal, con cosas que NO tienen que viajar, y algo suyo en la Pro.
writeFileSync(
  join(principal.dir, "settings.json"),
  JSON.stringify({
    model: "fable",
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node guardian-de-prueba.mjs" }] }] },
    permissions: { allow: ["Bash(ls)"], deny: ["Bash(rm -rf *)"] },
    attribution: { commit: "" },
  }),
);
writeFileSync(join(cuentas[0].dir, "settings.json"), JSON.stringify({ theme: "suyo" }));
writeFileSync(join(casa, ".claude.json"), JSON.stringify({ projects: {} }));

const tarjeta = (c) => ({
  note: "",
  plan: "",
  lines: [
    { label: "Current session", percent: c.sesion, resets: comoClaude(enPunto(ahora + 3 * HORA)), resetsAt: 0 },
    { label: "Current week (all models)", percent: c.semana, resets: comoClaude(c.renueva), resetsAt: 0 },
  ],
});
const cuota = Object.fromEntries([
  [`claude|`, { at: ahora, limits: tarjeta(principal) }],
  ...cuentas.map((c) => [`claude|${c.dir}`, { at: ahora, limits: tarjeta(c) }]),
]);
const guarda = `(() => {
  localStorage.setItem("adeorq-accounts", ${JSON.stringify(JSON.stringify({ accounts: [...cuentas.map(({ id, label, dir }) => ({ id, label, dir, provider: "claude" })), cuentaCodex], defaultAccount: "main:claude" }))});
  const c = ${JSON.stringify(cuota)};
  for (const v of Object.values(c)) v.at = Date.now();
  localStorage.setItem("adeorq-cuota", JSON.stringify(c));
})()`;

const puertoMcp = 47_000 + (process.pid % 900);
const a = await abrirAislada({
  nombre,
  puertoMcp,
  depurar: 9750 + (process.pid % 100),
  exe,
  guarda,
  entorno: { PATH: `${doble};${process.env.PATH}` },
});
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  let agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });

  // 1. get_usage
  const uso = (await agente.llamar("get_usage", {})).texto ?? "";
  console.log(`\n--- get_usage ---\n${uso}\n-----------------`);
  dice(/Claude Code · «Principal».*60 % de su semana.*se renueva en 5 días/.test(uso), "get_usage lista la principal, con su % y cuándo se renueva");
  dice(/«2da MAIN».*17 % de su semana · se renueva en 2 días, el \S+ a las \d+:00/.test(uso), "y la Pro, con la renovación en palabras");
  dice(/«Parada».*PARADA ahora por su tope de 5 horas, vuelve en [23] h, (hoy|mañana) a las \d+:00/.test(uso), "el tope de 5 horas va aparte");
  dice(!/Copilot · «Principal» · plan/.test(uso), "un CLI que no deja su plan en disco no hereda el de Claude");
  dice(/Claude Code → «2da MAIN»/.test(uso), "y la siguiente terminal de Claude va a la Pro");

  // 2. open_pane sin account
  const abrir = async (args, quien = agente) => {
    const r = await quien.llamar("open_pane", { cli: "claude", cwd: a.demo, brief: "", ...args });
    const id = Number(/Terminal\s+(\d+)/.exec(r.texto || "")?.[1]);
    return { ...r, id };
  };
  const pantalla = async (id) =>
    (await hasta(async () => {
      const t = (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
      // Las filas de la pantalla parten una ruta larga en dos: se juntan, y
      // cada «DOBLE» empieza su propia línea.
      return /DOBLE ARGS/.test(t) ? t.replace(/\r?\n/g, "").replace(/DOBLE/g, "\nDOBLE") : null;
    }, 20_000, 700)) ?? "";
  const confiada = (fichero) => {
    const j = JSON.parse(readFileSync(fichero, "utf8"));
    return Object.entries(j.projects ?? {}).some(([k, v]) => k.toLowerCase() === a.demo.replace(/\\/g, "/").toLowerCase() && v.hasTrustDialogAccepted === true);
  };

  const sola = await abrir({ name: "sin cuenta" });
  console.log(`\n--- open_pane sin account ---\n${sola.texto ?? sola.error}`);
  dice(Number.isFinite(sola.id) && /2da MAIN/.test(sola.texto ?? ""), "sin `account` elige la Pro y lo dice", sola.texto ?? sola.error);
  dice(/NO ve la memoria de la principal/.test(sola.texto ?? ""), "y avisa de que en otra cuenta no ve la memoria de la principal", sola.texto);
  const p1 = await pantalla(sola.id);
  console.log(p1.split("\n").filter((l) => /DOBLE/.test(l)).join("\n"));
  dice(p1.includes(`DOBLE CONFIG=[${cuentas[0].dir}]`), "su terminal nace con el CLAUDE_CONFIG_DIR de la Pro", p1);
  dice(/DOBLE ARGS=.*--permission-mode auto/.test(p1), "y en modo auto");
  dice(confiada(join(cuentas[0].dir, ".claude.json")) && !confiada(join(casa, ".claude.json")), "la carpeta queda de confianza en la Pro, no en la principal");
  const ajustesPro = JSON.parse(readFileSync(join(cuentas[0].dir, "settings.json"), "utf8"));
  dice(
    ajustesPro.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command === "node guardian-de-prueba.mjs" && ajustesPro.permissions?.deny?.[0] === "Bash(rm -rf *)" && ajustesPro.attribution?.commit === "",
    "las barreras de la principal llegan a la cuenta con la que nace",
    JSON.stringify(ajustesPro),
  );
  dice(ajustesPro.theme === "suyo" && !ajustesPro.model && !ajustesPro.permissions?.allow, "lo suyo se queda, y el modelo y los permisos de la principal no viajan", JSON.stringify(ajustesPro));
  const cabecera = await a.v.js(`document.querySelector('[data-pane-id="${sola.id}"] .pane-account')?.textContent ?? ""`);
  dice(cabecera === "2da", "la cabecera de la Cabina lleva sus iniciales", JSON.stringify(cabecera));
  console.log(`      foto: ${await a.foto(null, "reparto-cuentas-cabina.png")}`);

  // 2b. R3.2: la segunda seguida, con la misma foto, cuenta la que ya abrió.
  const segunda = await abrir({ name: "segunda" });
  dice(/más 1 terminal abierta desde entonces \(\+10\)/.test(segunda.texto ?? ""), "una segunda apertura seguida cuenta la que ya abrió en esa cuenta", segunda.texto ?? segunda.error);
  // 2b bis. Dos A LA VEZ, que es lo que pide el propio MCP («at the same time»):
  // dos agentes distintos, o un cliente que lanza en paralelo. Las dos pasan por
  // la misma foto y ninguna ha nacido aún cuando decide la otra.
  const otro = a.puente(null);
  await otro.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const [x, y] = await Promise.all([abrir({ name: "a la vez 1" }), abrir({ name: "a la vez 2" }, otro)]);
  const llevan = (t) => Number(/más (\d+) terminal/.exec(t ?? "")?.[1] ?? 0);
  dice(Math.abs(llevan(x.texto) - llevan(y.texto)) === 1, "dos a la vez: una cuenta a la otra aunque aún esté naciendo", `${x.texto ?? x.error}\n${y.texto ?? y.error}`);
  // Y `get_usage` dice lo que va a pasar de verdad: la siguiente, con las que ya lleva.
  const usoTras = (await agente.llamar("get_usage", {})).texto ?? "";
  dice(/Claude Code → «2da MAIN».*más 4 terminales abiertas/.test(usoTras), "get_usage cuenta las que ya abrió en esa cuenta", usoTras);
  // Con «fuera de Adeorq» subido, como nace aquí, el puerto también escribe: es lo
  // que necesita la prueba del Mac (`scripts/macos/probar-app.mjs`).
  const escrito = await agente.llamar("send_command", { paneId: x.id, command: "echo hola" });
  dice(!!escrito.texto && !escrito.error, "con «fuera de Adeorq» subido, lo de fuera escribe en una terminal", escrito.texto ?? escrito.error);
  // Fuera, para no llegar al tope de seis vivas con lo que falta por abrir.
  const cierre = "Laboratorio del reparto: ya medí lo que tenía que medir de esta terminal.";
  await agente.llamar("close_pane", { paneId: segunda.id, rastro: cierre });
  await agente.llamar("close_pane", { paneId: x.id, rastro: cierre });
  await otro.llamar("close_pane", { paneId: y.id, rastro: cierre });
  // 2c. R3.3: una cuenta sin suscripción, con el Opus que pone `mcp.rs` de fábrica.
  const gratis = await abrir({ name: "gratis", account: "gratis" });
  const pg = await pantalla(gratis.id);
  dice(/--model sonnet/.test(pg) && !/--model opus/.test(pg) && /Nace con sonnet y no con opus/.test(gratis.texto ?? ""), "en una cuenta gratis el Opus de fábrica baja a sonnet, y se dice", (gratis.texto ?? gratis.error) + "\n" + pg);

  // 3. account: principal
  const main = await abrir({ name: "principal", account: "principal" });
  const p2 = await pantalla(main.id);
  dice(/la que pediste/.test(main.texto ?? "") && p2.includes("DOBLE CONFIG=[]"), "con `principal`, sin CLAUDE_CONFIG_DIR", (main.texto ?? main.error) + "\n" + p2);
  dice(!/NO ve la memoria/.test(main.texto ?? ""), "y en la principal no hay aviso de memoria", main.texto);
  dice(confiada(join(casa, ".claude.json")), "y la confianza en el .claude.json de la casa");

  // 4. una que no existe, y una llena pedida a propósito
  const nada = await abrir({ name: "no existe", account: "4ta MAIN" });
  dice(!!nada.error && /4ta MAIN/.test(nada.error) && /2da MAIN/.test(nada.error), "una cuenta que no existe da error con las que hay", JSON.stringify(nada));
  const llena = await abrir({ name: "llena", account: "llena" });
  const p3 = await pantalla(llena.id);
  dice(p3.includes(`DOBLE CONFIG=[${cuentas[1].dir}]`), "una pedida a propósito se respeta aunque vaya llena", p3);

  // 5. La delegada vuelve a SU cuenta: con Reanimar y al reiniciar Adeorq. Si
  //    volviera en la predeterminada, su `--resume` buscaría la conversación
  //    en una carpeta que no la tiene.
  const sid = /--session-id (\S+)/.exec(p1)?.[1];
  dice(!!sid, "la de la Pro nació con su conversación", p1);
  // El doble no escribe conversación: se la escribo yo, una respuesta con su
  // contexto, en la carpeta de la Pro. Sin transcript, Reanimar abre otra limpia.
  const suya = join(cuentas[0].dir, "projects", a.demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(suya, { recursive: true });
  writeFileSync(
    join(suya, `${sid}.jsonl`),
    JSON.stringify({ type: "assistant", sessionId: sid, cwd: a.demo, message: { role: "assistant", model: "claude-haiku-4-5", content: [{ type: "text", text: "hecho" }], usage: { input_tokens: 1200, output_tokens: 3 } } }) + "\n",
  );
  // Que el panel la vea antes de pedirle nada (su contexto se lee cada pocos segundos).
  const visto = await hasta(
    () => a.v.js(`window.__TAURI_INTERNALS__.invoke("session_context", { cwd: ${JSON.stringify(a.demo)}, sessionId: ${JSON.stringify(sid)} }).then((c) => c ? JSON.stringify(c) : "")`),
    15_000,
    500,
  );
  dice(!!visto, "Adeorq encuentra su conversación en la carpeta de la Pro", visto);
  // El panel relee su contexto cada 20 s cuando no encontró nada (`useContextoDeSesion`).
  await new Promise((r) => setTimeout(r, 22_000));
  const retomada = async () => {
    const ids = JSON.parse(await a.v.js(`JSON.stringify([...document.querySelectorAll("[data-pane-id]")].map((e) => Number(e.getAttribute("data-pane-id"))))`));
    for (const id of [...new Set(ids)]) {
      const t = (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
      const junta = t.replace(/\r?\n/g, "").replace(/DOBLE/g, "\nDOBLE");
      if (junta.includes(`--resume ${sid}`)) return { id, pantalla: junta };
    }
    return null;
  };
  /** Lo que hay en cada panel, para cuando no aparece la que se busca. */
  const todas = async () => {
    const ids = JSON.parse(await a.v.js(`JSON.stringify([...document.querySelectorAll("[data-pane-id]")].map((e) => Number(e.getAttribute("data-pane-id"))))`));
    const out = [];
    for (const id of [...new Set(ids)]) {
      const t = ((await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "").replace(/\r?\n/g, "").replace(/DOBLE/g, "\nDOBLE");
      out.push(`#${id}: ${t.split("\n").filter((l) => /DOBLE/.test(l)).map((l) => l.slice(0, 160)).join(" | ") || t.slice(0, 200)}`);
    }
    return out.join("\n      ");
  };
  await a.v.js(`(() => {
    const p = document.querySelector('[data-pane-id="${sola.id}"]');
    p.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
    return true;
  })()`);
  const pulsado = await hasta(() => a.v.js(`(() => {
    const b = [...document.querySelectorAll("button, [role=menuitem], li, div")].find((x) => x.children.length < 3 && /Reanimar/.test(x.textContent ?? "") && (x.textContent ?? "").length < 90);
    b?.click();
    return !!b;
  })()`), 5_000, 300);
  dice(!!pulsado, "el menú del panel ofrece Reanimar");
  const revivida = await hasta(retomada, 20_000, 800);
  if (!revivida) console.log(`      paneles: ${await todas()}`);
  console.log(`      reanimada: ${revivida?.pantalla.split("\n").filter((l) => /DOBLE CONFIG/.test(l)).join(" ") ?? "no apareció"}`);
  dice(!!revivida && revivida.pantalla.includes(`DOBLE CONFIG=[${cuentas[0].dir}]`), "Reanimar la retoma en la Pro", revivida?.pantalla ?? "no apareció");
  const cabRevivida = revivida ? await a.v.js(`document.querySelector('[data-pane-id="${revivida.id}"] .pane-account')?.textContent ?? ""`) : "";
  dice(cabRevivida === "2da", "y su cabecera sigue diciendo 2DA", JSON.stringify(cabRevivida));

  // Tras reiniciar, las pantallas recreadas se leen en blanco por el MCP, así
  // que se mira el diario del doble: cada arranque deja ahí su cuenta y sus
  // argumentos, y solo cuentan las líneas escritas DESPUÉS de reiniciar (la de
  // Reanimar, de antes, también lleva `--resume`).
  const leerDiario = () => { try { return readFileSync(join(doble, "diario.txt"), "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };

  // 6. R3.4: una delegada en el LIENZO, que guarda su tablero aparte
  //    (`CanvasView.tsx`), también tiene que volver en su cuenta.
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Lienzo/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  await new Promise((r) => setTimeout(r, 1500));
  const enLienzo = await abrir({ name: "en el lienzo" });
  dice(/en el lienzo/.test(enLienzo.texto ?? "") && /2da MAIN/.test(enLienzo.texto ?? ""), "en el Lienzo también nace en la Pro", enLienzo.texto ?? enLienzo.error);
  const pl = await pantalla(enLienzo.id);
  const sidL = /--session-id (\S+)/.exec(pl)?.[1];
  writeFileSync(
    join(suya, `${sidL}.jsonl`),
    JSON.stringify({ type: "assistant", sessionId: sidL, cwd: a.demo, message: { role: "assistant", model: "claude-haiku-4-5", content: [{ type: "text", text: "hecho" }], usage: { input_tokens: 900, output_tokens: 3 } } }) + "\n",
  );
  // 6b. Y una de Codex en otra cuenta, también en el Lienzo.
  const codexL = await abrir({ name: "codex en el lienzo", cli: "codex", account: "Codex 2" });
  dice(/en el lienzo/.test(codexL.texto ?? "") && /Codex 2/.test(codexL.texto ?? ""), "un Codex en otra cuenta nace en el Lienzo", codexL.texto ?? codexL.error);
  // Que el Lienzo guarde su tablero con ellas dentro antes de irse.
  await new Promise((r) => setTimeout(r, 4000));
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);

  const antesDeReiniciar = leerDiario().length;
  // Lo que se guarda para volver: el panel reanimado, con el entorno de la Pro.
  const guardado = await hasta(() => a.v.js(`(() => {
    const l = JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}");
    const p = (l.panes ?? []).find((x) => (x.command ?? []).join(" ").includes(${JSON.stringify(`--resume ${sid}`)}));
    return p ? JSON.stringify({ env: p.env, account: p.account }) : "";
  })()`), 10_000, 500);
  dice(!!guardado && guardado.includes(JSON.stringify(cuentas[0].dir).slice(1, -1)) && /2da MAIN/.test(guardado), "el tablero guardado la lleva con el CLAUDE_CONFIG_DIR de la Pro", guardado);
  await a.reiniciar();
  agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  const tras = await hasta(() => {
    const nuevas = leerDiario().slice(antesDeReiniciar);
    return nuevas.filter((l) => l.includes(`--resume ${sid}`)).slice(-1)[0] ?? null;
  }, 90_000, 1000);
  console.log(`      tras reiniciar: ${tras ?? "no apareció"}`);
  if (!tras) {
    console.log(`      diario: ${leerDiario().join(" || ")}`);
    console.log(`      paneles: ${(await agente.llamar("get_active_panes", {})).texto ?? ""}`);
    console.log(`      guardado: ${await a.v.js(`JSON.stringify((JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}").panes ?? []).map((p) => [p.id, (p.command ?? []).join(" ").slice(-90)]))`)}`);
    try { console.log(`      rastro: ${readFileSync(join(base, "datos", "Adeorq", "rastro.log"), "utf8").slice(-1500)}`); } catch {}
    console.log(`      xterm: ${await a.v.js(`JSON.stringify([...document.querySelectorAll("[data-pane-id]")].map((e) => e.getAttribute("data-pane-id") + ": " + (e.querySelector(".xterm-rows")?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 300)))`)}`);
  }
  dice(!!tras && tras.startsWith(`[${cuentas[0].dir}]`), "al reiniciar Adeorq vuelve en la Pro", tras ?? "no apareció");
  const cabTras = await hasta(() => a.v.js(`(() => { const c = [...document.querySelectorAll(".pane-account")].map((e) => e.textContent); return c.includes("2da") ? JSON.stringify(c) : ""; })()`), 15_000, 500);
  dice(!!cabTras, "y su cabecera sigue diciendo 2DA", cabTras);

  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Lienzo/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  const trasL = await hasta(() => leerDiario().slice(antesDeReiniciar).filter((l) => l.includes(`--resume ${sidL}`)).slice(-1)[0] ?? null, 90_000, 1000);
  console.log(`      lienzo tras reiniciar: ${trasL ?? "no apareció"}`);
  if (!trasL) console.log(`      diario: ${leerDiario().slice(antesDeReiniciar).join(" || ")}`);
  dice(!!trasL && trasL.startsWith(`[${cuentas[0].dir}]`), "la del Lienzo vuelve en la Pro al reiniciar", trasL ?? "no apareció");
  const codexTras = await hasta(() => leerDiario().slice(antesDeReiniciar).filter((l) => l.startsWith("CODEX[")).slice(-1)[0] ?? null, 60_000, 1000);
  console.log(`      codex tras reiniciar: ${codexTras ?? "no apareció"}`);
  dice(!!codexTras && codexTras.startsWith(`CODEX[${cuentaCodex.dir}]`), "la de Codex del Lienzo vuelve a su CODEX_HOME al reiniciar", codexTras ?? "no apareció");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
