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
 * ESTÁ ESCRITO POR TIEMPOS, NO POR PANTALLAS. Sale de las rondas 6.ª y 7.ª de
 * Munir (2026-10-14): la primera pasada era «muy lenta y difícil para el
 * usuario», «pon a Adeo de protagonista, Adeo explica la plataforma», y luego
 * «que el highlight de las cosas sea mejor y que explique más funciones y que
 * Adeo esté al lado de los highlights explicando las cosas». Y de la 8.ª: que
 * salga el móvil y que el Lienzo se explique bien. Dura 71,25 s, ADEO es quien
 * la cuenta (todo lo que se lee después del nombre lo dice él, y sale a su
 * lado), y cada función es una PREGUNTA que se haría quien mira y la pieza de
 * la app que la contesta:
 *
 *    0:00     el problema y el giro   solo texto, en primera persona (Munir)
 *    0:06,25  el nombre               el logotipo despierta: es Adeo, y se presenta
 *    0:10     qué es                  la Cabina entera, y sus terminales
 *    0:15     Panel y Capataz         dos preguntas
 *    0:22,5   el Lienzo               el tablero, la flecha, las columnas, el enjambre
 *    0:36,25  cinco preguntas más     Archivos, Decisiones, Cuentas, Comandos, Agenda
 *    0:55     el móvil                el conserje y una terminal, en un teléfono
 *    1:02,5   Adeo                    lo que hace él
 *    1:07,5   el cierre               una sola cosa que hacer
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
 * Las duraciones van en múltiplos de un pulso de la música (0,625 s; un
 * compás son cuatro, `sonido.mjs` va a 96): así cada corte cae en un tiempo.
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
 * La cámara se acerca a ese trozo, lo resalta levantándolo de la pantalla, y
 * Adeo se pone pegado a él a contarlo.
 */
export type Foco = {
  /** El trozo de la captura: izquierda, arriba, ancho y alto, de 0 a 1. Se
      mide sobre la imagen, y vale igual para la de cada idioma. Cuanto más
      pequeño, más se acerca la cámara (hasta 2,6 aumentos). */
  en: readonly [number, number, number, number];
  /** Lo que cuenta Adeo de esa función: la respuesta, y a ser posible lo que
      se ve en ella (una cifra, una columna). Menos de 30 letras: va con él al
      lado. */
  dato: Frase;
  /** Si está, el puntero va a ese punto de la captura (x, y, de 0 a 1) y
      hace clic: es lo que hace que se vea usar la función y no solo mirarla. */
  clic?: readonly [number, number];
  /** Si está, se dibuja una flecha de (x1, y1) a (x2, y2), en fracciones de
      la captura, que se traza sola al encenderse la pieza. Es para lo que en
      la captura existe pero apenas se ve: la flecha que encadena dos agentes
      en el Lienzo queda tapada por su propia etiqueta. */
  flecha?: readonly [number, number, number, number];
};

export type EscenaPantalla = Comun & {
  tipo: "pantalla";
  /** El archivo dentro de `public/pantallas/<idioma>/`. */
  imagen: string;
  /** Ancho entre alto de la captura, si no es 16:9. Entonces no llena el
      cuadro: sale como una ventana flotando sobre el fondo de la marca. */
  proporcion?: number;
  /** `movil`: la ventana es un teléfono, con su canto y sus esquinas. */
  marco?: "movil";
  /** Cómo se llama esa pestaña en la app. No sale en el vídeo: es para la
      página del guion y para el hueco de una captura que falta. */
  nombre: Frase;
  /** La frase grande, que Adeo dice en el centro del cuadro antes de que la
      cámara entre. En una escena que entra `directo`, la pregunta. */
  titulo: Frase;
  /** La cámara empieza ya DENTRO de la primera pieza, en vez de enseñar la
      pantalla entera: la pregunta se lee sobre ella a media luz, y la
      respuesta sale cuando se enciende. La primera pasada abría cada función
      con la app entera, llena de código, y era lo «difícil para el usuario». */
  directo?: true;
  /** Cómo está Adeo cuando da la respuesta. Mientras pregunta, duda. */
  adeo: Animo;
  /** Las funciones que se enseñan, en el orden en que la cámara las recorre.
      Cada una pide dos segundos largos: una por tramo, salvo que dure más. */
  focos: Foco[];
};

export type Escena = EscenaTexto | EscenaPantalla | (Comun & { tipo: "nombre" | "adeo" | "cierre" });

export const TITULO = "Adeorq";
export const WEB = "adeorq.com";

/** Lo que dicen los tramos que no son ni texto solo ni una captura. */
export const TEXTOS = {
  /** Lo primero que dice Adeo al despertar: desde ahí, el vídeo lo cuenta él. */
  nombre: { es: "¡Hola! Soy *Adeo*. Te lo enseño.", en: "Hi! I'm *Adeo*. Let me show you." },
  adeo: {
    /** En su tramo habla de sí mismo, en primera persona. */
    saludo: { es: "Y yo *te aviso*…", en: "And I *let you know*…" },
    /** Lo que hace después, uno por parte. En cinco segundos cabe uno: el de
        los saltos y las chispas, que es la respuesta a «¿cuál ha terminado?». */
    estados: [
      { animo: "lista", frase: { es: "…cuando uno *termina*", en: "…when one *is done*" } },
      // Con el tipo abierto, y no con `satisfies`: con un solo estado en la
      // lista, TypeScript daría por imposibles los demás en `Sonido.tsx`.
    ] as readonly { animo: Animo; frase: Frase }[],
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

/** Una pregunta de 3,75 s: Adeo la dice dudando sobre la pieza a media luz,
    la pieza se levanta y él contesta pegado a ella. */
const pregunta = (p: Omit<EscenaPantalla, "tipo" | "dura" | "directo">): EscenaPantalla => ({
  tipo: "pantalla",
  dura: 3.75,
  directo: true,
  ...p,
});

export const ESCENAS: Escena[] = [
  // 0:00 · El problema y el giro. Solo texto y en primera persona: quien lo
  // cuenta es quien lo hizo, porque lo necesitaba.
  {
    id: "problema",
    tipo: "texto",
    dura: 6.25,
    lineas: [
      { es: "Programo con *varios agentes*.", en: "I code with *several agents*." },
      { es: "¿Cuál *terminó*? ¿Cuál me *espera*?", en: "Which one's *done*? Which one's *waiting*?" },
      { es: "Así que los junté en *una ventana*.", en: "So I put them all in *one window*." },
    ],
    voz: [
      { es: "Programo con varios agentes.", en: "I code with several agents." },
      { es: "¿Cuál terminó? ¿Cuál me espera?", en: "Which one's done? Which one's waiting?" },
      { es: "Así que los junté en una ventana.", en: "So I put them all in one window." },
    ],
  },

  // 0:06,25 · El nombre: el logotipo abre el ojo, es Adeo, y se presenta.
  {
    id: "nombre",
    tipo: "nombre",
    dura: 3.75,
    voz: [{ es: "Esto es Adeorq. Y yo soy Adeo: te lo enseño.", en: "This is Adeorq. And I'm Adeo: let me show you." }],
  },

  // 0:10 · Qué es: la Cabina entera, que es la ventana de la que habla el
  // giro, y después sus terminales.
  {
    id: "cabina",
    tipo: "pantalla",
    imagen: "cockpit.png",
    dura: 5,
    adeo: "trabaja",
    nombre: { es: "Cabina", en: "Cockpit" },
    titulo: { es: "Claude Code, Codex, Gemini…\n*lado a lado*", en: "Claude Code, Codex, Gemini…\n*side by side*" },
    focos: [
      {
        en: [0.157, 0.04, 0.822, 0.255],
        dato: { es: "Cada uno en su *terminal*", en: "Each in its *own terminal*" },
      },
    ],
    voz: [
      {
        es: "Claude Code, Codex, Gemini: lado a lado, cada uno en su terminal de verdad.",
        en: "Claude Code, Codex, Gemini: side by side, each in its own real terminal.",
      },
    ],
  },

  // 0:15 · Nueve preguntas, cada una con la pieza que la contesta. La cámara
  // ya está dentro de la pieza: no se enseña la pantalla entera.
  pregunta({
    id: "panel",
    imagen: "dashboard.png",
    adeo: "lista",
    nombre: { es: "Panel", en: "Dashboard" },
    titulo: { es: "¿Quién te *espera*?", en: "Who's *waiting*?" },
    focos: [{ en: [0.02, 0.148, 0.482, 0.12], dato: { es: "*3 trabajando*. Nadie espera.", en: "*3 working*. Nobody waiting." } }],
    voz: [{ es: "¿Quién te espera? Tres trabajando, nadie esperando.", en: "Who's waiting? Three working, nobody waiting." }],
  }),
  pregunta({
    id: "capataz",
    imagen: "dashboard.png",
    adeo: "escucha",
    nombre: { es: "Capataz", en: "Foreman" },
    titulo: { es: "¿Montar *un equipo*?", en: "Need *a team*?" },
    focos: [{ en: [0.145, 0.555, 0.32, 0.175], dato: { es: "Pídelo *en cristiano*", en: "Just ask, *in plain words*" } }],
    voz: [{ es: "¿Montar un equipo? Pídelo en cristiano.", en: "Need a team? Just ask, in plain words." }],
  }),
  // El Lienzo, explicado entero (8.ª ronda: «y bien el canvas»): primero el
  // tablero con sus terminales vivas, luego la flecha que hace que un agente
  // siga a otro, y después sus columnas y el enjambre.
  {
    id: "tablero",
    tipo: "pantalla",
    imagen: "canvas.png",
    dura: 6.25,
    adeo: "baila",
    nombre: { es: "Lienzo", en: "Canvas" },
    titulo: { es: "Y un *tablero infinito*", en: "And an *infinite board*" },
    focos: [
      { en: [0.205, 0.23, 0.745, 0.63], dato: { es: "Terminales vivas, *en el tablero*", en: "Live terminals, *on the board*" } },
      // El enlace entre las dos terminales de abajo: su etiqueta («…que el
      // texto de los planes sigue cuadrando») cruza el hueco y tapa la raya,
      // así que la flecha se dibuja justo debajo, de una terminal a la otra.
      {
        en: [0.42, 0.66, 0.13, 0.1],
        dato: { es: "Flecha: *uno sigue al otro*", en: "An arrow: *one feeds the next*" },
        flecha: [0.474, 0.722, 0.528, 0.722],
      },
    ],
    voz: [
      {
        es: "Y en el Lienzo, las terminales viven en un tablero infinito; con una flecha, un agente sigue al otro.",
        en: "And on the Canvas, terminals live on an infinite board; with an arrow, one agent feeds the next.",
      },
    ],
  },
  pregunta({
    id: "lienzo",
    imagen: "canvas.png",
    adeo: "piensa",
    nombre: { es: "Columnas", en: "Columns" },
    titulo: { es: "¿Quién hace *qué*?", en: "Who's doing *what*?" },
    focos: [{ en: [0.209, 0.255, 0.255, 0.242], dato: { es: "Cada uno, *en su columna*", en: "Each one, *in its column*" } }],
    voz: [{ es: "¿Quién hace qué? Cada uno, en su columna.", en: "Who's doing what? Each one, in its column." }],
  }),
  pregunta({
    id: "enjambre",
    imagen: "swarm.png",
    proporcion: 534 / 632,
    adeo: "baila",
    nombre: { es: "Enjambre", en: "Swarm" },
    titulo: { es: "¿Y si pides *algo grande*?", en: "And for *something big*?" },
    focos: [{ en: [0.025, 0.335, 0.95, 0.27], dato: { es: "Lo *reparto* yo", en: "I *split it up*" } }],
    voz: [{ es: "¿Y si pides algo grande? Lo reparto yo.", en: "And for something big? I split it up." }],
  }),
  pregunta({
    id: "archivos",
    imagen: "files.png",
    adeo: "trabaja",
    nombre: { es: "Archivos", en: "Files" },
    titulo: { es: "¿Qué ha *tocado*?", en: "What did it *touch*?" },
    focos: [{ en: [0.842, 0.045, 0.135, 0.37], dato: { es: "*2 archivos*, a un clic", en: "*2 files*, one click away" } }],
    voz: [{ es: "¿Qué ha tocado? Dos archivos, a un clic.", en: "What did it touch? Two files, one click away." }],
  }),
  pregunta({
    id: "decisiones",
    imagen: "decisions.png",
    adeo: "quieta",
    nombre: { es: "Decisiones", en: "Decisions" },
    titulo: { es: "¿Un agente *duda*?", en: "An agent *unsure*?" },
    focos: [
      {
        en: [0.297, 0.075, 0.385, 0.3],
        dato: { es: "Te da *opciones*, y eliges", en: "It lays out *options*" },
        clic: [0.318, 0.228],
      },
    ],
    voz: [{ es: "¿Un agente duda? Te da opciones, y eliges.", en: "An agent unsure? It lays out options, you pick." }],
  }),
  pregunta({
    id: "cuentas",
    imagen: "accounts.png",
    adeo: "lista",
    nombre: { es: "Cuentas", en: "Accounts" },
    titulo: { es: "¿Te queda *cuota*?", en: "Any *quota* left?" },
    focos: [
      {
        en: [0.397, 0.274, 0.246, 0.224],
        dato: { es: "La ves, y *eliges cuenta*", en: "See it, *pick the account*" },
        clic: [0.444, 0.392],
      },
    ],
    voz: [{ es: "¿Te queda cuota? La ves, y eliges cuenta.", en: "Any quota left? See it, and pick the account." }],
  }),
  pregunta({
    id: "comandos",
    imagen: "commands.png",
    adeo: "trabaja",
    nombre: { es: "Comandos", en: "Commands" },
    titulo: { es: "¿Cómo era *ese comando*?", en: "What was *that command*?" },
    focos: [
      {
        en: [0.026, 0.165, 0.41, 0.19],
        dato: { es: "Búscalo: *un clic lo teclea*", en: "Find it: *one click types it*" },
        clic: [0.05, 0.3],
      },
    ],
    voz: [{ es: "¿Cómo era ese comando? Búscalo: un clic lo teclea.", en: "What was that command? Find it: one click types it." }],
  }),
  pregunta({
    id: "agenda",
    imagen: "agenda.png",
    // Dormido: los encargos van solos, y él también descansa.
    adeo: "dormida",
    nombre: { es: "Agenda", en: "Agenda" },
    titulo: { es: "¿Y cuando *no estás*?", en: "And when *you're away*?" },
    focos: [{ en: [0.796, 0.13, 0.182, 0.08], dato: { es: "Encargos que *van solos*", en: "Jobs that *run on their own*" } }],
    voz: [{ es: "¿Y cuando no estás? Encargos que van solos.", en: "And when you're away? Jobs that run on their own." }],
  }),

  // 0:55 · El móvil (8.ª ronda): el conserje y una terminal desde el
  // teléfono. Las capturas salen de una copia del doble del móvil con el taller
  // de Sam (README, «Qué tocar»); la página del móvil no tiene inglés, así que
  // en la pieza inglesa su interfaz va en español y sus datos en inglés.
  pregunta({
    id: "movil",
    imagen: "movil-conserje.png",
    proporcion: 1170 / 2532,
    marco: "movil",
    adeo: "baila",
    nombre: { es: "Móvil", en: "Phone" },
    titulo: { es: "¿Lejos del *ordenador*?", en: "Away from *your desk*?" },
    focos: [{ en: [0.03, 0.225, 0.94, 0.495], dato: { es: "Pídelo, y *abro las sesiones*", en: "Ask, and *I open the sessions*" } }],
    voz: [{ es: "¿Lejos del ordenador? Pídelo desde el móvil, y abro las sesiones.", en: "Away from your desk? Ask from your phone, and I open the sessions." }],
  }),
  pregunta({
    id: "movil-terminal",
    imagen: "movil-terminal.png",
    proporcion: 1170 / 2532,
    marco: "movil",
    adeo: "escucha",
    nombre: { es: "Móvil: una terminal", en: "Phone: a terminal" },
    titulo: { es: "¿Y si una *te espera*?", en: "And if one *needs you*?" },
    focos: [
      {
        en: [0.02, 0.06, 0.96, 0.06],
        dato: { es: "Contestas *desde el móvil*", en: "Answer *from your phone*" },
        clic: [0.95, 0.09],
      },
    ],
    voz: [{ es: "¿Y si una te espera? Contestas desde el móvil.", en: "And if one needs you? Answer from your phone." }],
  }),

  // 1:02,5 · Adeo, en grande, hablando de sí mismo.
  {
    id: "adeo",
    tipo: "adeo",
    dura: 5,
    voz: [
      { es: "Y yo te aviso…", en: "And I let you know…" },
      { es: "…cuando uno termina.", en: "…when one is done." },
    ],
  },

  // 1:07,5 · El cierre: una sola cosa que hacer.
  {
    id: "cierre",
    tipo: "cierre",
    dura: 3.75,
    voz: [{ es: "Adeorq es gratis, en adeorq punto com.", en: "Adeorq is free, at adeorq dot com." }],
  },
];
