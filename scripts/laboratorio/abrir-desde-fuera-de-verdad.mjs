// Abrir terminales desde fuera de Adeorq, de verdad y sin gastar: `claude` y `codex`
// de mentira delante en el PATH de la app, y un programa de fuera que es un socket.
// Lo que se mide es lo que la revisión E15 (2026-11-04) vio fallar con la 0.9.239:
//
//   · un encargo no decide qué programa es la terminal. Con encargo, la línea es
//     `$env:ADEORQ_ENCARGO = '…'; $adeorqExe = 'codex'…`: el texto va delante, y un
//     Codex cuyo encargo nombraba a Claude subía a su escalón (y al revés, un Claude
//     se quedaba sin escribir en otras);
//   · una carpeta con un `claude.cmd` o un `chcp.cmd` dentro no se ejecuta al abrir
//     una terminal en ella, y por tanto no se lleva la contraseña de esa terminal;
//   · una carpeta que no existe es un error: el panel nacía en la del usuario sin
//     decirlo, y la ventana de «Abrir» habría aprobado otra de la que enseña;
//   · muchas a la vez no se cuelan por encima de un tope de 6 vivas (sembrado fijo);
//   · de fábrica lee lo que abrió, con y sin encargo, y no lo de otro programa (A1).
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   node scripts/laboratorio/abrir-desde-fuera-de-verdad.mjs [exe]
//
// Sale con 1 si algo falla. El MCP va en su propio puerto, con su casa y sus datos.
// Con el equipo muy cargado (otra sesión pasando sus pruebas y un `cargo build` al
// lado), la hija Codex tardó una vez más de los 30 s de `claveDe` y salió «las dos
// hijas han nacido» en rojo; las dos vueltas siguientes, verdes (15 y 16-nov).
// Antes de buscar un fallo ahí, repítelo con el equipo quieto.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const nombre = "abrir-desde-fuera";
const PUERTO = 40_000 + (process.pid % 900);
const DEPURAR = 9_500 + (process.pid % 100);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
for (const k of Object.keys(process.env)) {
  if (/^CLAUDE/i.test(k) || /^(GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY)$/i.test(k)) delete process.env[k];
}

const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
mkdirSync(join(base, "lab-bin"), { recursive: true });
const exe = join(base, "lab-bin", "adeorq.exe");
copyFileSync(process.argv[2] ?? EXE, exe);
const doble = join(base, "doble");
mkdirSync(doble, { recursive: true });
for (const prog of ["claude", "codex"]) {
  writeFileSync(join(doble, `${prog}.cmd`), ["@echo off", `>>"%~dp0paneles.txt" echo ${prog} %ADEORQ_PANE_ID% %ADEORQ_PANE_CLAVE%`, ""].join("\r\n"));
}
const paneles = () => (existsSync(join(doble, "paneles.txt")) ? readFileSync(join(doble, "paneles.txt"), "utf8").trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/)) : []);
const claveDe = async (id) => (await hasta(() => paneles().find((f) => f[1] === String(id)), 30_000, 150))?.[2];

/** Un cliente MCP crudo, como un programa cualquiera. Con `panel`, se presenta como esa terminal. */
async function cliente(quien, panel) {
  const s = connect(PUERTO, "127.0.0.1");
  let buf = "";
  const lineas = [];
  s.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (l) lineas.push(l);
    }
  });
  await new Promise((ok, mal) => {
    s.once("connect", ok);
    s.once("error", mal);
  });
  const escribir = (o) => s.write(JSON.stringify(o) + "\n");
  let n = 0;
  const pedir = async (method, params, ms = 20_000) => {
    const id = ++n;
    escribir({ jsonrpc: "2.0", id, method, params });
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      const i = lineas.findIndex((l) => JSON.parse(l).id === id);
      if (i >= 0) return JSON.parse(lineas.splice(i, 1)[0]);
      await dormir(40);
    }
    return { error: { message: `sin respuesta en ${ms / 1000} s` } };
  };
  if (panel) escribir({ adeorq: "panel", id: panel.id, clave: panel.clave });
  await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: quien, version: "9.9.9" } });
  escribir({ jsonrpc: "2.0", method: "notifications/initialized" });
  const llamar = async (name, args, ms) => {
    const r = await pedir("tools/call", { name, arguments: args }, ms);
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.map((c) => c.text).join("\n") ?? "" };
  };
  const herramientas = async () => ((await pedir("tools/list", {})).result?.tools ?? []).map((t) => t.name);
  return { llamar, herramientas, cerrar: () => s.destroy() };
}
const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
const corto = (r) => (r.error ?? r.texto ?? "").replace(/\s+/g, " ").slice(0, 150);

// El tope fijo en 6 (de fábrica va por la memoria libre, `cabida.rs`): la ráfaga de
// abajo mide que ninguna se cuela por encima de un número, no cuánta memoria tiene el equipo.
const sembrar = (datos) => writeFileSync(join(datos, "tope-agentes.json"), JSON.stringify({ porMemoria: false, comoMucho: 6 }));
const aislada = await abrirAislada({ nombre, fueraConTodo: false, puertoMcp: PUERTO, depurar: DEPURAR, exe, sembrar, entorno: { PATH: `${doble};${process.env.PATH}` } });
try {
  const { demo } = aislada;
  const fuera = await cliente("un-programa");
  await hasta(async () => /Arranque de Adeorq/.test((await fuera.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  await dormir(800);
  const cerrarLas = async (quien, ids) => {
    for (const id of ids) {
      const r = await quien.llamar("close_pane", { paneId: id, rastro: "Prueba del laboratorio abrir-desde-fuera: no hizo nada más que nacer. Su parte es la salida de este laboratorio y no queda nada pendiente." });
      if (r.error) console.log(`      (no cerró la ${id}: ${corto(r)})`);
    }
    await dormir(1500);
  };

  console.log("\n── Un encargo no decide qué programa es la terminal");
  {
    const a = numero(await fuera.llamar("open_pane", { cli: "claude", cwd: demo, name: "madre" }));
    const madre = await cliente("claude-code", { id: a, clave: await claveDe(a) });
    dice((await madre.herramientas()).includes("send_command"), "una terminal de Claude escribe en otras");
    await madre.llamar("get_active_panes", {});
    const b = numero(await madre.llamar("open_pane", { cli: "claude", cwd: demo, name: "hija-claude", brief: "revisa lo de codex ahora mismo" }));
    const c = numero(await madre.llamar("open_pane", { cli: "codex", cwd: demo, name: "hija-codex", brief: "que lo mire claude ahora mismo" }));
    const claveB = await claveDe(b);
    const claveC = await claveDe(c);
    dice(!!claveB && !!claveC, "las dos hijas han nacido y dicen su contraseña", `paneles: ${paneles().map((f) => f.slice(0, 2).join(" ")).join(", ")} · b=${b} c=${c}`);
    const hb = await cliente("claude-code", { id: b, clave: claveB });
    const hc = await cliente("codex-mcp-client", { id: c, clave: claveC });
    dice((await hb.herramientas()).includes("send_command"), "un Claude con un encargo que nombra a Codex sigue siendo Claude");
    dice(!(await hc.herramientas()).includes("send_command"), "un Codex con un encargo que nombra a Claude sigue siendo Codex");
    for (const x of [hb, hc]) x.cerrar();
    await cerrarLas(madre, [b, c]);
    madre.cerrar();
    await cerrarLas(fuera, [a]);
  }

  console.log("\n── Una carpeta con un programa del mismo nombre dentro");
  {
    const abiertas = [];
    for (const planta of ["claude", "chcp"]) {
      const dir = join(base, `carpeta-${planta}`);
      mkdirSync(dir, { recursive: true });
      const robado = join(dir, "robado.txt");
      writeFileSync(join(dir, `${planta}.cmd`), ["@echo off", `>"${robado}" echo %ADEORQ_PANE_ID% %ADEORQ_PANE_CLAVE%`, ""].join("\r\n"));
      const antes = paneles().length;
      const id = numero(await fuera.llamar("open_pane", { cli: "claude", cwd: dir, name: `carpeta ${planta}` }));
      abiertas.push(id);
      const arranco = await hasta(() => paneles().length > antes || existsSync(robado), 8000, 150);
      await dormir(800);
      dice(!!arranco && !existsSync(robado), `abrir ahí no ejecuta su ${planta}.cmd`, existsSync(robado) ? `se llevó: ${readFileSync(robado, "utf8").trim().slice(0, 12)}…` : "");
      dice(paneles().length > antes, `arranca el claude del PATH, no el de la carpeta (${planta})`);
    }
    await cerrarLas(fuera, abiertas);

    const noEsta = await fuera.llamar("open_pane", { cli: "shell", cwd: join(base, "esta-no-existe"), name: "no existe" });
    let donde = "";
    if (!noEsta.error) {
      await dormir(2500);
      donde = corto(await fuera.llamar("read_pane_screen", { paneId: numero(noEsta) }));
      await cerrarLas(fuera, [numero(noEsta)]);
    }
    dice(/No existe la carpeta/.test(noEsta.error ?? ""), "una carpeta que no existe es un error, no otra carpeta", noEsta.error ? "" : `nació en: ${donde}`);
    const relativa = await fuera.llamar("open_pane", { cli: "shell", cwd: "..\\relativa", name: "relativa" });
    dice(/este equipo/.test(relativa.error ?? ""), "desde fuera, una ruta relativa tampoco", corto(relativa));
    if (!relativa.error) await cerrarLas(fuera, [numero(relativa)]);
  }

  // Solo una terminal más: el tope es de 12 por hora, y la ráfaga de abajo necesita 6.
  console.log("\n── De fábrica, lo de fuera con encargo pasa por la ventana, y lee lo que abrió");
  {
    const espera = fuera.llamar("open_pane", { cli: "claude", cwd: demo, name: "con encargo", brief: "ENCARGO-A1: no hagas nada." }, 30_000);
    const enLaVentana = await hasta(() => aislada.v.js(`document.querySelector(".abrir-modal")?.innerText ?? null`), 10_000, 100);
    dice(!!enLaVentana && enLaVentana.includes("ENCARGO-A1"), "con encargo sale la ventana", enLaVentana ?? "no salió");
    await hasta(() => aislada.v.js(`(() => { const b = document.querySelector(".abrir-modal .np-btn"); return !!b && !b.disabled; })()`), 5_000, 50);
    await aislada.v.js(`document.querySelector(".abrir-modal .np-btn").click(), "ok"`);
    const abierta = numero(await espera);
    dice(abierta > 0, `con «Abrir» nace (${abierta})`);
    dice(!!(await hasta(async () => !(await fuera.llamar("read_pane_transcript", { paneId: abierta })).error, 15_000, 300)), "y lee la que abrió con encargo");
    const otro = await cliente("otro-programa");
    await otro.llamar("get_active_panes", {});
    const negada = await otro.llamar("read_pane_transcript", { paneId: abierta });
    dice(/Ajustes > Terminales/.test(negada.error ?? "") && /Leer y abrir/.test(negada.error ?? ""), "otro programa no la lee, y el mensaje dice dónde se sube", corto(negada));
    const lista = (await otro.llamar("get_active_panes", {})).texto ?? "";
    dice(!/Command:/.test(lista) && !lista.includes("ENCARGO-A1"), "la lista va sin los comandos, que llevan el encargo", lista.slice(0, 300));
    dice(new RegExp(`ID: ${abierta}\\b[^\\n]*Abierta por: ti`).test((await fuera.llamar("get_active_panes", {})).texto ?? "") && !new RegExp(`ID: ${abierta}\\b[^\\n]*Abierta por: ti`).test(lista), "y dice a cada uno si es suya");
    otro.cerrar();
    await cerrarLas(fuera, [abierta]);
    // Un Claude se despide antes de irse, y mientras tanto cuenta para las 6 vivas.
    const ida = await hasta(async () => (new RegExp(`ID: ${abierta}\\b`).test((await fuera.llamar("get_active_panes", {})).texto ?? "") ? null : true), 25_000, 500);
    if (!ida) console.log(`      (la ${abierta} sigue viva: la ráfaga de abajo tendrá un hueco menos)`);
  }

  console.log("\n── Muchas a la vez");
  {
    const N = 20;
    const clientes = await Promise.all(Array.from({ length: N }, (_, i) => cliente(`rafaga-${i}`)));
    const rs = await Promise.all(clientes.map((c, i) => c.llamar("open_pane", { cli: "shell", cwd: demo, name: `r${i}` }, 30_000)));
    const buenas = rs.filter((r) => !r.error).length;
    dice(buenas <= 6, `${N} a la vez desde ${N} conexiones no pasan de 6 vivas (abiertas: ${buenas})`, corto(rs.find((r) => r.error) ?? {}));
    dice(buenas === 6, "y se abren las que caben");
    for (const c of clientes) c.cerrar();
  }
  fuera.cerrar();
} finally {
  await aislada.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
