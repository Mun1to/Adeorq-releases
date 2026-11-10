// Los parones de la ventana y el paso del orbe. Casos que se ejecutan de verdad.
//
//   pnpm bancos parones
//
// Por qué existe: el 2026-11-10 Adeorq «se congelaba a veces» y el rastro no
// decía nada, porque un parón no es un fallo y nadie lo apuntaba
// (`src/lib/parones.ts`). Si el apunte no dice QUÉ código lo tuvo parado, no
// sirve; si apunta cada parón de una mala racha, el rastro se vuelve ilegible.
// Y la causa de fondo de aquel día fue el orbe moviéndose en cada fotograma de
// la pantalla: que ningún estado vuelva a eso.
import { ARRANQUE_MS, Apuntador, ENTRE_APUNTES_MS, archivoDe, resumirParon } from "../src/lib/parones";
import { esperaEntrePasos, satelite } from "../src/components/Orbe";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` · ${detalle}` : ""}`);
}

// --- de qué archivo venía ---------------------------------------------------------
ok("quita la huella del empaquetador", archivoDe("http://tauri.localhost/assets/TerminalPane-AbC12_xy.js") === "TerminalPane", archivoDe("http://tauri.localhost/assets/TerminalPane-AbC12_xy.js"));
ok("en desarrollo, el archivo tal cual", archivoDe("http://localhost:1420/src/components/Orbe.tsx?t=123") === "Orbe");
ok("sin dirección, un interrogante", archivoDe("") === "?");
ok("la huella puede llevar un guion", archivoDe("http://tauri.localhost/assets/TerminalPane-AbC-2_xy.js") === "TerminalPane", archivoDe("http://tauri.localhost/assets/TerminalPane-AbC-2_xy.js"));
ok("un nombre con guiones y sin huella se queda entero", archivoDe("http://localhost:1420/src/lib/vigia-ventana.ts") === "vigia-ventana", archivoDe("http://localhost:1420/src/lib/vigia-ventana.ts"));

// --- la línea del parón --------------------------------------------------------------
const linea = resumirParon({
  startTime: 50_000,
  duration: 2340,
  blockingDuration: 2200,
  renderStart: 51_800,
  styleAndLayoutStart: 51_900,
  scripts: [
    { invoker: "TimerHandler:setTimeout", sourceURL: "http://tauri.localhost/assets/index-Zx9yQ1aa.js", sourceFunctionName: "Yh", sourceCharPosition: 812_345, startTime: 50_000, duration: 300 },
    { invoker: "EventListener: message", sourceURL: "http://localhost:1420/src/components/TerminalPane.tsx", sourceFunctionName: "escribir", sourceCharPosition: 4567, startTime: 50_300, duration: 1500, forcedStyleAndLayoutDuration: 400 },
    { invoker: "FrameRequestCallback", sourceURL: "", startTime: 51_800, duration: 10 },
  ],
});
ok("dice cuánto duró y cuánto estuvo ocupada la página", linea.startsWith("la ventana se paró 2,3 s, con la página ocupada 2,2 s ·"), linea);
ok("lo que más tardó va primero, con quién lo llamó y su función", linea.includes("EventListener: message → escribir (TerminalPane) 1,5 s, 400 ms de maqueta forzada"), linea);
ok("en un archivo empaquetado va la posición, que es lo que encuentra la función", linea.includes("TimerHandler:setTimeout → Yh (index:812345) 300 ms"), linea);
ok("el tercero no sale: dos bastan para saber dónde mirar", !linea.includes("FrameRequestCallback"), linea);
ok("cuenta el renderizado y, dentro, los estilos y la maqueta", linea.includes("renderizado 540 ms (estilos y maqueta 440 ms)"), linea);
const conObservador = resumirParon({
  startTime: 50_000,
  duration: 1400,
  blockingDuration: 1300,
  renderStart: 50_200,
  styleAndLayoutStart: 50_300,
  scripts: [{ invoker: "ResizeObserverCallback", sourceURL: "http://localhost:1420/src/components/TerminalPane.tsx", sourceFunctionName: "ajustar", startTime: 50_400, duration: 900 }],
});
ok("lo que corre un ResizeObserver no se cuenta dos veces como maqueta", conObservador.includes("renderizado 1,2 s (estilos y maqueta 200 ms)"), conObservador);
const dibujo = resumirParon({ startTime: 50_000, duration: 2600, blockingDuration: 120, scripts: [] });
ok("con la página casi libre dice que fue esperar al dibujo", dibujo.includes("con la página ocupada solo 120 ms: lo demás fue esperar al dibujo"), dibujo);
const sinCodigo = resumirParon({ startTime: 50_000, duration: 1200, scripts: [] });
ok("sin código propio lo dice, no lo deja en blanco", sinCodigo.includes("sin código propio a la vista"), sinCodigo);

// --- cuándo se escribe ------------------------------------------------------------------
const a = new Apuntador();
const t0 = ARRANQUE_MS + 1000;
ok("el primero se escribe", a.apuntar(t0, "uno", 1200) === "uno");
ok("uno menor que viene enseguida se calla", a.apuntar(t0 + 5000, "dos", 1000) === null);
ok("otro también", a.apuntar(t0 + 9000, "tres", 1100) === null);
const peor = a.apuntar(t0 + 12_000, "peor", 3000);
ok("uno PEOR que el último escrito no espera, y cuenta los callados", peor === "peor · y 2 parones más antes de este, el mayor de 1,1 s", String(peor));
ok("tras él, uno menor se calla", a.apuntar(t0 + 15_000, "cinco", 2000) === null);
ok("los callados no se vacían antes de tiempo", a.vaciar(t0 + 20_000) === null);
const vaciado = a.vaciar(t0 + 12_000 + ENTRE_APUNTES_MS);
ok("pasado el plazo salen solos aunque no llegue otro parón", vaciado === "la ventana se paró 1 vez más tras el último apunte, la mayor 2,0 s", String(vaciado));
ok("y no salen dos veces", a.vaciar(t0 + 12_000 + 2 * ENTRE_APUNTES_MS) === null);
const seis = a.apuntar(t0 + 12_000 + 2 * ENTRE_APUNTES_MS + 1, "seis", 1000);
ok("y empieza la cuenta de cero", seis === "seis", String(seis));
const b = new Apuntador();
b.apuntar(t0, "x", 1500);
b.apuntar(t0 + 1000, "y", 1000);
ok("al irse la página se vacía sin esperar", b.vaciar(t0 + 2000, true) === "la ventana se paró 1 vez más tras el último apunte, la mayor 1,0 s");

// --- el orbe no vuelve a ir a un paso por fotograma ----------------------------------
for (const estado of ["reposo", "escucha", "piensa", "listo"] as const) {
  const espera = esperaEntrePasos(estado);
  ok(`el orbe en «${estado}» espera ${espera} ms entre pasos (como mucho 30 por segundo)`, espera >= 33);
}
// Ni el brillo del satélite da saltos, que sin la transición de CSS se verían
// como un parpadeo al pasar por detrás.
{
  let salto = 0;
  let min = 1;
  let max = 0;
  let antes = satelite(0).brillo;
  for (let i = 1; i <= 2000; i++) {
    const { brillo } = satelite((i / 2000) * 2 * Math.PI);
    salto = Math.max(salto, Math.abs(brillo - antes));
    min = Math.min(min, brillo);
    max = Math.max(max, brillo);
    antes = brillo;
  }
  ok("el brillo del satélite cambia sin saltos en toda la vuelta", salto < 0.02, `salto máximo ${salto.toFixed(4)}`);
  ok("y llega a esconderse del todo detrás del planeta y a verse entero delante", min === 0 && max === 1, `de ${min} a ${max}`);
}

if (fallos) {
  console.log(`\n${fallos} fallo(s)`);
  process.exit(1);
}
console.log("\ntodo bien");
