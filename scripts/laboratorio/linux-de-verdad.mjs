// La Adeorq de una release, abierta y usada de verdad en el Fedora de WSL, en una
// pantalla virtual: ni una ventana en el escritorio de Munir y ni una gota en su
// portapapeles (WSLg lo comparte con Windows, y aquí no se usa WSLg).
//
//   MSYS_NO_PATHCONV=1 wsl -d FedoraLinux-44 --user root -- \
//     node /mnt/c/proyectos/Adeorq/scripts/laboratorio/linux-de-verdad.mjs <carpeta de salida>
//
// Antes, `scripts/laboratorio/probar-linux-wsl.sh <versión>` (o a mano, el rpm)
// deja instalada la release, o `compilar-en-fedora.sh` compila un commit y
// `ADEORQ_BIN=<ruta>` le dice qué binario usar. Hacen falta Xvfb, xdotool e
// ImageMagick:
//   dnf install -y xorg-x11-server-Xvfb xdotool ImageMagick nodejs openbox xclip xorg-x11-utils
// (en Debian y Ubuntu: xvfb xdotool imagemagick nodejs openbox xclip x11-utils; con ImageMagick 6, que
// no trae `magick`, hace falta un `magick` que llame a `convert` y `compare`)
//
// Lo que hace:
//   1. levanta `Xvfb` y abre la app con una casa de usar y tirar;
//   2. le habla por el puente de verdad (`adeorq --mcp`): abre una consola, le
//      manda un `echo` con una cuenta y mira que salga el resultado;
//   3. va de la Cabina al Panel y vuelve, con la consola sin foco, y cuenta los
//      píxeles claros de la terminal en la foto;
//   4. pega y copia por todos los gestos, con `xclip` en esa pantalla;
//   5. saca fotos de la pantalla virtual, y con `--quedarse <segundos>` deja la
//      app abierta para manejarla con `xdotool` en esa misma pantalla.
//
// Con `LAB_FONDO_VIDEO=<ruta a un .mp4>`, en vez de todo eso mira que un fondo de vídeo
// se vea y se mueva.
//
// Con `LAB_PERFIL_REESCRIBE_EL_PATH=1`, el perfil de la shell de la consola reescribe el PATH como el
// `/etc/profile` de Debian, y se mira que el `adeorq` que se teclea siga siendo el de esta app.
//
// Lo que NO prueba: la aceleración gráfica de un equipo real (Xvfb pinta por
// software), un escritorio de verdad (GNOME, KDE) ni el .deb.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const salida = args[0];
const quedarse = args[1] === "--quedarse" ? Number(args[2]) : 0;
if (!salida) {
  console.error("uso: node linux-de-verdad.mjs <carpeta de salida> [--quedarse <segundos>]");
  process.exit(2);
}
mkdirSync(salida, { recursive: true });

const PUERTO = 3012;
const PANTALLA = ":77";
const BINARIO = process.env.ADEORQ_BIN || spawnSync("sh", ["-c", "command -v adeorq"], { encoding: "utf8" }).stdout.trim();
if (!BINARIO) {
  console.error("No está instalada: primero el rpm de la release, o ADEORQ_BIN=<ruta>.");
  process.exit(2);
}
// Dónde cae cada cosa en la ventana, medido en las fotos: la primera fila de la
// terminal, y las dos primeras líneas del menú respecto del clic que lo abre.
const FILA1 = { x: 304, y: 93, celda: 9 };
const MENU_COPIAR = { x: 40, y: 21 };
const MENU_PEGAR = { x: 40, y: 53 };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "BIEN" : "MAL "}  ${que}`);
  if (!ok) fallos.push(que);
};
async function hasta(fn, ms, cada = 500) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await dormir(cada);
  }
  return null;
}

const BASE = mkdtempSync(join(tmpdir(), "adeorq-linux-"));
const CASA = join(BASE, "casa");
const RUNTIME = join(BASE, "runtime");
const DATOS = join(CASA, ".local", "share", "adeorq");
mkdirSync(DATOS, { recursive: true });
mkdirSync(RUNTIME, { recursive: true, mode: 0o700 });
// Lo de fuera de una terminal de Adeorq solo mira y abre; esta sonda también
// escribe, así que nace con ese permiso subido, como se sube en Ajustes.
writeFileSync(join(DATOS, "mcp_clientes.json"), JSON.stringify({ niveles: { fuera: "auto" } }));
// Con `LAB_PERFIL_REESCRIBE_EL_PATH=1`, el perfil de la shell de login reescribe el PATH como el
// `/etc/profile` de Debian (Fedora y Ubuntu lo conservan, y por eso allí nunca se ve).
if (process.env.LAB_PERFIL_REESCRIBE_EL_PATH) writeFileSync(join(CASA, ".bash_profile"), "PATH=/usr/bin:/bin\nexport PATH\n");
const FONDO_VIDEO = process.env.LAB_FONDO_VIDEO;
if (FONDO_VIDEO) copyFileSync(FONDO_VIDEO, join(DATOS, "fondo.mp4"));

// Sin WAYLAND_DISPLAY ni el DISPLAY de WSLg: ni la ventana ni el portapapeles
// llegan a Windows. Y sin las carpetas de Windows en el PATH (WSL las añade): la
// app, buscando sus clientes, lanzaba el `copilot` de Windows y salía conectada
// una cuenta de Munir en una casa vacía.
const env = {
  PATH: (process.env.PATH ?? "").split(":").filter((d) => !d.startsWith("/mnt/")).join(":"),
  HOME: CASA,
  USER: "root",
  LOGNAME: "root",
  SHELL: "/bin/bash",
  LANG: "C.UTF-8",
  TERM: "xterm-256color",
  DISPLAY: PANTALLA,
  XDG_RUNTIME_DIR: RUNTIME,
  GDK_BACKEND: "x11",
  // Si esto corre dentro de `dbus-run-session`: la instancia única de Adeorq va por D-Bus,
  // y sin bus cada apertura sería una app nueva.
  ...(process.env.DBUS_SESSION_BUS_ADDRESS ? { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS } : {}),
};

// Con `LAB_WAYLAND=<socket>` la app NO va en X11: va en el compositor de Wayland que ya esté corriendo en
// ese socket, dentro de `XDG_RUNTIME_DIR` (el de quien lanza esto, con su propio directorio, nunca el de WSLg),
// sin `DISPLAY` y con `GDK_BACKEND=wayland` para que no pueda caer en X11 sin que se note. El compositor lo
// monta quien lanza esto, ANIDADO en la pantalla `:77` (weston, kwin, sway... con su backend X11): de ahí salen
// las fotos y por ahí entran el teclado y el ratón (`xdotool` sobre `:77`; el compositor los reenvía). El
// portapapeles es el del compositor (`wl-copy`, `wl-paste`). `LAB_ORIGEN=x,y,ancho,alto` dice dónde cae la
// ventana de la app en la foto (su parte web, sin la barra), porque un compositor no tiene un X11 que
// preguntar.
const WAYLAND = process.env.LAB_WAYLAND;
const envApp = WAYLAND
  ? { ...env, DISPLAY: undefined, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, WAYLAND_DISPLAY: WAYLAND, GDK_BACKEND: "wayland" }
  : env;
if (WAYLAND) {
  const guarda = process.env.XDG_RUNTIME_DIR ?? "";
  if (WAYLAND === "wayland-0" || !guarda || /^\/(mnt|run\/user)/.test(guarda) || !existsSync(join(guarda, WAYLAND))) {
    console.error(`LAB_WAYLAND=${WAYLAND} con XDG_RUNTIME_DIR=${guarda}: eso no es un socket propio (nada de WSLg). Me niego.`);
    process.exit(3);
  }
}

const xvfb = WAYLAND ? null : spawn("Xvfb", [PANTALLA, "-screen", "0", "1600x1000x24", "-nolisten", "tcp"], { stdio: "ignore", detached: true });
xvfb?.unref();
if (!WAYLAND) await dormir(1500);
// Con un gestor de ventanas hay barra, botones y foco de teclado de verdad: sin él,
// GTK no se entera de que su ventana está activa.
if (!WAYLAND) {
  const gestor = spawn("openbox", [], { env, stdio: "ignore", detached: true });
  gestor.unref();
  await dormir(500);
}

const registro = join(salida, "adeorq-salida.log");
const log = spawn("/bin/sh", ["-c", `exec "$0" >"$1" 2>&1`, BINARIO, registro], { env: envApp, detached: true, stdio: "ignore", cwd: CASA });
log.unref();
const pidApp = log.pid;

function puente() {
  const p = spawn(BINARIO, ["--mcp"], { env: envApp });
  let buf = "";
  const pend = new Map();
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(l);
        pend.get(m.id)?.(m);
      } catch {}
    }
  });
  let n = 0;
  const pedir = (method, params, ms = 20000) =>
    new Promise((ok) => {
      const id = ++n;
      pend.set(id, ok);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => ok({ timeout: true }), ms);
    });
  const llamar = async (name, args, ms) => {
    const r = await pedir("tools/call", { name, arguments: args }, ms);
    if (r.timeout) return { error: "sin respuesta" };
    if (r.error) return { error: r.error.message };
    return { texto: r.result?.content?.[0]?.text ?? JSON.stringify(r), esError: Boolean(r.result?.isError) };
  };
  return { pedir, llamar, cerrar: () => p.kill() };
}

function vive() {
  try {
    process.kill(pidApp, 0);
    return true;
  } catch {
    return false;
  }
}

// Con un compositor que no se maneja desde un X11 (mutter y kwin sin pantalla, donde la entrada va por D-Bus), el
// que lanza esto da `LAB_ENTRADA=<ejecutable>`, que recibe `clic X Y [boton]`, `tecla COMBINACION` o
// `arrastrar X1 Y1 X2 Y2`, y `LAB_FOTO=<ejecutable>`, que recibe la ruta de la foto. Coordenadas de la pantalla.
const ENTRADA = process.env.LAB_ENTRADA;
function foto(nombre) {
  if (process.env.LAB_FOTO) {
    const r = spawnSync(process.env.LAB_FOTO, [join(salida, nombre)], { encoding: "utf8" });
    console.log(`foto ${nombre}: ${r.stdout?.trim() === "ok" ? "ok" : `estado ${r.status} ${r.stdout?.trim() ?? ""} ${r.stderr?.trim() ?? ""}`}`);
    return;
  }
  const r = spawnSync("import", ["-display", PANTALLA, "-window", "root", join(salida, nombre)], { encoding: "utf8" });
  console.log(`foto ${nombre}: ${r.status === 0 ? "ok" : `estado ${r.status} ${r.stderr?.trim() ?? ""}`}`);
}

/** Dónde empieza lo de dentro de la ventana, sin la barra que le pone el gestor. */
function origenDeLaVentana() {
  if (process.env.LAB_ORIGEN) {
    const [x, y, ancho, alto] = process.env.LAB_ORIGEN.split(",").map(Number);
    return { x, y, ancho, alto };
  }
  const ids = spawnSync("xdotool", ["search", "--onlyvisible", "--name", "Adeorq"], { env, encoding: "utf8" }).stdout.trim().split("\n");
  // `xdotool` 3.2016 (el de Ubuntu 24.04 y Debian 13) suma la barra del gestor dos veces en Y (0,38 donde
  // son 0,19), y todos los clics salían corridos: con `xwininfo` sale bien en todas.
  const w = spawnSync("xwininfo", ["-id", ids.at(-1)], { env, encoding: "utf8" }).stdout ?? "";
  const de = (re) => Number(w.match(re)?.[1] ?? NaN);
  const x = de(/Absolute upper-left X:\s+(-?\d+)/);
  const y = de(/Absolute upper-left Y:\s+(-?\d+)/);
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y, ancho: de(/Width:\s+(\d+)/), alto: de(/Height:\s+(\d+)/) };
  const g = spawnSync("xdotool", ["getwindowgeometry", "--shell", ids.at(-1)], { env, encoding: "utf8" }).stdout;
  const dato = (n) => Number(g.match(new RegExp(`${n}=(-?\\d+)`))?.[1] ?? 0);
  return { x: dato("X"), y: dato("Y"), ancho: dato("WIDTH"), alto: dato("HEIGHT") };
}
let origen = { x: 0, y: 0, ancho: 0, alto: 0 };

/** Un clic dentro de la ventana, en coordenadas de la propia ventana. */
function clic(x, y, boton = 1) {
  if (ENTRADA) return void spawnSync(ENTRADA, ["clic", String(origen.x + x), String(origen.y + y), String(boton)], { env: process.env });
  spawnSync("xdotool", ["mousemove", String(origen.x + x), String(origen.y + y), "click", String(boton)], { env });
}

/** Una combinación de teclas para la ventana activa. */
function tecla(combinacion) {
  if (ENTRADA) return void spawnSync(ENTRADA, ["tecla", combinacion], { env: process.env });
  spawnSync("xdotool", ["key", "--clearmodifiers", combinacion], { env });
}

/** Arrastrar con el botón izquierdo, como quien selecciona con el ratón. */
function arrastrar(x1, y1, x2, y2) {
  if (ENTRADA) return void spawnSync(ENTRADA, ["arrastrar", String(origen.x + x1), String(origen.y + y1), String(origen.x + x2), String(origen.y + y2)], { env: process.env });
  spawnSync("xdotool", ["mousemove", String(origen.x + x1), String(origen.y + y1), "mousedown", "1", "mousemove", String(origen.x + x2), String(origen.y + y2), "mouseup", "1"], { env });
}

/** El portapapeles de ESTA pantalla virtual, que no es el de Windows. `xclip` se
    queda en segundo plano guardándolo: sin soltar sus salidas, esto no volvería. */
function aLaSeleccion(texto, seleccion = "clipboard") {
  if (WAYLAND) {
    spawnSync("wl-copy", [...(seleccion === "primary" ? ["--primary"] : []), "--", texto], { env: envApp, stdio: ["ignore", "ignore", "ignore"], timeout: 3000 });
    return;
  }
  spawnSync("xclip", ["-selection", seleccion], { env, input: texto, stdio: ["pipe", "ignore", "ignore"], timeout: 3000 });
}
function deLaSeleccion(seleccion = "clipboard") {
  if (WAYLAND) {
    return spawnSync("wl-paste", ["--no-newline", ...(seleccion === "primary" ? ["--primary"] : [])], { env: envApp, encoding: "utf8", timeout: 3000 }).stdout ?? "";
  }
  return spawnSync("xclip", ["-o", "-selection", seleccion], { env, encoding: "utf8", timeout: 3000 }).stdout ?? "";
}

/** Cuántos píxeles claros hay en las primeras filas de la terminal en esa foto: sin
    texto, cero, y también con la bienvenida encima, que la oscurece. */
function luzDeLaTerminal(nombre) {
  const r = spawnSync("magick", [join(salida, nombre), "-crop", `720x160+${origen.x + 310}+${origen.y + 85}`, "+repage", "-colorspace", "Gray", "-threshold", "40%", "-format", "%[fx:int(mean*w*h)]", "info:"], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

/** Cuántos píxeles claros hay en esa franja de la ventana. */
function luzEn(nombre, ancho, alto, x, y) {
  const r = spawnSync("magick", [join(salida, nombre), "-crop", `${ancho}x${alto}+${origen.x + x}+${origen.y + y}`, "+repage", "-colorspace", "Gray", "-threshold", "40%", "-format", "%[fx:int(mean*w*h)]", "info:"], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

let agente;
async function acabar() {
  agente?.cerrar();
  if (vive()) {
    // Es la mía: la lancé yo y me sé su número.
    try {
      process.kill(pidApp, "SIGTERM");
    } catch {}
  }
  await dormir(1500);
  // El gestor y los `xclip` que quedan guardando el portapapeles mueren con la pantalla.
  try {
    if (xvfb) process.kill(xvfb.pid, "SIGTERM");
  } catch {}
  console.log(fallos.length ? `\n${fallos.length} fallo(s):\n- ${fallos.join("\n- ")}` : "\nTodo bien.");
  // Dentro de un AppImage con `--appimage-extract-and-run`, el SIGTERM llega a su arrancador y no siempre a la app,
  // que sigue escribiendo en su casa unos instantes: sin reintentos, `rmSync` caía en ENOTEMPTY y la pasada salía con 1
  // estando todo en verde.
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (e) {
    console.log(`(no se pudo borrar ${BASE}: ${e.code})`);
  }
  process.exit(fallos.length ? 1 : 0);
}

try {
  const oye = await hasta(
    () =>
      new Promise((ok) => {
        const c = createConnection(PUERTO, "127.0.0.1");
        c.on("connect", () => {
          c.destroy();
          ok(true);
        });
        c.on("error", () => ok(false));
      }),
    90_000,
  );
  debe(Boolean(oye), `el MCP contesta en el ${PUERTO}`);
  debe(vive(), "la app sigue viva");
  if (!oye) throw new Error("sin MCP no hay nada más que probar");
  await dormir(6000);
  foto("1-al-abrir.png");
  origen = origenDeLaVentana();
  console.log(`la ventana empieza en ${origen.x},${origen.y}`);

  // Con `LAB_FONDO_VIDEO`, esta pasada solo mira el fondo: con un vídeo vivo detrás, contar
  // la luz de la terminal ya no diría nada. Un `<video>` de WebKitGTK no lee de `asset:`
  // (`lib/videoEnLinux.ts`), y el fondo se quedaba en nada. Vale cualquier vídeo con colores.
  if (FONDO_VIDEO) {
    clic(Math.round(origen.ancho / 2) - 230, Math.round(origen.alto / 2) + 111); // «Saltar» de la bienvenida
    await dormir(1500);
    clic(140, 20); // Panel
    await dormir(9000);
    foto("v1-fondo.png");
    const luz = luzEn("v1-fondo.png", 1200, 200, 200, 70);
    debe(luz > 2000, `el fondo de vídeo se ve (${luz} píxeles claros en lo alto del Panel)`);
    await dormir(1000);
    foto("v2-fondo.png");
    const cambia = spawnSync("magick", ["compare", "-metric", "AE", join(salida, "v1-fondo.png"), join(salida, "v2-fondo.png"), "null:"], { encoding: "utf8" });
    // Lo escribe en notación científica («2.3e+06»): `parseInt` diría 2.
    const distintos = Number(cambia.stderr.trim().split(/\s/)[0]) || 0;
    // El contador de la barra cambia solo y da unos 2e6; el vídeo, por encima de 1e9.
    debe(distintos > 1e8, `y se mueve (diferencia ${distintos} entre dos fotos a un segundo)`);
    await acabar();
  }

  agente = puente();
  const ini = await agente.pedir("initialize", { clientInfo: { name: "sonda-linux", version: "1" } });
  debe(Boolean(ini.result), "el puente `adeorq --mcp` se presenta");

  const hayVentana = await hasta(async () => /Arranque de Adeorq/.test((await agente.llamar("get_active_panes", {})).texto ?? ""), 40_000, 1000);
  debe(Boolean(hayVentana), "la ventana atiende al MCP (get_active_panes)");

  const abre = await agente.llamar("open_pane", { cli: "shell", cwd: CASA, name: "sonda-linux" }, 40_000);
  debe(Boolean(abre.texto) && !abre.error && !abre.esError, `open_pane abre una consola (${(abre.texto ?? abre.error ?? "").slice(0, 80).replace(/\s+/g, " ")})`);
  const id = Number((abre.texto ?? "").match(/(?:panel|pane|terminal)\D{0,40}(\d+)/i)?.[1] ?? NaN);
  debe(Number.isFinite(id), `se sabe el número del panel (${id})`);
  if (Number.isFinite(id)) {
    await dormir(3000);
    const manda = await agente.llamar("send_command", { paneId: id, command: 'echo adeorq-linux-$((6*7)); echo bash=$BASH_VERSION; echo clave=${#ADEORQ_PANE_CLAVE}; echo adeorq=$(command -v adeorq)' });
    debe(Boolean(manda.texto) && !manda.error && !manda.esError, `send_command acepta la orden (${(manda.texto ?? manda.error ?? "").slice(0, 80)})`);
    let pantalla = "";
    await hasta(async () => {
      const r = await agente.llamar("read_pane_screen", { paneId: id });
      pantalla = r.texto ?? "";
      return pantalla.includes("adeorq-linux-42");
    }, 30_000, 1000);
    writeFileSync(join(salida, "pantalla-consola.txt"), pantalla);
    debe(pantalla.includes("adeorq-linux-42"), "la consola EJECUTÓ el echo (salió 42, no el 6*7 escrito)");
    debe(/bash=\d/.test(pantalla), "la shell de la consola es bash");
    debe(/clave=[1-9]\d*/.test(pantalla), "la consola nació con su contraseña");
    debe(pantalla.includes(`adeorq=${BINARIO}`), `el \`adeorq\` que se teclea en la consola es el de esta Adeorq (${BINARIO})${process.env.LAB_PERFIL_REESCRIBE_EL_PATH ? ", aunque el perfil de la shell reescriba el PATH" : ""}`);
    await dormir(1000);
    foto("2-con-consola.png");

    // WebKitGTK no vuelve a enseñar un lienzo que estuvo en `display:none` hasta que
    // alguien pinte en él, y una terminal sin foco no pinta por su cuenta: se quedaba
    // en blanco hasta el primer clic (2026-11-03, en `docs/contexto/terminales.md`).
    clic(Math.round(origen.ancho / 2) - 230, Math.round(origen.alto / 2) + 111); // «Saltar» de la bienvenida
    await dormir(3000);
    foto("3-cabina.png");
    const antes = luzDeLaTerminal("3-cabina.png");
    debe(antes > 300, `la consola se ve en la Cabina (${antes} píxeles claros)`);
    clic(140, 20); // Panel
    await dormir(2000);
    clic(252, 20); // Cabina
    await dormir(1000);
    foto("4-vuelta-1s.png");
    const al1 = luzDeLaTerminal("4-vuelta-1s.png");
    debe(al1 > antes / 2, `al volver a la Cabina sin foco se ve al segundo (${al1} píxeles claros)`);
    await dormir(4000);
    foto("5-vuelta-5s.png");
    const al5 = luzDeLaTerminal("5-vuelta-5s.png");
    debe(al5 > antes / 2, `y a los cinco segundos (${al5} píxeles claros)`);

    // Pegar y copiar: la incidencia #3 del repo público. Todo por el portapapeles de
    // esta pantalla virtual, con `xclip`; el de Windows no se entera.
    const enPantalla = async (marca) => ((await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "").split(marca).length - 1;
    const DENTRO = { x: 800, y: 500 }; // Un sitio de la terminal sin texto
    clic(DENTRO.x, DENTRO.y);
    await dormir(800);
    const pegaCon = async (nombre, marca, gesto) => {
      aLaSeleccion(marca);
      await gesto();
      await dormir(1500);
      const veces = await enPantalla(marca);
      debe(veces === 1, `${nombre} pega una vez (salió ${veces})`);
      // Se sigue escribiendo: el teclado tiene que seguir en la terminal.
      tecla("ctrl+u");
      await dormir(400);
      const quedan = await enPantalla(marca);
      debe(quedan === 0, `y el teclado sigue en la terminal (Ctrl+U lo borró: quedan ${quedan})`);
    };
    await pegaCon("Ctrl+V", "pegaconctrlv", () => tecla("ctrl+v"));
    await pegaCon("Ctrl+Mayús+V", "pegaconctrlmayusv", () => tecla("ctrl+shift+v"));
    await pegaCon("Mayús+Insert", "pegaconmayusinsert", () => tecla("shift+Insert"));
    await pegaCon("«Pegar» del botón derecho", "pegaconbotonderecho", async () => {
      clic(DENTRO.x, DENTRO.y, 3);
      await dormir(800);
      foto("7-menu-derecho.png");
      clic(DENTRO.x + MENU_PEGAR.x, DENTRO.y + MENU_PEGAR.y);
    });

    // Sin `clear`, que este Fedora no trae: el texto queda en la primera fila.
    await agente.llamar("send_command", { paneId: id, command: "printf '\\033[H\\033[2J'; echo adeorq-copiar-77" });
    await dormir(1500);
    const COPIADO = "adeorq-copiar-77";
    const seleccionar = () => arrastrar(FILA1.x, FILA1.y, FILA1.x + 16 * FILA1.celda, FILA1.y);
    aLaSeleccion("vacio");
    aLaSeleccion("vacio", "primary");
    seleccionar();
    await dormir(800);
    foto("8-seleccion.png");
    const primaria = deLaSeleccion("primary");
    debe(primaria === COPIADO, `seleccionar deja el texto en la selección de X, la del botón central (${JSON.stringify(primaria)})`);
    clic(DENTRO.x, DENTRO.y, 2);
    await dormir(1200);
    const central = await enPantalla(COPIADO);
    debe(central === 2, `el botón central lo pega (en pantalla ${central}, y serían 2)`);
    tecla("ctrl+u");
    await dormir(400);
    seleccionar();
    await dormir(500);
    tecla("ctrl+c");
    await dormir(800);
    const conCtrlC = deLaSeleccion();
    debe(conCtrlC === COPIADO, `Ctrl+C con selección copia (${JSON.stringify(conCtrlC)})`);
    aLaSeleccion("vacio");
    seleccionar();
    await dormir(500);
    clic(DENTRO.x, DENTRO.y, 3);
    await dormir(800);
    clic(DENTRO.x + MENU_COPIAR.x, DENTRO.y + MENU_COPIAR.y);
    await dormir(800);
    const conMenu = deLaSeleccion();
    debe(conMenu === COPIADO, `«Copiar» del botón derecho copia (${JSON.stringify(conMenu)})`);
  }

  const rastro = join(DATOS, "rastro.log");
  const texto = existsSync(rastro) ? readFileSync(rastro, "utf8") : "";
  if (texto) writeFileSync(join(salida, "rastro.log"), texto);
  debe(!/panic|pánico/i.test(texto), "sin pánicos en el rastro de la app");

  if (quedarse > 0) {
    console.log(`La dejo abierta ${quedarse} s en la pantalla ${PANTALLA}.`);
    writeFileSync(join(salida, "lista.txt"), String(Date.now()));
    await dormir(quedarse * 1000);
    foto("6-al-final.png");
  }
} catch (e) {
  debe(false, `la prueba se cayó: ${e.message}`);
}
await acabar();
