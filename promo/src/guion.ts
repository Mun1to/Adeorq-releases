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
 * LA VOZ. Cada escena lleva en `voz` lo que se dice mientras está en pantalla.
 * La voz cuenta lo que no va a cambiar; los datos de debajo (`datos`) llevan
 * el detalle, que sí cambia de una versión a otra y se corrige sin regrabar.
 *
 * Las duraciones van en múltiplos de 2,5 segundos, que es un compás de la
 * música (`sonido.mjs`, 96 pulsos): así cada corte cae en el primer tiempo.
 * Son para una lectura tranquila, a unas 2,6 palabras por segundo. Cuando
 * llegue la grabación manda ella: la escena dura lo que dure su frase.
 *
 * ⚠ LAS IMÁGENES DE AHORA SON PROVISIONALES. Las seis viejas enseñan los
 * proyectos reales de Munir (auditado el 2026-08-11) y las tres nuevas aún no
 * existen: sale un hueco con su nombre. Sirven para ver la pieza moverse, NO
 * para publicar. Al llegar las nuevas a `web/assets/screens/` se traen con
 * `pnpm capturas`, con el mismo nombre, y no hay que tocar ni una línea.
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

export type EscenaPantalla = Comun & {
  tipo: "pantalla";
  /** El archivo dentro de `public/pantallas/`. Si existe `pantallas/en/` o
      `pantallas/es/` con el mismo nombre, cada idioma usa la suya. */
  imagen: string;
  /** Cómo se llama esa pestaña en la app. */
  nombre: Frase;
  /** La frase grande. Corta: se lee en dos segundos o no se lee. */
  titulo: Frase;
  /** Qué hace esa pantalla, en dos o tres datos de menos de 36 letras: con
      más, los tres ya no caben en una fila. */
  datos: Frase[];
  /** Si la ventana se acerca o se aleja mientras está en pantalla. Se
      alternan para que dos escenas seguidas no se muevan igual. */
  hacia: "acerca" | "aleja";
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
    linea: {
      es: "Gratis · sin cuenta · sin claves de API · se actualiza sola",
      en: "Free · no account · no API keys · updates itself",
    },
    sistemas: { es: "Windows y Linux", en: "Windows and Linux" },
  },
  /** El hueco que sale mientras una captura no ha llegado. */
  pendiente: { es: "Captura pendiente", en: "Screenshot pending" },
} as const;

export const ESCENAS: Escena[] = [
  {
    id: "gancho",
    tipo: "gancho",
    dura: 7.5,
    voz: [
      { es: "Varios agentes programando a la vez.", en: "Several agents coding at once." },
      { es: "¿Cuál ha terminado?", en: "Which one is done?" },
      { es: "¿Cuál lleva diez minutos esperándote?", en: "Which one has been waiting on you for ten minutes?" },
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
    dura: 12.5,
    voz: [
      {
        es: "Es un panel de escritorio que abre tus proyectos en terminales de verdad,",
        en: "It's a desktop panel that opens your projects in real terminals,",
      },
      {
        es: "con los programas que ya usas: Claude Code, Codex, Gemini y muchos más.",
        en: "running the tools you already use: Claude Code, Codex, Gemini and many more.",
      },
      { es: "Y siempre con tu cuenta.", en: "And always on your own account." },
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
    dura: 12.5,
    corta: 5,
    hacia: "aleja",
    adeo: "trabaja",
    nombre: { es: "Cabina", en: "Cockpit" },
    titulo: { es: "Terminales de verdad, no una imitación", en: "Real terminals, not an imitation" },
    datos: [
      { es: "Claude Code, Codex y Gemini a la vez", en: "Claude Code, Codex and Gemini at once" },
      { es: "Parte, mueve y aparta sin cerrar", en: "Split, move, set aside, never close" },
      { es: "Ves cuál trabaja y cuál te pregunta", en: "See which works and which asks you" },
    ],
    voz: [
      { es: "La Cabina es un mosaico de terminales reales.", en: "The Cockpit is a grid of real terminals." },
      { es: "Las partes, las mueves y las apartas sin cerrarlas.", en: "Split them, move them, set them aside without closing them." },
      {
        es: "Y cada una te dice si su agente trabaja o te espera.",
        en: "And each one tells you whether its agent is working or waiting for you.",
      },
    ],
  },
  {
    id: "lienzo",
    tipo: "pantalla",
    imagen: "canvas.png",
    dura: 10,
    corta: 5,
    hacia: "acerca",
    adeo: "piensa",
    nombre: { es: "Lienzo", en: "Canvas" },
    titulo: { es: "Un tablero infinito para pensar", en: "An infinite board to think on" },
    datos: [
      { es: "Terminales, notas e imágenes", en: "Terminals, notes and images" },
      { es: "Flechas de un agente al siguiente", en: "Arrows from one agent to the next" },
      { es: "Notas que se guardan como fichas", en: "Notes you save as runbooks" },
    ],
    voz: [
      {
        es: "En el Lienzo, las terminales viven en un tablero infinito,",
        en: "On the Canvas, those terminals live on an infinite board,",
      },
      {
        es: "con notas, imágenes y flechas que llevan el trabajo de un agente al siguiente.",
        en: "with notes, images, and arrows that hand one agent's work to the next.",
      },
    ],
  },
  {
    id: "archivos",
    tipo: "pantalla",
    imagen: "files.png",
    dura: 7.5,
    opcional: true,
    hacia: "aleja",
    adeo: "escucha",
    nombre: { es: "Archivos", en: "Files" },
    titulo: { es: "El proyecto, al lado de tus agentes", en: "Your project, beside your agents" },
    datos: [
      { es: "El árbol del proyecto, a mano", en: "The project tree, at hand" },
      { es: "Editor con imágenes y PDF", en: "Editor with images and PDFs" },
      { es: "Ctrl+K busca dentro de los archivos", en: "Ctrl+K searches inside the files" },
    ],
    voz: [
      {
        es: "Y al lado, los archivos del proyecto: los abres y los editas sin salir de aquí.",
        en: "And right beside them, the project's files: open and edit them without leaving.",
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
    dura: 12.5,
    corta: 5,
    hacia: "acerca",
    adeo: "quieta",
    nombre: { es: "Panel", en: "Dashboard" },
    titulo: { es: "Todo lo que está pasando, de un vistazo", en: "Everything going on, at a glance" },
    datos: [
      { es: "Quién trabaja y quién te espera", en: "Who is working, who is waiting" },
      { es: "Tu semana y tus proyectos, contados", en: "Your week and projects, counted" },
      { es: "El Capataz propone; tú das el OK", en: "The Foreman proposes; you say OK" },
    ],
    voz: [
      {
        es: "El Panel te lo cuenta de un vistazo: quién trabaja, quién te espera",
        en: "The Dashboard tells you at a glance: who's working, who's waiting,",
      },
      { es: "y cómo va tu semana.", en: "and how your week is going." },
      { es: "Y el Capataz te propone un plan: nada corre sin tu OK.", en: "And the Foreman drafts a plan: nothing runs without your OK." },
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
    dura: 10,
    hacia: "aleja",
    adeo: "escucha",
    nombre: { es: "Decisiones", en: "Decisions" },
    titulo: { es: "Tus agentes preguntan; tú eliges", en: "Your agents ask; you choose" },
    datos: [
      { es: "Opciones numeradas, para dictarlas", en: "Numbered options, easy to dictate" },
      { es: "Te llegan también al móvil", en: "They reach your phone too" },
      { es: "La respuesta vuelve a su terminal", en: "The answer returns to its terminal" },
    ],
    voz: [
      {
        es: "Si un agente necesita que elijas, te pregunta con opciones numeradas.",
        en: "When an agent needs you to choose, it asks with numbered options.",
      },
      {
        es: "Contestas, también desde el móvil, y la respuesta vuelve sola a su terminal.",
        en: "Answer, even from your phone, and the reply goes straight back to its terminal.",
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
    dura: 7.5,
    hacia: "acerca",
    adeo: "escucha",
    nombre: { es: "Cuentas", en: "Accounts" },
    titulo: { es: "Tus cuentas, tus cuotas, tu control", en: "Your accounts, your quotas, your call" },
    datos: [
      { es: "El límite más apretado, a la vista", en: "Your tightest limit, in plain sight" },
      { es: "Cada terminal con su cuenta", en: "Each terminal on its own account" },
      { es: "Las suscripciones que ya pagas", en: "The subscriptions you already pay" },
    ],
    voz: [
      {
        es: "En Cuentas ves cuánta cuota te queda, y eliges con qué cuenta nace cada terminal.",
        en: "Accounts shows how much quota you have left, and lets you pick the account each terminal starts on.",
      },
    ],
  },
  {
    id: "agenda",
    tipo: "pantalla",
    imagen: "agenda.png",
    dura: 10,
    hacia: "aleja",
    adeo: "piensa",
    nombre: { es: "Agenda", en: "Agenda" },
    titulo: { es: "Lo que viene, y lo que se lanza solo", en: "What's next, and what runs itself" },
    datos: [
      { es: "Tus objetivos del día", en: "Your goals for the day" },
      { es: "Las ideas que dejan los agentes", en: "Ideas your agents leave behind" },
      { es: "Encargos programados, con freno", en: "Scheduled jobs, with a breaker" },
    ],
    voz: [
      {
        es: "La Agenda guarda tus objetivos y las ideas que te dejan los agentes.",
        en: "The Agenda keeps your goals and the ideas your agents leave behind.",
      },
      { es: "Y lanza encargos sola, a la hora que tú digas.", en: "And it runs jobs on its own, at the time you set." },
    ],
  },
  {
    id: "comandos",
    tipo: "pantalla",
    imagen: "commands.png",
    dura: 7.5,
    opcional: true,
    hacia: "acerca",
    adeo: "trabaja",
    nombre: { es: "Comandos", en: "Commands" },
    titulo: { es: "Todo lo que puedes escribir, buscable", en: "Everything you can type, searchable" },
    datos: [
      { es: "Busca por lo que quieres hacer", en: "Search by what you want to do" },
      { es: "Un clic lo teclea en tu terminal", en: "One click types it in your terminal" },
      { es: "Los de cada agente y tus skills", en: "Every agent's, plus your skills" },
    ],
    voz: [
      { es: "Todo lo que puedes escribirle a un agente, buscable.", en: "Everything you can type to an agent, searchable." },
      { es: "Un clic, y lo teclea por ti.", en: "One click, and it types it for you." },
    ],
  },
  {
    id: "ajustes",
    tipo: "pantalla",
    imagen: "settings.png",
    dura: 5,
    opcional: true,
    hacia: "aleja",
    adeo: "baila",
    nombre: { es: "Ajustes", en: "Settings" },
    titulo: { es: "Hazlo tuyo", en: "Make it yours" },
    datos: [
      { es: "Temas, avisos y atajos", en: "Themes, alerts and shortcuts" },
      { es: "Un modelo local, si lo quieres", en: "A local model, if you want one" },
      { es: "Se actualiza sola, con firma", en: "Self-updating, signed releases" },
    ],
    voz: [{ es: "Temas, avisos, atajos: lo dejas a tu gusto.", en: "Themes, alerts, shortcuts: make it yours." }],
  },

  {
    id: "cierre",
    tipo: "cierre",
    dura: 10,
    corta: 5,
    voz: [
      { es: "Adeorq es gratis.", en: "Adeorq is free." },
      { es: "Sin cuenta, sin claves de API, y se actualiza sola.", en: "No account, no API keys, and it updates itself." },
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
