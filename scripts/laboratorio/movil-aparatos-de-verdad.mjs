// «Tus aparatos» y «por un rato», de verdad (2026-11-13). Munir emparejó el PC
// de clase con un código del móvil; para quitarlo tenía que hacerlo EN ese PC, y
// en la lista seguían tres viejos de octubre. Una Adeorq aislada (ver
// `aislada.mjs`) con el móvil encendido en su puerto y un `movil.json` sembrado
// como el suyo: su móvil, los tres de octubre y uno «por un rato» a punto de
// acabarse. Desde la página del móvil, en un Brave a 390 px:
//   · la lista con «este aparato» y la hora a la que se olvida el del rato;
//   · un código «por un rato» con el que entra el PC de clase (otro Brave, a
//     1440), que se ve a sí mismo con su hora y sale en la lista del móvil solo;
//   · quitar a dos toques los tres viejos y el PC de clase: fuera de movil.json,
//     su llave da 401, el rastro dice quién quitó a quién y Ajustes > Móvil del
//     PC se pone al día sin tocar nada;
//   · al del rato se le acaba: 401, fuera de la lista y al rastro.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/movil-aparatos-de-verdad.mjs [carpeta para las fotos]
//
// Tailscale, escondido como en `movil-otro-aparato-de-verdad.mjs`. Sale con 1 si algo falla.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3197;
const DEPURAR = 9397;
const PUERTO_MOVIL = 4397;
const B = `http://127.0.0.1:${PUERTO_MOVIL}`;
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
// Lo que le queda al «por un rato» sembrado: lo bastante para mirarlo antes de que se vaya.
const LE_QUEDA = 75;

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 220)})` : ""}`);
  if (!bien) fallos.push(que);
};

const sinProgramas = mkdtempSync(join(tmpdir(), "adeorq-sin-programas-"));
const PATH = ["C:\\WINDOWS\\system32", "C:\\WINDOWS", "C:\\WINDOWS\\System32\\Wbem", "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0"].join(";");

function playwrightCore() {
  const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = join(npx, d, "node_modules", "playwright-core");
    if (existsSync(join(p, "package.json"))) return p;
  }
  throw new Error(`no encuentro playwright-core en ${npx}`);
}

const clave = () => randomBytes(32).toString("base64url");
const huella = (c) => createHash("sha256").update(c).digest("hex");
const ahora = () => Math.floor(Date.now() / 1000);
const OCT = Math.floor(Date.parse("2026-10-20T18:00:00Z") / 1000);
const MOVIL = clave();
const RATO = clave();
const sembrados = [
  { nombre: "Android · Chrome", clave: MOVIL, creado: OCT, visto: ahora() },
  { nombre: "Android", clave: clave(), creado: OCT - 86400 * 9, visto: OCT - 86400 * 5 },
  { nombre: "Móvil", clave: clave(), creado: OCT - 86400 * 8, visto: OCT - 86400 * 4 },
  { nombre: "PC", clave: clave(), creado: OCT - 86400 * 7, visto: OCT - 86400 * 3 },
  { nombre: "Caduca pronto", clave: RATO, creado: ahora() - 3600, visto: ahora() - 60, hasta: ahora() + LE_QUEDA },
];
const pedir = (ruta, llave, cuerpo) =>
  fetch(`${B}${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: { ...(llave ? { Authorization: `Bearer ${llave}` } : {}), "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).then(async (r) => ({ estado: r.status, v: await r.json().catch(() => ({})) }));

const a = await abrirAislada({
  nombre: "aparatos",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe: EXE,
  entorno: { PATH, Path: PATH, ADEORQ_MOVIL_PUERTO: String(PUERTO_MOVIL), ProgramW6432: sinProgramas, ProgramFiles: sinProgramas },
  sembrar: (datos) =>
    writeFileSync(join(datos, "movil.json"), JSON.stringify({
      encendido: true,
      dispositivos: sembrados.map(({ clave: c, ...d }) => ({ ...d, huella: huella(c) })),
    })),
});
let navegador = null;
try {
  const { v, base } = a;
  const datos = join(base, "datos", "Adeorq");
  const rastro = () => (existsSync(join(datos, "rastro.log")) ? readFileSync(join(datos, "rastro.log"), "utf8") : "");
  const enDisco = () => JSON.parse(readFileSync(join(datos, "movil.json"), "utf8")).dispositivos;
  const enAjustesPc = () => v.js(`JSON.stringify([...document.querySelectorAll(".movil-lista li")].map((l) => l.querySelector("strong").textContent + " | " + l.querySelector("em").textContent))`).then(JSON.parse);

  debe(await hasta(async () => (await fetch(`${B}/`).catch(() => null))?.ok, 20_000, 300), `la página del móvil contesta en el ${PUERTO_MOVIL}`);
  await v.js(`localStorage.setItem("adeorq-ajustes-seccion", "movil"); document.querySelector('[data-tab="ajustes"]').click(); true`);
  debe(await hasta(() => v.js(`!!document.querySelector(".movil-lista")`), 15_000, 300), "Ajustes > Móvil del PC enseña los emparejados");
  const pc0 = await enAjustesPc();
  const fila = (lista, nombre) => lista.find((l) => l.startsWith(`${nombre} |`)) ?? "";
  debe(/se olvida a las \d\d:\d\d$/.test(fila(pc0, "Caduca pronto")) && !/se olvida/.test(fila(pc0, "PC")), "en el PC, el del rato dice a qué hora se olvida y los demás no", JSON.stringify(pc0));

  // 1. Su móvil: «Tus aparatos» en Ajustes.
  const { chromium } = createRequire(import.meta.url)(playwrightCore());
  navegador = await chromium.launch({ executablePath: BRAVE, headless: true });
  const movilCtx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const movil = await movilCtx.newPage();
  await movil.goto(`${B}/`);
  await movil.evaluate((c) => localStorage.setItem("adeorq-movil-clave", c), MOVIL);
  await movil.goto(`${B}/?r=1`);
  await movil.waitForSelector("#abrir-cajon");
  await movil.click("#abrir-cajon");
  await movil.click("#cajon .a-ajustes");
  await movil.waitForSelector("#aparatos .aparato", { timeout: 8000 });
  const filasDe = (p) => p.$$eval("#aparatos .aparato", (fs) => fs.map((f) => `${f.querySelector("span").firstChild.textContent.trim()} | ${f.querySelector("small").textContent.trim()}`));
  const m0 = await filasDe(movil);
  debe(m0[0] === "Android · Chrome | este aparato", "el de ahora va primero y marcado", m0[0]);
  debe(m0.length === 5 && /^Caduca pronto \| visto hace \d+ min · se olvida a las \d\d:\d\d$/.test(m0[1] ?? ""), "el del rato, con su hora", JSON.stringify(m0));
  debe(m0.slice(2).join(",") === "PC | visto 17 oct,Móvil | visto 16 oct,Android | visto 15 oct", "los tres de octubre, del último visto al primero", JSON.stringify(m0.slice(2)));
  debe(await movil.$eval("#olvidarme", (b) => b.textContent.trim()) === "Olvidar este aparato", "el botón dice «Olvidar este aparato»");
  await movil.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await movil.screenshot({ path: join(FOTOS, "aparatos-de-verdad-1-movil.png") });

  // 2. Un código «por un rato» y el PC de clase entra con él, a 1440.
  await movil.click("#pedir-codigo");
  await movil.waitForSelector(".codigo-otro strong", { timeout: 8000 });
  const codigo = (await movil.$eval(".codigo-otro strong", (s) => s.textContent)).replace(" ", "");
  const clase = await (await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" })).newPage();
  await clase.goto(`${B}/`);
  await clase.waitForSelector("#codigo");
  await clase.fill("#codigo", codigo);
  await clase.fill("#nombre", "Windows · Chrome");
  await clase.click("#entrar");
  await clase.waitForSelector(".emparejar", { state: "detached", timeout: 8000 }).catch(() => {});
  const claveClase = await clase.evaluate(() => localStorage.getItem("adeorq-movil-clave"));
  debe(Boolean(claveClase), "el PC de clase entra con el código del móvil");
  const enJson = enDisco().find((d) => d.nombre === "Windows · Chrome");
  debe(enJson?.hasta && Math.abs(enJson.hasta - (ahora() + 8 * 3600)) < 120, "movil.json lo guarda con su fecha de caducidad, dentro de 8 h", JSON.stringify(enJson));
  await clase.click("#cajon .a-ajustes");
  await clase.waitForSelector("#aparatos .aparato", { timeout: 8000 });
  const yoClase = (await filasDe(clase))[0];
  debe(/^Windows · Chrome \| este aparato · se olvida a las \d\d:\d\d$/.test(yoClase), "el PC de clase se ve a sí mismo con su hora", yoClase);
  await clase.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await clase.screenshot({ path: join(FOTOS, "aparatos-de-verdad-2-pc-de-clase.png") });
  debe(await hasta(async () => (await filasDe(movil)).some((f) => f.startsWith("Windows · Chrome |")), 8_000, 400), "en el móvil sale solo, sin volver a entrar en Ajustes");
  debe(/ya ha entrado/.test(await movil.$eval("#otro-aparato", (c) => c.textContent)), "y el código del móvil dice que ya entró");

  // 3. Quitar los tres de octubre desde el móvil, a dos toques.
  for (const nombre of ["PC", "Móvil", "Android"]) {
    const boton = movil.locator("#aparatos .aparato", { hasText: new RegExp(`^\\s*${nombre}\\s*(visto|tendrá)`) }).locator("button");
    await boton.click();
    await dormir(200);
    debe((await boton.textContent())?.trim() === "Toca otra vez", `«${nombre}»: el primer toque solo avisa`);
    await boton.click();
    await hasta(async () => !(await filasDe(movil)).some((f) => f.startsWith(`${nombre} |`)), 5_000, 200);
  }
  const m1 = await filasDe(movil);
  debe(m1.map((f) => f.split(" | ")[0]).join(",") === "Android · Chrome,Windows · Chrome,Caduca pronto", "quedan su móvil, el PC de clase y el del rato", JSON.stringify(m1));
  debe(enDisco().map((d) => d.nombre).join(",") === "Android · Chrome,Caduca pronto,Windows · Chrome", "y en movil.json igual", enDisco().map((d) => d.nombre));
  const lineas = rastro();
  debe(["PC", "Móvil", "Android"].every((n) => lineas.includes(`Móvil: «Android · Chrome» quitó a «${n}» desde Tus aparatos`)), "el rastro dice quién quitó a quién", lineas.split("\n").filter((l) => /quitó/.test(l)).join(" | "));
  debe(await hasta(async () => (await enAjustesPc()).length === 3, 6_000, 300), "Ajustes > Móvil del PC se pone al día solo", JSON.stringify(await enAjustesPc()));
  const viejo = sembrados.find((s) => s.nombre === "PC");
  debe((await pedir("/api/yo", viejo.clave)).estado === 401, "la llave de un quitado ya no abre");
  await movil.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await movil.screenshot({ path: join(FOTOS, "aparatos-de-verdad-3-movil-sin-los-viejos.png") });

  // 4. Y el PC de clase, quitado desde el móvil, se queda fuera al momento.
  const bClase = movil.locator("#aparatos .aparato", { hasText: "Windows · Chrome" }).locator("button");
  await bClase.click();
  await dormir(200);
  await bClase.click();
  debe(await hasta(async () => (await pedir("/api/yo", claveClase)).estado === 401, 5_000, 300), "el PC de clase, quitado desde el móvil, ya no abre");

  // 5. Al del rato se le acaba: su llave da 401, sale de movil.json y queda en el rastro.
  const sobra = sembrados.find((s) => s.nombre === "Caduca pronto").hasta - ahora();
  debe((await pedir("/api/yo", RATO)).estado === 200, "antes de su hora, el del rato todavía abre");
  await dormir(Math.max(0, sobra + 2) * 1000);
  debe((await pedir("/api/yo", RATO)).estado === 401, "a su hora, su llave ya no abre");
  debe(!enDisco().some((d) => d.nombre === "Caduca pronto"), "y sale de movil.json", enDisco().map((d) => d.nombre));
  debe(rastro().includes("Móvil: «Caduca pronto» se olvidó solo: era por un rato"), "y el rastro lo dice");
  await movil.goto(`${B}/?r=2`);
  await movil.waitForSelector("#abrir-cajon");
  await movil.click("#abrir-cajon");
  await movil.click("#cajon .a-ajustes");
  await movil.waitForSelector("#aparatos .aparato", { timeout: 8000 });
  const m2 = await filasDe(movil);
  debe(m2.length === 1 && m2[0] === "Android · Chrome | este aparato", "en la lista del móvil solo queda él", JSON.stringify(m2));
  await movil.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await movil.screenshot({ path: join(FOTOS, "aparatos-de-verdad-4-movil-al-final.png") });
} catch (e) {
  debe(false, "el laboratorio se cayó", e?.stack ?? e);
} finally {
  await navegador?.close().catch(() => {});
  await a.cerrar();
  rmSync(sinProgramas, { recursive: true, force: true });
}
console.log(fallos.length ? `\n${fallos.length} fallos` : "\nTodo en verde.");
process.exit(fallos.length ? 1 : 0);
