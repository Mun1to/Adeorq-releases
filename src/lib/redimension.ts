// Mientras arrastras un separador, las terminales no se reajustan.
//
// El lag tenía una cadena entera detrás, y ninguno de sus eslabones era lento
// por sí solo (Munir, 2026-08-11: «hay mucho lag cuando haces el resizing y
// también automáticamente se te mueve el texto para arriba»):
//
//   arrastras 13 px  →  setCols  →  se re-renderiza el panel entero  →  el
//   ResizeObserver de CADA terminal dispara  →  fit()  →  xterm rehace el
//   reflow de todo su búfer (puede tener diez mil líneas)  →  y encima avisa
//   del tamaño nuevo al PTY, que es un salto a Rust.
//
// Con nueve terminales abiertas y el ratón moviéndose, eso son varios cientos
// de reflows y de saltos a Rust por segundo para enseñar un estado intermedio
// que nadie va a leer. Y como cada `fit()` recoloca el scroll, el historial se
// va hacia arriba: no es un fallo aparte, es el mismo.
//
// La regla, que es la de cualquier emulador de terminal decente: mientras el
// dedo está abajo se mueve solo el CSS, y el reflow se hace UNA vez al soltar.
//
// Vive fuera de React a propósito. Meterlo en un estado obligaría a re-pintar
// los nueve paneles justo en el frame que se quiere aligerar; aquí es una
// bandera en memoria y un evento, y ni App ni los paneles se enteran hasta que
// hay algo que hacer.

/** Lo que se dispara al soltar para que cada terminal se ajuste una vez. */
export const EVENTO_REFIT = "adeorq:refit";

/**
 * Cada cuánto se deja reajustar una terminal MIENTRAS se arrastra.
 *
 * El primer intento fue no reajustar en absoluto hasta soltar, y era pasarse
 * (Munir, 2026-08-11: «solo se mueve la parte de la derecha, las terminales de
 * la izquierda no se mueven»). Es exactamente lo que tenía que pasar: la
 * columna que encoge se quedaba con el texto del ancho de antes, así que se
 * veía cortado y la barra parecía mover solo un lado.
 *
 * Ochenta milisegundos son unos doce reflows por segundo en vez de sesenta y
 * pico. Se ve fluir el texto de las dos columnas mientras arrastras, y se paga
 * la quinta parte. El ajuste exacto sigue llegando al soltar.
 */
export const CADENCIA_ARRASTRE_MS = 80;

/**
 * Si toca reajustar ahora. Fuera de un arrastre, siempre; dentro, solo cuando
 * ha pasado la cadencia desde el anterior.
 */
export function tocaAjustar(ahora: number, ultimo: number, arrastrando: boolean): boolean {
  if (!arrastrando) return true;
  return ahora - ultimo >= CADENCIA_ARRASTRE_MS;
}

let arrastrando = false;
/** Hasta cuándo dura la marca de «esto lo mueve un panel». Ver `anclarColumnas`
    al final del archivo: se declara aquí porque `empezarRedimension` la borra. */
let anclaHasta = 0;

/** Si hay un separador (o el borde de la ventana) en movimiento ahora mismo. */
export function redimensionando(): boolean {
  return arrastrando;
}

export function empezarRedimension(): void {
  if (arrastrando) return;
  arrastrando = true;
  /* Y si había un anclaje en vuelo, se cae aquí. Arrastrar un separador es
     pedir columnas con la mano; si el gesto cae dentro de los cuatro décimas de
     segundo de un panel que se acaba de abrir, la terminal se pondría a
     encoger la letra en vez de dar columnas, que es lo contrario de lo pedido. */
  anclaHasta = 0;
  /* Marca en el DOM para que el CSS pueda apagar lo que cueste pintar (las
     sombras y el desenfoque del cristal) mientras dura el arrastre. */
  document.body.dataset.redim = "1";

  /* El seguro. `setPointerCapture` garantiza que el `pointerup` vuelve al
     separador, pero si el puntero se pierde de otra manera (la ventana pierde
     el foco, el navegador cancela el gesto) la bandera se quedaría puesta y
     las terminales no volverían a ajustarse NUNCA. Escuchar también en la
     ventana cuesta nada y cierra ese agujero. */
  window.addEventListener("pointerup", terminarRedimension, { once: true });
  window.addEventListener("pointercancel", terminarRedimension, { once: true });
  window.addEventListener("blur", terminarRedimension, { once: true });
}

/* ── ANCLAR LAS COLUMNAS ────────────────────────────────────────────────────
   Abrir o cerrar un panel lateral estrecha las terminales, y ahí no vale
   reajustar como siempre.

   El motivo es que los clientes de agente ENVUELVEN el texto ellos mismos, con
   saltos duros, al ancho que la terminal tenía cuando lo escribieron. Al
   estrecharse, esas líneas dejan de caber y el emulador las corta por columna,
   no por palabra: «los mante / nedores», «bor / ra». Y el texto original ya no
   existe en ninguna parte, así que nadie puede rehacer el párrafo (Munir,
   2026-08-20: «como que se desordena»).

   Medido con xterm de verdad: al pasar de 134 a 107 columnas salen palabras
   partidas; al volver a 134 se recomponen solas. O sea que el daño no está en
   el reflow, está en CAMBIAR de columnas.

   Por eso, cuando el ancho lo cambia un panel y no la mano de nadie, las
   columnas se quedan como estaban y lo que se ajusta es el tamaño de la letra.
   Munir eligió este trato sabiendo el precio: «no estropea nada y se ve todo el
   texto». La alternativa era que el panel flotara encima tapando una franja.

   Solo se ancla el cambio del PANEL. Arrastrar un separador o redimensionar la
   ventana siguen dando columnas, que es justo lo que se pide con ese gesto. */

/** Cuánto dura la marca. Un panel que aparece o desaparece se lleva dos o tres
    frames en asentar el layout; con menos, el reajuste bueno llegaba después de
    que la marca hubiera caducado y el anclaje no servía de nada. */
export const ANCLA_MS = 400;

/** Si el cambio de tamaño de ahora mismo viene de un panel lateral. */
export function anclando(ahora = Date.now()): boolean {
  return ahora < anclaHasta;
}

/**
 * Avisa de que lo que va a cambiar el ancho es un panel, no una mano.
 *
 * Se llama ANTES de tocar el estado: entre eso y el reajuste caben varios
 * frames, y la marca tiene que estar puesta cuando llegue cualquiera de ellos,
 * venga del ResizeObserver o del evento de refit.
 */
export function anclarColumnas(ahora = Date.now()): void {
  anclaHasta = ahora + ANCLA_MS;
  requestAnimationFrame(() => window.dispatchEvent(new Event(EVENTO_REFIT)));
}

/**
 * Qué tamaño de letra hace que quepan las columnas de antes.
 *
 * Se razona con COLUMNAS y no con píxeles a propósito: `proposeDimensions()` ya
 * descuenta el relleno de la caja y la barra de scroll, así que preguntarle
 * cuántas caben con la letra de ahora y hacer una regla de tres sale exacto y
 * no duplica esa aritmética.
 *
 * El techo es el tamaño que la terminal tendría sin anclar (el de Ajustes, o el
 * que calcula la letra automática): al cerrar el panel hay que volver a él y no
 * pasarse. El suelo es el mínimo legible; si para conservar las columnas hiciera
 * falta bajar de ahí, se deja reflowar, que es feo pero se lee.
 */
export function fuenteAnclada(
  colsQueCaben: number,
  colsObjetivo: number,
  fuenteActual: number,
  minimo: number,
  techo: number,
): number {
  // Sin medida no se decide: se deja la letra como está. Volver al techo sería
  // devolverle las columnas al ancho nuevo, que es justo lo que parte el texto,
  // y hacerlo encima por no haber podido medir.
  if (colsQueCaben <= 0 || colsObjetivo <= 0 || fuenteActual <= 0) {
    return fuenteActual > 0 ? Math.max(minimo, Math.min(techo, fuenteActual)) : techo;
  }
  const bruta = (fuenteActual * colsQueCaben) / colsObjetivo;
  // Un decimal, y hacia ABAJO. Fraccionario porque xterm lo acepta y con
  // enteros el salto de 14 a 13 ya se lleva por delante seis columnas. Y hacia
  // abajo porque el error tiene un lado bueno: quedarse corto de letra deja una
  // columna de sobra, y quedarse largo deja una de menos, que es exactamente lo
  // que parte la palabra que veníamos a salvar.
  const redondeada = Math.floor(bruta * 10) / 10;
  /* Y si la cuenta se queda pegada al techo, se pega del todo. Los dos redondeos
     (este y el de columnas enteras de `proposeDimensions`) tiran hacia abajo, así
     que el viaje de vuelta aterrizaba en 11,9 en vez de en los 12 de Ajustes, y
     ahí se quedaba hasta que algo sin relación volviera a medir. Una décima no se
     ve, pero un tamaño de letra que ya no es el que elegiste, sí. */
  if (techo - redondeada > 0 && techo - redondeada <= 0.15) return techo;
  return Math.max(minimo, Math.min(techo, redondeada));
}

/* -- LA LETRA AUTOMATICA, Y SU OTRO EXTREMO -------------------------------
   Nueve paneles en pantalla significa que cada uno es estrecho, y por debajo de
   unas 76 columnas las cajas que dibuja un CLI se convierten en pure. Por eso
   el tamano de Ajustes es un TECHO: un panel apretado baja la letra hasta que
   la linea vuelve a caber. Eso llevaba puesto desde el principio y funciona.

   Lo que no estaba es el extremo contrario, y es de donde salia el hueco negro
   que reporto Munir el 2026-08-20 con una terminal maximizada. Medido con xterm
   de verdad, con su Ajustes en 17 px:

       panel de  222 px  ->  letra  9 px  ->   42 columnas
       panel de  356 px  ->  letra  9 px  ->   69 columnas
       panel de  890 px  ->  letra 17 px  ->   93 columnas
       panel de 1780 px  ->  letra 17 px  ->  188 columnas   <-- aqui

   La letra sabia bajar pero no subir: al llegar al techo de Ajustes se quedaba
   ahi y las columnas se disparaban. Y 188 columnas no las quiere nadie, por dos
   motivos que se suman. El primero es el que se ve: el texto que el CLI ya
   habia escrito a 42 columnas se queda a 42 y deja el 77 % de la pantalla en
   negro, porque ese texto lleva saltos de linea DUROS y no hay forma de
   rehacerlo (todo el porque, arriba, en ANCLAR LAS COLUMNAS). El segundo es el
   que se sufre luego: lo que el agente escriba a partir de entonces sale en
   lineas de 188 caracteres, que se leen fatal.

   Asi que la letra automatica gana un techo de COLUMNAS. Si en el hueco caben
   mas de `MAX_COLS`, la letra sube hasta que quepan justo esas: el texto viejo
   ocupa mucho mas ancho y el nuevo nace legible. Solo con la letra automatica
   puesta, que es el modo donde Munir ya dijo "decide tu"; con un tamano fijo
   elegido a mano, manda el suyo y no se toca. */

/** Las columnas objetivo cuando el panel es estrecho: el suelo de legibilidad
    de las cajas que dibujan los CLI. */
export const TARGET_COLS = 76;
/** Y el techo, cuando sobra sitio. Ciento diez columnas es una linea larga pero
    todavia comoda; a partir de ahi la letra sube en vez de dar mas rejilla. */
export const MAX_COLS = 110;
/**
 * Ancho de celda de Cascadia Mono como fraccion del tamano de letra.
 *
 * Estaba en 0,6 desde el principio, a ojo, y esta MEDIDO en 0,55: se montaron
 * nueve terminales de xterm de verdad (9, 12, 14, 17, 20, 24, 27, 30 y 34 px,
 * con el `lineHeight: 1.2` y el `letterSpacing: 0.2` de la app) y se dividio el
 * ancho real de `.xterm-screen` entre sus columnas. Salio 0,5497 - 0,5500 en
 * los NUEVE, sin desviarse.
 *
 * El 0,6 no daba la cara mientras la letra solo sabia bajar, porque ahi
 * pasarse de ancho es conservador: calcula menos columnas de las que caben y
 * la letra sale un poco mas pequena de lo necesario, que no rompe nada. En el
 * techo de columnas el mismo error va justo al reves y se lo come entero: la
 * letra sale corta y caben mas columnas de las que se querian. Medido antes de
 * corregirlo: 117 columnas donde el techo pedia 110.
 */
export const CELL_RATIO = 0.55;

/**
 * El tamano de letra para un hueco de `ancho` pixeles.
 *
 * `techo` es el de Ajustes. Con la letra automatica apagada se devuelve tal
 * cual, porque entonces el numero lo eligio una persona.
 */
export function fuenteAuto(
  ancho: number,
  techo: number,
  auto: boolean,
  minimo: number,
): number {
  if (!auto || ancho <= 0) return techo;
  // Lo de siempre: bajar hasta que quepan las columnas objetivo.
  const cabe = Math.floor(ancho / (TARGET_COLS * CELL_RATIO));
  if (cabe < techo) return Math.max(minimo, cabe);
  /* Y lo nuevo: si con el techo de Ajustes caben mas de MAX_COLS, subir la
     letra hasta dejarlas en MAX_COLS.

     Hacia ARRIBA, y esto lo cazo la prueba y no el ojo: redondeando hacia abajo
     la letra sale un pelin mas pequena de la cuenta exacta, y con la letra mas
     pequena caben MAS columnas, que es justo lo que se venia a evitar. Salian
     114 y 115 donde el techo son 110. Una decima de letra de mas no se ve; cinco
     columnas de mas son cinco columnas de mas. */
  const conElTecho = Math.floor(ancho / (techo * CELL_RATIO));
  if (conElTecho <= MAX_COLS) return techo;
  return Math.max(techo, Math.ceil(ancho / (MAX_COLS * CELL_RATIO)));
}

export function terminarRedimension(): void {
  if (!arrastrando) return;
  arrastrando = false;
  delete document.body.dataset.redim;
  window.removeEventListener("pointerup", terminarRedimension);
  window.removeEventListener("pointercancel", terminarRedimension);
  window.removeEventListener("blur", terminarRedimension);
  /* Ahora sí: un solo ajuste, con el tamaño definitivo. En el frame siguiente
     porque el layout de la última posición puede no estar aplicado todavía. */
  requestAnimationFrame(() => window.dispatchEvent(new Event(EVENTO_REFIT)));
}
