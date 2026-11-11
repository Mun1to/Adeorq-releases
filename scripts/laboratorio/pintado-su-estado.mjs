// Cuánto gasta la ventana de Adeorq con el estado de Munir, y quién se lo come.
//
// Salió del 2026-11-11: su 0.9.250 quieta, con la ventana delante, tenía el
// proceso de gráficos del WebView al 55-90% de un núcleo y la página al 57-92%,
// y no bajaba aunque ninguna terminal escribiera. `pintado-en-reposo.mjs` daba
// 12%+16% con cuatro terminales y la ruedita en la misma máquina: algo de SU
// estado pintaba y el laboratorio no lo tenía. Lo que aquí se le pone, leído de
// su `localStorage` (`leer-localstorage.py`):
//   - sesiones en la barra, varias trabajando (`a_medias`): el hilo de luz y el
//     marco verde del proyecto, que en la aislada no salían porque nace sin leer
//     sesiones;
//   - música sonando (lo que contesta `media_now`): el título y el ecualizador
//     arriba, y la mascota que baila;
//   - el panel de la derecha en «uso», el modo rendimiento «siempre», su tema y
//     su foto de fondo (una copia de la suya en la casa de pruebas);
//   - cinco terminales, tres con la ruedita de un agente que piensa.
// Y luego quita los sospechosos de uno en uno, midiendo cada vez el proceso de
// gráficos y el de la página, que es donde se ve el pintado.
//
// Lo que dio la primera pasada (Intel Arc integrada, 144 Hz): con su estado,
// 130% + 74%; sin el hilo, 20% + 15%. La música, el marco verde y el panel de
// uso no movían nada. Era el hilo, repintado en cada fotograma; girándolo en la
// tarjeta gráfica, 51% + 27%. Lo que queda es sacar 144 fotogramas por segundo,
// no el cristal (sin ningún desenfoque cuesta lo mismo).
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (C:\ct\debug\adeorq.exe)
//   pnpm dev --host 127.0.0.1                           (la ventana carga de ahí)
//   node scripts/laboratorio/pintado-su-estado.mjs
//
// Por defecto con el navegador de los paneles nativo, como la publicada
// (`NATIVO=0` lo pone en iframe). `FONDO=0` sin su foto, `TEMA=<id>` otro tema
// (el suyo es «tinta»), `HILOS=<n>` cuántas sesiones trabajan (3), `TERMINALES=<n>`
// cuántas terminales (5; tres con la ruedita), `RENDIMIENTO=nunca|auto|siempre`
// el modo (el suyo, «siempre»), `VENTANA_S` la ventana de medida, `EXE` otro
// binario, `ANTES=1` el hilo y el filo pintados como hasta la 0.9.250 (para el
// antes y el después). `ADEO=1` mide el filo de luz de la caja de Adeo del Panel
// con Adeo pensando, en vez del hilo. `FOTOS=<carpeta>` no mide: compara el
// aspecto del hilo (y del filo, con `ADEO=1`) con el de antes (ver abajo).
// `MIRAR=<fichero.js>` evalúa esa expresión en la página montada y la imprime.
// Las cifras dependen de la pantalla (a 144 Hz un bucle por fotograma cuesta
// más que a 60): se comparan entre sí en la misma pasada.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const PUERTO = 21000 + (process.pid % 2000);
const DEPURAR = 25000 + (process.pid % 2000);
const VENTANA_S = Number(process.env.VENTANA_S || 12);
const NATIVO = process.env.NATIVO !== "0";
const HILOS = Number(process.env.HILOS ?? 3);
const TEMA = process.env.TEMA || "tinta";
const TERMINALES = Number(process.env.TERMINALES ?? 5);
const RENDIMIENTO = process.env.RENDIMIENTO || "siempre";
const ADEO = process.env.ADEO === "1";
const ANTES = process.env.ANTES === "1";
const FONDO_SUYO = join(process.env.LOCALAPPDATA || "", "Adeorq", "fondo.png");

for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

// El hilo como se pintó hasta la 0.9.250: el ángulo de un cono animado en el
// fondo de la propia fila. Con `FOTOS` se pone encima de lo de ahora para
// comparar en la misma página. Va detrás de toda la hoja, así que el ratón
// encima se repite (antes ganaba por ir más abajo en `03-barra-lateral.css`).
const HILO_DE_ANTES = `
@property --hilo-giro { syntax: "<angle>"; initial-value: 0turn; inherits: false; }
.session-row[data-trabajando] {
  border-color: transparent;
  background:
    linear-gradient(var(--panel-solid), var(--panel-solid)) padding-box,
    conic-gradient(from var(--hilo-giro), transparent 0 66%, color-mix(in srgb, var(--accent) 85%, transparent) 78%, transparent 90%) border-box;
  animation: hilo-vuelta 3.2s linear infinite;
}
@keyframes hilo-vuelta { to { --hilo-giro: 1turn; } }
.session-row:hover {
  background: linear-gradient(var(--row), var(--row)), var(--panel-solid);
  border-color: color-mix(in srgb, var(--border) 90%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .session-row[data-trabajando] { animation: none; border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: var(--panel-solid); }
}
.session-row > .hilo { display: none !important; }
`;

// El filo de luz de las cajas de Adeo (`21-chat.css`, `34-inicio.css`) como se
// pintó hasta la 0.9.250: el ángulo de un cono animado en un `::before` con
// máscara de anillo. Igual que el de arriba, para `ANTES` y `FOTOS`.
const FILO_DE_ANTES = `
@property --adeo-ang { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.cj-caja, .inicio-caja {
  --adeo-filo: conic-gradient(from var(--adeo-ang), transparent 0 62%, color-mix(in srgb, var(--accent) 70%, transparent) 76%, #fff 82%, color-mix(in srgb, var(--accent) 70%, transparent) 88%, transparent 100%);
}
@keyframes adeo-filo { to { --adeo-ang: 360deg; } }
:is(.cj-caja, .inicio-caja)[data-trabajando="true"]::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1.5px; pointer-events: none;
  background: var(--adeo-filo);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: adeo-filo 6s linear infinite;
}
:root[data-rendimiento="1"] :is(.cj-caja, .inicio-caja)[data-trabajando="true"]::before { animation: none; --adeo-ang: 300deg; }
@media (prefers-reduced-motion: reduce) {
  :is(.cj-caja, .inicio-caja)[data-trabajando="true"]::before { animation: none; --adeo-ang: 300deg; }
}
.adeo-filo { display: none !important; }
`;
// Ese filo NO giraba: el cono se declaraba en la caja con `var(--adeo-ang)`,
// que se sustituye en la caja (a 0deg), y el `::before` que animaba el ángulo
// heredaba el cono ya sustituido. Para verlo girar como se quiso, el cono se
// declara en el propio `::before` (así se midió lo que costaría: `21-chat.css`).

// La casa de pruebas se siembra ANTES de arrancar: `abrirAislada` la crea en
// esta misma ruta (`adeorq-<nombre>-<pid>`).
const nombre = "su-estado";
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const raiz = join(base, "proyectos");
const claude = join(base, "casa", ".claude");
mkdirSync(join(claude, "sessions"), { recursive: true });

// Su foto de fondo, COPIADA a la casa de pruebas. El protocolo de archivos sirve
// `$LOCALDATA/Adeorq`, que Windows saca de USERPROFILE (la casa falsa), no la
// carpeta de datos de la aislada: ahí es donde se puede leer.
const FONDO = process.env.FONDO !== "0" && existsSync(FONDO_SUYO) ? join(base, "casa", "AppData", "Local", "Adeorq", "fondo.png") : "";
if (FONDO) {
  mkdirSync(join(base, "casa", "AppData", "Local", "Adeorq"), { recursive: true });
  copyFileSync(FONDO_SUYO, FONDO);
}

// Cinco proyectos con sesiones de varias edades. Las `HILOS` primeras están
// vivas (su `sessions/*.json` apunta a este proceso, que está vivo) y a medias
// (lo último es una herramienta): son las que encienden el hilo y el marco.
const PROYECTOS = ["Alfa", "Beta", "Gamma", "Delta", "Epsilon"];
const uuid = (n) => `5e55${String(n).padStart(4, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
let n = 0;
for (const [i, p] of PROYECTOS.entries()) {
  const cwd = join(raiz, p);
  mkdirSync(cwd, { recursive: true });
  const carpeta = join(claude, "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(carpeta, { recursive: true });
  for (let j = 0; j < 5; j++) {
    const sid = uuid(++n);
    const trabaja = j === 0 && i < HILOS;
    const viva = j === 0 && i < HILOS + 2;
    const hace = new Date(Date.now() - (trabaja ? 0 : (j + 1) * 3.6e6 * (i + 1))).toISOString();
    const linea = (o) => JSON.stringify({ cwd, sessionId: sid, timestamp: hace, ...o });
    const lineas = [linea({ type: "user", message: { role: "user", content: `Tarea ${n} de ${p}: revisa el módulo y arregla lo que falle` } })];
    lineas.push(
      trabaja
        ? linea({ type: "assistant", message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "tool_use", id: `toolu_${n}`, name: "Bash", input: { command: "pnpm test" } }] } })
        : linea({ type: "assistant", message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: "Hecho: el módulo queda arreglado." }] } }),
    );
    writeFileSync(join(carpeta, `${sid}.jsonl`), lineas.join("\n") + "\n");
    if (viva) writeFileSync(join(claude, "sessions", `${process.pid}-${n}.json`), JSON.stringify({ pid: process.pid, sessionId: sid, cwd }));
  }
}

const guarda = `(() => {
  const perfil = JSON.parse(localStorage.getItem("adeorq-perfil") || "{}");
  localStorage.setItem("adeorq-perfil", JSON.stringify({ ...perfil, leerSesiones: true }));
  localStorage.setItem("adeorq-rendimiento", ${JSON.stringify(RENDIMIENTO)});
  localStorage.setItem("adeorq-lateral", "uso");
  localStorage.setItem("adeorq-theme", ${JSON.stringify(TEMA)});
  localStorage.setItem("adeorq-fondo-opacidad", "100");
  localStorage.setItem("adeorq-fondo-desenfoque", "0");
  const antes = window.fetch;
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  window.__labSuena = true;
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    const m = url.match(/^https?:\\/\\/ipc\\.localhost\\/([a-z_]+)$/);
    if (m && m[1] === "media_now") return responde(window.__labSuena ? { title: "Pass The Dutchie", artist: "Musical Youth", playing: true, app: "Spotify.exe", volume: null } : null);
    if (m && m[1] === "get_fondo") return responde(${JSON.stringify(FONDO)});
    return antes(a, b);
  };
})()`;

/** El gasto de CPU (en % de un núcleo) de los procesos del navegador de esta
 *  pasada durante `s` segundos, por tipo de proceso. */
function cpuNavegador(s) {
  const guion = `
    $f = { Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${base.replace(/'/g, "''")}*' } }
    $a = & $f; Start-Sleep -Milliseconds ${Math.round(s * 1000)}; $b = & $f
    foreach ($p in $b) {
      $q = $a | Where-Object ProcessId -eq $p.ProcessId
      if (-not $q) { continue }
      $tipo = if ($p.CommandLine -match '--type=(\\S+)') { $matches[1] } else { 'navegador' }
      $d = (($p.KernelModeTime + $p.UserModeTime) - ($q.KernelModeTime + $q.UserModeTime)) / 1e7 / ${s} * 100
      "$tipo|$d"
    }`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { encoding: "utf8" });
  const por = {};
  for (const l of (r.stdout ?? "").trim().split(/\r?\n/)) {
    const [tipo, v] = l.split("|");
    if (!tipo || !v) continue;
    por[tipo] = (por[tipo] ?? 0) + Number(v.replace(",", "."));
  }
  return por;
}

// `EXE=<copia de adeorq.exe>` (con barras de Windows) para que otra sesión pueda recompilar C:\ct mientras tanto.
const a = await abrirAislada({ nombre, puertoMcp: PUERTO, depurar: DEPURAR, raiz, guarda, exe: process.env.EXE || undefined, fotos: process.env.FOTOS || tmpdir(), entorno: NATIVO ? { ADEORQ_NAVEGADOR_LABORATORIO: "1" } : {} });
const filas = [];
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  const { v, demo } = a;
  // La guarda ya está puesta para las cargas que vengan: esta recarga es la que
  // lee el perfil con las sesiones, el tema, el panel y el modo de Munir.
  await v.enviar("Page.reload");
  await dormir(2000);
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector('[data-tab="cabina"]')`), 30_000);
  await v.enviar("Performance.enable");

  writeFileSync(
    join(demo, "ruedita.ps1"),
    [
      "$e = [char]27; $r = '|/-\\'; $i = 0",
      "[Console]::Write(\"`n`n`n`n`n`n\")",
      "while ($true) {",
      "  $i++; $c = $r[$i % 4]",
      "  $t = \"$e[6A$e[2K$c Incubating... ($([int]($i/10))s - 18.3k tokens)`n$e[2K`n$e[2K> `n$e[2K  auto mode on (shift+tab to cycle)`n$e[2K`n$e[2K$i`n\"",
      "  [Console]::Write($t); Start-Sleep -Milliseconds 100",
      "}",
    ].join("\r\n"),
  );

  const metricas = async () => Object.fromEntries((await v.enviar("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const medir = async (etiqueta) => {
    await dormir(3000);
    const m0 = await metricas();
    const cpu = cpuNavegador(VENTANA_S);
    const m1 = await metricas();
    const dt = m1.Timestamp - m0.Timestamp;
    const fila = {
      situacion: etiqueta,
      graficos: Math.round(cpu["gpu-process"] ?? 0),
      pagina: Math.round(cpu.renderer ?? 0),
      estilos_s: Math.round((m1.RecalcStyleCount - m0.RecalcStyleCount) / dt),
      maqueta_s: Math.round((m1.LayoutCount - m0.LayoutCount) / dt),
      hilo_ocupado: `${Math.round(((m1.TaskDuration - m0.TaskDuration) / dt) * 100)}%`,
      animaciones: await v.js(`(() => { const c = {}; for (const x of document.getAnimations()) if (x.playState === "running") { const k = x.animationName || x.transitionProperty || x.constructor.name; c[k] = (c[k] || 0) + 1; } return Object.entries(c).map(([k, n]) => n > 1 ? k + "×" + n : k).join(", ") || "-"; })()`),
    };
    filas.push(fila);
    console.log(`${fila.situacion.padEnd(40)} gráficos ${String(fila.graficos).padStart(3)}%  página ${String(fila.pagina).padStart(3)}%  estilos/s ${String(fila.estilos_s).padStart(4)}  maqueta/s ${String(fila.maqueta_s).padStart(4)}  hilo ${fila.hilo_ocupado.padStart(4)}  · ${fila.animaciones}`);
  };
  // Un sospechoso fuera, con una hoja de estilo propia que se puede quitar.
  const quitar = (id, css) => v.js(`(() => { const s = document.createElement("style"); s.id = ${JSON.stringify(id)}; s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return "ok"; })()`);
  const devolver = (id) => v.js(`(document.getElementById(${JSON.stringify(id)})?.remove(), "ok")`);

  // Las terminales: cinco como las suyas (`TERMINALES`), y tres con la ruedita.
  const fuera = a.puente(null);
  await fuera.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await fuera.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  const ids = [];
  for (let i = 0; i < TERMINALES; i++) {
    const r = await fuera.llamar("open_pane", { cli: "shell", cwd: demo, name: `t${i + 1}` });
    const id = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
    if (!id) throw new Error(`no abrió la terminal ${i + 1}: ${r.error ?? r.texto}`);
    ids.push(id);
  }
  await dormir(3000);
  for (const id of ids.slice(0, 3)) await fuera.llamar("send_command", { paneId: id, command: "powershell -NoProfile -ExecutionPolicy Bypass -File ruedita.ps1" });
  await v.js(`(document.querySelector('[data-tab="cabina"]')?.click(), "ok")`);
  // Los proyectos, desplegados: en su barra lo están los que tienen terminales
  // abiertas (abrir algo de un proyecto lo despliega), y plegados no hay filas.
  await hasta(() => v.js(`document.querySelectorAll(".project").length >= ${PROYECTOS.length}`), 20_000, 500);
  await v.js(`(document.querySelectorAll('.project[data-open="false"] .project-main').forEach((b) => b.click()), "ok")`);
  await dormir(4000);
  if (ADEO) {
    // Adeo pensando, por el mismo camino que un envío (`marcarPensando`): la caja
    // del Panel enciende su filo. El módulo tiene que ser EL DE LA APP: si Vite lo
    // recargó por un cambio, la app lo tiene con `?t=` y `/src/lib/conserje.ts` a
    // pelo sería otra copia con su propio estado.
    await v.js(`(document.querySelector('[data-tab="panel"]')?.click(), "ok")`);
    await v.js(`(() => {
      const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => /\\/src\\/lib\\/conserje\\.ts(\\?|$)/.test(n)) || "/src/lib/conserje.ts";
      return import(url).then((m) => { m.marcarPensando("laboratorio", true); return "ok"; });
    })()`);
    await hasta(() => v.js(`!!document.querySelector('.inicio-caja[data-trabajando="true"]')`), 15_000, 300);
    // Sin música: sin el modo rendimiento, su ecualizador y el título que pasa
    // también se mueven a cada fotograma y taparían lo que cuesta el filo.
    await v.js(`(window.__labSuena = false, "ok")`);
    await dormir(5000);
  }
  if (ANTES) {
    await v.js(`(() => { const s = document.createElement("style"); s.id = "lab-de-antes"; s.textContent = ${JSON.stringify(HILO_DE_ANTES + FILO_DE_ANTES)}; document.head.appendChild(s); return "ok"; })()`);
    await dormir(1000);
  }

  const estado = await v.js(`JSON.stringify({
    vista: document.querySelector('[data-tab][data-active="true"]')?.dataset.tab ?? "?",
    rendimiento: document.documentElement.dataset.rendimiento ?? "",
    filas: document.querySelectorAll(".session-row").length,
    hilos: document.querySelectorAll(".session-row[data-trabajando]").length,
    marcos: document.querySelectorAll(".project[data-trabajando]").length,
    musica: !!document.querySelector(".np-eq[data-on='true']"),
    lateral: document.querySelector(".lateral .lateral-title")?.textContent?.trim() ?? "",
    fondo: (() => { const i = document.querySelector(".fondo img"); return i ? i.naturalWidth + "x" + i.naturalHeight : "sin fondo"; })(),
    paneles: document.querySelectorAll("[data-pane-id]").length,
    filo: (() => { const c = document.querySelector('.inicio-caja[data-trabajando="true"]'); if (!c) return "no"; const r = c.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); })(),
    antes: ${ANTES},
  })`).then((s) => JSON.parse(s));
  console.log(`\nPantalla: ${await v.js("`${screen.width}x${screen.height} a ${devicePixelRatio}x`")}, ventana ${await v.js("`${innerWidth}x${innerHeight}`")}`);
  console.log(`Navegador de los paneles: ${(await v.js(`window.__TAURI_INTERNALS__.invoke("nav_disponible")`)) ? "nativo, como la publicada" : "en iframe"}`);
  console.log(`Su estado: ${JSON.stringify(estado)}\n`);
  if (HILOS > 0 && estado.hilos < 1) console.log("OJO: ninguna fila con el hilo: la barra no leyó las sesiones sembradas\n");
  if (ADEO && estado.filo === "no" && !process.env.MIRAR) throw new Error("la caja de Adeo del Panel no se puso a pensar");

  // `MIRAR=<fichero.js>`: evalúa esa expresión en la página montada, la imprime
  // y no mide nada (para preguntarle algo a este mismo estado).
  if (process.env.MIRAR) console.log(await v.js(readFileSync(process.env.MIRAR, "utf8")));
  // `FOTOS=<carpeta>`: que el hilo (o con `ADEO=1` el filo de la caja de Adeo)
  // se VE igual que como se pintaba hasta la 0.9.250. Parado en ocho momentos de
  // su vuelta (la animación se llama igual y dura lo mismo, así que el mismo
  // momento vale para las dos formas de pintarlo) y en lo que cambia su aspecto:
  // el hilo con el ratón encima, con «reducir movimiento», apartándose en un
  // arrastre y como la copia que va en la mano; el filo con el modo rendimiento
  // y con «reducir movimiento», que lo dejan quieto. Primero con lo de ahora y
  // luego con lo de antes puesto encima, en la misma página, y se comparan
  // píxel a píxel.
  if (process.env.FOTOS) {
    mkdirSync(process.env.FOTOS, { recursive: true });
    const pieza = ADEO ? '.inicio-caja[data-trabajando="true"]' : ".session-row[data-trabajando]";
    const margen = ADEO ? 30 : 4;
    const sitio = await v.js(`JSON.stringify((() => { const r = document.querySelector(${JSON.stringify(pieza)}).getBoundingClientRect(); return { x: r.x - ${margen}, y: r.y - ${margen}, width: r.width + ${2 * margen}, height: r.height + ${2 * margen} }; })())`).then((s) => JSON.parse(s));
    const [nombreAnimacion, vuelta] = ADEO ? ["adeo-filo", 6000] : ["hilo-vuelta", 3200];
    const parar = (ms) => v.js(`(document.getAnimations().filter((x) => x.animationName === "${nombreAnimacion}").forEach((x) => { x.pause(); x.currentTime = ${ms}; }), "ok")`);
    const { root } = await v.enviar("DOM.getDocument", { depth: 0 });
    const { nodeId } = await v.enviar("DOM.querySelector", { nodeId: root.nodeId, selector: pieza });
    const fotos = async (pre) => {
      const hechas = {};
      const foto = async (nombre) => {
        await dormir(400);
        const r = await v.enviar("Page.captureScreenshot", { format: "png", clip: { ...sitio, scale: ADEO ? 1 : 2 } });
        hechas[nombre] = r.data;
        writeFileSync(join(process.env.FOTOS, `${pre}-${ADEO ? "filo" : "hilo"}-${TEMA}-${nombre}.png`), Buffer.from(r.data, "base64"));
      };
      for (let i = 0; i < 8; i++) {
        await parar((i * vuelta) / 8);
        await foto(`vuelta-${i}`);
      }
      if (ADEO) {
        await v.js(`(document.documentElement.dataset.rendimiento = "1", "ok")`);
        await foto("rendimiento");
        await v.js(`(${RENDIMIENTO === "siempre"} || delete document.documentElement.dataset.rendimiento, "ok")`);
        await v.enviar("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
        await foto("quieto");
        await v.enviar("Emulation.setEmulatedMedia", { features: [] });
        return hechas;
      }
      await v.enviar("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
      await foto("encima");
      await v.enviar("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      await v.enviar("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await foto("quieto");
      await v.enviar("Emulation.setEmulatedMedia", { features: [] });
      // Apartándose: `transform` en la fila (sin moverla), que la hace contexto propio.
      await v.js(`(() => { const f = document.querySelector(".session-row[data-trabajando]"); f.setAttribute("data-apartada", ""); f.style.setProperty("--dy", "0px"); return "ok"; })()`);
      await parar(1200);
      await foto("apartada");
      await v.js(`(() => { const f = document.querySelector(".session-row[data-trabajando]"); f.removeAttribute("data-apartada"); f.style.removeProperty("--dy"); return "ok"; })()`);
      // La copia de la mano (`lib/fantasma.ts`), justo encima de su fila.
      await v.js(`(() => { const f = document.querySelector(".session-row[data-trabajando]"); const r = f.getBoundingClientRect(); const c = f.cloneNode(true); c.classList.add("fantasma"); c.id = "lab-fantasma"; c.style.width = r.width + "px"; c.style.height = r.height + "px"; c.style.transform = "translate(" + r.x + "px, " + r.y + "px)"; document.body.appendChild(c); return "ok"; })()`);
      await parar(800);
      await foto("en-la-mano");
      await v.js(`(document.getElementById("lab-fantasma")?.remove(), "ok")`);
      return hechas;
    };
    const ahora = await fotos("ahora");
    await quitar("lab-fotos-de-antes", HILO_DE_ANTES + FILO_DE_ANTES);
    const antes = await fotos("antes");
    await devolver("lab-fotos-de-antes");
    // La comparación, en la propia página: decodificar un PNG allí es una línea.
    const comparar = (a, b) => v.js(`(async () => {
      const pixeles = async (b64) => {
        const i = new Image();
        i.src = "data:image/png;base64," + b64;
        await i.decode();
        const c = new OffscreenCanvas(i.width, i.height);
        const x = c.getContext("2d");
        x.drawImage(i, 0, 0);
        return x.getImageData(0, 0, i.width, i.height).data;
      };
      const a = ${JSON.stringify(a)}, b = ${JSON.stringify(b)};
      const out = {};
      for (const k of Object.keys(a)) {
        const [p, q] = [await pixeles(a[k]), await pixeles(b[k])];
        let max = 0, distintos = 0;
        for (let j = 0; j < p.length; j += 4) {
          const d = Math.max(Math.abs(p[j] - q[j]), Math.abs(p[j + 1] - q[j + 1]), Math.abs(p[j + 2] - q[j + 2]));
          if (d > max) max = d;
          if (d > 8) distintos++;
        }
        out[k] = { max, distintos, de: p.length / 4 };
      }
      return JSON.stringify(out);
    })()`).then((s) => JSON.parse(s));
    const tabla = (titulo, dif) => {
      console.log(`${titulo} (tema ${TEMA}; diferencia máxima de un canal, de 255, y píxeles con más de 8):`);
      for (const [k, d] of Object.entries(dif)) console.log(`  ${k.padEnd(12)} máx ${String(d.max).padStart(3)}   ${String(d.distintos).padStart(4)} de ${d.de}`);
    };
    tabla("Ahora frente a antes", await comparar(ahora, antes));
  }
  const deAntes = ANTES ? " (pintado de antes)" : "";
  if (process.env.MIRAR || process.env.FOTOS) {
    fuera.cerrar();
  } else if (ADEO) {
    // El filo de la caja de Adeo, con Adeo pensando en la vista del Panel.
    await medir(`Adeo pensando${deAntes}`);
    await quitar("lab-sin-filo", ".inicio-caja::before, .inicio-caja *, .inicio-caja *::before { animation: none !important; }");
    await medir("sin el filo");
    await devolver("lab-sin-filo");
    await v.js(`(document.documentElement.dataset.rendimiento = "1", "ok")`);
    await medir("con el modo rendimiento (filo quieto)");
    fuera.cerrar();
  } else {
    await medir(`su estado${deAntes}`);
    // Con cualquier forma de pintarlo: en la fila o en algo de dentro.
    await quitar("lab-sin-hilo", ".session-row[data-trabajando], .session-row[data-trabajando] *, .session-row[data-trabajando] *::before, .session-row[data-trabajando] *::after { animation: none !important; }");
    await medir("sin el hilo");
    await devolver("lab-sin-hilo");
    await v.js(`(window.__labSuena = false, "ok")`);
    await dormir(5000);
    await medir("sin música");
    await v.js(`(window.__labSuena = true, "ok")`);
    await dormir(5000);
    await quitar("lab-sin-marco", ".project[data-trabajando] { box-shadow: none !important; }");
    await medir("sin el marco verde");
    await devolver("lab-sin-marco");
    await v.js(`(document.querySelector('.franja-btn[data-on="true"]')?.click(), "ok")`);
    await medir("sin el panel de uso");
    await v.js(`(document.querySelector('.franja-btn')?.click(), "ok")`);
    // El cristal: si lo que queda con algo moviéndose es recalcular desenfoques
    // o solo sacar 144 fotogramas por segundo (2026-11-11: lo segundo).
    await quitar("lab-sin-cristal", "*, *::before, *::after { backdrop-filter: none !important; }");
    await medir("sin ningún cristal");
    await devolver("lab-sin-cristal");
    for (const id of ids.slice(0, 3)) await fuera.llamar("send_keys", { paneId: id, keys: ["ctrl+c"] });
    await medir("sin la ruedita en las terminales");
    for (const id of ids.slice(0, 3)) await fuera.llamar("send_command", { paneId: id, command: "powershell -NoProfile -ExecutionPolicy Bypass -File ruedita.ps1" });
    await quitar("lab-quieto", "*, *::before, *::after { animation-play-state: paused !important; }");
    await medir("con la ruedita, todo CSS parado");
    await devolver("lab-quieto");
    await medir("su estado, otra vez");
    fuera.cerrar();

    const salida = join(process.env.TEMP || ".", `pintado-su-estado-${process.pid}.json`);
    writeFileSync(salida, JSON.stringify({ estado, filas }, null, 2));
    console.log(`\nLas cifras, en ${salida}`);
  }
} finally {
  await a.cerrar();
}
