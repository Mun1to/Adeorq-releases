// «Claves que duran» (2026-11-06) de punta a punta, en una Adeorq aislada y con
// claves INVENTADAS: ninguna clave de Munir se lee ni se mueve.
//
// Lo que mira, desde una terminal de Adeorq (con su contraseña, como un agente):
//   1. un nombre que no está pero se parece a uno guardado no abre la ventana de
//      pegar: el agente lee cuál hay;
//   2. con `--nueva`, la ventana sí sale y dice cuál parecida tienes;
//   3. al guardarla, Adeorq le pregunta a Cloudflare DE VERDAD (con la clave
//      inventada, que Cloudflare rechaza) y sale el aviso «Una clave ya no vale»;
//   4. `adeorq secreto --lista` la enseña como que ya no vale;
//   5. pedirla para un comando abre la ventana diciendo que sustituye a la de
//      antes, y si el comando falla con «Authentication error», el agente lee que
//      la clave ya no vale (Cloudflare lo confirma) y cómo pedir otra;
//   6. una clave de un servicio que no contesta: tras un 401, «si es la clave…»;
//   7. Ajustes › Terminales dice que ya no vale;
//   8. al acabar, las claves inventadas se olvidan del Gestor de Credenciales.
//
// Necesita red (Cloudflare) y, antes:
//   cargo build --manifest-path src-tauri/Cargo.toml    (C:\ct\debug\adeorq.exe)
//   pnpm dev                                             (la ventana carga de :1420)
// Uso: node scripts/laboratorio/claves-que-duran-de-verdad.mjs [<adeorq.exe>] [<carpeta de fotos>]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, carceles, dormir, EXE, hasta, mayusculas } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
const fotos = process.argv[3] ?? join(tmpdir(), `claves-que-duran-${process.pid}`);
mkdirSync(fotos, { recursive: true });

let fallos = 0;
const ok = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "BIEN " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

// Nombres de esta pasada: no chocan con nada de verdad y se olvidan al acabar.
const N = process.pid;
const CF = `cloudflare-lab${N}`;
const GUARDADA = `cloudflare-lab${N}-guardada`;
const OTRA = `lab${N}-sinservicio`;
const inventada = (i) => `inventadaAdeorqLab${N}x${i}`.padEnd(40, "0");

const a = await abrirAislada({
  nombre: "claves",
  puertoMcp: 3197,
  depurar: 9337,
  exe,
  fotos,
  // Solo el NOMBRE de una guardada, en el índice de esta Adeorq: sin valor en ningún sitio.
  sembrar: (datos) => writeFileSync(join(datos, "secretos-de-agente.json"), JSON.stringify([GUARDADA])),
});
const { v } = a;

/** `adeorq secreto …` desde la terminal `panel`, con su contraseña. */
const secreto = (args, panel, clave) =>
  new Promise((listo) => {
    const env = { ...a.env, ADEORQ_PANE_ID: String(panel), ADEORQ_PANE_CLAVE: clave, MSYS_NO_PATHCONV: "1" };
    const p = spawn(a.exe, ["secreto", ...args], { env });
    let salida = "";
    let errores = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (errores += d));
    const tope = setTimeout(() => p.kill(), 120_000);
    p.on("exit", (codigo) => {
      clearTimeout(tope);
      listo({ codigo, salida, errores });
    });
  });

const modal = () => v.js(`(() => { const m = document.querySelector(".secreto-modal"); return m ? { titulo: m.querySelector(".modal-title")?.textContent, texto: m.textContent } : null; })()`);
const pegar = async (valor) => {
  await v.js(`(() => {
    const caja = document.querySelector(".secreto-modal .secreto-caja");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(caja, ${JSON.stringify(valor)});
    caja.dispatchEvent(new Event("input", { bubbles: true }));
    return "ok";
  })()`);
  await dormir(300);
  await v.js(`document.querySelector(".secreto-modal .np-btn").click(), "ok"`);
};
const fotoModal = async (archivo) => {
  await dormir(500);
  const r = await v.js(`(() => { const m = document.querySelector(".secreto-modal"); if (!m) return null; const b = m.getBoundingClientRect(); return { x: Math.max(0, b.x - 24), y: Math.max(0, b.y - 24), width: b.width + 48, height: b.height + 48 }; })()`);
  return r ? a.foto(r, archivo) : null;
};
const caducidad = () => {
  const f = join(a.base, "datos", "Adeorq", "secretos-de-agente-caducidad.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
};
/** Si el Gestor de Credenciales tiene esa entrada. Se mira la lista entera (solo
 *  los nombres): `cmdkey /list:<nombre>` repite el nombre en su cabecera aunque no
 *  haya ninguna, y daba por guardada una clave ya olvidada. */
const enElAlmacen = (nombre) => {
  const r = spawnSync("cmdkey", ["/list"], { encoding: "utf8" });
  return (r.stdout ?? "").split(/\r?\n/).some((l) => l.trim().endsWith(`=Adeorq/agente:${nombre}`) || l.trim().endsWith(` Adeorq/agente:${nombre}`));
};

try {
  for (const n of [CF, OTRA]) ok(!enElAlmacen(n), `«${n}» no está en el Gestor de Credenciales antes de empezar`);
  // Los avisos que emite Rust, apuntados en la página.
  await v.js(`(async () => {
    window.__pedidos = []; window.__caduca = [];
    const I = window.__TAURI_INTERNALS__;
    await I.invoke("plugin:event|listen", { event: "secreto-pedido", target: { kind: "Any" }, handler: I.transformCallback((e) => window.__pedidos.push(e.payload)) });
    await I.invoke("plugin:event|listen", { event: "secreto-caduca", target: { kind: "Any" }, handler: I.transformCallback((e) => window.__caduca.push(e.payload)) });
    return "ok";
  })()`);

  // Una terminal de Adeorq, y su contraseña: lo que lleva un agente de dentro.
  const mira = a.puente(null);
  await mira.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await mira.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  const abierta = await mira.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Un agente", brief: "" });
  const P = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(abierta.texto || "")?.[1]);
  ok(P > 0, `hay una terminal de Adeorq, la ${P}`);
  const clave = await a.claveDe(P);
  ok(!!clave, "y se sabe su contraseña");

  console.log("\n── 1. Un nombre parecido a uno guardado");
  const r1 = await secreto([`cloudflare-lab${N}`, "para desplegar"], P, clave);
  ok(r1.codigo === 1 && r1.errores.includes(`no hay ninguna clave «${CF}»`) && r1.errores.includes(GUARDADA), "el agente lee que no está y cuál se le parece", r1.errores.trim().split("\n")[0]);
  ok((await v.js("window.__pedidos.length")) === 0 && !(await modal()), "y a Munir no le sale ninguna ventana");

  console.log("\n── 2. Con --nueva sale la ventana, diciendo cuál se parece");
  const p2 = secreto([CF, "--nueva", "para probar el aviso de caducidad"], P, clave);
  const m2 = await hasta(modal, 15_000);
  ok(!!m2 && m2.texto.includes("nombre parecido") && m2.texto.includes(GUARDADA), `sale «${m2?.titulo}» y dice cuál parecida tienes`);
  await fotoModal("1-pegar-con-una-parecida.png");
  const jaulas2 = await carceles(v, ".secreto-modal");
  ok(jaulas2.fallos.length === 0, "la ventana de pegar, sin cárceles", JSON.stringify(jaulas2.fallos).slice(0, 300));
  await pegar(inventada(1));
  const r2 = await p2;
  ok(r2.codigo === 0 && /está guardada/.test(r2.errores) && !r2.salida.includes(inventada(1)) && !r2.errores.includes(inventada(1)), "pegada y guardada, sin que el valor salga por ningún sitio", r2.errores.trim().split("\n")[0]);

  console.log("\n── 3. Al guardarla, Adeorq le pregunta a Cloudflare de verdad");
  const aviso = await hasta(() => v.js("window.__caduca.find((x) => x.nombre === " + JSON.stringify(CF) + ") ?? null"), 40_000, 500);
  ok(aviso?.aviso === "no_vale" && aviso?.servicio === "Cloudflare", "Cloudflare rechaza la inventada y sale el aviso", JSON.stringify(aviso));
  const m3 = await hasta(modal, 5_000);
  ok(m3?.titulo === "Una clave ya no vale" && m3.texto.includes("Mi perfil › Tokens de API"), `el aviso: «${m3?.titulo}», con dónde se crea otra`);
  await fotoModal("2-aviso-ya-no-vale.png");
  const jaulas = await carceles(v, ".secreto-modal");
  const letras = await mayusculas(v, ".secreto-modal");
  ok(jaulas.fallos.length === 0 && letras.fallos.length === 0, "el aviso, sin cárceles ni mayúsculas espaciadas", JSON.stringify([...jaulas.fallos, ...letras.fallos]).slice(0, 300));
  await v.js(`document.querySelector(".secreto-modal .np-btn").click(), "ok"`);
  const c3 = caducidad()[CF];
  ok(c3?.servicio === "cloudflare" && c3?.vale === false && c3?.avisado === "no_vale", "y queda apuntado sin el valor: Cloudflare, no vale, avisado", JSON.stringify(c3));
  ok(!JSON.stringify(caducidad()).includes(inventada(1)), "el fichero no lleva el valor");

  console.log("\n── 4. La lista");
  const r4 = await secreto(["--lista"], P, clave);
  ok(r4.codigo === 0 && new RegExp(`${CF}\\s+Cloudflare · YA NO VALE`).test(r4.salida) && r4.salida.includes(GUARDADA), "`adeorq secreto --lista` la enseña como que ya no vale", r4.salida.split("\n").filter((l) => l.includes(N)).join(" | "));

  console.log("\n── 5. Pedirla para un comando: la ventana sustituye, y el fallo se explica");
  const fallaComoWrangler = ["--env", "CF_TOKEN", "--", "cmd", "/c", "echo Authentication error [code: 10000] & exit 1"];
  const p5 = secreto([CF, ...fallaComoWrangler], P, clave);
  const m5 = await hasta(modal, 15_000);
  ok(m5?.titulo === "Una clave ya no vale: hace falta otra" && m5.texto.includes("La que pegues la sustituye"), `sale «${m5?.titulo}»`);
  await fotoModal("3-pegar-sustituye.png");
  await pegar(inventada(2));
  const r5 = await p5;
  ok(r5.codigo === 1, `el código del comando pasa tal cual (${r5.codigo})`);
  ok(/ya no vale \(Cloudflare la rechaza/.test(r5.errores) && r5.errores.includes(`adeorq secreto ${CF} --nueva`) && /No sigas probando/.test(r5.errores), "el agente lee que ya no vale, que pare, y cómo pedir otra", r5.errores.trim().split("\n").slice(-6).join(" | "));
  ok(!r5.errores.includes(inventada(2)) && !r5.salida.includes(inventada(2)), "sin el valor en su salida");
  // El aviso de la nueva (también inventada) puede salir: se cierra.
  await hasta(async () => {
    if (await modal()) await v.js(`document.querySelector(".secreto-modal .np-btn")?.click(), "ok"`);
    return !(await modal());
  }, 15_000, 1000);

  console.log("\n── 6. Una clave de un servicio que no contesta, tras un 401");
  const p6 = secreto([OTRA, "--env", "LAB_K", "--", "cmd", "/c", "echo HTTP 401: Unauthorized & exit 1"], P, clave);
  const m6 = await hasta(modal, 15_000);
  ok(m6?.titulo === "Un agente necesita una clave", `sale «${m6?.titulo}» (no se parece a ninguna)`);
  await pegar("valor-inventado-del-laboratorio");
  const r6 = await p6;
  ok(r6.codigo === 1 && r6.errores.includes(`Si es la clave «${OTRA}» la que no vale`) && r6.errores.includes("--nueva"), "el agente lee «si es la clave… pídele una nueva»", r6.errores.trim().split("\n").slice(-4).join(" | "));
  ok(!caducidad()[OTRA], "y de esa no se apunta nada: no se manda a ningún servicio");

  console.log("\n── 7. Ajustes › Terminales");
  await v.js(`localStorage.setItem("adeorq-ajustes-seccion", "terminales"); (() => { const t = [...document.querySelectorAll("[data-tab]")].find((x) => x.getAttribute("data-tab") === "ajustes"); t?.click(); return "ok"; })()`);
  const fila = await hasta(() => v.js(`(() => { const f = [...document.querySelectorAll(".mcp-cliente")].find((x) => x.textContent.includes(${JSON.stringify(CF)})); return f ? f.textContent : null; })()`), 15_000);
  ok(!!fila && fila.includes("Cloudflare ya no la acepta: pide otra"), "la tarjeta dice que ya no vale", fila ?? "");
  const otraFila = await v.js(`[...document.querySelectorAll(".mcp-cliente")].find((x) => x.textContent.includes(${JSON.stringify(OTRA)}))?.textContent ?? ""`);
  ok(!!otraFila && !otraFila.includes("Cloudflare") && !/caduca|acepta/.test(otraFila), "y de la que no es de ningún servicio no dice nada de más", otraFila);
  await v.js(`[...document.querySelectorAll(".mcp-cliente")].find((x) => x.textContent.includes(${JSON.stringify(CF)}))?.closest(".panel-card")?.scrollIntoView({ block: "center" }); "ok"`);
  await dormir(600);
  const tarjeta = await v.js(`(() => { const c = [...document.querySelectorAll(".mcp-cliente")].find((x) => x.textContent.includes(${JSON.stringify(CF)}))?.closest(".panel-card"); if (!c) return null; const b = c.getBoundingClientRect(); return { x: Math.max(0, b.x - 16), y: Math.max(0, b.y - 16), width: b.width + 32, height: b.height + 32 }; })()`);
  if (tarjeta) await a.foto(tarjeta, "4-ajustes-claves.png");
  const jaulas7 = await carceles(v, ".panel-card:has(.mcp-cliente)");
  ok(jaulas7.fallos.length === 0, "la tarjeta, sin cárceles", JSON.stringify(jaulas7.fallos).slice(0, 300));
} finally {
  console.log("\n── 8. Recoger");
  for (const n of [CF, OTRA]) {
    await v.js(`window.__TAURI_INTERNALS__.invoke("secreto_de_agente_olvidar", { nombre: ${JSON.stringify(n)} }).then(() => "ok", (e) => String(e))`).catch(() => {});
    ok(!enElAlmacen(n), `«${n}» ya no está en el Gestor de Credenciales`);
  }
  await a.cerrar();
}
console.log(`\nFotos en ${fotos}`);
console.log(fallos ? `\n${fallos} FALLO(S)` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
