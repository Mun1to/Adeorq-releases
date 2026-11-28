// Perfil › Cuentas › «En la web», de verdad (2026-11-27).
//
//   cargo build --manifest-path src-tauri/Cargo.toml     (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                              (el binario de desarrollo carga de :1420)
//   node scripts/laboratorio/cuentas-web-de-verdad.mjs [--fotos <carpeta>] [--quitar-prueba]
//
// Una Adeorq aislada (casa, datos y ventana de usar y tirar) que mira el perfil DE VERDAD del
// navegador de los agentes (`ADEORQ_PERFIL_AGENTES`, el `~/.playwright-brave` de quien lo lanza)
// y su servidor compartido de verdad (el 3019). No toca ninguna sesión de trabajo:
//  1. La lista sale entera, y cada fila dice lo mismo que el estado que da Rust.
//  2. «Añadir» GitHub, pulsado en la pantalla, abre su página de entrar en el navegador de los
//     agentes. La pestaña de prueba se cierra al acabar.
//  3. Con `--quitar-prueba`, y solo si X está fuera en ese perfil: le pone una cookie FALSA
//     `auth_token` en `.x.com`, la pantalla la ve «Dentro», «Quitar» con su diálogo la quita, y
//     no queda ni una cookie de x.com (las de visita de X también se van, que no son de nadie).
//  4. Fotos a 1920 y 1440, en oscuro y en claro, con los detectores de cárceles y mayúsculas.
// Con el navegador cerrado, 2 abre una ventana normal de Brave con ese perfil (la cierra
// `cerrar`, que mata el árbol de la app) y 3 no se hace.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";

const args = process.argv.slice(2);
const iFotos = args.indexOf("--fotos");
const fotos = iFotos >= 0 ? args[iFotos + 1] : join(tmpdir(), `adeorq-cuentas-web-fotos-${process.pid}`);
const QUITAR_PRUEBA = args.includes("--quitar-prueba");
mkdirSync(fotos, { recursive: true });

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k) || /^ADEORQ_PANE/i.test(k)) delete process.env[k];

const PERFIL = join(homedir(), ".playwright-brave");
const PUERTO = 47_000 + (process.pid % 900);
const DEPURAR = 9650 + (process.pid % 100);
const copia = join(tmpdir(), `adeorq-cuentas-web-${process.pid}.exe`);
copyFileSync(EXE, copia);

// ── El servidor compartido, para mirar y preparar desde fuera de la app ──
const SERVIDOR = "http://127.0.0.1:3019/mcp";
const H = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
async function correr(codigo) {
  const datos = (t) => t.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
  const ini = await fetch(SERVIDOR, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "laboratorio-cuentas-web", version: "1" } } }),
  });
  const s = ini.headers.get("mcp-session-id");
  await ini.text();
  const conS = { ...H, "mcp-session-id": s };
  try {
    await fetch(SERVIDOR, { method: "POST", headers: conS, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    const r = await fetch(SERVIDOR, { method: "POST", headers: conS, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "browser_run_code_unsafe", arguments: { code: codigo } } }) });
    const m = datos(await r.text()).find((x) => x.id === 2);
    const texto = m?.result?.content?.[0]?.text ?? "";
    const tras = texto.split("### Result\n")[1]?.split("\n### ")[0]?.trim();
    const v = JSON.parse(tras);
    return typeof v === "string" ? JSON.parse(v) : v;
  } finally {
    await fetch(SERVIDOR, { method: "DELETE", headers: conS }).catch(() => {});
  }
}

const a = await abrirAislada({
  nombre: "cuentas-web",
  puertoMcp: PUERTO,
  depurar: DEPURAR,
  exe: copia,
  fotos,
  entorno: { ADEORQ_PERFIL_AGENTES: PERFIL },
  // La cuenta con la que se entra en Google, como la tendrá su Adeorq.
  sembrar: (datos) => writeFileSync(join(datos, "cuentas-web.json"), JSON.stringify({ pistas: { google: "torres@orquio.com" } })),
});

const rust = (comando, parametros = {}) =>
  a.v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(comando)}, ${JSON.stringify(parametros)}).then((x) => ({ ok: x }), (e) => ({ error: String(e) }))`);

/** Perfil › Cuentas › En la web, como se llega pulsando. */
async function abrirSeccion() {
  await a.v.js(`document.querySelector('[data-tab="perfil"]')?.click(); "ok"`);
  await hasta(() => a.v.js(`!!document.querySelector('.perfil-seccion[data-seccion="cuentas"]')`), 15_000);
  await a.v.js(`document.querySelector('.perfil-seccion[data-seccion="cuentas"]')?.click(); "ok"`);
  const pestana = await hasta(
    () => a.v.js(`(() => { const b = [...document.querySelectorAll(".accounts .set-tab")].find((x) => /En la web|On the web/.test(x.textContent)); if (!b) return null; b.click(); return b.textContent; })()`),
    20_000,
    500,
  );
  await hasta(() => a.v.js(`document.querySelectorAll(".cweb-fila").length > 0`), 15_000);
  await dormir(600);
  return pestana;
}

const filas = () =>
  a.v.js(`[...document.querySelectorAll(".cweb-fila")].map((f) => ({ nombre: f.querySelector(".cweb-nombre b")?.textContent, lado: f.dataset.lado, grupo: f.dataset.grupo, sub: f.querySelector(".cweb-sub")?.textContent ?? "", botones: [...f.querySelectorAll("button")].map((b) => b.textContent) }))`);

const pestanasDeGithub = () =>
  correr(`async (page) => page.context().pages().filter((p) => /github\\.com\\/login/.test(p.url())).length`).catch(() => -1);

try {
  // ── 1. La lista ──
  console.log("\n== 1. La lista, contra el perfil de verdad ==");
  const pestana = await abrirSeccion();
  dice(!!pestana, "Cuentas lleva la sección «En la web»", String(pestana));
  const estado = (await rust("cuentas_web_estado")).ok;
  dice(estado?.disponible === true, "Rust encuentra el navegador de los agentes", JSON.stringify({ abierto: estado?.abierto, error: estado?.error }));
  const vistas = await filas();
  dice(vistas.length === estado.sitios.length && vistas.length === 13, `salen las ${estado.sitios.length} webs de la lista`, String(vistas.length));
  const esperado = (s) => (s.dentro === true ? "dentro" : s.dentro === false ? "fuera" : "nose");
  const distintas = estado.sitios.filter((s, i) => vistas[i]?.lado !== esperado(s));
  dice(distintas.length === 0, "cada fila dice lo mismo que el estado de Rust", JSON.stringify(distintas.map((s) => s.id)));
  console.log(vistas.map((v) => `      ${(v.nombre ?? "").padEnd(16)} ${v.lado.padEnd(7)} ${v.botones.join(" + ").padEnd(16)} ${v.sub}`).join("\n"));
  const bloqueadas = vistas.filter((v) => v.grupo === "bloqueado");
  dice(bloqueadas.length === 3 && bloqueadas.every((v) => !v.botones.includes("Añadir") && v.sub.length > 10), "las tres bloqueadas, sin «Añadir» y con su porqué");
  const aviso = await a.v.js(`document.querySelector(".cweb-aviso")?.textContent ?? ""`);
  dice(/tocar tu web en vivo/.test(aviso), "las webs en vivo llevan su aviso", aviso);
  const google = vistas.find((v) => v.nombre === "Google");
  dice(/torres@orquio\.com/.test(google?.sub ?? ""), "Google dice con qué cuenta se entra", google?.sub);

  // ── 2. Añadir ──
  console.log("\n== 2. «Añadir» GitHub ==");
  const github = vistas.find((v) => v.nombre === "GitHub");
  if (!github?.botones.includes("Añadir")) {
    console.log("      GitHub ya está dentro en ese perfil: no hay «Añadir» que probar");
  } else {
    const antes = estado.abierto ? await pestanasDeGithub() : 0;
    await a.v.js(`[...document.querySelectorAll(".cweb-fila")].find((f) => f.querySelector(".cweb-nombre b")?.textContent === "GitHub")?.querySelector("button")?.click(); "ok"`);
    if (estado.abierto) {
      const despues = await hasta(async () => ((await pestanasDeGithub()) > antes ? await pestanasDeGithub() : null), 15_000, 500);
      dice(despues > antes, "con el navegador abierto, sale una pestaña con github.com/login en él", `${antes} → ${despues}`);
      const nota = await hasta(() => a.v.js(`document.querySelector(".cweb-nota")?.textContent ?? null`), 5_000);
      dice(/pestaña del navegador de los agentes/.test(nota ?? ""), "y la pantalla dice dónde entrar", nota);
      await a.foto(null, "anadir-github-abierto.png");
      const cerradas = await correr(`async (page) => { let n = 0; for (const p of page.context().pages()) if (/github\\.com\\/login/.test(p.url())) { await p.close(); n++; } return n; }`);
      dice(cerradas >= 1, "la pestaña de prueba se cierra", String(cerradas));
    } else {
      const entrando = await hasta(async () => (await rust("cuentas_web_estado")).ok?.entrando, 15_000, 500);
      dice(entrando === "github", "con el navegador cerrado, se abre su ventana y la pantalla dice que estás entrando", String(entrando));
      await dormir(1500);
      await a.foto(null, "anadir-github-cerrado.png");
    }
  }

  // ── 3. Quitar, con una cookie falsa en una web sin sesión ──
  console.log("\n== 3. «Quitar» ==");
  const x = vistas.find((v) => v.nombre === "X");
  if (!QUITAR_PRUEBA) console.log("      sin --quitar-prueba: no se toca el perfil");
  else if (!estado.abierto) console.log("      el navegador está cerrado: la cookie de prueba se pone con él abierto");
  else if (x?.lado !== "fuera") console.log("      X no está fuera en ese perfil: no se prueba sobre una sesión suya");
  else {
    const puesta = await correr(`async (page) => { await page.context().addCookies([{ name: "auth_token", value: "prueba-de-adeorq", domain: ".x.com", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, secure: true, httpOnly: true, sameSite: "None" }]); return (await page.context().cookies()).filter((c) => c.domain.endsWith("x.com") && c.name === "auth_token").length; }`);
    dice(puesta === 1, "la cookie de prueba está en el perfil", String(puesta));
    await a.v.js(`window.dispatchEvent(new Event("focus")); "ok"`);
    const ve = await hasta(async () => ((await filas()).find((v) => v.nombre === "X")?.lado === "dentro" ? true : null), 15_000, 500);
    dice(ve === true, "la pantalla ve X «Dentro»");
    await a.foto(null, "quitar-x-1-dentro.png");
    await a.v.js(`[...document.querySelectorAll(".cweb-fila")].find((f) => f.querySelector(".cweb-nombre b")?.textContent === "X")?.querySelector(".menu-warn")?.click(); "ok"`);
    const dialogo = await hasta(() => a.v.js(`document.querySelector(".modal-title")?.textContent ?? null`), 5_000);
    dice(dialogo === "Quitar X", "«Quitar» pregunta antes", String(dialogo));
    await a.foto(null, "quitar-x-2-dialogo.png");
    await a.v.js(`document.querySelector(".modal .np-btn")?.click(); "ok"`);
    const fuera = await hasta(async () => ((await filas()).find((v) => v.nombre === "X")?.lado === "fuera" ? true : null), 20_000, 500);
    dice(fuera === true, "tras confirmar, X vuelve a «Fuera»");
    const quedan = await correr(`async (page) => (await page.context().cookies()).filter((c) => /(^|\\.)x\\.com$/.test(c.domain)).length`);
    dice(quedan === 0, "y en el perfil no queda ni una cookie de x.com", String(quedan));
    await a.foto(null, "quitar-x-3-fuera.png");
  }

  // ── 4. Fotos y detectores ──
  console.log("\n== 4. Fotos ==");
  for (const tema of ["contraste", "claro"]) {
    // Sin «seguir a Windows», que es lo de fábrica en una casa nueva y pisaría el tema.
    await a.v.js(`localStorage.setItem("adeorq-tema-sistema", JSON.stringify({ activo: false, oscuro: "contraste", claro: "papel" })); localStorage.setItem("adeorq-theme", ${JSON.stringify(tema)}); localStorage.setItem("adeorq-cuentas-seccion", "web"); "ok"`);
    await a.v.enviar("Page.reload");
    await dormir(2500);
    await hasta(() => a.v.js(`!!document.querySelector(".app, #root > *")`), 20_000);
    // Quien la dejó abierta vuelve a ella, sin pulsar nada (la pestaña no espera a la lectura).
    await a.v.js(`document.querySelector('[data-tab="perfil"]')?.click(); "ok"`);
    await hasta(() => a.v.js(`!!document.querySelector('.perfil-seccion[data-seccion="cuentas"]')`), 15_000);
    await a.v.js(`document.querySelector('.perfil-seccion[data-seccion="cuentas"]')?.click(); "ok"`);
    const vuelve = await hasta(() => a.v.js(`document.querySelectorAll(".cweb-fila").length ? document.querySelector(".accounts .set-tab[data-on]")?.textContent : null`), 15_000, 300);
    dice(/En la web/.test(vuelve ?? ""), `${tema}: al volver a Cuentas sigue en «En la web»`, String(vuelve));
    await abrirSeccion();
    for (const ancho of [1920, 1440]) {
      await a.v.enviar("Emulation.setDeviceMetricsOverride", { width: ancho, height: 1080, deviceScaleFactor: 1, mobile: false });
      await dormir(900);
      const medida = await a.v.js(`(() => {
        const c = document.querySelector(".cweb");
        const r = c.getBoundingClientRect();
        const letras = [...c.querySelectorAll("*")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize));
        const cortados = [...c.querySelectorAll(".cweb-nombre b, .cweb-sub, .cweb-lado, .cweb-botones button")].filter((e) => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === "ellipsis").map((e) => e.textContent);
        const tema = document.documentElement.dataset.theme;
        const columnas = getComputedStyle(c.querySelector(".cweb-filas")).gridTemplateColumns.split(" ").length;
        return { ancho: Math.round(r.width), desborda: c.scrollWidth > c.clientWidth + 1, letraMin: Math.min(...letras), cortados, columnas, tema };
      })()`);
      dice(medida.tema === tema && !medida.desborda && medida.letraMin >= 13 && medida.cortados.length === 0,`${tema} a ${ancho}: sin desbordar, letra de ${medida.letraMin} px o más y nada cortado (${medida.columnas} columnas)`, JSON.stringify(medida));
      await a.foto(null, `en-la-web-${tema}-${ancho}.png`);
    }
    const jaulas = await carceles(a.v, ".cweb");
    const letras = await mayusculas(a.v, ".cweb");
    dice(jaulas.fallos.length === 0 && letras.fallos.length === 0, `${tema}: sin cárceles ni mayúsculas espaciadas`, JSON.stringify([...jaulas.fallos, ...letras.fallos]).slice(0, 400));
    await a.v.enviar("Emulation.clearDeviceMetricsOverride");
  }
  await a.v.js(`localStorage.setItem("adeorq-theme", "contraste"); "ok"`);
} finally {
  await a.cerrar();
  rmSync(copia, { force: true });
}
console.log(`\nFotos en ${fotos}`);
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo bien.");
process.exitCode = fallos ? 1 : 0;
