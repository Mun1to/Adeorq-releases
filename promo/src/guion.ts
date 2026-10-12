/**
 * EL GUION. Es el único archivo que hay que tocar para cambiar el vídeo.
 *
 * Aquí está TODO lo que se lee y lo que se DICE, en los dos idiomas, y la
 * lista de escenas con lo que dura cada una. El montaje, las transiciones, los
 * tiempos, dónde suena cada efecto (`tiempos.ts`) y hasta la página que Munir
 * lee en voz alta para grabar (`guion-voz.mjs`) salen de esta lista, así que
 * añadir, quitar o reordenar escenas es editar aquí y nada más.
 *
 * No hay un vídeo en español y otro en inglés: hay uno, y cada frase es un par
 * `{ es, en }`. Si a una le falta un idioma, TypeScript no compila. Es lo que
 * impide que una versión se quede con una escena que la otra ya no tiene.
 *
 * LA ESTRUCTURA (2026-10-11, después de que Munir viera la primera y dijera
 * que era corta, floja de estructura y que explicaba poco): un problema, la
 * respuesta, y tres capítulos que contestan cada uno a una pregunta.
 *   gancho → portada → qué es
 *   1 · Trabaja    Cabina, Lienzo, Archivos
 *   2 · Entérate   Panel, Adeo, Decisiones
 *   3 · Tú mandas  Cuentas, Agenda, Comandos, Ajustes
 *   cierre
 *
 * EL RITMO (2026-10-12, tercera vuelta: Munir vio la segunda y dijo que
 * explicaba «muy lento», con el texto «abajo del todo» y sin acercarse a las
 * funciones). Una pantalla ya no es una foto con tres datos debajo: el título
 * sale en el centro, sube a su sitio, y la cámara va de función en función
 * (`focos`), cada una con su frase al lado. Una función, menos de dos
 * segundos. La pieza dura un tercio menos y enseña más cosas.
 *
 * LA VOZ. Cada escena lleva en `voz` lo que se dice mientras está en pantalla.
 * La voz cuenta lo que no va a cambiar; la frase de cada foco lleva el
 * detalle, que sí cambia de una versión a otra y se corrige sin regrabar.
 *
 * Las duraciones van en múltiplos de 2,5 segundos, que es un compás de la
 * música (`sonido.mjs`, 96 pulsos): así cada corte cae en el primer tiempo.
 * Cuando llegue la grabación manda ella: la escena dura lo que dure su frase.
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
  /** Su nombre: para encontrarla aquí, para que React la distinga y para el
      archivo de su voz (`public/voz/<idioma>/<id>.wav`). */
  id: string;
  /** Segundos desde que entra hasta que entra la siguiente. */
  dura: number;
  /** Si está, la escena sale también en la pieza corta, y dura esto. */
  corta?: number;
  /** Lo que se dice, frase a frase. Vacío si la escena va callada. */
  voz: Frase[];
  /** Se puede quitar sin que el resto se resienta: la pieza «Media» es la
      misma sin estas. */
  opcional?: true;
};

/**
 * Una función de una pantalla: dónde está en la captura y qué se dice de ella.
 * La cámara se acerca a ese trozo, lo demás se apaga y la frase sale a su lado.
 */
export type Foco = {
  /** El trozo de la captura: izquierda, arriba, ancho y alto, de 0 a 1. Se
      mide sobre la imagen, y vale igual para la de cada idioma. Cuanto más
      pequeño, más se acerca la cámara (hasta 2,6 aumentos). */
  en: readonly [number, number, number, number];
  /** Qué se cuenta de esa función. Menos de 40 letras. */
  dato: Frase;
  /** Si está, el puntero va a ese punto de la captura (x, y, de 0 a 1) y
      hace clic: es lo que hace que se vea usar la función y no solo mirarla. */
  clic?: readonly [number, number];
};

export type EscenaPantalla = Comun & {
  tipo: "pantalla";
  /** El archivo dentro de `public/pantallas/`. Si existe `pantallas/en/` o
      `pantallas/es/` con el mismo nombre, cada idioma usa la suya. */
  imagen: string;
  /** Cómo se llama esa pestaña en la app. */
  nombre: Frase;
  /** La frase grande, que sale en el centro del cuadro. Tres o cuatro
      palabras: está un segundo ahí antes de subir a su sitio. */
  titulo: Frase;
  /** Las funciones que se enseñan, en el orden en que la cámara las recorre.
      Cada una pide cerca de dos segundos: si la escena es más corta que eso
      (la pieza de bolsillo), se quedan fuera las últimas. */
  focos: Foco[];
  /** Qué hace Adeo al lado de la ventana. */
  adeo: Animo;
};

/** El cartel que abre cada capítulo: un número y dos palabras. */
export type EscenaCapitulo = Comun & { tipo: "capitulo"; numero: number; titulo: Frase };

export type Escena =
  | (Comun & { tipo: "gancho" | "portada" | "que-es" | "adeo" | "cierre" })
  | EscenaCapitulo
  | EscenaPantalla;

export const TITULO = "Adeorq";
export const WEB = "adeorq.com";

/** Lo que dicen las escenas que no son una captura. Un trozo entre asteriscos
    sale en el color de la marca. */
export const TEXTOS = {
  lema: { es: "Nueve agentes trabajando. Una sola pantalla.", en: "Nine agents working. One screen." },
  gancho: {
    /** Las dos preguntas que se hace cualquiera con cinco ventanas abiertas. */
    preguntas: [
      { es: "¿Cuál ha terminado?", en: "Which one is done?" },
      { es: "¿Cuál te está esperando?", en: "Which one is waiting for you?" },
    ],
    /** Lo que pone en la barra de cada ventana suelta. */
    ventana: { es: "agente", en: "agent" },
  },
  queEs: {
    orden: { es: "¿qué es adeorq?", en: "what is adeorq?" },
    titular: {
      es: "Un panel de escritorio que abre tus proyectos en *terminales de verdad*",
      en: "A desktop panel that opens your projects in *real terminals*",
    },
    /** Solo los nombres, escritos: los logotipos son marcas de otros. */
    clientes: ["Claude Code", "Codex", "Gemini CLI", "Antigravity", "Copilot", "Cursor", "opencode"],
    yMas: { es: "y más", en: "and more" },
    cuenta: {
      es: "Funciona con *TU* cuenta. Adeorq no revende acceso a nadie.",
      en: "It runs on *YOUR* account. Adeorq resells access to no one.",
    },
    aviso: {
      es: "Adeorq no está afiliado a Anthropic, OpenAI, Google ni Microsoft. Los nombres son marcas de sus dueños.",
      en: "Adeorq is not affiliated with Anthropic, OpenAI, Google or Microsoft. Names are trademarks of their owners.",
    },
  },
  adeo: {
    nombre: { es: "Adeo", en: "Adeo" },
    titulo: { es: "Y Adeo te avisa", en: "And Adeo keeps you posted" },
    /** Lo primero que hace: saludar. */
    saludo: { es: "Este es Adeo", en: "This is Adeo" },
    /** Sus cuatro estados de siempre, en el orden en que salen y con las
        palabras con las que los cuentan los dos README. */
    estados: [
      { animo: "trabaja", frase: { es: "Teclea cuando tus agentes trabajan", en: "Types when your agents are working" } },
      { animo: "espera", frase: { es: "Te llama cuando uno te espera", en: "Waves when one is waiting for you" } },
      { animo: "lista", frase: { es: "Salta cuando uno termina", en: "Jumps when one finishes" } },
      { animo: "dormida", frase: { es: "Y se duerme si no hay ninguno", en: "And sleeps when there are none" } },
    ] satisfies readonly { animo: Animo; frase: Frase }[],
  },
  cierre: {
    titulo: { es: "Descárgalo gratis", en: "Download it free" },
    /** Una sola línea debajo de la dirección: «gratis» ya lo dice el título. */
    linea: {
      es: "Windows y Linux · sin cuenta · sin claves de API",
      en: "Windows and Linux · no account · no API keys",
    },
  },
  /** El hueco que sale mientras una captura no ha llegado. */
  pendiente: { es: "Captura pendiente", en: "Screenshot pending" },
} as const;

export const ESCENAS: Escena[] = [
  {
    id: "gancho",
    tipo: "gancho",
    dura: 5,
    voz: [
      { es: "Varios agentes programando a la vez.", en: "Several agents coding at once." },
      { es: "¿Cuál ha terminado?", en: "Which one is done?" },
      { es: "¿Cuál te está esperando?", en: "Which one is waiting for you?" },
    ],
  },
  {
    id: "portada",
    tipo: "portada",
    dura: 5,
    corta: 2.5,
    voz: [{ es: "Esto es Adeorq: todos tus agentes, en una sola pantalla.", en: "This is Adeorq: all your agents, on one screen." }],
  },
  {
    id: "que-es",
    tipo: "que-es",
    dura: 7.5,
    voz: [
      { es: "Abre tus proyectos en terminales de verdad,", en: "It opens your projects in real terminals," },
      { es: "con Claude Code, Codex, Gemini y más,", en: "with Claude Code, Codex, Gemini and more," },
      { es: "y siempre con tu cuenta.", en: "and always on your own account." },
    ],
  },

  {
    id: "cap-trabaja",
    tipo: "capitulo",
    numero: 1,
    dura: 2.5,
    titulo: { es: "Trabaja", en: "Work" },
    voz: [{ es: "Primero, a trabajar.", en: "First, the work." }],
  },
  {
    id: "cabina",
    tipo: "pantalla",
    imagen: "cockpit.png",
    dura: 7.5,
    corta: 5,
    adeo: "trabaja",
    nombre: { es: "Cabina", en: "Cockpit" },
    titulo: { es: "Terminales de verdad", en: "Real terminals" },
    focos: [
      {
        en: [0.157, 0.04, 0.411, 0.255],
        dato: { es: "Claude Code, en su terminal de verdad", en: "Claude Code, in its real terminal" },
      },
      {
        en: [0.568, 0.04, 0.411, 0.255],
        dato: { es: "Codex, justo al lado", en: "Codex, right beside it" },
      },
      {
        en: [0.157, 0.522, 0.411, 0.118],
        dato: { es: "Te pregunta, y contestas con un clic", en: "It asks; you answer in one click" },
        clic: [0.187, 0.602],
      },
    ],
    voz: [
      { es: "La Cabina: terminales reales, una al lado de otra.", en: "The Cockpit: real terminals, side by side." },
      { es: "Y cada una te avisa cuando su agente te pregunta.", en: "And each one tells you when its agent is asking." },
    ],
  },
  {
    id: "lienzo",
    tipo: "pantalla",
    imagen: "canvas.png",
    dura: 5,
    corta: 5,
    adeo: "piensa",
    nombre: { es: "Lienzo", en: "Canvas" },
    titulo: { es: "Un tablero infinito", en: "An infinite board" },
    focos: [
      {
        en: [0.522, 0.218, 0.427, 0.312],
        dato: { es: "Terminales vivas y notas, juntas", en: "Live terminals and notes, together" },
      },
      {
        en: [0.209, 0.255, 0.255, 0.242],
        dato: { es: "El trabajo de cada agente, en tarjetas", en: "Each agent's work, on cards" },
      },
    ],
    voz: [
      {
        es: "En el Lienzo viven en un tablero infinito, con notas y tarjetas.",
        en: "On the Canvas they live on an infinite board, with notes and cards.",
      },
    ],
  },
  {
    id: "archivos",
    tipo: "pantalla",
    imagen: "files.png",
    dura: 5,
    opcional: true,
    adeo: "escucha",
    nombre: { es: "Archivos", en: "Files" },
    titulo: { es: "El proyecto, al lado", en: "Your project, right there" },
    focos: [
      {
        en: [0.498, 0.04, 0.481, 0.28],
        dato: { es: "Abres y editas sin salir", en: "Open and edit without leaving" },
      },
      {
        en: [0.157, 0.04, 0.341, 0.28],
        dato: { es: "Con las pruebas corriendo al lado", en: "With the tests running alongside" },
      },
    ],
    voz: [
      {
        es: "Y al lado, los archivos: los abres y los editas sin salir.",
        en: "And beside them, your files: open and edit without leaving.",
      },
    ],
  },

  {
    id: "cap-enterate",
    tipo: "capitulo",
    numero: 2,
    dura: 2.5,
    titulo: { es: "Entérate", en: "Stay on top" },
    voz: [{ es: "Después, enterarte de todo.", en: "Then, staying on top of it." }],
  },
  {
    id: "panel",
    tipo: "pantalla",
    imagen: "dashboard.png",
    dura: 7.5,
    corta: 5,
    adeo: "quieta",
    nombre: { es: "Panel", en: "Dashboard" },
    titulo: { es: "Todo, de un vistazo", en: "Everything at a glance" },
    focos: [
      {
        en: [0.02, 0.148, 0.482, 0.12],
        dato: { es: "Quién trabaja y quién te espera", en: "Who's working, who's waiting" },
      },
      {
        en: [0.137, 0.284, 0.413, 0.25],
        dato: { es: "El Capataz propone; tú das el OK", en: "The Foreman proposes; you say OK" },
        clic: [0.172, 0.508],
      },
      {
        en: [0.137, 0.775, 0.413, 0.155],
        dato: { es: "Tu semana, proyecto a proyecto", en: "Your week, project by project" },
      },
    ],
    voz: [
      { es: "El Panel te dice quién trabaja y quién te espera.", en: "The Dashboard shows who's working and who's waiting." },
      { es: "Y el Capataz propone un plan: nada corre sin tu OK.", en: "And the Foreman drafts a plan: nothing runs without your OK." },
    ],
  },
  {
    id: "adeo",
    tipo: "adeo",
    dura: 12.5,
    voz: [
      { es: "Y este es Adeo.", en: "And this is Adeo." },
      { es: "Teclea cuando tus agentes trabajan.", en: "He types when your agents are working." },
      { es: "Te llama cuando uno te espera.", en: "Waves when one is waiting for you." },
      { es: "Salta cuando uno termina.", en: "Jumps when one finishes." },
      { es: "Y se duerme si no hay ninguno.", en: "And sleeps when there are none." },
    ],
  },
  {
    id: "decisiones",
    tipo: "pantalla",
    imagen: "decisions.png",
    dura: 5,
    adeo: "escucha",
    nombre: { es: "Decisiones", en: "Decisions" },
    titulo: { es: "Preguntan. Tú eliges.", en: "They ask. You choose." },
    focos: [
      {
        en: [0.297, 0.075, 0.388, 0.316],
        dato: { es: "Opciones numeradas, para dictarlas", en: "Numbered options, easy to dictate" },
        clic: [0.317, 0.228],
      },
      {
        en: [0.698, 0.076, 0.174, 0.29],
        dato: { es: "Y la respuesta vuelve a su terminal", en: "And the answer returns to its terminal" },
      },
    ],
    voz: [
      {
        es: "Si un agente duda, te pregunta. Eliges, y la respuesta vuelve sola a su terminal.",
        en: "When an agent is unsure, it asks. You choose, and the answer goes straight back to its terminal.",
      },
    ],
  },

  {
    id: "cap-mandas",
    tipo: "capitulo",
    numero: 3,
    dura: 2.5,
    titulo: { es: "Tú mandas", en: "Stay in charge" },
    voz: [{ es: "Y por último, mandar tú.", en: "And finally, staying in charge." }],
  },
  {
    id: "cuentas",
    tipo: "pantalla",
    imagen: "accounts.png",
    dura: 5,
    adeo: "escucha",
    nombre: { es: "Cuentas", en: "Accounts" },
    titulo: { es: "Tus cuentas, tu control", en: "Your accounts, your call" },
    focos: [
      {
        en: [0.148, 0.268, 0.25, 0.165],
        dato: { es: "Cuánta cuota te queda, a la vista", en: "How much quota is left, in plain sight" },
      },
      {
        en: [0.397, 0.274, 0.246, 0.224],
        dato: { es: "Cada terminal, con la cuenta que elijas", en: "Each terminal on the account you pick" },
        clic: [0.444, 0.392],
      },
    ],
    voz: [
      {
        es: "En Cuentas ves cuánta cuota te queda y eliges con cuál nace cada terminal.",
        en: "Accounts shows how much quota you have left, and which one each terminal starts on.",
      },
    ],
  },
  {
    id: "agenda",
    tipo: "pantalla",
    imagen: "agenda.png",
    dura: 5,
    adeo: "piensa",
    nombre: { es: "Agenda", en: "Agenda" },
    titulo: { es: "Lo que viene", en: "What's next" },
    focos: [
      {
        en: [0.796, 0.686, 0.196, 0.3],
        dato: { es: "Tus objetivos del día", en: "Your goals for the day" },
        clic: [0.816, 0.796],
      },
      {
        en: [0.796, 0.13, 0.182, 0.08],
        dato: { es: "Encargos que se lanzan solos, a su hora", en: "Jobs that run themselves, on schedule" },
      },
    ],
    voz: [
      {
        es: "La Agenda guarda tus objetivos, y lanza encargos sola a su hora.",
        en: "The Agenda keeps your goals, and runs jobs on its own, on schedule.",
      },
    ],
  },
  {
    id: "comandos",
    tipo: "pantalla",
    imagen: "commands.png",
    dura: 5,
    opcional: true,
    adeo: "trabaja",
    nombre: { es: "Comandos", en: "Commands" },
    titulo: { es: "Todo lo que puedes escribir", en: "Everything you can type" },
    focos: [
      {
        en: [0.02, 0.07, 0.475, 0.165],
        dato: { es: "Busca por lo que quieres hacer", en: "Search by what you want to do" },
      },
      {
        en: [0.027, 0.276, 0.407, 0.146],
        dato: { es: "Un clic lo teclea en tu terminal", en: "One click types it in your terminal" },
        clic: [0.365, 0.313],
      },
    ],
    voz: [
      {
        es: "Todo lo que puedes escribirle a un agente, buscable: un clic y lo teclea.",
        en: "Everything you can type to an agent, searchable: one click and it types it.",
      },
    ],
  },
  {
    id: "ajustes",
    tipo: "pantalla",
    imagen: "settings.png",
    dura: 5,
    opcional: true,
    adeo: "baila",
    nombre: { es: "Ajustes", en: "Settings" },
    titulo: { es: "Hazlo tuyo", en: "Make it yours" },
    focos: [
      {
        en: [0.145, 0.265, 0.445, 0.3],
        dato: { es: "Temas para todos los gustos", en: "Themes for every taste" },
      },
      {
        en: [0.026, 0.222, 0.102, 0.34],
        dato: { es: "Avisos, atajos, móvil y más", en: "Alerts, shortcuts, phone and more" },
      },
    ],
    voz: [{ es: "Temas, avisos, atajos: lo dejas a tu gusto.", en: "Themes, alerts, shortcuts: make it yours." }],
  },

  {
    id: "cierre",
    tipo: "cierre",
    dura: 7.5,
    corta: 5,
    voz: [
      { es: "Adeorq es gratis.", en: "Adeorq is free." },
      { es: "Sin cuenta y sin claves de API.", en: "No account, no API keys." },
      { es: "Para Windows y Linux, en adeorq punto com.", en: "For Windows and Linux, at adeorq dot com." },
    ],
  },
];

/** Los tres cortes que salen del mismo guion. */
export type Corte = "entera" | "media" | "corta";

/** Las escenas de un corte: la entera las lleva todas, la media deja fuera las
    opcionales, y la corta solo las que tienen `corta`. */
export const escenasDe = (corte: Corte): Escena[] =>
  corte === "corta" ? ESCENAS.filter((e) => e.corta !== undefined) : corte === "media" ? ESCENAS.filter((e) => !e.opcional) : ESCENAS;
