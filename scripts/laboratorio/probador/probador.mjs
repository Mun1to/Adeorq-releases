// El probador de diseños: la app compilada, con datos de mentira y su foto de
// fondo, y un cambiador 0..N encima que pone la hoja de cada dirección de diseño.
// Es como se le enseña a Munir un rediseño: su app de verdad, navegable, y no
// fotos con un parámetro tocado (GUSTOS-DE-DISENO.md §12, 2026-11-16: «sigen mal
// todo mal el diseño la manera de preguntarme las cosas»).
//
//   node scripts/laboratorio/probador/probador.mjs [carpeta] [--construir] [--puerto 5240]
//
// - carpeta: las direcciones, un `nombre.css` por cada una y su `nombre.json` al
//   lado: { "nombre", "frase", "letra": { "suelo", "suma", "tope" } }. Se numeran
//   de 1 a 9 por orden alfabético (la 0 es la app tal cual). Por defecto,
//   docs/propuestas/rediseno-app.
// - --construir: vuelve a compilar la app aunque ya haya una, que es lo que hace
//   falta tras tocar src/. Compila con el candado del laboratorio puesto.
//
// La app compilada y el doble viven en %TEMP%\adeorq-probador, fuera del repo.
// Las fotos de cada dirección las hace fotos.js, de esta misma carpeta.
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(AQUI, "../../..");
const CASA = join(tmpdir(), "adeorq-probador");
const APP = join(CASA, "app");
const DOBLE = join(CASA, "doble.js");
const CANDADO = join(REPO, ".adeorq", "laboratorio.lock");

const args = process.argv.slice(2);
const opcion = (n) => {
  const i = args.indexOf(n);
  return i < 0 ? null : args.splice(i, 2)[1];
};
const PUERTO = Number(opcion("--puerto") || process.env.PUERTO || 5240);
const construir = args.includes("--construir");
const CARPETA = resolve(REPO, args.find((a) => !a.startsWith("--")) || "docs/propuestas/rediseno-app");

// Su fondo de verdad (el que Adeorq copia al elegirlo), para juzgar el cristal
// sobre lo que él ve cada día; si no está, la foto del banco.
const SUYO = join(process.env.LOCALAPPDATA || "", "Adeorq", "fondo.png");
const FONDO = [SUYO, join(REPO, ".playwright-mcp", "fondo.png")].find((f) => existsSync(f));

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm",
  ".ico": "image/x-icon", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4",
};

function compilar() {
  if (existsSync(CANDADO)) {
    console.error(`el laboratorio está cogido, espera a que acabe sin tocar nada:\n  ${readFileSync(CANDADO, "utf8").trim()}`);
    process.exit(1);
  }
  mkdirSync(dirname(CANDADO), { recursive: true });
  writeFileSync(CANDADO, `probador: vite build, ${new Date().toISOString()}\n`);
  // Con un Ctrl+C a mitad, Node saldría sin pasar por el `finally` y el candado
  // se quedaría huérfano: las demás sesiones no guardarían en src/. Con el
  // manejador puesto, el Ctrl+C mata a vite, spawnSync vuelve y el `finally` lo
  // borra; el aviso de salida va detrás.
  let cortado = false;
  const alCortar = () => (cortado = true);
  process.on("SIGINT", alCortar);
  process.on("SIGTERM", alCortar);
  try {
    console.log(`compilando la app en ${APP}…`);
    const vite = join(REPO, "node_modules", "vite", "bin", "vite.js");
    const r = spawnSync(process.execPath, [vite, "build", "--outDir", APP, "--emptyOutDir", "--logLevel", "warn"], {
      cwd: REPO,
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`vite build salió con ${r.status ?? r.signal}`);
  } finally {
    rmSync(CANDADO, { force: true });
    process.off("SIGINT", alCortar);
    process.off("SIGTERM", alCortar);
  }
  if (cortado) process.exit(130);
}

// El guion de arranque de doble-conserje.js (lo que el banco mete con
// page.addInitScript) pasado a un doble.js normal, para que la app compilada
// arranque con datos de mentira en un navegador cualquiera, sin Playwright.
async function hacerDoble() {
  const fuente = readFileSync(join(REPO, "scripts", "laboratorio", "doble-conserje.js"), "utf8");
  const guion = (0, eval)(fuente);
  const trozos = [];
  const locator = () => {
    const l = { count: async () => 0, click: async () => {}, waitFor: async () => {} };
    l.first = () => l;
    return l;
  };
  await guion({
    setViewportSize: async () => {},
    route: async () => {},
    addInitScript: async (fn, arg) => trozos.push(`(${fn.toString()})(${arg === undefined ? "" : JSON.stringify(arg)});`),
    goto: async () => {},
    waitForTimeout: async () => {},
    locator,
    title: async () => "",
    evaluate: async () => {},
  });
  let js = trozos.join("\n").replaceAll("http://localhost:1420", "");

  // La Cabina con tres terminales y algo escrito en cada una.
  const cmd = (id) => ["cmd.exe", "/k", `chcp 65001 >nul && claude --permission-mode acceptEdits --session-id ${id}`];
  const sembrado = JSON.stringify({
    panes: [
      { name: "Adeorq · barra", cwd: "C:\\proyectos\\Adeorq", command: cmd("11111111-2222-4333-8444-555555555555") },
      { name: "Adeorq · campana", cwd: "C:\\proyectos\\Adeorq", command: cmd("21111111-2222-4333-8444-555555555555") },
      { name: "VoCript · dictado", cwd: "C:\\proyectos\\VoCript", command: cmd("31111111-2222-4333-8444-555555555555") },
    ],
    cols: [{ w: 0.5, hs: [1, 1], idx: [0, 1] }, { w: 0.5, hs: [1], idx: [2] }],
    ocultos: [],
  });
  const texto =
    "\x1b[38;5;75m●\x1b[0m He cambiado \x1b[1msrc/lib/barraQueCabe.ts\x1b[0m\r\n  y el banco pasa en los 47 anchos.\r\n\r\n" +
    "\x1b[38;5;75m●\x1b[0m Bash(pnpm comprobar --rapido)\r\n  \x1b[38;5;244m⎿  Todo en verde: 23 comprobadores.\x1b[0m\r\n\r\n" +
    "\x1b[38;5;215m✻\x1b[0m Pensando… \x1b[38;5;244m(12s · ↓ 1.2k tokens)\x1b[0m\r\n";
  js += `
(function () {
  try { localStorage.setItem("adeorq-layout", ${JSON.stringify(sembrado)}); } catch (e) {}
  window.__estadoPanel = "a_medias";
  var hechos = new Set();
  setInterval(function () {
    (window.__llamadas || []).forEach(function (l) {
      var a = l[1];
      if (l[0] !== "pty_spawn" || !a || hechos.has(a.id)) return;
      hechos.add(a.id);
      setTimeout(function () { window.__emitir && window.__emitir("pty-data", { id: a.id, data: ${JSON.stringify(texto)} }); }, 600);
    });
  }, 400);
})();
`;
  mkdirSync(CASA, { recursive: true });
  writeFileSync(DOBLE, js);
}

function variantes() {
  if (!existsSync(CARPETA)) return [];
  return readdirSync(CARPETA)
    .filter((f) => f.endsWith(".css"))
    .sort()
    .slice(0, 9)
    .map((f, i) => {
      const json = join(CARPETA, `${basename(f, ".css")}.json`);
      let datos = {};
      try {
        if (existsSync(json)) datos = JSON.parse(readFileSync(json, "utf8"));
      } catch (e) {
        console.error(`${json} no es JSON válido: ${e.message}`);
      }
      return { n: i + 1, css: join(CARPETA, f), nombre: datos.nombre || basename(f, ".css"), frase: datos.frase || "", letra: datos.letra || null };
    });
}

function dentro(base, ruta) {
  const p = resolve(base, `.${ruta.startsWith("/") ? ruta : `/${ruta}`}`);
  const rel = relative(base, p);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? p : null;
}

function enviar(res, ruta, sinCache) {
  res.writeHead(200, {
    "Content-Type": TIPOS[extname(ruta).toLowerCase()] || "application/octet-stream",
    "Cache-Control": sinCache ? "no-store" : "max-age=3600",
  });
  res.end(readFileSync(ruta));
}

function portada(res) {
  const cabeza = '<script src="/__probador/doble.js"></script><script src="/__probador/cambiador.js"></script>';
  const html = readFileSync(join(APP, "index.html"), "utf8").replace("<head>", `<head>${cabeza}`);
  res.writeHead(200, { "Content-Type": TIPOS[".html"], "Cache-Control": "no-store" });
  res.end(html);
}

if (construir || !existsSync(join(APP, "index.html"))) compilar();
await hacerDoble();
const lista = variantes();

createServer((req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (ruta.startsWith("/__fondo/")) return FONDO ? enviar(res, FONDO, false) : res.writeHead(404).end();
    if (ruta === "/__probador/doble.js") return enviar(res, DOBLE, true);
    if (ruta === "/__probador/cambiador.js") return enviar(res, join(AQUI, "cambiador.js"), true);
    if (ruta === "/__probador/variantes.json") {
      // Se relee en cada petición: un diseñador que retoca su hoja solo tiene que recargar.
      const v = variantes().map(({ css, ...resto }) => resto);
      res.writeHead(200, { "Content-Type": TIPOS[".json"], "Cache-Control": "no-store" });
      return res.end(JSON.stringify(v));
    }
    const m = /^\/__probador\/variante\/(\d)\.css$/.exec(ruta);
    if (m) {
      const v = variantes().find((x) => x.n === Number(m[1]));
      return v ? enviar(res, v.css, true) : res.writeHead(404).end();
    }
    if (ruta === "/" || ruta === "/index.html") return portada(res);
    // La app no tiene favicon fuera de Tauri: sin esto, cada foto lleva un 404 en sus errores.
    if (ruta === "/favicon.ico") return res.writeHead(204).end();
    const p = dentro(APP, ruta);
    if (p && existsSync(p) && statSync(p).isFile()) return enviar(res, p, false);
    if (!extname(ruta)) return portada(res);
    res.writeHead(404).end();
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PUERTO, "127.0.0.1", () => {
  console.log(`probador en http://127.0.0.1:${PUERTO}/?opcion=1`);
  console.log(`  0  Como hoy`);
  for (const v of lista) console.log(`  ${v.n}  ${v.nombre}  (${relative(REPO, v.css)})`);
  if (!lista.length) console.log(`  (no hay ninguna .css en ${CARPETA})`);
});
