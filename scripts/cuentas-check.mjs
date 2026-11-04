// Que la página de las cuentas no pueda llegar a adeorq.com sin pedirlo.
//   `node scripts/cuentas-check.mjs`   ·   va dentro de `pnpm comprobar`
//
// El registro no está abierto y un push a web/ despliega solo. La página vive en
// web/cuenta/ y solo entra en el build con ADEORQ_CUENTAS=1 (web/scripts/cuentas-fuera.mjs).
// Esto se pone rojo si aparece web/dist/cuenta, si un build de fábrica la trae, si
// alguien la enlaza desde lo público o si el despliegue la enciende. Abrir el registro
// de verdad pasa por cambiar esas dos últimas cosas a propósito, y por este archivo:
// el orden está en docs/contexto/cuentas.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entradasDeCuentas, PAGINAS, pendientes, revisarSalida } from "../web/scripts/cuentas-fuera.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(RAIZ, "web");
const CUENTA = path.join(WEB, "cuenta");

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ": " + detalle : ""}`);
};
const leer = (...trozos) => fs.readFileSync(path.join(...trozos), "utf8");
const revienta = (f) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

// ── La regla, sobre una carpeta de mentira ──────────────────────────────────
{
  const falsa = fs.mkdtempSync(path.join(os.tmpdir(), "adeorq-cuentas-check-"));
  ok("sin cuenta/ en la salida, el build sigue", !revienta(() => revisarSalida(falsa, {})));
  fs.mkdirSync(path.join(falsa, "cuenta"));
  ok("con cuenta/ y sin la variable, el build revienta", revienta(() => revisarSalida(falsa, {})));
  ok("con cuenta/ y con la variable, sigue", !revienta(() => revisarSalida(falsa, { ADEORQ_CUENTAS: "1" })));
  ok("una variable con otro valor no enciende nada", revienta(() => revisarSalida(falsa, { ADEORQ_CUENTAS: "true" })));
  fs.rmSync(falsa, { recursive: true, force: true });

  ok("sin la variable, ninguna entrada", Object.keys(entradasDeCuentas(WEB, {})).length === 0);
  ok("con la variable y sin la URL, no construye", revienta(() => entradasDeCuentas(WEB, { ADEORQ_CUENTAS: "1", ADEORQ_SUPABASE_CLAVE: "x" })));
  ok("con la variable y sin la clave, no construye", revienta(() => entradasDeCuentas(WEB, { ADEORQ_CUENTAS: "1", ADEORQ_SUPABASE_URL: "x" })));
}

// ── Lo que hay en el disco y lo que se publica ──────────────────────────────
ok("web/dist no trae la página", !revienta(() => revisarSalida(path.join(WEB, "dist"), { ADEORQ_CUENTAS: process.env.ADEORQ_CUENTAS })));

{
  const despliegue = leer(RAIZ, ".github", "workflows", "web.yml");
  // La línea que vigila la salida nombra la variable: lo que se busca es quien la pone, en
  // cualquier forma (`: 1`, o `: ${{ vars.X }}`, que desde aquí no se ve a qué vale).
  const laNombra = (yml) => /ADEORQ_CUENTAS/.test(yml.split("\n").filter((l) => !l.includes("dist/cuenta")).join("\n"));
  ok("encenderlas con una variable de GitHub también se ve", laNombra("env:\n  ADEORQ_CUENTAS: ${{ vars.X }}\n") && laNombra("env:\n  ADEORQ_CUENTAS: 1\n"));
  const flujos = path.join(RAIZ, ".github", "workflows");
  for (const f of fs.readdirSync(flujos)) ok(`${f} no enciende las cuentas`, !laNombra(leer(flujos, f)));
  ok("el despliegue comprueba la salida antes de subir", despliegue.includes("[ -e dist/cuenta ]"));
}

for (const nombre of ["sitemap.xml", "robots.txt", "llms.txt", "index.html", "guia.html", "404.html"]) {
  const texto = leer(WEB, nombre);
  ok(`${nombre} no enlaza a la página`, !/(?:href|src|loc)[=>]["']?[^"'<\s]*\/?cuenta\/|adeorq\.com\/cuenta/.test(texto));
}

// ── Un build de fábrica de verdad ───────────────────────────────────────────
{
  const vite = path.join(WEB, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(vite) || !fs.existsSync(path.join(WEB, "en", "index.html"))) {
    console.log("     sin web/node_modules o sin web/en: NO PROBADO el build de verdad en esta copia");
  } else {
    const salida = fs.mkdtempSync(path.join(os.tmpdir(), "adeorq-cuentas-build-"));
    const env = { ...process.env };
    for (const v of ["ADEORQ_CUENTAS", "ADEORQ_CUENTAS_BORRADOR", "ADEORQ_SUPABASE_URL", "ADEORQ_SUPABASE_CLAVE"]) delete env[v];
    const r = spawnSync(process.execPath, [vite, "build", "--outDir", salida, "--emptyOutDir", "--logLevel", "error"], { cwd: WEB, env, encoding: "utf8" });
    ok("el build de fábrica termina bien", r.status === 0, r.status === 0 ? "" : String(r.stderr).slice(-400));
    ok("y no trae cuenta/", !fs.existsSync(path.join(salida, "cuenta")));
    const trozos = fs.existsSync(path.join(salida, "assets")) ? fs.readdirSync(path.join(salida, "assets")).filter((n) => n.endsWith(".js")) : [];
    const colado = trozos.filter((n) => /usuario_disponible|borrar_mi_cuenta/.test(leer(salida, "assets", n)));
    ok("ni su código, en ningún trozo de JavaScript", colado.length === 0, colado.join(", "));
    fs.rmSync(salida, { recursive: true, force: true });
  }
}

// ── La página misma ─────────────────────────────────────────────────────────
if (!fs.existsSync(CUENTA)) {
  console.log("     todavía no hay web/cuenta");
} else {
  const propios = fs.readdirSync(CUENTA);
  for (const p of PAGINAS.filter((n) => propios.includes(`${n}.html`))) {
    const html = leer(CUENTA, `${p}.html`);
    ok(`${p}.html no se indexa`, /<meta name="robots" content="noindex, nofollow">/.test(html));
    ok(`${p}.html limita lo que carga`, /Content-Security-Policy/.test(html) && !/<script[^>]+src=["']https?:/.test(html));
  }

  const codigo = propios.filter((n) => n.endsWith(".js")).map((n) => [n, leer(CUENTA, n)]);
  for (const [n, js] of codigo) {
    ok(`${n} no guarda nada en el navegador`, !/\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(js.replace(/^\s*\/\/.*$/gm, "")));
    ok(`${n} sin analíticas`, !/gtag|analytics|plausible|posthog|sendBeacon/i.test(js));
  }

  for (const n of propios) {
    const texto = leer(CUENTA, n);
    ok(`${n} sin la clave ni el proyecto escritos`, !/sb_publishable_|eyJhbGci|supabase\.co/.test(texto));
    ok(`${n} sin rayas`, !/[—–]/.test(texto));
  }

  if (propios.includes("textos.js")) {
    const { TEXTOS } = await import("../web/cuenta/textos.js");
    const es = Object.keys(TEXTOS.es);
    const en = Object.keys(TEXTOS.en);
    ok("los dos idiomas tienen las mismas claves", es.length === en.length && es.every((k) => k in TEXTOS.en), es.filter((k) => !(k in TEXTOS.en)).concat(en.filter((k) => !(k in TEXTOS.es))).join(", "));
    const usadas = [...new Set(codigo.flatMap(([, js]) => [...js.matchAll(/'((?:nombre|correo|clave|error|vuelta|dentro|nueva)\.[A-Za-z]+)'/g)].map((m) => m[1])))];
    const sinTexto = usadas.filter((k) => !(k in TEXTOS.es));
    ok("todo lo que dice el código tiene su texto", sinTexto.length === 0, sinTexto.join(", "));
    const html = leer(CUENTA, "index.html");
    const enHtml = [...new Set([...html.matchAll(/data-t(?:-aria)?="([^"]+)"/g)].map((m) => m[1]))];
    const sinTextoHtml = enHtml.filter((k) => !(k in TEXTOS.es));
    ok("y todo lo que pide el HTML también", sinTextoHtml.length === 0, sinTextoHtml.join(", "));
  }

  if (propios.includes("logica.js")) {
    const { errorClave, errorCorreo, errorNombre, leerVuelta, textoDeFallo } = await import("../web/cuenta/logica.js");
    ok("nombre: los bordes del formato", errorNombre("abc") === null && errorNombre("a".repeat(20)) === null && errorNombre("ab") === "nombre.formato" && errorNombre("a".repeat(21)) === "nombre.formato");
    ok("nombre: conserva lo que acepta la base", errorNombre("Mi_Nombre_1") === null && errorNombre("con-guion") === "nombre.formato" && errorNombre("con espacio") === "nombre.formato" && errorNombre("ñandú") === "nombre.formato");
    ok("correo: lo mal escrito", errorCorreo("a@b.co") === null && errorCorreo("a@b") === "correo.mal" && errorCorreo("a b@c.co") === "correo.mal" && errorCorreo("a@b..co") === "correo.mal" && errorCorreo("") === "correo.vacio");
    ok("contraseña: el mínimo solo al elegirla", errorClave("corta", true) === "clave.corta" && errorClave("corta", false) === null && errorClave("12345678", true) === null && errorClave("", false) === "clave.vacia");
    ok("vuelta: confirmación", leerVuelta("#access_token=t&type=signup")?.tipo === "signup");
    ok("vuelta: recuperar", leerVuelta("#access_token=t&type=recovery")?.tipo === "recovery");
    ok("vuelta: caducado", leerVuelta("#error=access_denied&error_code=otp_expired")?.error === "vuelta.caducada");
    ok("vuelta: otro error", leerVuelta("#error=server_error")?.error === "vuelta.fallida");
    ok("vuelta: nada", leerVuelta("") === null && leerVuelta("#") === null && leerVuelta("#seccion") === null);
    ok("fallos: la red", textoDeFallo({ red: true }) === "error.red");
    ok("fallos: el límite de correos", textoDeFallo({ status: 429 }) === "error.limite" && textoDeFallo({ status: 400, code: "over_email_send_rate_limit" }) === "error.limite");
    ok("fallos: lo que dice Auth", textoDeFallo({ status: 400, code: "invalid_credentials" }) === "error.credenciales" && textoDeFallo({ status: 400, code: "email_not_confirmed" }) === "error.sinConfirmar" && textoDeFallo({ status: 422, code: "weak_password" }) === "clave.floja");
    ok("fallos: lo desconocido no se inventa", textoDeFallo({ status: 500, code: "unexpected_failure" }) === "error.servidor");
  }

  if (PAGINAS.every((p) => propios.includes(`${p}.html`))) {
    const faltan = pendientes(WEB);
    console.log(`     textos legales con datos por poner: ${faltan.join(", ") || "ninguno"}`);
    if (faltan.length) {
      ok("sin esos datos, un build de verdad no se construye", revienta(() => entradasDeCuentas(WEB, { ADEORQ_CUENTAS: "1", ADEORQ_SUPABASE_URL: "x", ADEORQ_SUPABASE_CLAVE: "y" })));
    }
  }
}

if (fallos) {
  console.error(`\n${fallos} fallos.`);
  process.exit(1);
}
console.log("\nLas cuentas siguen fuera de lo que se publica.");
