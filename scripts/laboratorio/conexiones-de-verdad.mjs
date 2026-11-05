// A dónde se conecta de verdad la app, comparado con la tabla de la privacidad (encargo E30).
//
//   node scripts/laboratorio/conexiones-de-verdad.mjs [carpeta para los resultados] [exe]
//
// `docs/contexto/tiendas/privacidad-borrador.md` (apartado 7) dice, leyendo el código, a dónde sale
// Adeorq. Esto lo MIDE: abre la Adeorq aislada y apunta cada conexión TCP de su árbol de procesos
// (la app, el navegador de su ventana, las terminales y lo que lancen) en estados distintos:
//
//   E1  recién abierta, sin hacer nada
//   E2  con una sesión de agente abierta (un `claude` de mentira: no gasta nada ni sale a ninguna parte);
//       el «copiloto» pide el catálogo público de OpenRouter, pero su primera vuelta es a los 4 minutos
//   E3  con el móvil encendido (en otro puerto, `ADEORQ_MOVIL_PUERTO`: el 3013 es el de la de verdad)
//   E4  con el móvil apagado otra vez
//
// Dos pasadas: la Tienda (`ADEORQ_FINGIR_EMPAQUETADA=1`, todos los estados) y la instalación de
// siempre (solo E1: ahí está el actualizador, que en la Tienda no existe).
//
// Lo que NO se hace: ninguna clave real (sin clave de OpenRouter), nada de Tailscale (su programa
// se esconde: encender el móvil con él a mano le pondría `tailscale serve` a la red de Munir), ni
// un clic en el escritorio de nadie. No hace falta ser administrador: se muestrea `netstat -ano`
// cada ~100 ms, y los nombres salen de la caché DNS de Windows. Una conexión más corta que eso, o
// que se cierra antes de que se vea, no sale; el navegador mantiene las suyas abiertas y esas sí.
//
// Sale con 1 si un destino de `adeorq.exe` no está entre los de la tabla, o si algo escucha fuera de
// 127.0.0.1. Lo que hace por su cuenta el navegador de la ventana (WebView2, de Microsoft) se enseña
// aparte: no es de Adeorq, pero el revisor lo ve en una captura de red, así que va en el documento.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const SALIDA = resolve(process.argv[2] || tmpdir());
const exe = resolve(process.argv[3] || EXE);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
const visto = (texto, detalle = "") => console.log(`VISTO ${texto}${detalle ? `\n      ${detalle}` : ""}`);
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const PUERTO_MOVIL = 47_911;
/** Con `RAPIDO=1` las esperas son de 8 s: sirve para probar el muestreador, no para medir (el copiloto tarda 4 minutos). */
const espera = (ms) => dormir(process.env.RAPIDO ? Math.min(ms, 8000) : ms);
const PATH_LIMPIO = ["C:\\WINDOWS\\system32", "C:\\WINDOWS", "C:\\WINDOWS\\System32\\Wbem", "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0"].join(";");

/** El muestreador: un PowerShell que apunta, la primera vez que la ve, cada conexión (y cada puerto en
 *  escucha) de los procesos del árbol de la Adeorq de esta pasada. Raíces: el ejecutable de la pasada y
 *  cualquier proceso con la carpeta de la pasada en su línea de comandos (el navegador de la ventana no
 *  cuelga del árbol de la app). Se para cuando aparece el archivo `parar`. */
const MUESTREADOR = String.raw`
param([string]$Exe, [string]$Base, [string]$Salida, [string]$Parar)
$ErrorActionPreference = 'SilentlyContinue'
function Arbol {
  $todos = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
  $ids = @{}
  foreach ($r in ($todos | Where-Object { $_.ExecutablePath -eq $Exe -or ($_.CommandLine -and $_.CommandLine.Contains($Base)) })) { $ids[[int]$r.ProcessId] = $r.Name }
  do {
    $nuevo = 0
    foreach ($p in $todos) {
      if (-not $ids.ContainsKey([int]$p.ProcessId) -and $ids.ContainsKey([int]$p.ParentProcessId)) { $ids[[int]$p.ProcessId] = $p.Name; $nuevo++ }
    }
  } while ($nuevo -gt 0)
  return $ids
}
$ids = Arbol
$ultimo = Get-Date
$ya = @{}
while (-not (Test-Path $Parar)) {
  if (((Get-Date) - $ultimo).TotalSeconds -ge 1.2) {
    $ids = Arbol
    $ultimo = Get-Date
    # La caché DNS también, cada vez: un nombre dura lo que su TTL y al final de la pasada ya no está.
    foreach ($d in (Get-DnsClientCache | Where-Object { $_.Type -in 1,28 })) {
      $k = "DNS|$($d.Entry)|$($d.Data)"
      if (-not $ya.ContainsKey($k)) { $ya[$k] = 1; Add-Content -Path $Salida -Value $k }
    }
  }
  $t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  foreach ($l in (netstat -ano)) {
    if ($l -match '^\s*TCP\s+(\S+):(\d+)\s+(\S+):(\d+)\s+(\w+)\s+(\d+)\s*$') {
      $proceso = [int]$Matches[6]
      if ($ids.ContainsKey($proceso)) {
        $clave = "$proceso|$($Matches[1]):$($Matches[2])|$($Matches[3]):$($Matches[4])|$($Matches[5])"
        if (-not $ya.ContainsKey($clave)) {
          $ya[$clave] = 1
          Add-Content -Path $Salida -Value ("{0}|{1}|{2}|{3}:{4}|{5}:{6}|{7}" -f $t, $proceso, $ids[$proceso], $Matches[1], $Matches[2], $Matches[3], $Matches[4], $Matches[5])
        }
      }
    }
  }
  Start-Sleep -Milliseconds 40
}
`;

const esLocal = (ip) => /^(127\.|::1$|\[::1\]$|0\.0\.0\.0$|\[::\]$|::$)/.test(ip);

/** De «IP:puerto» (con o sin corchetes de IPv6) a [ip, puerto]. */
function partir(a) {
  const i = a.lastIndexOf(":");
  return [a.slice(0, i).replace(/^\[|\]$/g, ""), a.slice(i + 1)];
}

/** La caché DNS de Windows: de qué nombre salió cada IP. */
function cacheDns() {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-DnsClientCache | Where-Object { $_.Type -in 1,28 } | Select-Object Entry,Data | ConvertTo-Json -Compress"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = new Map();
  try {
    const l = JSON.parse(r.stdout || "[]");
    for (const e of Array.isArray(l) ? l : [l]) if (e?.Data) m.set(String(e.Data).toLowerCase(), e.Entry);
  } catch {}
  return m;
}

/** El destino es de ese dominio (por su nombre, o porque casa con él: «(coincide con a / b)»). */
const esDe = (x, sufijo) => (x.nombre.startsWith("(coincide con ") ? x.nombre.slice(14, -1).split(" / ") : [x.nombre]).some((n) => n === sufijo || n.endsWith(`.${sufijo}`));

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
function tamano(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    try {
      t += e.isDirectory() ? tamano(p) : statSync(p).size;
    } catch {}
  }
  return t;
}

/** Lo que cada pasada puede contactar por su cuenta (adeorq.exe), por sufijo de nombre. La tabla del
 *  apartado 7 de `privacidad-borrador.md`: S1 GitHub (solo la instalación de siempre), S2 y S3 OpenRouter. */
const TABLA = { tienda: ["openrouter.ai"], normal: ["github.com", "openrouter.ai"] };

async function pasada({ nombre, tienda, estados, n }) {
  console.log(`\n── ${tienda ? "La Tienda (paquete fingido)" : "La instalación de siempre"} ──`);
  const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
  const parar = join(base, "parar-muestreo");
  const salida = join(base, "conexiones.txt");
  const guion = join(SALIDA, `muestreador-${process.pid}-${n}.ps1`);
  mkdirSync(base, { recursive: true });
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(guion, MUESTREADOR);
  writeFileSync(salida, "");
  // Sin Tailscale a la vista (ni en el PATH ni en `Program Files`), y con un `claude` de mentira delante.
  const falso = join(base, "falso");
  mkdirSync(falso, { recursive: true });
  writeFileSync(join(falso, "claude.cmd"), "@echo off\r\necho [claude de mentira del laboratorio de conexiones]\r\npause >nul\r\n");
  const sinProgramas = join(base, "sin-programas");
  mkdirSync(sinProgramas, { recursive: true });
  const PATH = `${falso};${PATH_LIMPIO}`;

  const muestreador = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", guion, "-Exe", exe, "-Base", base, "-Salida", salida, "-Parar", parar], { stdio: "ignore", windowsHide: true });
  const marcas = [];
  const marca = (estado) => marcas.push({ estado, t: Date.now() });
  let a;
  try {
    a = await abrirAislada({
      nombre,
      puertoMcp: 47_650 + (process.pid % 200) + n,
      depurar: 9650 + (process.pid % 90) + n,
      exe,
      fotos: SALIDA,
      red: true,
      guarda: `localStorage.setItem("adeorq-lang", "en");`,
      sembrar: (datos) => {
        if (tienda) {
          // En el paquete los datos viven en `.adeorq`: la carpeta de proyectos se sube ahí.
          const casa = resolve(datos, "..", "..", "casa");
          mkdirSync(join(casa, ".adeorq"), { recursive: true });
          writeFileSync(join(casa, ".adeorq", "raiz.txt"), join(base, "proyectos"));
        }
      },
      entorno: {
        ...(tienda ? { ADEORQ_FINGIR_EMPAQUETADA: "1" } : {}),
        PATH,
        Path: PATH,
        ADEORQ_MOVIL_PUERTO: String(PUERTO_MOVIL),
        ProgramW6432: sinProgramas,
        ProgramFiles: sinProgramas,
        "ProgramFiles(x86)": sinProgramas,
      },
    });
    const { v } = a;
    dice((await v.js(`window.__TAURI_INTERNALS__.invoke("esta_empaquetada")`)) === tienda, tienda ? "es el paquete fingido" : "es la instalación de siempre");
    const t0 = Date.now();

    // E1: recién abierta.
    marca("E1 recién abierta");
    await espera(estados.includes("E2") ? 195_000 : 75_000);

    if (estados.includes("E2")) {
      // E2: una sesión de agente abierta (con identificador de sesión, como las de verdad).
      marca("E2 con una sesión de agente abierta");
      await v.js(`document.querySelector('[data-tab="cabina"]')?.click(); "ok"`);
      await dormir(1200);
      await v.js(`(() => { const p = [...document.querySelectorAll(".project-main")].find((x) => x.textContent.includes("demo")); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); return true; })()`);
      await dormir(600);
      const abierta = await v.js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.replace(/\\s+/g, " ").trim() === "New Claude Code session here"); if (!b) return false; b.click(); return true; })()`);
      dice(abierta, "se abre una sesión de Claude Code (la de mentira) en el proyecto de ejemplo");
      await dormir(3000);
      const paneles = await v.js(`document.querySelectorAll("[data-pane-id]").length`);
      dice(paneles >= 1, "hay una terminal viva con la sesión", `${paneles}`);
      await a.foto(null, `conexiones-${nombre}-sesion.png`);
      // El copiloto da su primera vuelta a los 4 minutos de montarse: hasta 5 minutos después de abrir la página.
      const falta = 330_000 - (Date.now() - t0);
      if (falta > 0) await espera(falta);

      // E3: el móvil encendido.
      marca("E3 con el móvil encendido");
      const e = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_encender", { encendido: true }).then((x) => JSON.stringify(x), (m) => "ERROR " + m)`);
      visto("el estado del móvil al encenderlo", String(e).slice(0, 200));
      await espera(40_000);

      // E4: apagado otra vez.
      marca("E4 con el móvil apagado otra vez");
      await v.js(`window.__TAURI_INTERNALS__.invoke("movil_encender", { encendido: false }).then(() => "ok", (m) => "ERROR " + m)`);
      await espera(20_000);
    }
    marca("fin");

    // La carpeta del navegador de la ventana, antes de cerrar.
    const navegador = join(base, "navegador");
    if (existsSync(navegador)) {
      const hijos = readdirSync(navegador, { withFileTypes: true }).map((e) => e.name);
      visto(`la carpeta del navegador de la ventana (WebView2): ${kb(tamano(navegador))} en total`, hijos.join(", "));
      const ebw = join(navegador, "EBWebView");
      if (existsSync(ebw)) {
        const sub = readdirSync(ebw, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${e.name} ${kb(tamano(join(ebw, e.name)))}`);
        visto("y por dentro (EBWebView)", sub.join(" | "));
        const def = join(ebw, "Default");
        if (existsSync(def)) {
          const dd = readdirSync(def, { withFileTypes: true }).map((e) => `${e.name}${e.isDirectory() ? "/" : ""} ${kb(e.isDirectory() ? tamano(join(def, e.name)) : statSync(join(def, e.name)).size)}`);
          visto("y en Default", dd.join(" | "));
        }
      }
    }
  } finally {
    writeFileSync(parar, "1");
    await dormir(1500);
    muestreador.kill();
    spawnSync("taskkill", ["/PID", String(muestreador.pid), "/T", "/F"], { stdio: "ignore" });
    // Los nombres, mientras la caché DNS todavía los recuerda y antes de cerrar nada.
  }
  const dns = cacheDns();
  // Antes de cerrar: `cerrar` borra la carpeta de la pasada, y el archivo con ella.
  const crudo = readFileSync(salida, "utf8");
  if (a) await a.cerrar();

  // ── Lo apuntado, por estado ──────────────────────────────────────────────
  const lineas = crudo.split(/\r?\n/).filter(Boolean);
  for (const l of lineas) if (l.startsWith("DNS|")) {
    const [, entrada, dato] = l.split("|");
    if (dato) dns.set(dato.toLowerCase(), dns.get(dato.toLowerCase()) ?? entrada);
  }
  /** Chromium resuelve con su propio cliente y no deja rastro en la caché de Windows, y el nombre inverso (PTR)
   *  de estas direcciones no existe. Se resuelve en directo una lista corta de nombres que se esperan (los de la
   *  tabla y los que el runtime de WebView2 usa) y se casan por IP: un destino sin casar sale tal cual, con su IP. */
  const conocidos = new Map();
  {
    const nombres = ["github.com", "api.github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "openrouter.ai", "config.edge.skype.com", "ecs.office.com", "edge.microsoft.com", "msedge.api.cdp.microsoft.com", "update.googleapis.com", "clients2.google.com", "go.microsoft.com", "ctldl.windowsupdate.com", "www.bing.com", "assets.msn.com", "c.msn.com", "api.msn.com", "browser.events.data.microsoft.com"];
    // Tres veces: los nombres que rotan entre varias direcciones (config.edge.skype.com) no dan todas de golpe.
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `1..3 | ForEach-Object { foreach ($n in ${nombres.map((x) => `'${x}'`).join(",")}) { foreach ($d in (Resolve-DnsName -Name $n -Type A -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'A' })) { "$($d.IPAddress)|$n" } } }`], { encoding: "utf8" });
    for (const l of (r.stdout ?? "").split(/\r?\n/).filter(Boolean)) {
      const [ip, nombre] = l.split("|");
      conocidos.set(ip, [...(conocidos.get(ip) ?? []), nombre]);
    }
  }
  const casa = (ip) => (conocidos.has(ip) ? `(coincide con ${conocidos.get(ip).join(" / ")})` : "(sin nombre: ninguna caché ni lista lo conoce)");
  const filas = lineas
    .filter((l) => !l.startsWith("DNS|"))
    .map((l) => {
      const [t, pid, proceso, local, remoto, estado] = l.split("|");
      return { t: Number(t), pid, proceso, local, remoto, estado };
    });
  const estadoDe = (t) => [...marcas].reverse().find((m) => t >= m.t - 1500)?.estado ?? marcas[0].estado;
  const resumen = {};
  const escuchas = [];
  for (const f of filas) {
    if (f.estado === "LISTENING") {
      escuchas.push(f);
      continue;
    }
    const [ip, puerto] = partir(f.remoto);
    if (esLocal(ip)) continue;
    const nombreDns = dns.get(ip.toLowerCase()) ?? casa(ip);
    const clave = `${estadoDe(f.t)}|${f.proceso}|${nombreDns}|${ip}:${puerto}`;
    resumen[clave] = (resumen[clave] ?? 0) + 1;
  }
  const porEstado = {};
  for (const [k, veces] of Object.entries(resumen)) {
    const [estado, proceso, dnsNombre, destino] = k.split("|");
    (porEstado[estado] ??= []).push({ proceso, nombre: dnsNombre, destino, veces });
  }
  writeFileSync(join(SALIDA, `conexiones-${nombre}.json`), JSON.stringify({ marcas, porEstado, escuchas }, null, 2));
  for (const m of marcas) {
    if (m.estado === "fin") continue;
    const lista = porEstado[m.estado] ?? [];
    visto(`${m.estado}: ${lista.length ? "destinos que no son de este equipo" : "ninguna conexión a un destino que no sea de este equipo"}`, lista.map((x) => `${x.proceso} → ${x.nombre} ${x.destino} (${x.veces})`).join("\n      "));
  }

  // Lo que Adeorq mismo contacta (adeorq.exe): tiene que estar en la tabla.
  const suyos = Object.entries(porEstado).flatMap(([estado, l]) => l.filter((x) => /^adeorq/i.test(x.proceso)).map((x) => ({ estado, ...x })));
  const permitidos = TABLA[tienda ? "tienda" : "normal"];
  const fuera = suyos.filter((x) => !permitidos.some((s) => esDe(x, s)));
  dice(fuera.length === 0, "todo destino de adeorq.exe está en la tabla de la privacidad", fuera.map((x) => `${x.estado}: ${x.nombre} ${x.destino}`).join("\n      "));
  if (tienda) {
    dice(!suyos.some((x) => esDe(x, "github.com")), "en la Tienda adeorq.exe no pregunta a GitHub (sin actualizador)");
    if (estados.includes("E2")) {
      const or = suyos.filter((x) => x.estado.startsWith("E2") && esDe(x, "openrouter.ai"));
      dice(or.length > 0, "con una sesión abierta, adeorq.exe pide el catálogo público a OpenRouter (S2, S3), sin ninguna clave", or.map((x) => `${x.nombre} ${x.destino}`).join(", ") || "no se vio: ¿la primera vuelta del copiloto no llegó o la conexión fue más corta que el muestreo?");
    }
  } else {
    const gh = suyos.filter((x) => esDe(x, "github.com"));
    dice(gh.length > 0, "la instalación de siempre pregunta a GitHub por la última versión al arrancar (S1)", gh.map((x) => `${x.estado}: ${x.nombre} ${x.destino}`).join(", ") || "no se vio");
  }

  // Lo que hace por su cuenta el navegador de la ventana (WebView2).
  const ajenos = Object.entries(porEstado).flatMap(([estado, l]) => l.filter((x) => !/^adeorq/i.test(x.proceso)).map((x) => ({ estado, ...x })));
  visto("lo que hace por su cuenta el navegador de la ventana (WebView2) y lo demás del árbol", ajenos.map((x) => `${x.estado} · ${x.proceso} → ${x.nombre} ${x.destino} (${x.veces})`).join("\n      ") || "nada");

  // Quién escucha, y dónde.
  const unicas = [...new Map(escuchas.map((f) => [`${f.proceso}|${f.local}`, f])).values()];
  visto("puertos en escucha del árbol", unicas.map((f) => `${f.proceso} ${f.local}`).join(" | ") || "ninguno");
  const abiertos = unicas.filter((f) => !/^(127\.0\.0\.1|\[::1\]):/.test(f.local));
  dice(abiertos.length === 0, "todo lo que escucha, escucha solo en 127.0.0.1 (nada en 0.0.0.0 ni en la red)", abiertos.map((f) => `${f.proceso} ${f.local}`).join(", "));
  if (tienda && estados.includes("E3")) {
    const movil = unicas.find((f) => f.local === `127.0.0.1:${PUERTO_MOVIL}`);
    dice(!!movil, `con el móvil encendido, la página del móvil escucha en 127.0.0.1:${PUERTO_MOVIL} (el puerto de prueba)`, movil ? `${movil.proceso}` : "no se vio");
  }
  return { porEstado, escuchas: unicas };
}

// `SOLO=tienda` o `SOLO=normal`: la de la Tienda tarda unos 8 minutos (el copiloto da su primera vuelta a los 4).
if (process.env.SOLO !== "normal") await pasada({ nombre: "conexiones-tienda", tienda: true, estados: ["E1", "E2", "E3", "E4"], n: 0 });
if (process.env.SOLO !== "tienda") await pasada({ nombre: "conexiones-normal", tienda: false, estados: ["E1"], n: 1 });

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
