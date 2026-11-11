// La ventana con la máquina llena, de verdad: una Adeorq aislada, una terminal
// suya que quema todos los núcleos, y cuánto tarda la ventana en hacer su trabajo
// en reposo y con la máquina llena. Dice también la prioridad de cada proceso del
// árbol: la app, su navegador, el proceso de terminales, la consola y lo que lanza.
//
// Salió de «todavía se queda congelado en muchas funciones y luego vuelve» (Munir,
// 2026-11-11): 12,6 de 16 núcleos ocupados por lo que lanzaban sus terminales y la
// ventana compitiendo a la misma prioridad. Lo que va por debajo de lo normal es
// lo de la terminal (`pty.rs`, «La prioridad de lo que nace en una terminal»).
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   [LAB_TERMINALES_APARTE=1] node scripts/laboratorio/prioridad-de-verdad.mjs [exe] [salida.json]
//
// Sale con 1 si lo que nace en la terminal no va por debajo de lo normal o si
// algo de la ventana sí. Las medidas de tiempo no deciden la salida: dependen de
// lo que haga el resto del equipo, y se comparan entre pasadas.
//
// La quema dura como mucho `QUEMA_S` segundos aunque el laboratorio se caiga: el
// propio programa se va solo.
import { spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] || EXE;
const salida = process.argv[3];
// Con `LAB_NUCLEOS=10,11` la app, su navegador, su terminal y la quema van atados
// a esos núcleos: la pelea es solo entre la ventana y lo que lanza su terminal, y
// lo que hagan las demás sesiones del equipo ensucia mucho menos la medida. En
// el Core Ultra 7 255H de Munir los de rendimiento son el 0, el 1 y del 10 al 13.
const ATADOS = (process.env.LAB_NUCLEOS || "").split(",").filter(Boolean).map(Number);
const NUCLEOS = ATADOS.length || availableParallelism();
// Dos hilos por núcleo: con uno por núcleo sobra hueco entre cuanto y cuanto, y
// lo que se mide es la máquina llena de verdad.
const HILOS = 2 * NUCLEOS;
const QUEMA_S = 45;
const MEDIR_MS = 8_000;

/** Lo que mide la página: fotogramas y temporizadores en una mitad, y en la otra
 *  un trabajo fijo de JavaScript y una ida y vuelta al hilo principal de la app. */
const MEDIR = (ms) => `(async () => {
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10 : null; };
  const resumen = (a) => ({ n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), max: pct(a, 1) });
  const fotogramas = [], retrasos = [], trabajo = [], largo = [], ida = [];
  const calcular = (n) => { let x = 0; for (let i = 0; i < n; i++) x += Math.sqrt(i); window.__lab = x; };
  let sigue = true, antes = 0;
  const raf = (t) => { if (antes) fotogramas.push(t - antes); antes = t; if (sigue) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  let fin = performance.now() + ${ms} / 2;
  while (performance.now() < fin) {
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 10));
    retrasos.push(performance.now() - t0 - 10);
  }
  sigue = false;
  fin = performance.now() + ${ms} / 2;
  // Uno corto (unos 5 ms en reposo) y uno largo (unos 70), que es lo que dura
  // pintar algo grande: el largo es el que nota si le quitan la CPU a media tarea.
  while (performance.now() < fin) {
    const t1 = performance.now();
    calcular(2e6);
    trabajo.push(performance.now() - t1);
    const t3 = performance.now();
    calcular(3e7);
    largo.push(performance.now() - t3);
    const t2 = performance.now();
    await window.__TAURI_INTERNALS__.invoke("latido_ventana", { visible: true });
    ida.push(performance.now() - t2);
    await new Promise((r) => setTimeout(r, 5));
  }
  return {
    fotogramas: { ...resumen(fotogramas), tirones: fotogramas.filter((d) => d > 50).length },
    temporizador: resumen(retrasos),
    trabajo: resumen(trabajo),
    largo: resumen(largo),
    idaYVuelta: resumen(ida),
  };
})()`;

const QUEMAR = `// Un hilo por núcleo dando vueltas; se va solo a los N segundos.
const { Worker } = require("node:worker_threads");
const [n, s] = process.argv.slice(2).map(Number);
for (let i = 0; i < n; i++) new Worker("for(;;){}", { eval: true });
console.log("QUEMANDO " + n + " hilos, pid " + process.pid);
setTimeout(() => process.exit(0), s * 1000);
`;

/** El árbol de la app (y lo que corra desde la carpeta de la pasada), con la
 *  prioridad de cada proceso. */
function arbol(base) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
    $b = '${base.replace(/'/g, "''")}'
    $todos = Get-CimInstance Win32_Process
    $raiz = @($todos | Where-Object { $_.ExecutablePath -like "$b*" -or $_.CommandLine -like "*$b*" } | ForEach-Object { $_.ProcessId })
    $app = @($todos | Where-Object { $_.ExecutablePath -eq '${exe.replace(/'/g, "''")}' -and $_.CommandLine -notmatch '--(terminales|mcp)' } | ForEach-Object { $_.ProcessId })
    $vistos = @{}
    $cola = [System.Collections.Generic.Queue[int]]::new()
    foreach ($p in $raiz + $app) { $cola.Enqueue([int]$p) }
    while ($cola.Count) {
      $p = $cola.Dequeue()
      if ($vistos.ContainsKey($p)) { continue }
      $vistos[$p] = 1
      foreach ($h in $todos | Where-Object { $_.ParentProcessId -eq $p }) { $cola.Enqueue([int]$h.ProcessId) }
    }
    foreach ($w in $todos | Where-Object { $vistos.ContainsKey([int]$_.ProcessId) }) {
      $p = Get-Process -Id $w.ProcessId -ErrorAction SilentlyContinue
      $linea = ([string]$w.CommandLine) -replace '\\s+', ' '
      if ($p) { "{0}|{1}|{2}|{3}|{4}" -f $w.Name, $w.ProcessId, $w.ParentProcessId, $p.PriorityClass, $linea.Substring(0, [Math]::Min(70, $linea.Length)) }
    }
  `], { encoding: "utf8" });
  return (r.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).map((l) => {
    const [nombre, pid, padre, prioridad, linea] = l.split("|");
    return { nombre, pid: Number(pid), padre: Number(padre), prioridad, linea };
  });
}

/** Ata esos procesos a los núcleos de `ATADOS`; lo que nazca de ellos lo hereda. */
function atar(pids) {
  const mascara = ATADOS.reduce((m, n) => m | (1 << n), 0);
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `foreach ($i in @(${pids.join(",")})) { $p = Get-Process -Id $i -ErrorAction SilentlyContinue; if ($p) { $p.ProcessorAffinity = [IntPtr]${mascara} } }`,
  ], { stdio: "ignore" });
}

/** La prioridad y el padre de un proceso suelto, por si el árbol no lo vio. */
function uno(pid) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$w = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($w -and $p) { "{0}|{1}|{2}|{3}" -f $w.Name, $w.ProcessId, $w.ParentProcessId, $p.PriorityClass }`,
  ], { encoding: "utf8" });
  const [nombre, p, padre, prioridad] = (r.stdout ?? "").trim().split("|");
  return nombre ? { nombre, pid: Number(p), padre: Number(padre), prioridad, linea: "" } : null;
}

const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
const fila = (nombre, m) =>
  `  ${nombre.padEnd(9)} fotogramas p50 ${m.fotogramas.p50} p95 ${m.fotogramas.p95} máx ${m.fotogramas.max} ms (${m.fotogramas.tirones} de más de 50 ms, ${m.fotogramas.n})` +
  ` · temporizador de 10 ms, retraso p95 ${m.temporizador.p95} máx ${m.temporizador.max}` +
  ` · trabajo corto p50 ${m.trabajo.p50} p95 ${m.trabajo.p95} máx ${m.trabajo.max}` +
  ` · trabajo largo p50 ${m.largo.p50} p95 ${m.largo.p95} máx ${m.largo.max}` +
  ` · ida y vuelta a la app p50 ${m.idaYVuelta.p50} p95 ${m.idaYVuelta.p95} máx ${m.idaYVuelta.max}`;

const aislada = await abrirAislada({ nombre: "prioridad", puertoMcp: 3291, depurar: 9391, exe });
let fallos = 0;
const dice = (ok, texto) => {
  console.log(`  ${ok ? "OK  " : "FALLA"} ${texto}`);
  if (!ok) fallos++;
};
try {
  const { v, demo, base } = aislada;
  console.log(`exe ${exe}${aislada.aparte ? " · terminales en su proceso aparte" : " · terminales dentro de la app"} · ${ATADOS.length ? `atada a los núcleos ${ATADOS.join(", ")}` : `${NUCLEOS} núcleos`} · ${HILOS} hilos quemando`);
  writeFileSync(join(demo, "quemar.js"), QUEMAR);
  const fuera = aislada.puente(null);
  await fuera.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await fuera.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  const id = numero(await fuera.llamar("open_pane", { cli: "shell", cwd: demo, name: "quemar" }));
  if (!id) throw new Error("no se abrió la terminal");
  const pantalla = async () => (await fuera.llamar("read_pane_screen", { paneId: id })).texto ?? "";
  if (!(await hasta(async () => /PS [^\n]*>/.test(await pantalla()), 30_000, 500))) throw new Error("la consola no llegó a su prompt");
  if (ATADOS.length) atar(arbol(base).filter((p) => !/^powershell\.exe$/i.test(p.nombre) || p.linea.includes("-NoLogo")).map((p) => p.pid));

  await dormir(1500);
  const reposo = await v.js(MEDIR(MEDIR_MS));

  // Lo tecleado se pierde a veces si la consola aún no escucha: se repite solo si
  // la orden no llegó a la pantalla, para no lanzar dos quemas.
  const orden = `node quemar.js ${HILOS} ${QUEMA_S}`;
  let quemando = null;
  for (let i = 0; i < 3 && !quemando; i++) {
    if (!(await pantalla()).includes(orden)) await fuera.llamar("send_command", { paneId: id, command: orden });
    quemando = await hasta(async () => /QUEMANDO \d+ hilos, pid (\d+)/.exec(await pantalla()), 15_000, 500);
  }
  if (!quemando) throw new Error(`la terminal no empezó a quemar. Su pantalla:\n${(await pantalla()).trim().split("\n").slice(-8).join("\n")}`);
  await dormir(1500);
  const llena = await v.js(MEDIR(MEDIR_MS));
  const procesos = arbol(base);
  spawnSync("taskkill", ["/PID", quemando[1], "/F"], { stdio: "ignore" });

  console.log(fila("reposo", reposo));
  console.log(fila("llena", llena));
  console.log("  procesos:");
  for (const p of procesos) console.log(`    ${p.prioridad.padEnd(12)} ${p.nombre} ${p.pid} (de ${p.padre}) ${p.linea}`);

  const quema = procesos.find((p) => p.pid === Number(quemando[1])) ?? uno(quemando[1]);
  const consola = quema && (procesos.find((p) => p.pid === quema.padre) ?? uno(quema.padre));
  // El proceso de gráficos de WebView2 se pone él mismo por encima de lo normal:
  // lo que se comprueba es que nada de la ventana baje.
  const ventana = procesos.filter((p) => /^adeorq\.exe$/i.test(p.nombre) || /^msedgewebview2\.exe$/i.test(p.nombre));
  dice(quema?.prioridad === "BelowNormal", `lo que lanza la terminal (node ${quemando[1]}) va por debajo de lo normal: ${quema?.prioridad}`);
  dice(consola?.prioridad === "BelowNormal", `la consola de la terminal (${consola?.nombre} ${consola?.pid}) también: ${consola?.prioridad}`);
  dice(ventana.length > 1 && ventana.every((p) => /^(Normal|AboveNormal|High)$/.test(p.prioridad)), `la app, su proceso de terminales y su navegador no bajan (${ventana.length}: ${[...new Set(ventana.map((p) => p.prioridad))].join(", ")})`);
  if (salida) writeFileSync(salida, JSON.stringify({ exe, aparte: aislada.aparte, nucleos: NUCLEOS, reposo, llena, procesos }, null, 2));
} finally {
  await aislada.cerrar();
}
process.exit(fallos ? 1 : 0);
