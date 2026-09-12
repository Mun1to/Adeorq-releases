// El scroll de las terminales, que se iba solo.
//
//   npx tsc scripts/scroll-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/scroll-check.js

import {
  esDelRaton,
  esRespuestaDelTerminal,
  esUnSalto,
  GESTO_RECIENTE_MS,
  SALTO_SOSPECHOSO,
  gestoDeRueda,
  hayQueAjustar,
  hayQueRecolocar,
  trasBorrarScrollback,
  trasGestoParaCongelar,
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

/* -- EL GESTO SE LEE DEL EVENTO, NUNCA DEL BUFER (decimo reporte) ----------
   La 0.9.124 media el gesto comparando viewportY antes y despues del frame, y
   si el borrado caia entre las dos lecturas la diferencia era el colapso del
   bufer entero: 617-67 = 550 renglones contados como una rueda de tres.

   La conversion replica la ruta viva de xterm: tics = wheelDeltaY/120, 50 px
   por tic, Alt x5, Shift horizontal. Y devuelve renglones CON decimales, que
   `pendiente` acumula y se redondean UNA vez al colocar: xterm redondea la
   posicion, no cada gesto, y redondear cada evento inflaba un flick de
   trackpad (decenas de eventos de fraccion de celda) de ~24 renglones reales
   a 60 contados, ademas de perder los tics suaves hacia abajo. */

const ticArriba = { deltaY: -100, deltaMode: 0, wheelDeltaY: 120 };
const ticAbajo = { deltaY: 100, deltaMode: 0, wheelDeltaY: -120 };
ok(
  "un tic de rueda arriba son los 50 px de xterm: 2,5 renglones con celda de 20",
  gestoDeRueda(ticArriba, 20) === 2.5,
  `salio ${gestoDeRueda(ticArriba, 20)}`,
);
ok(
  "y el mismo tic hacia abajo, los mismos 2,5 hacia abajo",
  gestoDeRueda(ticAbajo, 20) === -2.5,
);
// La simetria importa: con el redondeo por evento de antes, subir y bajar el
// mismo tic dejaba +1 renglon de deriva (ceil hacia arriba, floor hacia abajo).
ok(
  "subir y bajar lo mismo te deja donde estabas",
  trasRueda(trasRueda(0, gestoDeRueda(ticArriba, 20)) ?? 0, gestoDeRueda(ticAbajo, 20)) === 0,
);
ok(
  "un tic suave de trackpad cuenta su fraccion: ni se pierde ni se infla",
  gestoDeRueda({ deltaY: -8, deltaMode: 0, wheelDeltaY: 12 }, 20) === 0.25,
  `salio ${gestoDeRueda({ deltaY: -8, deltaMode: 0, wheelDeltaY: 12 }, 20)}`,
);
ok(
  "Alt acelera por cinco, como xterm",
  gestoDeRueda({ ...ticArriba, alt: true }, 20) === 12.5,
);
ok(
  "Shift es scroll horizontal para xterm: aqui no se apunta nada",
  gestoDeRueda({ ...ticArriba, shift: true }, 20) === 0,
);
ok(
  "sin wheelDeltaY, los pixeles se pasan a tics como xterm (deltaY/40)",
  gestoDeRueda({ deltaY: -120, deltaMode: 0 }, 20) === 7.5,
  `salio ${gestoDeRueda({ deltaY: -120, deltaMode: 0 }, 20)}`,
);
ok(
  "en modo lineas, un delta de linea es un tic (asi lo lee xterm fuera de Firefox)",
  gestoDeRueda({ deltaY: -3, deltaMode: 1 }, 20) === 7.5,
);
ok(
  "con una celda rota no se inventa nada",
  gestoDeRueda(ticArriba, 0) === 0,
);

// ── El panel táctil ya no pausa la terminal con un roce ────────────────────
//
// Munir, 2026-08-30: «no me gusta nada el scroll en las terminales con el panel
// táctil del portátil». Un trackpad manda dos o tres píxeles por evento, o sea
// fracciones de renglón; la condición vieja (`deltaY < 0`) congelaba con el
// primero, y la terminal se quedaba en «Pausada» sin haberse movido.

/** Pasar una ráfaga de eventos, como la que manda un dedo en el trackpad. */
function rafaga(deltas: number[], celda = 20): { subido: number; congelo: boolean } {
  let subido = 0;
  let congelo = false;
  for (const dy of deltas) {
    const movido = gestoDeRueda({ deltaY: dy, deltaMode: 0 }, celda);
    const r = trasGestoParaCongelar(subido, movido);
    subido = r.subido;
    if (r.congelar) congelo = true;
  }
  return { subido, congelo };
}

ok(
  "un roce del trackpad hacia arriba NO pausa la terminal",
  !rafaga([-3, -3, -3]).congelo,
  `subido ${rafaga([-3, -3, -3]).subido.toFixed(3)} renglones`,
);
ok(
  "un roce arriba y abajo se queda en cero: el dedo apoyado no cuenta",
  !rafaga([-3, -3, 3, 3, -2, 2]).congelo && rafaga([-3, -3, 3, 3, -2, 2]).subido === 0,
);
ok(
  "un gesto de verdad con el trackpad SI pausa",
  rafaga([-4, -4, -4, -4, -4, -4, -4, -4, -4]).congelo,
);
ok(
  "un clic de rueda de raton pausa al instante, como antes",
  rafaga([-100]).congelo,
);
ok("bajar no pausa nunca, por mucho que bajes", !rafaga([100, 100, 100]).congelo);
ok("y lo acumulado no se va por debajo de cero", rafaga([100, 100]).subido === 0);
ok(
  "shift es scroll horizontal: no pausa aunque el delta sea grande",
  !trasGestoParaCongelar(0, gestoDeRueda({ deltaY: -300, deltaMode: 0, shift: true }, 20))
    .congelar,
);

// ── EL CLIC QUE BAJABA LA TERMINAL (undécimo reporte, 2026-09-10) ───────────
// Munir: «hago clic en otra terminal que estaba scrolleada arriba y se vuelve
// abajo sola». Con el modo ratón activo, un clic viaja por `onData` igual que
// una tecla, y bajar por eso es el fallo. Medido en un navegador de verdad:
// mirando la 100 de 189, un mousedown entregaba `\x1b[<0;5;2M` y saltaba a 189.
ok("un clic en SGR es del raton", esDelRaton("\x1b[<0;5;2M"));
ok("y soltarlo tambien", esDelRaton("\x1b[<0;5;2m"));
ok(
  "el par entero que llega de un clic, junto",
  esDelRaton("\x1b[<0;5;2M\x1b[<0;5;2m"),
  "xterm puede entregar la pulsación y la soltada en la misma tanda",
);
ok("arrastrar con el boton pulsado tambien", esDelRaton("\x1b[<32;10;4M"));
ok("la codificacion vieja de tres bytes, tambien", esDelRaton("\x1b[M !!"));
ok("una tecla NO es del raton", !esDelRaton("a"));
ok("un Enter tampoco", !esDelRaton("\r"));
ok("ni una flecha", !esDelRaton("\x1b[A"));
ok("ni un pegado largo", !esDelRaton("git status\r"));
ok("nada no es del raton", !esDelRaton(""));
ok(
  "raton MAS una tecla cuenta como tecleo",
  !esDelRaton("\x1b[<0;5;2Ma"),
  "si en la misma tanda viene una tecla, es que además estás escribiendo: hay que bajar",
);
ok(
  "una respuesta del terminal no se confunde con un clic",
  !esDelRaton("\x1b[?1;2c"),
  "el ratón es otra cosa: de las respuestas se encarga esRespuestaDelTerminal",
);

// --- lo que el terminal contesta solo, que tampoco es escribir ---------------
//
// Todo esto sale por `onData`, igual que una tecla, y hasta la 0.9.159 se
// trataba como tecleo: bajaba la terminal al final, la marcaba como «se está
// escribiendo aquí» y devolvía al mosaico un panel maximizado. El aviso de foco
// es el caro: pinchar de un panel a otro son dos, uno por terminal.
ok("el aviso de que el panel gana el foco", esRespuestaDelTerminal("\x1b[I"));
ok("y el de que lo pierde", esRespuestaDelTerminal("\x1b[O"));
ok(
  "los dos juntos, que es lo que llega al cambiar de panel",
  esRespuestaDelTerminal("\x1b[O\x1b[I"),
);
ok(
  "quién eres (XTVERSION), de lo que depende cómo desplaza Claude Code",
  esRespuestaDelTerminal("\x1bP>|xterm.js(6.1.0-beta.302)\x1b\\"),
);
ok("la identidad del terminal (DA1)", esRespuestaDelTerminal("\x1b[?1;2c"));
ok("dónde está el cursor (DSR)", esRespuestaDelTerminal("\x1b[24;80R"));
ok("y su forma con prefijo", esRespuestaDelTerminal("\x1b[?24;80R"));
ok("si un modo está puesto (DECRPM)", esRespuestaDelTerminal("\x1b[?2026;2$y"));
ok("las banderas del teclado de kitty", esRespuestaDelTerminal("\x1b[?0u"));
ok(
  "un color del tema por OSC, que acaba en campana",
  esRespuestaDelTerminal("\x1b]11;rgb:0d/15/24\x07"),
);
ok("y el mismo acabado en ST", esRespuestaDelTerminal("\x1b]11;rgb:0d/15/24\x1b\\"));

ok("una tecla NO es una respuesta", !esRespuestaDelTerminal("a"));
ok("un Enter tampoco", !esRespuestaDelTerminal("\r"));
ok(
  "y una FLECHA tampoco, que se parece mucho",
  !esRespuestaDelTerminal("\x1b[A"),
  "ESC[A es subir el cursor: lo teclea quien busca el comando anterior",
);
ok("ni Inicio ni Fin", !esRespuestaDelTerminal("\x1b[H") && !esRespuestaDelTerminal("\x1b[F"));
ok("ni un Escape suelto", !esRespuestaDelTerminal("\x1b"));
ok(
  "ni ESC[R ni ESC[u, que sin número dentro son teclas",
  !esRespuestaDelTerminal("\x1b[R") && !esRespuestaDelTerminal("\x1b[u"),
  "por eso el patrón exige al menos un dígito: la respuesta de verdad lleva la posición",
);
ok("ni nada", !esRespuestaDelTerminal(""));
ok(
  "respuesta MÁS una tecla cuenta como tecleo",
  !esRespuestaDelTerminal("\x1b[Ia"),
  "si en la misma tanda viene una tecla, es que además estás escribiendo",
);
ok(
  "un clic no es una respuesta (cada uno por su camino)",
  !esRespuestaDelTerminal("\x1b[<0;5;2M"),
);

// --- el testigo del salto -----------------------------------------------------
//
// No arregla el salto: lo atrapa. Trece reportes del mismo síntoma y seis causas
// distintas; desde este escritorio no se puede sintetizar un gesto de rueda, así
// que cada vuelta se diagnosticó leyendo código. Esto deja el número en el rastro
// cuando pasa de verdad. Lo que se mide es la DISTANCIA AL FINAL, no la posición:
// mientras llega texto la posición sube sola en cada línea y eso es lo normal.
ok(
  "alejarse doce renglones del final sin tocar nada es un salto",
  esUnSalto(3, 3 + SALTO_SOSPECHOSO, GESTO_RECIENTE_MS + 1)?.renglones === SALTO_SOSPECHOSO,
);
ok(
  "y se apunta CUÁNTO, que es el dato que faltaba",
  esUnSalto(8, 320, 5000)?.renglones === 312,
);
ok(
  "un salto justo después de tu gesto NO se apunta",
  esUnSalto(3, 300, GESTO_RECIENTE_MS - 1) === null,
  "el reflow de un gesto llega en el frame siguiente; sería culparte a ti",
);
ok(
  "acercarse al final no es el síntoma",
  esUnSalto(300, 0, 5000) === null,
  "eso es la terminal volviendo al día, que es lo que se quiere",
);
ok(
  "seguir el final mientras llega texto tampoco",
  esUnSalto(0, 0, 5000) === null,
  "la posición sube en cada línea, pero la distancia al final no se mueve",
);
ok(
  "un ajuste pequeño tampoco",
  esUnSalto(4, 4 + SALTO_SOSPECHOSO - 1, 5000) === null,
  "el reflow de un panel que cambia de alto mueve unos pocos renglones",
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
