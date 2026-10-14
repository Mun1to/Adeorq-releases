/**
 * EL GUION. Es el único archivo que hay que tocar para cambiar el vídeo.
 *
 * Aquí está TODO lo que se lee y lo que se DICE, en los dos idiomas, y la
 * lista de tramos con lo que dura cada uno. El montaje, las transiciones, los
 * tiempos, dónde suena cada efecto (`tiempos.ts`) y hasta la página que Munir
 * lee en voz alta para grabar (`guion-voz.mjs`) salen de esta lista, así que
 * añadir, quitar o reordenar tramos es editar aquí y nada más.
 *
 * No hay un vídeo en español y otro en inglés: hay uno, y cada frase es un par
 * `{ es, en }`. Si a una le falta un idioma, TypeScript no compila.
 *
 * ESTÁ ESCRITO POR TIEMPOS, NO POR PANTALLAS (2026-10-13). El corte anterior
 * eran un problema, la respuesta y tres capítulos con diez pantallas, 1:35, y
 * Munir cerró la duración con sus 21 referencias medidas: «Solo la corta, de
 * 45 a 60 segundos», de una tirada y sin capítulos. No se recortó: se rehízo.
 *
 *    0:00  el problema y el giro   solo texto, en primera persona
 *    0:10  el nombre               el logotipo, que es Adeo
 *    0:12  el producto             cinco funciones, la app a pantalla completa
 *    0:42  Adeo
 *    0:52  el cierre               una sola cosa que hacer
 *
 * La misma tabla, con lo que se ve y se lee en cada tramo, está en el README.
 * Si se cambia aquí, se cambia allí.
 *
 * LO QUE SE LEE va de dos a siete palabras por pantalla, entra palabra a
 * palabra y lleva UNA sola en color: la que va entre asteriscos.
 *
 * LA VOZ. Cada tramo lleva en `voz` lo que se dice mientras está en pantalla.
 * Hoy la pieza va sin ella; cuando Munir la grabe manda ella, y el tramo dura
 * lo que dure su frase.
 *
 * Las duraciones van en múltiplos de 2,5 segundos, que es un compás de la
 * música (`sonido.mjs`, 96 pulsos): así cada corte cae en el primer tiempo.
 *
 * LAS IMÁGENES son las de `web/assets/screens/es` y `/en`: la app de verdad
 * sobre un taller de demostración, así que se pueden publicar. Se traen con
 * `pnpm capturas`. Si cambia el reparto de una pantalla, sus `focos` (que van
 * en fracciones de la captura) hay que volver a mirarlos.
 */

export const IDIOMAS = ["es", "en"] as const;
export type Idioma = (typeof IDIOMAS)[number];
/** Una misma frase en cada idioma. */
export type Frase = Record<Idioma, string>;

/** Los ánimos de Adeo son los de la app: salen de `src/lib/mascota.ts`. */
export type Animo = keyof typeof import("../../src/lib/mascota").GUIONES;

type Comun = {
  /** Su nombre: para encontrarlo aquí, para que React lo distinga y para el
      archivo de su voz (`public/voz/<idioma>/<id>.wav`). */
  id: string;
  /** Segundos desde que entra hasta que entra el siguiente. */
  dura: number;
  /** Lo que se dice, frase a frase. */
  voz: Frase[];
};

/** Solo texto: frases que se relevan en el centro del cuadro. Un `\n` parte
    la frase en dos renglones. Si lleva voz, una frase de voz por línea. */
export type EscenaTexto = Comun & { tipo: "texto"; lineas: Frase[] };

/**
 * Una función de una pantalla: dónde está en la captura y qué se dice de ella.
 * La cámara se acerca a ese trozo, lo demás se apaga y la frase sale a su lado.
 */
export type Foco = {
  /** El trozo de la captura: izquierda, arriba, ancho y alto, de 0 a 1. Se
      mide sobre la imagen, y vale igual para la de cada idioma. Cuanto más
      pequeño, más se acerca la cámara (hasta 2,6 aumentos). */
  en: readonly [number, number, number, number];
  /** Qué se cuenta de esa función: a ser posible, lo que se ve en ella.
      Menos de 36 letras. */
  dato: Frase;
  /** Si está, el puntero va a ese punto de la captura (x, y, de 0 a 1) y
      hace clic: es lo que hace que se vea usar la función y no solo mirarla. */
  clic?: readonly [number, number];
};

export type EscenaPantalla = Comun & {
  tipo: "pantalla";
  /** El archivo dentro de `public/pantallas/<idioma>/`. */
  imagen: string;
  /** Cómo se llama esa pestaña en la app. No sale en el vídeo: es para la
      página del guion y para el hueco de una captura que falta. */
  nombre: Frase;
  /** La frase grande, que sale en el centro del cuadro antes de que la
      cámara entre. */
  titulo: Frase;
  /** Las funciones que se enseñan, en el orden en que la cámara las recorre.
      Cada una pide tres segundos: una en un tramo de 5, dos en uno de 7,5. */
  focos: Foco[];
};

export type Escena = EscenaTexto | EscenaPantalla | (Comun & { tipo: "nombre" | "adeo" | "cierre" });

export const TITULO = "Adeorq";
export const WEB = "adeorq.com";

/** Lo que dicen los tramos que no son ni texto solo ni una captura. */
export const TEXTOS = {
  adeo: {
    /** Lo primero que hace: saludar. */
    saludo: { es: "Y este es *Adeo*", en: "And this is *Adeo*" },
    /** Tres de sus estados de siempre, en el orden en que salen. El cuarto
        (se duerme si no hay ninguno) se quedó fuera: no cabe en diez segundos. */
    estados: [
      { animo: "trabaja", frase: { es: "Teclea cuando *trabajan*", en: "He types while *they work*" } },
      { animo: "espera", frase: { es: "Te llama si *te esperan*", en: "He waves when *they're waiting*" } },
      { animo: "lista", frase: { es: "Y salta cuando *terminan*", en: "And jumps when *they're done*" } },
    ] satisfies readonly { animo: Animo; frase: Frase }[],
  },
  cierre: {
    /** Sin palabra en color: aquí lo único en color es la dirección. */
    titulo: { es: "Descárgalo gratis", en: "Download it free" },
    /** Una sola línea debajo de la dirección. Windows y Linux, que es lo que
        hay hoy: si algún día sale el de Mac, se cambia aquí. */
    linea: { es: "Windows y Linux", en: "Windows and Linux" },
  },
  /** El hueco que sale mientras una captura no ha llegado. */
  pendiente: { es: "Captura pendiente", en: "Screenshot pending" },
} as const;

export const ESCENAS: Escena[] = [
  // 0:00 · El problema y el giro. Solo texto y en primera persona: quien lo
  // cuenta es quien lo hizo, porque lo necesitaba.
  {
    id: "problema",
    tipo: "texto",
    dura: 10,
    lineas: [
      { es: "Trabajo con *varios agentes* a la vez.", en: "I work with *several agents* at once." },
      { es: "Y siempre *pierdo el hilo*.", en: "And I keep *losing track*." },
      { es: "¿Cuál ha *terminado*?\n¿Cuál me *espera*?", en: "Which one is *done*?\nWhich one is *waiting*?" },
      { es: "Así que los junté en *una sola pantalla*.", en: "So I put them all on *one screen*." },
    ],
    voz: [
      { es: "Trabajo con varios agentes a la vez.", en: "I work with several agents at once." },
      { es: "Y siempre pierdo el hilo.", en: "And I keep losing track." },
      { es: "¿Cuál ha terminado? ¿Cuál me espera?", en: "Which one is done? Which one is waiting?" },
      { es: "Así que los junté en una sola pantalla.", en: "So I put them all on one screen." },
    ],
  },

  // 0:10 · El nombre, cuando ha pasado un quinto de la pieza.
  {
    id: "nombre",
    tipo: "nombre",
    dura: 2.5,
    voz: [{ es: "Lo llamé Adeorq.", en: "I called it Adeorq." }],
  },

  // 0:12,5 · El producto: cinco funciones que una terminal sola no hace.
  {
    id: "cabina",
    tipo: "pantalla",
    imagen: "cockpit.png",
    dura: 7.5,
    nombre: { es: "Cabina", en: "Cockpit" },
    titulo: { es: "Todos tus agentes, *lado a lado*", en: "All your agents, *side by side*" },
    focos: [
      {
        en: [0.157, 0.04, 0.411, 0.255],
        dato: { es: "Claude Code, en su *terminal de verdad*", en: "Claude Code, in its *real terminal*" },
      },
      {
        en: [0.568, 0.04, 0.411, 0.255],
        dato: { es: "Codex, *justo al lado*", en: "Codex, *right beside it*" },
      },
    ],
    voz: [
      {
        es: "Todos tus agentes, lado a lado: Claude Code, Codex, cada uno en su terminal de verdad.",
        en: "All your agents, side by side: Claude Code, Codex, each in its own real terminal.",
      },
    ],
  },
  {
    id: "panel",
    tipo: "pantalla",
    imagen: "dashboard.png",
    dura: 5,
    nombre: { es: "Panel", en: "Dashboard" },
    titulo: { es: "Quién trabaja. *Quién te espera.*", en: "Who's working. *Who's waiting.*" },
    focos: [
      {
        en: [0.02, 0.148, 0.482, 0.12],
        dato: { es: "Tres trabajando, *nadie esperando*", en: "Three working, *no one waiting*" },
      },
    ],
    voz: [{ es: "De un vistazo ves quién trabaja y quién te espera.", en: "At a glance you see who's working and who's waiting." }],
  },
  {
    id: "lienzo",
    tipo: "pantalla",
    imagen: "canvas.png",
    dura: 7.5,
    nombre: { es: "Lienzo", en: "Canvas" },
    titulo: { es: "Un *tablero infinito*", en: "An *infinite board*" },
    focos: [
      {
        en: [0.522, 0.218, 0.427, 0.312],
        dato: { es: "Terminales vivas y notas, *juntas*", en: "Live terminals and notes, *together*" },
      },
      {
        en: [0.209, 0.255, 0.255, 0.242],
        dato: { es: "El trabajo de cada agente, *en tarjetas*", en: "Each agent's work, *on cards*" },
      },
    ],
    voz: [
      {
        es: "En el Lienzo viven en un tablero infinito, con sus notas y sus tarjetas.",
        en: "On the Canvas they live on an infinite board, with their notes and cards.",
      },
    ],
  },
  {
    id: "cuentas",
    tipo: "pantalla",
    imagen: "accounts.png",
    dura: 5,
    nombre: { es: "Cuentas", en: "Accounts" },
    titulo: { es: "Tus cuentas, *tu cuota*", en: "Your accounts, *your quota*" },
    focos: [
      {
        en: [0.397, 0.274, 0.246, 0.224],
        dato: { es: "Cada terminal, con *la cuenta que elijas*", en: "Each terminal on *the account you pick*" },
        clic: [0.444, 0.392],
      },
    ],
    voz: [
      {
        es: "Ves la cuota de cada cuenta y eliges con cuál nace cada terminal.",
        en: "You see each account's quota and pick which one each terminal starts on.",
      },
    ],
  },
  {
    id: "agenda",
    tipo: "pantalla",
    imagen: "agenda.png",
    dura: 5,
    nombre: { es: "Agenda", en: "Agenda" },
    titulo: { es: "Encargos que *se lanzan solos*", en: "Jobs that *run themselves*" },
    focos: [
      {
        en: [0.796, 0.13, 0.182, 0.08],
        dato: { es: "Tres programados, *a su hora*", en: "Three scheduled, *right on time*" },
      },
    ],
    voz: [{ es: "Y les dejas encargos que se lanzan solos, a su hora.", en: "And you leave them jobs that run themselves, on schedule." }],
  },

  // 0:42,5 · Adeo. Una frase de voz por parte: el saludo y sus tres estados.
  {
    id: "adeo",
    tipo: "adeo",
    dura: 10,
    voz: [
      { es: "Y este es Adeo.", en: "And this is Adeo." },
      { es: "Teclea cuando trabajan.", en: "He types while they work." },
      { es: "Te llama si te esperan.", en: "He waves when they're waiting." },
      { es: "Y salta cuando terminan.", en: "And jumps when they're done." },
    ],
  },

  // 0:52,5 · El cierre: una sola cosa que hacer.
  {
    id: "cierre",
    tipo: "cierre",
    dura: 5,
    voz: [{ es: "Adeorq es gratis, para Windows y Linux. En adeorq punto com.", en: "Adeorq is free, for Windows and Linux. At adeorq dot com." }],
  },
];
