// «Que las terminales aguanten si Adeorq se cae», con una VENTANA de verdad.
//
// Las pruebas de Rust (`cargo test --lib terminales`, `proceso_de_verdad`) miran
// el proceso de terminales y su cliente; `reenganche.js` mira la ventana con un
// doble. Esto junta las dos mitades: el binario de desarrollo entero, con su
// ventana, tirado a la fuerza y vuelto a abrir.
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/caida-de-verdad.mjs [ruta del .exe]
//
// Abre una ventana «Adeorq · DESARROLLO» en el escritorio dos veces, unos
// cuarenta segundos en total, y la maneja por dentro (el puerto de depuración
// del WebView): ni ratón ni teclado. Solo en Windows.
//
// No toca la Adeorq instalada ni sus datos: la casa (`USERPROFILE`), los datos
// (`LOCALAPPDATA`) y el perfil del navegador (`WEBVIEW2_USER_DATA_FOLDER`) van a
// una carpeta temporal, y el canal de terminales es propio. Solo mata procesos
// que ha lanzado él o que salen del fichero de señas de SU canal.
//
// La trampa que costó encontrar: con una casa falsa recién creada el puerto de
// depuración NO se abre. El argumento llega al navegador (se ve en su línea de
// comandos) y nadie escucha. Desde Chromium 136 el puerto se niega si la
// carpeta de datos es «la de siempre», y para saber cuál es la de siempre el
// navegador pregunta por `AppData\Local` de la casa: si no existe, no lo sabe y
// se niega por si acaso. Basta con crearla antes del primer arranque. No era el
// puerto, ni la ruta, ni quién lanza el proceso: se descartaron los tres.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9400 + (process.pid % 100);
const CANAL = `caida${process.pid}`;
const BASE = join(tmpdir(), `adeorq-caida-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const PROYECTO = join(BASE, "proyectos", "demo");
const SEÑAS = join(DATOS, "terminales", `${CANAL}.json`);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const hasta = async (que, ms, cada = 300) => {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await Promise.resolve(que()).catch(() => null);
    if (v) return v;
    if (Date.now() > fin) return null;
    await dormir(cada);
  }
};

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

function abrirApp() {
  const hijo = spawn(EXE, [], {
    cwd: PROYECTO,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: join(BASE, "casa"),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
      ADEORQ_TERMINALES_CANAL: CANAL,
    },
  });
  hijo.unref();
  return hijo.pid;
}

/** La ventana, por el protocolo de depuración: evaluar y llamar a Tauri. */
async function ventana() {
  const destino = await hasta(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
    return lista.find((t) => t.type === "page" && t.url.includes("localhost:1420"));
  }, 30_000);
  if (!destino) throw new Error("la ventana no abrió su puerto de depuración");
  const ws = new WebSocket(destino.webSocketDebuggerUrl);
  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error("no conecta con la ventana"));
  });
  let n = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    if (m.error) p.mal(new Error(m.error.message));
    else p.ok(m.result);
  };
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      const id = ++n;
      pendientes.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const js = async (expr) => {
    const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const inv = (cmd, args = {}) => js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
  await hasta(() => js("!!window.__TAURI_INTERNALS__"), 20_000);
  return { enviar, js, inv, cerrar: () => ws.close() };
}

const sinColores = (t) => t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
const historial = async (v, id) => sinColores(await v.inv("pty_historial", { id, bytes: 6000 }));
const ultimoTic = (t) => Math.max(0, ...[...t.matchAll(/tic (\d+)/g)].map((m) => Number(m[1])));
const señas = () => JSON.parse(readFileSync(SEÑAS, "utf8"));

let app = 0;
let motor = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  // El ajuste es un fichero y se lee al ARRANCAR, antes de que la ventana abra
  // nada; y la raíz en disco evita que el primer arranque mire `C:\proyectos`.
  mkdirSync(join(DATOS, "terminales"), { recursive: true });
  mkdirSync(PROYECTO, { recursive: true });
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  writeFileSync(join(DATOS, "terminales", "encendido"), "1");
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));

  // ------------------------------------------------------------ primera vida
  app = abrirApp();
  let v = await ventana();
  // El primer arranque sale con la bienvenida: se deja hecho y se le da un
  // tablero de dos terminales, que al recargar abre él por el camino de siempre.
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )});
    localStorage.setItem("adeorq-layout", ${JSON.stringify(
      JSON.stringify({
        panes: [
          { name: "demo · uno", cwd: PROYECTO },
          { name: "demo · dos", cwd: PROYECTO },
        ],
        cols: [
          { w: 1, hs: [1], idx: [0] },
          { w: 1, hs: [1], idx: [1] },
        ],
        ocultos: [],
      }),
    )});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();

  dice(await v.inv("terminales_aparte"), "el ajuste está encendido en la ventana");
  const antes = await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length === 2 ? l : null;
  }, 30_000);
  if (!antes) throw new Error("el tablero no abrió sus dos terminales");
  const [uno, dos] = antes.map((t) => t.id).sort((a, b) => a - b);
  motor = (await hasta(() => existsSync(SEÑAS) && señas().pid, 5000)) || 0;
  dice(motor > 0 && vivo(motor), `el proceso de terminales corre aparte (pid ${motor})`);

  await dormir(2500);
  await v.inv("pty_write", { id: uno, data: "echo marca-de-la-uno\r" });
  await v.inv("pty_write", { id: dos, data: '1..600 | % { "tic $_"; Start-Sleep 1 }\r' });
  // Seis segundos: que el contador avance y que el tablero, con el número de
  // cada terminal ya apuntado, llegue al disco del navegador.
  await dormir(6000);
  const ticAntes = ultimoTic(await historial(v, dos));
  dice((await historial(v, uno)).includes("marca-de-la-uno"), "la uno tiene su marca antes de la caída");
  dice(ticAntes > 0, `la dos cuenta (va por el ${ticAntes})`);
  v.cerrar();

  // ------------------------------------------------------------ la caída
  // Solo el proceso de la app, sin su árbol: lo mismo que un fallo.
  process.kill(app);
  await dormir(4000);
  dice(!vivo(app), "la app ha muerto");
  dice(vivo(motor), "el proceso de terminales sigue vivo sin ella");

  // ------------------------------------------------------------ la vuelta
  app = abrirApp();
  v = await ventana();
  const despues = await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length >= 2 && (await v.js("document.querySelectorAll('.xterm').length")) >= 2 ? l : null;
  }, 30_000);
  const ids = (despues ?? []).map((t) => t.id).sort((a, b) => a - b);
  dice(ids.length === 2 && ids[0] === uno && ids[1] === dos, `la ventana vuelve y encuentra las mismas dos terminales (${ids.join(", ")})`);
  dice(señas().pid === motor, "es el mismo proceso de terminales, no uno nuevo");
  await dormir(2500);
  dice((await historial(v, uno)).includes("marca-de-la-uno"), "la uno conserva lo que dijo");
  const ticDespues = ultimoTic(await historial(v, dos));
  dice(ticDespues > ticAntes + 3, `la dos siguió contando sin la app (del ${ticAntes} al ${ticDespues})`);
  const tablero = JSON.parse((await v.js("localStorage.getItem('adeorq-layout')")) ?? "{}");
  const paneles = tablero.panes ?? [];
  dice(
    paneles.length === 2 && paneles.some((p) => p.pty === uno) && paneles.some((p) => p.pty === dos),
    `cada panel recoge su terminal (${paneles.map((p) => `${p.name} = ${p.pty}`).join("; ")})`,
  );
  dice(!paneles.some((p) => /recuperada/.test(p.name)), "ninguna sale como «recuperada»: las dos tenían dueño");
  // Dos veces la palabra: la orden que se teclea y lo que contesta el shell.
  const contesto = () => hasta(async () => (await historial(v, uno)).split("escrito-al-volver").length > 2, 8000);
  await v.inv("pty_write", { id: uno, data: "echo escrito-al-volver\r" });
  let acepta = await contesto();
  if (!acepta) {
    console.log("      la primera escritura no llegó; cola de la uno: " + JSON.stringify((await historial(v, uno)).slice(-160)));
    await v.inv("pty_write", { id: uno, data: "echo escrito-al-volver\r" });
    acepta = (await contesto()) && "a la segunda";
  }
  dice(acepta === true, `la terminal recogida sigue aceptando teclas${acepta === "a la segunda" ? " (la PRIMERA escritura se perdió)" : ""}`);

  // ------------------------------------------------------------ el cierre de verdad
  // Salir bien es despedirse: el proceso de terminales se lleva todo.
  await v.inv("plugin:process|exit", { code: 0 }).catch(() => {});
  dice(await hasta(() => !vivo(motor) && !vivo(app), 10_000), "al salir bien, el proceso de terminales se cierra con ella");
} catch (e) {
  dice(false, e.message);
} finally {
  for (const pid of [app, motor]) if (pid && vivo(pid)) process.kill(pid);
  await dormir(1500);
  // El navegador puede tardar un momento en soltar su carpeta.
  for (let i = 0; i < 5 && existsSync(BASE); i++) {
    try {
      rmSync(BASE, { recursive: true, force: true });
    } catch {
      await dormir(1000);
    }
  }
}

console.log(fallos ? `\n${fallos} en rojo.` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
