// Cuánto gasta la ventana de Adeorq SIN hacer nada, y quién se lo come.
//
// Salió del «se congela a veces» del 2026-11-10: su Adeorq, quieta con cuatro
// terminales y el modo rendimiento puesto, tenía el proceso de gráficos del
// WebView al 85% de un núcleo y la página al 54%, y la gráfica integrada (donde
// pinta el WebView en su portátil) al 46% solo por Adeorq. Con ese gasto de
// fondo no queda margen: cualquier pico (una terminal que escupe, abrir una
// vista) se nota como un parón.
//
// Mide la app aislada (la de desarrollo, con casa, datos y navegador propios:
// `aislada.mjs`) en varias situaciones, quitando sospechosos de uno en uno, y
// cuenta el gasto de SU navegador: el proceso de gráficos y el de la página,
// que es donde se ve el pintado (`adeorq.exe` no pinta nada). Además del CPU,
// lo que dice la propia página por el protocolo de depuración: cuántas veces
// recalcula estilos y maqueta por segundo, y cuánto tiempo de tareas.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (C:\ct\debug\adeorq.exe)
//   pnpm dev --host 127.0.0.1                           (la ventana carga de ahí)
//   node scripts/laboratorio/pintado-en-reposo.mjs
//   NATIVO=1 node scripts/laboratorio/pintado-en-reposo.mjs   (como la publicada)
//
// Las cifras dependen de la máquina y de la pantalla (a 144 Hz un bucle por
// fotograma cuesta más que a 60): se comparan entre sí en la misma pasada, no
// con las de otro día.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const PUERTO = 21000 + (process.pid % 2000);
const DEPURAR = 25000 + (process.pid % 2000);
const VENTANA_S = Number(process.env.VENTANA_S || 12);
const TERMINALES = Number(process.env.TERMINALES || 4);

/** El gasto de CPU (en % de un núcleo) de los procesos del navegador de esta
 *  pasada durante `s` segundos, por tipo de proceso. Se reconocen por su línea
 *  de comando, que lleva la carpeta de la pasada. */
function cpuNavegador(base, s) {
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

/** Lo que dice la página de sí misma entre dos lecturas: recálculos de estilo y
 *  maquetaciones por segundo, y la fracción del tiempo que su hilo principal
 *  pasó trabajando. */
async function metricas(v) {
  const r = await v.enviar("Performance.getMetrics");
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}

const ESTILO_QUIETO = "lab-todo-quieto";
// El orbe se SACA de la página, no se esconde: escondido con `display: none` su
// reloj seguía tocándolo y la ventana seguía recalculando, y la cifra «sin el
// orbe» no era la de una app sin él. Se vuelve a poner en su sitio al acabar.
const quieto = (que) => `(() => {
  document.getElementById("${ESTILO_QUIETO}")?.remove();
  for (const [e, padre, sig] of window.__labOrbes ?? []) padre.insertBefore(e, sig && sig.parentNode === padre ? sig : null);
  window.__labOrbes = null;
  if (${JSON.stringify(que)}.includes("orbe")) {
    window.__labOrbes = [...document.querySelectorAll(".orbe")].map((e) => [e, e.parentNode, e.nextSibling]);
    for (const [e] of window.__labOrbes) e.remove();
  }
  const css = ${JSON.stringify("")} + (${JSON.stringify(que)}.includes("css") ? "*, *::before, *::after { animation-play-state: paused !important; }" : "")
    + (${JSON.stringify(que)}.includes("mascota") ? ".mascota { display: none !important; }" : "");
  if (!css) return "nada";
  const s = document.createElement("style");
  s.id = "${ESTILO_QUIETO}";
  s.textContent = css;
  document.head.appendChild(s);
  return css;
})()`;

const nombre = "pintado";
// `NATIVO=1`: con el navegador de los paneles en un WebView de verdad, como en
// la app publicada. Sin él va en un iframe, y lo que gaste el nativo no sale.
const NATIVO = process.env.NATIVO === "1";
const a = await abrirAislada({ nombre, puertoMcp: PUERTO, depurar: DEPURAR, entorno: NATIVO ? { ADEORQ_NAVEGADOR_LABORATORIO: "1" } : {} });
const filas = [];
try {
  const { v, base, demo } = a;
  await v.enviar("Performance.enable");

  // Un programa que repinta como el de Claude Code mientras piensa: cada 100 ms
  // sube seis renglones y los vuelve a escribir (la línea de estado, la caja de
  // escribir), que es lo que hace su interfaz con la ruedita girando.
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

  const medir = async (etiqueta) => {
    await dormir(3000);
    const m0 = await metricas(v);
    const cpu = cpuNavegador(base, VENTANA_S);
    const m1 = await metricas(v);
    const dt = m1.Timestamp - m0.Timestamp;
    const fila = {
      situacion: etiqueta,
      graficos: Math.round(cpu["gpu-process"] ?? 0),
      pagina: Math.round(cpu.renderer ?? 0),
      navegador: Math.round(cpu.navegador ?? 0),
      estilos_s: Math.round((m1.RecalcStyleCount - m0.RecalcStyleCount) / dt),
      maqueta_s: Math.round((m1.LayoutCount - m0.LayoutCount) / dt),
      hilo_ocupado: `${Math.round(((m1.TaskDuration - m0.TaskDuration) / dt) * 100)}%`,
      animaciones: await v.js(`document.getAnimations().filter((x) => x.playState === "running").map((x) => x.animationName || x.constructor.name).join(", ") || "-"`),
    };
    filas.push(fila);
    console.log(`${fila.situacion.padEnd(44)} gráficos ${String(fila.graficos).padStart(3)}%  página ${String(fila.pagina).padStart(3)}%  estilos/s ${String(fila.estilos_s).padStart(4)}  maqueta/s ${String(fila.maqueta_s).padStart(4)}  hilo ${fila.hilo_ocupado.padStart(4)}  · ${fila.animaciones}`);
  };

  // Como lo deja Ajustes (`guardarRendimiento`): la preferencia guardada, para
  // que App.tsx no la deshaga al contar terminales, y la marca en `<html>` con
  // su aviso, que es lo que releen el CSS y las terminales abiertas.
  const rendimiento = async (pref) => {
    await v.js(`localStorage.setItem("adeorq-rendimiento", "${pref}");
      if (${pref === "siempre"}) document.documentElement.dataset.rendimiento = "1"; else delete document.documentElement.dataset.rendimiento;
      window.dispatchEvent(new Event("adeorq:tema-terminal")); "ok"`);
  };

  console.log(`\nPantalla: ${await v.js("`${screen.width}x${screen.height} a ${devicePixelRatio}x`")}, ventana ${await v.js("`${innerWidth}x${innerHeight}`")}`);
  console.log(`Navegador de los paneles: ${(await v.js(`window.__TAURI_INTERNALS__.invoke("nav_disponible")`)) ? "nativo, como la publicada" : "en iframe"}\n`);

  await rendimiento("siempre");
  await medir("vacía, modo rendimiento");
  await v.js(quieto("orbe"));
  await medir("vacía, sin el orbe");
  await v.js(quieto("orbe css mascota"));
  await medir("vacía, todo quieto");
  await v.js(quieto(""));

  // Las terminales, como shell, y en cada una la ruedita.
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
  await dormir(4000);
  await medir(`${TERMINALES} terminales quietas`);
  for (const id of ids) await fuera.llamar("send_command", { paneId: id, command: "powershell -NoProfile -ExecutionPolicy Bypass -File ruedita.ps1" });
  await dormir(3000);
  await medir(`${TERMINALES} terminales con la ruedita`);
  await v.js(quieto("orbe"));
  await medir(`${TERMINALES} con la ruedita, sin el orbe`);
  await v.js(quieto("orbe css mascota"));
  await medir(`${TERMINALES} con la ruedita, todo quieto`);
  await v.js(quieto(""));
  await rendimiento("nunca");
  await medir(`${TERMINALES} con la ruedita, SIN modo rendimiento`);
  await rendimiento("siempre");
  fuera.cerrar();

  const salida = join(process.env.TEMP || ".", `pintado-en-reposo-${process.pid}.json`);
  writeFileSync(salida, JSON.stringify(filas, null, 2));
  console.log(`\nLas cifras, en ${salida}`);
} finally {
  await a.cerrar();
}
