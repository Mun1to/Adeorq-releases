// La barra de una terminal con «solo el nombre»: el proyecto y el título, sin el modelo ni la memoria.
//
// Un usuario de Linux, 2026-10-31: «¿se puede poner que en la barra de arriba
// aparezca solamente el nombre de mi proyecto?». El ajuste vive en
// `lib/cabeceraTerminal.ts` y lo pinta `TerminalPane.tsx`, que deja de montar
// `.ph-meta`.
//
// En una Adeorq aislada: una consola en el proyecto «demo». Se mira:
//   · de fábrica, la zona de estado está y el proyecto se lee;
//   · al apagar el interruptor de Ajustes, la zona de estado se va en caliente
//     y el proyecto y el nombre siguen a la vista;
//   · el globo del nombre sigue cargando con el resto;
//   · al encenderlo otra vez, vuelve.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/cabecera-solo-nombre.mjs [exe]
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const puertoMcp = 47_000 + (process.pid % 900);
const a = await abrirAislada({ nombre: "cabecera-nombre", puertoMcp, depurar: 9750 + (process.pid % 100), exe });
try {
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const r = await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Probando la barra", brief: "" });
  const id = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
  dice(Number.isFinite(id), "se abre una terminal en el proyecto demo");
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${id}"] .pane-head')`), 15_000, 400);
  // La zona de estado solo se pinta cuando hay algo que medir: se espera a la memoria.
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${id}"] .pane-ram')`), 20_000, 500);

  const mira = () =>
    a.v.js(`(() => {
      const h = document.querySelector('[data-pane-id="${id}"] .pane-head');
      if (!h) return "null";
      const ancho = (sel) => { const e = h.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().width) : -1; };
      return JSON.stringify({
        meta: !!h.querySelector(".ph-meta"),
        proyecto: h.querySelector(".pane-proj")?.textContent ?? "",
        anchoProyecto: ancho(".pane-proj"),
        anchoNombre: ancho(".pane-name"),
        globo: h.querySelector(".pane-name")?.getAttribute("data-tip") ?? "",
      });
    })()`).then((x) => JSON.parse(x ?? "null"));

  const antes = await mira();
  dice(antes?.meta === true, "de fábrica la barra lleva la zona de estado", JSON.stringify(antes));
  dice(antes?.proyecto === "demo" && antes.anchoProyecto > 0, "y el proyecto se lee", JSON.stringify(antes));
  // La foto de la barra sola, para mirarla: los números no dicen si se lee bien.
  const fotoDeLaBarra = async (archivo) => {
    // Al volver de Ajustes la Cabina tarda un momento en volver a medir.
    const rect = JSON.parse(
      await hasta(
        () => a.v.js(`(() => { const r = document.querySelector('[data-pane-id="${id}"] .pane-head')?.getBoundingClientRect(); return r && r.width > 0 ? JSON.stringify(r) : ""; })()`),
        10_000,
        300,
      ),
    );
    console.log(`      foto: ${await a.foto({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, archivo)}`);
  };
  await fotoDeLaBarra("cabecera-todo.png");

  // El interruptor de verdad, en Ajustes › Terminales.
  const pulsar = () =>
    a.v.js(`(() => {
      const fila = [...document.querySelectorAll("label.setting-row")].find((l) => /barra de cada terminal/.test(l.textContent ?? ""));
      fila?.querySelector("input")?.click();
      return !!fila;
    })()`);
  const pestana = (nombre) =>
    a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => (x.textContent ?? "").trim().startsWith("${nombre}")); t?.click(); return !!t; })()`);
  // Ajustes se carga perezoso: primero se espera a su lista de secciones.
  const aTerminales = async () => {
    await pestana("Ajustes");
    await hasta(() => a.v.js(`!!document.querySelector(".set-tab")`), 20_000, 400);
    await a.v.js(`(() => { const b = [...document.querySelectorAll(".set-tab")].find((x) => x.querySelector(".set-tab-nom")?.textContent === "Terminales"); b?.click(); return !!b; })()`);
    const hay = await hasta(() => a.v.js(`[...document.querySelectorAll("label.setting-row")].some((l) => /barra de cada terminal/.test(l.textContent ?? ""))`), 10_000, 400);
    if (!hay) console.log(`      pestañas: ${await a.v.js(`[...document.querySelectorAll(".tab, .set-tab")].map((x) => (x.textContent ?? "").trim()).join(" | ")`)}`);
  };
  await aTerminales();
  dice(await pulsar(), "el interruptor está en Ajustes › Terminales");
  await pestana("Cabina");
  await dormir(600);

  const despues = await mira();
  dice(despues?.meta === false, "apagado, la zona de estado se va en caliente", JSON.stringify(despues));
  dice(despues?.proyecto === "demo" && despues.anchoProyecto > 0 && despues.anchoNombre > 0, "y quedan el proyecto y el nombre", JSON.stringify(despues));
  dice(/de memoria/.test(despues?.globo ?? ""), "lo que se fue de la barra sigue en el globo del nombre", despues?.globo);
  const guardado = await a.v.js(`localStorage.getItem("adeorq-cabecera-terminal")`);
  dice(guardado === "nombre", "se guarda en este equipo", String(guardado));
  await fotoDeLaBarra("cabecera-solo-nombre.png");

  await aTerminales();
  await pulsar();
  await pestana("Cabina");
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${id}"] .ph-meta')`), 10_000, 400);
  const otraVez = await mira();
  dice(otraVez?.meta === true, "encendido otra vez, la zona de estado vuelve", JSON.stringify(otraVez));
  dice((await a.v.js(`localStorage.getItem("adeorq-cabecera-terminal")`)) === null, "y de fábrica no queda nada guardado");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
