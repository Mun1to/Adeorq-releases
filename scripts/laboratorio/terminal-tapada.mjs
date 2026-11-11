// Tapar una terminal la desenfoca, no la apaga.
//
// Munir, 2026-11-11, con la captura de un panel negro con «terminal tapada»:
// «que lo de hide terminal sea un blur y no un blackout completo». El desenfoque
// estaba en `07-ajustes.css` desde julio, pero `TerminalPane.tsx` escondía la
// terminal con `display: none` al taparla, así que no quedaba nada que
// desenfocar.
//
// En una Adeorq aislada: una consola con texto de colores, se tapa con su botón
// del ojo y se mira que la terminal siga pintada (no `display: none`), con el
// desenfoque puesto y el letrero traducido, y que al destaparla vuelva limpia.
// Deja una foto tapada.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/terminal-tapada.mjs [exe]
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const puertoMcp = 47_000 + (process.pid % 900);
const a = await abrirAislada({ nombre: "terminal-tapada", puertoMcp, depurar: 9750 + (process.pid % 100), exe });
try {
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const r = await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Tapada", brief: "" });
  const id = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
  dice(Number.isFinite(id), "se abre una consola", r.texto);
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${id}"] .xterm')`), 20_000, 400);
  await dormir(1500);
  // Texto de sobra y con color, para que el desenfoque tenga algo que enseñar.
  for (let i = 0; i < 3; i++) {
    await agente.llamar("send_command", { paneId: id, command: "dir /s /b %WINDIR%\\System32\\drivers\\etc & echo Adeorq tapada de prueba" });
    await dormir(700);
  }
  await dormir(1200);

  const mira = () =>
    a.v.js(`(() => {
      const p = document.querySelector('[data-pane-id="${id}"]');
      const t = p?.querySelector(".pane-term");
      if (!t) return "null";
      const cs = getComputedStyle(t);
      return JSON.stringify({ tapada: p.getAttribute("data-blurred"), display: cs.display, filtro: cs.filter, alto: t.getBoundingClientRect().height, letrero: getComputedStyle(p, "::after").content });
    })()`).then((x) => JSON.parse(x ?? "null"));

  const antes = await mira();
  dice(antes?.tapada === "false" && antes.display === "block" && antes.filtro === "none", "destapada se ve limpia", JSON.stringify(antes));

  const ojo = `[...document.querySelectorAll('[data-pane-id="${id}"] .pane-btn')].find((b) => /Tapar esta terminal|Cover this terminal/.test(b.getAttribute("data-tip") ?? ""))`;
  dice(await a.v.js(`(() => { const b = ${ojo}; b?.click(); return !!b; })()`), "está el botón del ojo");
  await dormir(600);
  const tapada = await mira();
  dice(tapada?.tapada === "true", "el panel queda tapado", JSON.stringify(tapada));
  dice(tapada?.display !== "none" && tapada?.alto > 50, "la terminal sigue pintada debajo (no es un apagón)", JSON.stringify(tapada));
  dice(/blur\(18px\)/.test(tapada?.filtro ?? ""), "y desenfocada", tapada?.filtro);
  // El letrero sale del atributo traducido, no de un texto fijo en el CSS.
  dice(/^"(terminal tapada|terminal covered)"$/.test(tapada?.letrero ?? ""), "con su letrero en el idioma de la app", tapada?.letrero);

  const caja = await a.v.js(`JSON.stringify(document.querySelector('[data-pane-id="${id}"]').getBoundingClientRect())`).then((x) => JSON.parse(x));
  const foto = await a.foto({ x: caja.x, y: caja.y, width: Math.min(1400, caja.width), height: Math.min(700, caja.height) }, "terminal-tapada.png");
  console.log(`      foto: ${foto}`);

  const mostrar = `[...document.querySelectorAll('[data-pane-id="${id}"] .pane-btn')].find((b) => /Mostrar esta terminal|Show this terminal/.test(b.getAttribute("data-tip") ?? ""))`;
  await a.v.js(`(() => { const b = ${mostrar}; b?.click(); return !!b; })()`);
  await dormir(600);
  const despues = await mira();
  dice(despues?.tapada === "false" && despues.display === "block" && despues.filtro === "none", "al destaparla vuelve limpia", JSON.stringify(despues));
  agente.cerrar();
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
