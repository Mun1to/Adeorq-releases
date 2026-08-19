// El scroll de las terminales, que se iba solo.
//
//   npx tsc scripts/scroll-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/scroll-check.js

import {
  hayQueAjustar,
  hayQueRecolocar,
  trasBorrarScrollback,
  trasRueda,
  volverA,
} from "../src/lib/scrollTerm";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// --- cuándo se ajusta --------------------------------------------------------
ok(
  "si la rejilla queda igual NO se toca nada (el fallo que movia el scroll)",
  hayQueAjustar({ cols: 120, rows: 30 }, { cols: 120, rows: 30 }) === false,
);
ok(
  "una fila mas si obliga a ajustar",
  hayQueAjustar({ cols: 120, rows: 30 }, { cols: 120, rows: 31 }) === true,
);
ok(
  "y una columna mas tambien",
  hayQueAjustar({ cols: 120, rows: 30 }, { cols: 121, rows: 30 }) === true,
);
ok(
  "sin medida propuesta no se ajusta, en vez de ajustar a cero",
  hayQueAjustar({ cols: 120, rows: 30 }, undefined) === false &&
    hayQueAjustar({ cols: 120, rows: 30 }, { cols: 0, rows: 0 }) === false,
);

// --- adonde se vuelve --------------------------------------------------------
ok(
  "viendo el final, se vuelve al final aunque hayan entrado lineas",
  volverA({ baseY: 500, viewportY: 500 }, 540) === null,
);
ok(
  "leyendo hacia arriba, se conserva la distancia al final",
  volverA({ baseY: 500, viewportY: 488 }, 540) === 528,
  "12 lineas por encima del final, antes y despues",
);
ok(
  "si el texto encoge al rehacerse, no se sale por arriba",
  volverA({ baseY: 500, viewportY: 100 }, 60) === 0,
  "400 por encima del final en un buffer que ahora tiene 60",
);
ok(
  "arriba del todo sigue estando arriba del todo cuando cabe",
  volverA({ baseY: 500, viewportY: 0 }, 500) === 0,
);
// Mientras llega texto, viewportY puede ir por delante de baseY un instante.
ok(
  "un viewport adelantado cuenta como estar al final, no como saltar",
  volverA({ baseY: 500, viewportY: 503 }, 540) === null,
);
ok(
  "una terminal recien abierta, sin historial, no se mueve",
  volverA({ baseY: 0, viewportY: 0 }, 0) === null,
);

// --- el salto que Munir reporto TRES veces (7 y 10 de agosto, y el 14) --------
// Cuando solo cambia el ALTO del panel, el texto NO se re-envuelve: las lineas
// son las mismas. Mantener la distancia al final te mueve exactamente lo que
// haya crecido el panel, y hacia arriba, que es lo que el veia.
ok(
  "mismo ancho y panel MAS ALTO: la linea de arriba no se mueve",
  volverA({ baseY: 500, viewportY: 480 }, 494, true) === 480,
  "el panel gano 6 filas; con la regla vieja habria saltado a 474",
);
ok(
  "y con la regla vieja ese mismo caso SI saltaba",
  volverA({ baseY: 500, viewportY: 480 }, 494) === 474,
  "6 lineas hacia arriba sin que nadie tocara nada",
);
ok(
  "mismo ancho y panel MAS BAJO: tampoco se mueve",
  volverA({ baseY: 500, viewportY: 480 }, 512, true) === 480,
);
ok(
  "estar al final manda sobre todo lo demas, tambien con el ancho igual",
  volverA({ baseY: 500, viewportY: 500 }, 494, true) === null,
);
ok(
  "si el panel crece tanto que ya no hay donde bajar, se topa en el final",
  volverA({ baseY: 500, viewportY: 480 }, 300, true) === 300,
);
ok(
  "cambiar el ANCHO sigue guardando la distancia al final, que es lo correcto",
  volverA({ baseY: 500, viewportY: 488 }, 540, false) === 528,
  "ahi el texto SI se re-envuelve y el numero de linea ya no significa lo mismo",
);

// --- la segunda pasada, que es la que arregla el salto ------------------------
// El div de scroll de xterm se resincroniza solo en el frame siguiente y pisaba
// lo que acababamos de colocar. Se recoloca, pero solo si hace falta.
ok(
  "si el viewport se subio solo, se vuelve a bajar",
  hayQueRecolocar(null, { baseY: 540, viewportY: 300 }),
  "queriamos el final y acabamos 240 lineas mas arriba",
);
ok(
  "si ya esta al final, no se toca (ni un tiron)",
  !hayQueRecolocar(null, { baseY: 540, viewportY: 540 }),
);
ok(
  "un viewport adelantado tampoco se recoloca",
  !hayQueRecolocar(null, { baseY: 540, viewportY: 542 }),
);
ok(
  "una linea concreta que se movio, se recoloca",
  hayQueRecolocar(528, { baseY: 540, viewportY: 400 }),
);
ok(
  "un renglon de margen no cuenta: el reflow deja a uno de distancia",
  !hayQueRecolocar(528, { baseY: 540, viewportY: 529 }),
  "recolocar por una linea da un tiron peor que el fallo",
);
ok(
  "dos renglones ya no son el reflow, son un salto",
  hayQueRecolocar(528, { baseY: 540, viewportY: 530 }),
);
ok(
  "terminal vacia: nada que recolocar",
  !hayQueRecolocar(null, { baseY: 0, viewportY: 0 }),
);

/* ── Cuando el CLI borra el scrollback y lo repinta (2026-08-19) ─────────
   La tercera causa distinta del mismo síntoma. Claude Code no escribe al final:
   en cada turno borra pantalla y scrollback y repinta la conversación entera
   (confirmado por los mantenedores de xterm, issue #5620, que además dicen que
   no piensan tocarlo). Aquí se conserva la DISTANCIA al final y no la línea,
   porque tras el repintado los números de línea ya no significan lo mismo:
   medido, `baseY` pasó de 577 a 617 con el mismo texto delante. */

ok(
  "estabas a 8 del final: vuelves a 8 del final",
  trasBorrarScrollback(8, 617) === 609,
  `salió ${trasBorrarScrollback(8, 617)}`,
);
ok(
  "estando al final no se toca nada",
  trasBorrarScrollback(0, 617) === null,
);
ok(
  "ni con distancia negativa, que pasa mientras llega texto",
  trasBorrarScrollback(-3, 617) === null,
);
ok(
  "si el repintado deja MENOS texto del que había, no te manda a negativo",
  trasBorrarScrollback(500, 20) === 0,
  `salió ${trasBorrarScrollback(500, 20)}`,
);
ok(
  "un buffer que se queda vacío tampoco",
  trasBorrarScrollback(8, 0) === 0,
);
ok(
  "y con MÁS texto del que había, la distancia se respeta igual",
  trasBorrarScrollback(8, 2000) === 1992,
);
// El caso que separa esta regla de `volverA` con mismoAncho: allí se conserva
// la LÍNEA, aquí la DISTANCIA. Con el mismo dato dan sitios distintos, y por
// eso son dos funciones y no una con un parámetro más.
ok(
  "no es lo mismo que conservar la línea",
  trasBorrarScrollback(8, 617) !== volverA({ baseY: 577, viewportY: 569 }, 617, true),
  `${trasBorrarScrollback(8, 617)} frente a ${volverA({ baseY: 577, viewportY: 569 }, 617, true)}`,
);


/* -- LA RUEDA MIENTRAS EL REPINTADO ESTA EN VUELO --------------------------
   El noveno reporte (2026-08-19): «sigue el salto cuando haces solo un pequeno
   scroll para arriba». Durante el repintado la rueda no te lleva a una linea,
   te aleja del final, porque la linea a la que te llevaria se refiere a un
   bufer que en medio segundo pasa de 87 renglones a 617. */

ok(
  "estabas al final y subes tres: quieres estar a tres del final",
  trasRueda(0, 3) === 3,
);
ok(
  "estabas a ocho y subes tres: once",
  trasRueda(8, 3) === 11,
);
ok(
  "y si bajas, te acercas",
  trasRueda(11, -4) === 7,
);
ok(
  "bajar mas de lo que subiste te deja al final, no en negativo",
  trasRueda(3, -9) === 0,
);
ok(
  "sin repintado en vuelo, la rueda no apunta nada",
  trasRueda(null, 3) === null,
);
// Y el encaje de las dos reglas, que es lo que arregla el caso de Munir: el
// borrado apunta cero (estaba al final), la rueda lo sube a tres, y al terminar
// el repintado se coloca a tres del final de 617.
ok(
  "el caso entero: cero al borrar, tres de rueda, y acabas en la 614",
  trasBorrarScrollback(trasRueda(0, 3) ?? 0, 617) === 614,
  `salio ${trasBorrarScrollback(trasRueda(0, 3) ?? 0, 617)}`,
);
// Y el que NO tiene que moverse: al final y sin tocar nada.
ok(
  "al final y sin tocar la rueda, nada se mueve",
  trasBorrarScrollback(trasRueda(0, 0) ?? 0, 617) === null,
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
