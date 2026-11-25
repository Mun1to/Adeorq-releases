// El tope de las terminales que abren los agentes, en una Adeorq de verdad
// (`src-tauri/src/cabida.rs`, decisión d1a213cb2ce0). Lo que mide:
//
//   · `tope-agentes.json` sembrado a {porMemoria:false, comoMucho:2} es lo que lee
//     Rust y lo que enseña Ajustes › Terminales;
//   · con ese 2, dos `open_pane` nacen y la tercera sale rechazada diciendo el 2 y
//     dónde se cambia;
//   · `close_pane` cuenta el sitio que queda con el tope fijo («el tope es 2»);
//   · con la memoria encendida (lo de fábrica) desde el mismo comando que usa
//     Ajustes, se abre otra y `close_pane` dice «como mucho 12 a la vez, y las que
//     quepan en la memoria libre», con un sitio que no pasa de lo que cabe;
//   · `cabida` mide la memoria del equipo de verdad (no ceros).
//
// Lo que NO mide: el rechazo «No cabe otra en la memoria», que pide un equipo sin
// memoria libre; ese lo fijan las pruebas de `cabida.rs` y `mcp.rs`.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   node scripts/laboratorio/tope-por-memoria-de-verdad.mjs [exe]
//
// Solo abre consolas (`shell`): no gasta cuota. Sale con 1 si algo falla.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const nombre = "tope-por-memoria";
const PUERTO = 41_000 + (process.pid % 900);
const DEPURAR = 9_600 + (process.pid % 100);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
mkdirSync(join(base, "lab-bin"), { recursive: true });
const exe = join(base, "lab-bin", "adeorq.exe");
copyFileSync(process.argv[2] ?? EXE, exe);

const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
const todo = (r) => (r.error ?? r.texto ?? "").replace(/\s+/g, " ");
const RASTRO = "Prueba del laboratorio tope-por-memoria: una consola que solo nació para contar el tope. Su parte es la salida de este laboratorio y no queda nada pendiente.";

const aislada = await abrirAislada({
  nombre,
  puertoMcp: PUERTO,
  depurar: DEPURAR,
  exe,
  sembrar: (datos) => writeFileSync(join(datos, "tope-agentes.json"), JSON.stringify({ porMemoria: false, comoMucho: 2 })),
});
const invocar = (cmd, args = {}) =>
  aislada.v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r), (e) => "ERROR " + String(e))`);

try {
  const { demo } = aislada;
  const fuera = aislada.puente(null);
  await fuera.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio-tope", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await fuera.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  await dormir(800);

  console.log("\n── Lo sembrado es lo que lee Rust y lo que enseña Ajustes");
  const leido = await invocar("tope_agentes");
  dice(leido === JSON.stringify({ porMemoria: false, comoMucho: 2 }), "Rust lee {porMemoria:false, comoMucho:2}", leido);
  await aislada.v.js(`localStorage.setItem("adeorq-ajustes-seccion", "terminales"); document.querySelector('[data-tab="ajustes"]')?.click(); "ok"`);
  const fila = await hasta(
    () =>
      aislada.v.js(`(() => {
        const f = [...document.querySelectorAll(".setting-row")].find((x) => /tus agentes a la vez/.test(x.innerText));
        const caja = [...document.querySelectorAll(".setting-row")].find((x) => /Que tus agentes abran solo/.test(x.innerText));
        if (!f || !caja) return null;
        return JSON.stringify({ rotulo: f.innerText.split("\\n")[0], valor: f.querySelector('input[type="range"]')?.value, memoria: caja.querySelector('input[type="checkbox"]')?.checked });
      })()`),
    10_000,
    300,
  );
  const enAjustes = JSON.parse(fila ?? "{}");
  dice(enAjustes.valor === "2" && enAjustes.memoria === false && /^Terminales abiertas/.test(enAjustes.rotulo ?? ""), "Ajustes › Terminales enseña la memoria apagada y el 2", fila ?? "no salió la fila");
  await aislada.foto(null, "tope-por-memoria-ajustes.png");

  console.log("\n── Con el tope fijo en 2");
  const a = await fuera.llamar("open_pane", { cli: "shell", cwd: demo, name: "tope 1" });
  const b = await fuera.llamar("open_pane", { cli: "shell", cwd: demo, name: "tope 2" });
  dice(numero(a) > 0 && numero(b) > 0, `las dos primeras nacen (${numero(a)} y ${numero(b)})`, `${todo(a).slice(0, 160)} | ${todo(b).slice(0, 160)}`);
  const c = await fuera.llamar("open_pane", { cli: "shell", cwd: demo, name: "tope 3" });
  dice(!numero(c) && /Tope alcanzado: ya hay 2 terminales vivas/.test(todo(c)) && /Ajustes › Terminales/.test(todo(c)), "la tercera sale rechazada con el 2 y dónde se cambia", todo(c));
  if (numero(c)) await fuera.llamar("close_pane", { paneId: numero(c), rastro: RASTRO });
  const cierreFijo = await fuera.llamar("close_pane", { paneId: numero(b), rastro: RASTRO });
  dice(/sitio para 1 más \(el tope es 2 a la vez\)/.test(todo(cierreFijo)), "close_pane: «sitio para 1 más (el tope es 2 a la vez)»", todo(cierreFijo));

  console.log("\n── Con la memoria encendida, como viene de fábrica");
  const fijado = await invocar("fijar_tope_agentes", { tope: { porMemoria: true, comoMucho: 12 } });
  dice(fijado === JSON.stringify({ porMemoria: true, comoMucho: 12 }), "Ajustes lo guarda en Rust", fijado);
  const cab = JSON.parse((await invocar("cabida")) || "null");
  dice(!!cab && cab.totalMb > 0 && cab.libreMb > 0 && cab.porTerminalMb >= 500 && cab.reservaMb >= 2048, "`cabida` mide la memoria de verdad", JSON.stringify(cab));
  const d = await fuera.llamar("open_pane", { cli: "shell", cwd: demo, name: "tope memoria" });
  const caben = cab?.caben ?? 0;
  if (caben >= 1) {
    dice(numero(d) > 0, `con sitio en la memoria (caben ${caben}), nace otra (${numero(d)})`, todo(d).slice(0, 200));
  } else {
    dice(/No cabe otra en la memoria/.test(todo(d)), "sin sitio en la memoria, sale rechazada diciendo por qué", todo(d));
  }
  // La que se cierra deja una viva (la primera): el sitio no pasa de 11 ni de lo que cabe.
  const cierreMem = await fuera.llamar("close_pane", { paneId: numero(d) || numero(a), rastro: RASTRO });
  const sitio = Number(/sitio para (\d+) más/.exec(todo(cierreMem))?.[1]);
  const cabenAhora = JSON.parse((await invocar("cabida")) || "null")?.caben ?? 0;
  dice(/como mucho 12 a la vez, y las que quepan en la memoria libre/.test(todo(cierreMem)), "close_pane: «como mucho 12 a la vez, y las que quepan en la memoria libre»", todo(cierreMem));
  dice(sitio <= 12 - 1 && sitio <= Math.max(caben, cabenAhora), `y el sitio (${sitio}) no pasa de 11 ni de lo que cabe (${caben} antes, ${cabenAhora} después)`);
  if (numero(d)) await fuera.llamar("close_pane", { paneId: numero(a), rastro: RASTRO });
  fuera.cerrar();
} finally {
  await aislada.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
