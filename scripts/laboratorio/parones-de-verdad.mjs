// Que un parón de la ventana quede escrito en el rastro, con la app de verdad.
//
// Tres parones fabricados en la app aislada (`aislada.mjs`), uno por cada forma
// de quedarse quieta que vigilan `src/lib/parones.ts` y `vigia_ventana.rs`:
//   1. la página ocupada 2,5 s seguidos (un bucle en su hilo);
//   2. la página libre y los fotogramas sin salir 6 s (se retienen los
//      `requestAnimationFrame`, que es lo que pasa cuando el dibujo se para);
//   3. la página colgada 22 s, que solo puede contar Rust.
// Uno sin nadie delante, que no tiene que dejar nada, y al final el proceso de
// la página tirado de verdad, que tiene que contarlo WebView2.
// Y se lee el `rastro.log` de la pasada: cada uno tiene que dejar su línea.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (C:\ct\debug\adeorq.exe)
//   pnpm dev --host 127.0.0.1
//   node scripts/laboratorio/parones-de-verdad.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const PUERTO = 23000 + (process.pid % 2000);
const DEPURAR = 27000 + (process.pid % 2000);
let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "BIEN " : "FALLO"} ${nombre}${detalle ? `\n      ${detalle}` : ""}`);
};

const a = await abrirAislada({ nombre: "parones", puertoMcp: PUERTO, depurar: DEPURAR });
try {
  const { v, base } = a;
  const rastro = () => {
    try {
      return readFileSync(join(base, "datos", "Adeorq", "rastro.log"), "utf8");
    } catch {
      return "";
    }
  };
  const nuevas = (antes) => rastro().slice(antes.length);
  // Alguien usando la app: sin eso los parones 1 y 2 no se apuntan.
  const usar = () => v.js(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" })); "ok"`);

  // El arranque no cuenta (ARRANQUE_MS): se espera a que pase.
  await hasta(() => v.js("performance.now() > 16000"), 30_000, 500);

  console.log("\n── 1. La página ocupada 2,5 s dentro de una función de la app");
  {
    const antes = rastro();
    await usar();
    // El navegador nombra la función y el archivo del código que EMPEZÓ la
    // tarea, y solo si viene de un archivo: aquí la tarea la empieza
    // `resumirParon` (de `src/lib/parones.ts`), y lo lento va dentro, en un
    // campo que ella lee.
    await v.js(`import("/src/lib/parones.ts").then((m) => {
      const lento = { startTime: 0, duration: 1, get scripts() { const t = performance.now(); while (performance.now() - t < 2500) {} return []; } };
      setTimeout(m.resumirParon, 0, lento);
      return "ok";
    })`);
    const linea = await hasta(() => nuevas(antes).match(/.*la ventana se paró.*/)?.[0], 10_000, 300);
    ok("deja «la ventana se paró» con cuánto", /la ventana se paró 2,\d s/.test(linea ?? ""), linea ?? "(nada en el rastro)");
    ok("y qué la tuvo parada: quién lo llamó, la función y su archivo", /TimerHandler:setTimeout → resumirParon \(parones\) 2,\d s/.test(linea ?? ""), linea ?? "");
  }

  console.log("\n── 2. La página libre y los fotogramas sin salir");
  {
    await dormir(31_000); // que el apuntador vuelva a dejar escribir
    const antes = rastro();
    await usar();
    await v.js(`(() => {
      const real = window.requestAnimationFrame.bind(window);
      const retenidos = [];
      window.requestAnimationFrame = (f) => { retenidos.push(f); return 0; };
      setTimeout(() => { window.requestAnimationFrame = real; for (const f of retenidos) real(f); }, 6500);
      return "ok";
    })()`);
    const parada = await hasta(() => nuevas(antes).match(/.*sin sacar fotogramas.*/)?.[0], 12_000, 300);
    ok("deja que el dibujo se paró con la página libre", !!parada, parada ?? "(nada en el rastro)");
    const vuelta = await hasta(() => nuevas(antes).match(/.*volvió a sacar fotogramas tras.*/)?.[0], 12_000, 300);
    ok("y cuándo volvió", !!vuelta, vuelta ?? "(nada en el rastro)");
  }

  console.log("\n── 3. La página colgada 22 s");
  {
    const antes = rastro();
    // Desde un temporizador de la página, que es como se cuelga de verdad: lo que
    // se evalúa directamente por el protocolo de depuración no lo cuenta el
    // navegador como un fotograma largo de la página.
    await v.js(`(() => { setTimeout(function colgarse() { const t = performance.now(); while (performance.now() - t < 22000) {} }, 0); return "ok"; })()`);
    const parada = await hasta(() => nuevas(antes).match(/.*ventana: la página lleva \d+ s sin contestar.*/)?.[0], 30_000, 500);
    ok("Rust dice que la página no contesta", !!parada, parada ?? "(nada en el rastro)");
    ok("y que el hilo principal de la app sí contesta", /hilo principal de la app sí contesta/.test(parada ?? ""), parada ?? "");
    const vuelta = await hasta(() => nuevas(antes).match(/.*ventana: la página volvió a contestar tras (\d+) s.*/), 30_000, 500);
    ok("y cuánto estuvo parada al volver", !!vuelta && Number(vuelta[1]) >= 18, vuelta?.[0] ?? "(nada en el rastro)");
    const pagina = await hasta(() => nuevas(antes).match(/.*la ventana se paró 2\d,\d s.*/)?.[0], 10_000, 300);
    ok("y la propia página, al soltarse, dice cuánto y quién", /TimerHandler:setTimeout/.test(pagina ?? ""), pagina ?? "(la página no lo apuntó)");
  }

  console.log("\n── 4. Con nadie delante no se apunta");
  {
    // Más de un minuto sin tocarla de verdad: el parón se juzga desde que
    // empieza, así que fingir el reloj de la página ya no vale.
    await dormir(62_000);
    const antes = rastro();
    await v.js(`(() => { requestAnimationFrame(() => { const t = Date.now(); while (Date.now() - t < 1500) {} }); return "ok"; })()`);
    await dormir(5000);
    ok("un parón sin nadie usando la app no llena el rastro", !/la ventana se paró/.test(nuevas(antes)), nuevas(antes).trim() || "(nada, bien)");
  }

  console.log("\n── 5. El proceso de la página se cae");
  {
    const antes = rastro();
    // Lo que hace el protocolo de depuración es tirar el proceso de verdad: la
    // respuesta no llega nunca, por eso no se espera.
    await Promise.race([v.enviar("Page.crash").catch(() => {}), dormir(1500)]);
    const caida = await hasta(() => nuevas(antes).match(/.*ventana: se cayó el proceso de la página.*/)?.[0], 15_000, 300);
    ok("WebView2 lo cuenta y queda escrito, con el motivo", !!caida && /\(.+, código -?\d+/.test(caida), caida ?? "(nada en el rastro)");
  }
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLO(S)` : "\nTodo BIEN");
process.exit(fallos ? 1 : 0);
