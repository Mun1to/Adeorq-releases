// La página de las cuentas, construida y usada de verdad en un navegador propio, sin
// que salga un solo correo: Supabase es un doble que vive en este mismo proceso, así
// que la página no puede hablar con el proyecto real ni aunque quiera (su CSP solo deja
// conectar con la URL que se le da al construir, que es la de aquí).
//
// La única excepción, si se pasan ADEORQ_REAL_URL y ADEORQ_REAL_CLAVE: la consulta de
// si un nombre está libre va al proyecto de verdad, porque esa no manda correos.
//
//   node scripts/laboratorio/cuenta-de-verdad.mjs              prueba todo y hace las fotos
//   node scripts/laboratorio/cuenta-de-verdad.mjs --servir     la deja levantada para mirarla
//
// Las fotos van a LAB_FOTOS, o a una carpeta temporal que dice al acabar. Nada de esto
// toca web/dist: construye en una carpeta aparte.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(RAIZ, "web");
const PUERTO = 4188;
const ORIGEN = `http://127.0.0.1:${PUERTO}`;
// Otro puerto es otro origen: el doble pasa por CORS igual que el Supabase de verdad.
const PUERTO_DOBLE = 4189;
const API = `http://127.0.0.1:${PUERTO_DOBLE}`;
const SERVIR = process.argv.includes("--servir");
const REAL_URL = process.env.ADEORQ_REAL_URL;
const REAL_CLAVE = process.env.ADEORQ_REAL_CLAVE;
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";

const salida = mkdtempSync(join(tmpdir(), "adeorq-cuenta-"));
const fotos = SERVIR ? "" : (process.env.LAB_FOTOS ?? mkdtempSync(join(tmpdir(), "adeorq-cuenta-fotos-")));
if (fotos) mkdirSync(fotos, { recursive: true });

console.log("Construyendo con las cuentas encendidas, fuera de web/dist…");
execFileSync(process.execPath, [join(WEB, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", salida, "--emptyOutDir", "--logLevel", "warn"], {
  cwd: WEB,
  stdio: "inherit",
  env: {
    ...process.env,
    ADEORQ_CUENTAS: "1",
    ADEORQ_CUENTAS_BORRADOR: "1",
    ADEORQ_SUPABASE_URL: API,
    ADEORQ_SUPABASE_CLAVE: "clave-del-doble",
  },
});

// ── El doble de Supabase ────────────────────────────────────────────────────

const OCUPADOS = new Set(["ya_cogido"]);
const RESERVADOS = new Set(["munito", "admin"]);
const usuarios = new Map();
const peticiones = [];
const CLAVE_BUENA = "contraseña-buena";
const TOKEN = "token-del-doble";

/** Si `true`, la consulta del nombre se contesta como si otra alta hubiera ganado la carrera. */
let carrera = false;

async function libreDeVerdad(nombre) {
  if (OCUPADOS.has(nombre.toLowerCase())) return false;
  if (REAL_URL && REAL_CLAVE) {
    const r = await fetch(`${REAL_URL}/rest/v1/rpc/usuario_disponible`, {
      method: "POST",
      headers: { apikey: REAL_CLAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ p_usuario: nombre }),
    });
    peticiones.push({ ruta: "(real) usuario_disponible", nombre, status: r.status });
    return r.json();
  }
  return !RESERVADOS.has(nombre.toLowerCase());
}

async function dobleSupabase(req, res, ruta, cuerpo) {
  const responder = (status, datos) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(datos === undefined ? "" : JSON.stringify(datos));
  };
  const fallo = (status, code, msg = code) => responder(status, { code: status, error_code: code, msg });
  peticiones.push({ metodo: req.method, ruta, cuerpo, apikey: req.headers.apikey, token: req.headers.authorization });

  if (ruta === "/rest/v1/rpc/usuario_disponible") return responder(200, await libreDeVerdad(cuerpo.p_usuario));
  if (ruta === "/auth/v1/signup") {
    if (carrera) {
      OCUPADOS.add(cuerpo.data.usuario.toLowerCase());
      return fallo(500, "unexpected_failure", "Database error saving new user");
    }
    if (cuerpo.email === "limite@prueba.test") return fallo(429, "over_email_send_rate_limit");
    if (cuerpo.email === "rechazado@prueba.test") return fallo(400, "email_address_invalid");
    if (cuerpo.password === "password") return fallo(422, "weak_password");
    usuarios.set(cuerpo.email, { usuario: cuerpo.data.usuario, confirmado: false });
    OCUPADOS.add(cuerpo.data.usuario.toLowerCase());
    return responder(200, { id: "doble", email: cuerpo.email, identities: [] });
  }
  if (ruta === "/auth/v1/token") {
    if (cuerpo.email === "sinconfirmar@prueba.test") return fallo(400, "email_not_confirmed");
    if (cuerpo.password !== CLAVE_BUENA) return fallo(400, "invalid_credentials");
    return responder(200, { access_token: TOKEN, token_type: "bearer" });
  }
  if (ruta === "/auth/v1/recover" || ruta === "/auth/v1/resend") return responder(200, {});
  if (ruta === "/auth/v1/logout") return responder(204);
  if (ruta === "/auth/v1/user" && req.method === "GET") return responder(200, { email: "yo@prueba.test" });
  if (ruta === "/auth/v1/user" && req.method === "PUT") {
    if (cuerpo.password === CLAVE_BUENA) return fallo(422, "same_password");
    return responder(200, { email: "yo@prueba.test" });
  }
  if (ruta === "/rest/v1/perfiles") return responder(200, [{ usuario: "Prueba_Doble" }]);
  if (ruta === "/rest/v1/rpc/borrar_mi_cuenta") return responder(204);
  return fallo(500, "doble_sin_ruta", ruta);
}

// ── Los archivos construidos ────────────────────────────────────────────────

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/json" };

function servirArchivo(res, ruta) {
  let f = normalize(join(salida, decodeURIComponent(ruta)));
  if (!f.startsWith(normalize(salida))) return res.writeHead(403).end();
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) return res.writeHead(404).end("no existe");
  res.writeHead(200, { "Content-Type": TIPOS[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
}

const servidor = createServer((req, res) => servirArchivo(res, new URL(req.url, ORIGEN).pathname));

const servidorDoble = createServer((req, res) => {
  const url = new URL(req.url, API);
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "apikey,content-type,authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    });
    return res.end();
  }
  const trozos = [];
  req.on("data", (d) => trozos.push(d));
  req.on("end", () => {
    const texto = Buffer.concat(trozos).toString("utf8");
    const cuerpo = texto ? JSON.parse(texto) : undefined;
    dobleSupabase(req, res, url.pathname, cuerpo).catch((e) => {
      res.writeHead(500).end(String(e));
    });
  });
});
await new Promise((ok) => servidor.listen(PUERTO, "127.0.0.1", ok));
await new Promise((ok) => servidorDoble.listen(PUERTO_DOBLE, "127.0.0.1", ok));

if (SERVIR) {
  console.log(`\nLevantada en ${ORIGEN}/cuenta/ (Supabase es de mentira: no sale ningún correo)`);
  console.log(`  entrar con cualquier correo y la contraseña: ${CLAVE_BUENA}`);
  console.log(`  correo confirmado:   ${ORIGEN}/cuenta/#access_token=${TOKEN}&type=signup`);
  console.log(`  contraseña nueva:    ${ORIGEN}/cuenta/#access_token=${TOKEN}&type=recovery`);
  console.log(`  enlace caducado:     ${ORIGEN}/cuenta/#error=access_denied&error_code=otp_expired`);
  console.log(`  privacidad y aviso:  ${ORIGEN}/cuenta/privacidad.html  ${ORIGEN}/cuenta/aviso-legal.html`);
  console.log("Ctrl+C para pararla.");
  process.on("SIGINT", () => {
    rmSync(salida, { recursive: true, force: true });
    process.exit(0);
  });
  await new Promise(() => {});
}

// ── El navegador, propio y sin ventana ──────────────────────────────────────

function playwrightCore() {
  const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = join(npx, d, "node_modules", "playwright-core");
    if (existsSync(join(p, "package.json"))) return p;
  }
  throw new Error(`no encuentro playwright-core en ${npx}`);
}
const { chromium } = createRequire(import.meta.url)(playwrightCore());
const navegador = await chromium.launch({ executablePath: BRAVE, headless: true });

let fallos = 0;
function ver(bien, texto, detalle = "") {
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `: ${detalle}` : ""}`);
  if (!bien) fallos++;
}

const problemasDeConsola = [];
const terceros = [];

async function abrir({ ancho = 1440, alto = 900, tema = "dark", idioma = "es-ES", ruta = "/cuenta/" } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema, locale: idioma });
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => {
    if (m.type() === "error" && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) problemasDeConsola.push(m.text());
  });
  pagina.on("pageerror", (e) => problemasDeConsola.push(String(e)));
  pagina.on("request", (r) => {
    if (!r.url().startsWith(ORIGEN) && !r.url().startsWith(API)) terceros.push(r.url());
  });
  await pagina.goto(ORIGEN + ruta);
  await pagina.waitForSelector("main.alta:not([hidden]), main.legal");
  return { contexto, pagina };
}

const foto = (pagina, nombre) => pagina.screenshot({ path: join(fotos, `${nombre}.png`), animations: "disabled" });
const textoDe = (pagina, sel) => pagina.locator(sel).first().innerText();
const msjDe = (pagina, id) => textoDe(pagina, `#${id}-msj`);

/** Espera a que un mensaje diga lo que tiene que decir, sin dormir de más. */
async function esperarTexto(pagina, sel, esperado, ms = 6000) {
  const hasta = Date.now() + ms;
  let ahora = "";
  while (Date.now() < hasta) {
    ahora = (await pagina.locator(sel).first().innerText().catch(() => "")) ?? "";
    if (ahora.includes(esperado)) return { bien: true, ahora };
    await pagina.waitForTimeout(40);
  }
  return { bien: false, ahora };
}

async function comprobarMsj(pagina, sel, esperado, texto) {
  const r = await esperarTexto(pagina, sel, esperado);
  ver(r.bien, texto, r.ahora);
}

try {
  // ── Los errores del alta, en español y en oscuro ─────────────────────────
  {
    const { contexto, pagina } = await abrir();
    await foto(pagina, "01-crear-vacio-oscuro-1440");

    await pagina.fill("#crear-usuario", "ya_cogido");
    await comprobarMsj(pagina, "#crear-usuario-msj", "Ese nombre no está libre", "nombre cogido");
    await foto(pagina, "02-nombre-cogido-oscuro-1440");

    await pagina.fill("#crear-usuario", "MUNITO");
    await comprobarMsj(pagina, "#crear-usuario-msj", "Ese nombre no está libre", `reservado (munito, en mayúsculas${REAL_URL ? ", contra el proyecto de verdad" : ""})`);

    await pagina.fill("#crear-usuario", "con-guion");
    await comprobarMsj(pagina, "#crear-usuario-msj", "De 3 a 20 letras", "nombre con formato malo");

    const libre = `prueba_e5_${Date.now() % 100000}`;
    await pagina.fill("#crear-usuario", libre);
    await comprobarMsj(pagina, "#crear-usuario-msj", "Está libre", `nombre libre${REAL_URL ? " (contra el proyecto de verdad)" : ""}`);
    await foto(pagina, "03-nombre-libre-oscuro-1440");
    ver(await textoDe(pagina, "[data-arroba]") === `@${libre}`, "el nombre se ve en grande mientras se escribe");

    // Un nombre largo tiene que caber sin salirse de su columna.
    await pagina.fill("#crear-usuario", "nombre_de_veinte_car");
    await comprobarMsj(pagina, "#crear-usuario-msj", "Está libre", "nombre de veinte letras");
    const medida = await pagina.evaluate(() => {
      const a = document.querySelector("[data-arroba]");
      return { ancho: a.scrollWidth, cabe: a.parentElement.clientWidth };
    });
    ver(medida.ancho <= medida.cabe, "veinte letras caben en su columna", `${medida.ancho} de ${medida.cabe} px`);

    await pagina.fill("#crear-usuario", libre);
    await comprobarMsj(pagina, "#crear-usuario-msj", "Está libre", "de vuelta al nombre libre");
    await pagina.fill("#crear-correo", "correo-mal-escrito");
    await pagina.fill("#crear-clave", "corta");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    ver((await msjDe(pagina, "crear-correo")).includes("mal escrito"), "correo mal escrito", await msjDe(pagina, "crear-correo"));
    ver((await msjDe(pagina, "crear-clave")).includes("Mínimo 8"), "contraseña corta", await msjDe(pagina, "crear-clave"));
    ver(!peticiones.some((p) => p.ruta === "/auth/v1/signup"), "con errores no se llama al alta");
    await foto(pagina, "04-errores-oscuro-1440");

    // Lo que devuelve el servidor aunque la página lo diera por bueno.
    await pagina.fill("#crear-correo", "rechazado@prueba.test");
    await pagina.fill("#crear-clave", "contraseña-larga");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    await comprobarMsj(pagina, "#crear-correo-msj", "mal escrito", "correo que rechaza el servidor");

    await pagina.fill("#crear-correo", "yo@prueba.test");
    await pagina.fill("#crear-clave", "password");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    await comprobarMsj(pagina, "#crear-clave-msj", "demasiado fácil", "contraseña floja según el servidor");

    await pagina.fill("#crear-correo", "limite@prueba.test");
    await pagina.fill("#crear-clave", "contraseña-larga");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    await comprobarMsj(pagina, "[data-nota]", "Demasiados intentos", "el límite de correos de Supabase");

    // Otra alta ganó la carrera por el nombre: el servidor da su error genérico.
    carrera = true;
    await pagina.fill("#crear-correo", "yo@prueba.test");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    await comprobarMsj(pagina, "#crear-usuario-msj", "no está libre", "perder la carrera por el nombre se entiende");
    carrera = false;
    OCUPADOS.delete(libre.toLowerCase());

    // Sin red, escribiendo y al enviar.
    await contexto.setOffline(true);
    await pagina.fill("#crear-usuario", `${libre}_b`);
    await comprobarMsj(pagina, "#crear-usuario-msj", "No se ha podido comprobar", "sin red, comprobando el nombre");
    await foto(pagina, "05-sin-red-nombre-oscuro-1440");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    await comprobarMsj(pagina, "[data-nota]", "Sin conexión", "sin red, al crear la cuenta");
    await foto(pagina, "06-sin-red-crear-oscuro-1440");
    await contexto.setOffline(false);

    // El alta buena: qué se le manda al servidor.
    await pagina.fill("#crear-usuario", libre);
    await comprobarMsj(pagina, "#crear-usuario-msj", "Está libre", "al volver la red");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    await pagina.waitForSelector('[data-vista="correo"]:not([hidden])');
    const alta = peticiones.findLast((p) => p.ruta === "/auth/v1/signup");
    ver(alta.cuerpo.email === "yo@prueba.test" && alta.cuerpo.data.usuario === libre, "el alta lleva el correo y el nombre");
    ver(alta.apikey === "clave-del-doble", "el alta lleva la clave que le da el build");
    ver((await textoDe(pagina, "[data-correo-a]")) === "yo@prueba.test", "dice a qué correo se ha mandado");
    await foto(pagina, "07-mira-tu-correo-oscuro-1440");
    await pagina.click('[data-vista="correo"] [data-reenviar]');
    await comprobarMsj(pagina, "[data-nota]", "vuelto a mandar", "reenviar el correo");
    await contexto.close();
  }

  // ── Entrar, recuperar, tu cuenta y borrar ────────────────────────────────
  {
    const { contexto, pagina } = await abrir({ tema: "light" });
    await pagina.click('[data-pestanas] [data-ir="entrar"]');
    await foto(pagina, "08-entrar-claro-1440");
    await pagina.click('form[data-vista="entrar"] button[type=submit]');
    ver((await msjDe(pagina, "entrar-correo")).includes("Escribe tu correo"), "entrar con todo vacío", await msjDe(pagina, "entrar-correo"));
    await pagina.fill("#entrar-correo", "sinconfirmar@prueba.test");
    await pagina.fill("#entrar-clave", "lo-que-sea");
    await pagina.click('form[data-vista="entrar"] button[type=submit]');
    await comprobarMsj(pagina, "[data-nota]", "no has confirmado", "entrar sin haber confirmado");
    ver(await pagina.locator('form[data-vista="entrar"] [data-reenviar]').isVisible(), "entonces ofrece reenviar el correo");

    await pagina.fill("#entrar-correo", "yo@prueba.test");
    await pagina.fill("#entrar-clave", "otra-distinta");
    await pagina.click('form[data-vista="entrar"] button[type=submit]');
    await comprobarMsj(pagina, "[data-nota]", "no coinciden", "contraseña equivocada");

    await pagina.click('form[data-vista="entrar"] [data-ir="recuperar"]');
    await pagina.fill("#recuperar-correo", "yo@prueba.test");
    await foto(pagina, "09-recuperar-claro-1440");
    await pagina.click('form[data-vista="recuperar"] button[type=submit]');
    await pagina.waitForSelector('[data-vista="correo"]:not([hidden])');
    ver((await textoDe(pagina, "[data-correo-texto]")).includes("Si ese correo tiene cuenta"), "recuperar no delata si el correo existe");
    ver(!(await pagina.locator('[data-vista="correo"] [data-reenviar]').isVisible()), "y no ofrece reenviar la confirmación");

    await pagina.click('[data-vista="correo"] [data-ir="entrar"]');
    await pagina.fill("#entrar-clave", CLAVE_BUENA);
    await pagina.click('form[data-vista="entrar"] button[type=submit]');
    await pagina.waitForSelector('[data-vista="dentro"]:not([hidden])');
    ver((await textoDe(pagina, "[data-arroba]")) === "@Prueba_Doble", "dentro se ve su nombre con sus mayúsculas");
    ver((await textoDe(pagina, "[data-mi-correo]")) === "yo@prueba.test", "y su correo");
    await foto(pagina, "10-tu-cuenta-claro-1440");

    // Nada guardado en el navegador, con la sesión abierta.
    const guardado = await pagina.evaluate(() => ({ cookies: document.cookie, local: localStorage.length, sesion: sessionStorage.length }));
    const cookies = await contexto.cookies();
    ver(guardado.cookies === "" && guardado.local === 0 && guardado.sesion === 0 && cookies.length === 0, "sin cookies ni almacenamiento con la sesión abierta", JSON.stringify({ ...guardado, cookies: cookies.length }));

    await pagina.click("[data-pedir-borrar]");
    await foto(pagina, "11-borrar-claro-1440");
    await pagina.click("[data-borrar] button[type=submit]");
    ver((await msjDe(pagina, "borrar-clave")).includes("Escribe tu contraseña"), "borrar pide la contraseña");
    await pagina.fill("#borrar-clave", "equivocada");
    await pagina.click("[data-borrar] button[type=submit]");
    await comprobarMsj(pagina, "#borrar-clave-msj", "no coinciden", "borrar con la contraseña mal");
    ver(!peticiones.some((p) => p.ruta === "/rest/v1/rpc/borrar_mi_cuenta"), "con la contraseña mal no se borra");
    await pagina.fill("#borrar-clave", CLAVE_BUENA);
    await pagina.click("[data-borrar] button[type=submit]");
    await pagina.waitForSelector('[data-vista="borrada"]:not([hidden])');
    const borrado = peticiones.findLast((p) => p.ruta === "/rest/v1/rpc/borrar_mi_cuenta");
    ver(borrado?.token === `Bearer ${TOKEN}`, "borrar va con la sesión recién abierta");
    await foto(pagina, "12-borrada-claro-1440");
    await contexto.close();
  }

  // ── La vuelta de los enlaces de los correos ──────────────────────────────
  {
    const a = await abrir({ ruta: `/cuenta/#access_token=${TOKEN}&refresh_token=x&type=signup` });
    await a.pagina.waitForSelector('[data-vista="dentro"]:not([hidden])');
    ver((await textoDe(a.pagina, "[data-nota]")).includes("Correo confirmado"), "confirmar el correo lleva a tu cuenta");
    ver(!a.pagina.url().includes("access_token"), "el token no se queda en la dirección", a.pagina.url());
    await foto(a.pagina, "13-confirmado-oscuro-1440");
    await a.contexto.close();

    const b = await abrir({ ruta: `/cuenta/#access_token=${TOKEN}&type=recovery` });
    await b.pagina.waitForSelector('[data-vista="nueva"]:not([hidden])');
    ver(!b.pagina.url().includes("access_token"), "ni al recuperar la contraseña");
    await b.pagina.fill("#nueva-clave", "corta");
    await b.pagina.click('form[data-vista="nueva"] button[type=submit]');
    ver((await msjDe(b.pagina, "nueva-clave")).includes("Mínimo 8"), "la contraseña nueva también pide 8");
    await b.pagina.fill("#nueva-clave", CLAVE_BUENA);
    await b.pagina.click('form[data-vista="nueva"] button[type=submit]');
    await comprobarMsj(b.pagina, "#nueva-clave-msj", "distinta", "si es la misma que tenías");
    await foto(b.pagina, "14-nueva-clave-oscuro-1440");
    await b.pagina.fill("#nueva-clave", "contraseña-nueva");
    await b.pagina.click('form[data-vista="nueva"] button[type=submit]');
    await b.pagina.waitForSelector('[data-vista="dentro"]:not([hidden])');
    ver((await textoDe(b.pagina, "[data-nota]")).includes("Contraseña cambiada"), "al guardarla, a tu cuenta");
    await b.contexto.close();

    const c = await abrir({ ruta: "/cuenta/#error=access_denied&error_code=otp_expired&error_description=x" });
    await c.pagina.waitForSelector('[data-vista="entrar"]:not([hidden])');
    ver((await textoDe(c.pagina, "[data-nota]")).includes("ya no vale"), "un enlace caducado lo dice y deja entrar");
    await foto(c.pagina, "15-enlace-caducado-oscuro-1440");
    await c.contexto.close();
  }

  // ── Los dos idiomas ──────────────────────────────────────────────────────
  {
    const { contexto, pagina } = await abrir({ idioma: "en-GB" });
    ver((await pagina.evaluate(() => document.documentElement.lang)) === "en", "un navegador en inglés la abre en inglés");
    ver((await textoDe(pagina, '[data-pestanas] [data-ir="crear"]')) === "Create account", "con sus textos");
    await pagina.fill("#crear-usuario", "ya_cogido");
    await comprobarMsj(pagina, "#crear-usuario-msj", "That name is not free", "los errores también");
    await pagina.click("[data-cambiar-idioma]");
    ver((await textoDe(pagina, "#crear-usuario-msj")).includes("no está libre"), "cambiar de idioma traduce lo que ya estaba dicho");
    ver(pagina.url().endsWith("/cuenta/"), "y cambia la dirección", pagina.url());
    await pagina.click("[data-cambiar-idioma]");
    ver(pagina.url().endsWith("?lang=en"), "ida y vuelta", pagina.url());
    await pagina.fill("#crear-usuario", "otro_nombre_e5");
    await comprobarMsj(pagina, "#crear-usuario-msj", "It is free", "en inglés");
    await pagina.fill("#crear-correo", "en@prueba.test");
    await pagina.fill("#crear-clave", "contraseña-larga");
    await pagina.click('form[data-vista="crear"] button[type=submit]');
    await pagina.waitForSelector('[data-vista="correo"]:not([hidden])');
    await contexto.close();
    const pedido = await abrir({ idioma: "en-GB", ruta: "/cuenta/?lang=es" });
    ver((await pedido.pagina.evaluate(() => document.documentElement.lang)) === "es", "?lang= manda sobre el navegador");
    await pedido.contexto.close();
  }

  // ── Claro y oscuro, móvil y ancho, los dos idiomas: fotos y medidas ──────
  const PANTALLAS = [
    { nombre: "1920", ancho: 1920, alto: 1080 },
    { nombre: "1440", ancho: 1440, alto: 900 },
    { nombre: "1536", ancho: 1536, alto: 730 },
    { nombre: "390", ancho: 390, alto: 844 },
  ];
  for (const tema of ["dark", "light"]) {
    for (const lang of ["es", "en"]) {
      for (const p of PANTALLAS) {
        const { contexto, pagina } = await abrir({ ancho: p.ancho, alto: p.alto, tema, idioma: lang === "es" ? "es-ES" : "en-GB" });
        await pagina.waitForFunction(() => document.querySelector("svg.adeo rect"));
        const etiqueta = `${tema === "dark" ? "oscuro" : "claro"}-${lang}-${p.nombre}`;
        await pagina.fill("#crear-usuario", "Prueba_E5");
        await pagina.waitForTimeout(500);
        await foto(pagina, `matriz-crear-${etiqueta}`);

        const m = await pagina.evaluate(() => {
          const doc = document.documentElement;
          const visibles = [...document.querySelectorAll("label, button, input, a, p, h1")].filter((e) => e.offsetParent);
          const letra = Math.min(...visibles.filter((e) => e.textContent.trim() || e.tagName === "INPUT").map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const toque = Math.min(...[...document.querySelectorAll("main button, main input")].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height));
          const panel = document.querySelector(".alta__panel").getBoundingClientRect();
          return { desborde: doc.scrollWidth - doc.clientWidth, alto: doc.scrollHeight, ventana: innerHeight, letra, toque, panelAncho: panel.width };
        });
        ver(m.desborde <= 0, `${etiqueta}: sin desborde de lado`, `${m.desborde} px`);
        ver(m.letra >= 12, `${etiqueta}: nada por debajo de 12 px`, `${m.letra} px`);
        ver(m.toque >= 44, `${etiqueta}: lo que se toca mide 44 px o más`, `${m.toque} px`);
        if (p.ancho > 900) ver(m.alto <= m.ventana, `${etiqueta}: cabe sin scroll en el ordenador`, `${m.alto} de ${m.ventana} px`);

        await pagina.click('[data-pestanas] [data-ir="entrar"]');
        await pagina.waitForTimeout(120);
        await foto(pagina, `matriz-entrar-${etiqueta}`);
        await contexto.close();
      }
    }
  }

  // ── Los textos legales ───────────────────────────────────────────────────
  for (const [archivo, idioma] of [["privacidad", "es-ES"], ["aviso-legal", "es-ES"], ["privacy", "en-GB"], ["legal-notice", "en-GB"]]) {
    for (const tema of ["dark", "light"]) {
      for (const ancho of [1440, 390]) {
        const { contexto, pagina } = await abrir({ ruta: `/cuenta/${archivo}.html`, tema, ancho, idioma });
        const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ver(desborde <= 0, `${archivo} ${tema} ${ancho}: sin desborde`, `${desborde} px`);
        await pagina.screenshot({ path: join(fotos, `legal-${archivo}-${tema === "dark" ? "oscuro" : "claro"}-${ancho}.png`), fullPage: true, animations: "disabled" });
        await contexto.close();
      }
    }
  }

  // ── Lo que no se ve ──────────────────────────────────────────────────────
  {
    const { contexto, pagina } = await abrir();
    const meta = await pagina.evaluate(() => document.querySelector('meta[name="robots"]')?.content);
    ver(meta === "noindex, nofollow", "sin indexar", meta);
    const fuentes = await pagina.evaluate(() => document.fonts.check("16px Inter"));
    ver(fuentes, "con la letra de la web");
    const adeo = await pagina.locator("svg.adeo rect").count();
    ver(adeo > 0, "con Adeo dibujado", `${adeo} cuadros`);
    await contexto.close();
  }
  ver(terceros.length === 0, "ninguna petición a terceros", terceros.slice(0, 3).join(" "));
  ver(problemasDeConsola.length === 0, "sin errores de consola ni de la CSP", [...new Set(problemasDeConsola)].slice(0, 3).join(" | "));
  const sinClave = peticiones.filter((p) => p.ruta.startsWith("/") && p.metodo && p.apikey !== "clave-del-doble");
  ver(sinClave.length === 0, "todas las peticiones llevan su clave", `${peticiones.length} peticiones al doble`);
  const aLoReal = peticiones.filter((p) => String(p.ruta).startsWith("(real)"));
  console.log(`     al proyecto de verdad: ${aLoReal.length} consultas, todas usuario_disponible${aLoReal.length ? `, estados ${[...new Set(aLoReal.map((p) => p.status))].join(",")}` : ""}`);
} finally {
  await navegador.close();
  servidor.close();
  servidorDoble.close();
  rmSync(salida, { recursive: true, force: true });
}

console.log(`\nFotos en ${fotos}`);
console.log(fallos ? `${fallos} fallos.` : "Todo bien.");
process.exit(fallos ? 1 : 0);
