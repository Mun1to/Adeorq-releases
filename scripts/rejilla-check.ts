// La rejilla del lienzo: casos que se ejecutan de verdad.
//
//   npx tsc scripts/rejilla-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/rejilla-check.js
//
// Por qué existe: `aRejilla` decide DÓNDE cae cada cosa que mueves por el
// lienzo, y un redondeo mal hecho no se ve en una captura, se ve tres semanas
// después cuando algo queda medio píxel torcido y nadie sabe por qué. Compilar
// demuestra que los tipos encajan, no que la cuenta redondee bien.
import { REJILLA, aRejilla, caminoCurvo, imantar } from "../src/lib/trazos";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
function esIgual(nombre: string, visto: number, esperado: number, detalle = "") {
  ok(nombre, visto === esperado, visto === esperado ? detalle : `esperaba ${esperado} y salió ${visto}`);
}

// --- lo básico ---------------------------------------------------------------
esIgual("el cero se queda en el cero", aRejilla(0), 0);
esIgual("un múltiplo exacto no se mueve", aRejilla(52), 52, "52 = 26 x 2");
esIgual("justo por debajo de la mitad, baja", aRejilla(12), 0);
esIgual("justo por encima de la mitad, sube", aRejilla(14), 26);
esIgual("un valor grande cae en su casilla", aRejilla(1000), 988, "1000/26 = 38,46 -> 38");

// --- la mitad exacta ---------------------------------------------------------
// Math.round sube en el empate, y da igual cuál se elija MIENTRAS SEA SIEMPRE
// LA MISMA: lo que no puede pasar es que dos piezas soltadas en el mismo sitio
// acaben en casillas distintas.
esIgual("la mitad exacta sube", aRejilla(13), 26);
ok(
  "y sube siempre igual, no a veces",
  aRejilla(13) === aRejilla(13) && aRejilla(39) === aRejilla(39),
);
esIgual("la mitad exacta de la casilla siguiente, también", aRejilla(39), 52);

// --- negativos, que es donde se rompen estas cuentas -------------------------
// El lienzo tiene coordenadas negativas en cuanto arrastras el tablero hacia
// abajo y a la derecha, así que esto NO es un caso raro: es la mitad del mapa.
esIgual("un negativo cae en su casilla", aRejilla(-52), -52);
esIgual("un negativo cerca del cero", aRejilla(-12), -0, "-0 y 0 son iguales con ===");
esIgual("un negativo por encima de la mitad", aRejilla(-40), -52);
ok(
  "la rejilla es simétrica alrededor del cero",
  Math.abs(aRejilla(-78)) === Math.abs(aRejilla(78)),
  `${aRejilla(-78)} vs ${aRejilla(78)}`,
);

// --- paso a medida -----------------------------------------------------------
esIgual("con paso propio, redondea a ese paso", aRejilla(47, 10), 50);
esIgual("con paso de 1, no cambia nada entero", aRejilla(47, 1), 47);

// --- lo que NO puede hacer nunca ---------------------------------------------
// Un paso de cero dividiría por cero y devolvería NaN, que en una coordenada
// significa que la pieza desaparece del tablero sin ningún aviso.
esIgual("con paso 0 devuelve el valor tal cual, no NaN", aRejilla(47, 0), 47);
esIgual("con paso negativo tampoco inventa", aRejilla(47, -5), 47);
ok("un NaN de entrada sale igual y no revienta", Number.isNaN(aRejilla(NaN)));
ok(
  "un infinito no se convierte en NaN",
  aRejilla(Infinity) === Infinity,
  `salió ${aRejilla(Infinity)}`,
);

// --- convive con el imán de bordes, que ya existía ---------------------------
// Son dos cosas distintas y no se pisan: `imantar` tiene umbral y se pega a lo
// que ya hay; `aRejilla` no tiene umbral y se pega a la cuadrícula.
esIgual(
  "el imán de bordes sigue respetando su umbral",
  imantar(100, [140], 8),
  100,
  "140 está a 40, fuera de los 8 de umbral",
);
esIgual("y se pega cuando sí llega", imantar(100, [104], 8), 104);
ok(
  "la rejilla NO tiene umbral: se pega aunque esté lejos",
  aRejilla(100) === 104 && aRejilla(1) === 0,
  `${aRejilla(100)} y ${aRejilla(1)}`,
);

// --- el número tiene que ser el del fondo ------------------------------------
esIgual(
  "la casilla mide lo mismo que el paso de los puntos del fondo",
  REJILLA,
  26,
  "si esto cambia, hay que cambiar el <Background gap> de CanvasView",
);

// --- la curva de las líneas y flechas ----------------------------------------
// Se prueba aquí y no en un archivo nuevo porque es la misma familia: geometría
// pura del lienzo que decide dónde cae cada cosa.
{
  const recta = caminoCurvo([0, 0, 100, 0]);
  ok(
    "con dos puntos no se inventa una curva, va recta",
    recta === "M0 0 L100 0",
    recta,
  );
  ok("sin puntos no revienta, devuelve nada", caminoCurvo([]) === "");
  ok("con un solo punto tampoco", caminoCurvo([5, 5]) === "");

  const tres = caminoCurvo([0, 0, 50, 40, 100, 0]);
  ok("con tres puntos ya es una curva", tres.includes("C"), tres);
  ok("y empieza en el primer punto", tres.startsWith("M0 0"), tres);
  ok("y termina en el último", tres.trim().endsWith("100 0"), tres);
  ok(
    "hay un tramo de curva por cada hueco entre puntos",
    (tres.match(/C/g) ?? []).length === 2,
    `${(tres.match(/C/g) ?? []).length} tramos`,
  );

  // Lo que de verdad importa: la curva PASA por los puntos que tú pusiste. Si
  // no, la flecha dejaría de tocar la terminal a la que apunta, que es
  // exactamente el fallo que este trazo no se puede permitir.
  const cuatro = caminoCurvo([0, 0, 30, 30, 60, 0, 90, 30]);
  ok(
    "la curva pasa por todos los puntos intermedios",
    cuatro.includes("30 30") && cuatro.includes("60 0") && cuatro.includes("90 30"),
    cuatro,
  );
  ok(
    "un número impar de coordenadas no rompe el camino",
    typeof caminoCurvo([0, 0, 10, 10, 20]) === "string",
  );
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
