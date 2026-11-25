/* ============================================================================
   Adeorq · demo/vivo.js
   LO QUE HACE QUE LA DEMOSTRACIÓN SE PUEDA PULSAR.

   Lo que se ve es el DOM de la app, congelado (`datos-es.html`, `datos-en.html`,
   generados por `scripts/hacer-demo.mjs`). Congelado quiere decir que React no
   está: nada responde solo. Este archivo le devuelve los gestos, uno por uno,
   con las mismas clases y los mismos atributos que usa la app, para que su
   propia hoja de estilos haga el resto:

     · cambiar de vista, de sección y de tema
     · el inicio: pedirle algo a Adeo, contestar a quien espera, ir a un proyecto
     · la Cabina: enfocar, tapar, minimizar (a la tira de las apartadas),
       sacar a su ventana, maximizar y cerrar terminales, minimizarlas todas,
       ordenarlas en columnas y filas, la barra de proyectos (cada uno con su
       logo, `logos.js`), los paneles de la derecha (Adeo entre ellos, también
       con Ctrl+Mayús+A) y la paleta de Ctrl+K
     · Adeo flotando, en las demás vistas; el Chat con sus dos pestañas
     · el Lienzo: arrastrar las piezas, mover y acercar el tablero, tachar tareas
     · el Perfil y sus cuatro secciones, tu uso, las decisiones con su menú de
       Posponer, los objetivos, los comandos y las cuentas

   Lo que no se puede imitar sin mentir (abrir una terminal de verdad, llamar a
   un agente) no se finge: Adeo lo cuenta al lado de lo que has pulsado
   (`explica.js`). Ningún botón se queda mudo: el que no tiene gesto propio
   cuenta lo que hace con su propio globo de ayuda. Y la primera vez, Adeo
   enseña la demo por partes, con flechas (el recorrido, al final).
   ========================================================================= */

import { ponerModoLigero } from '../portada/ligero.js';

const $ = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];

// Sin tarjeta gráfica, sin cristal (portada/ligero.js y demo.css). Dentro de la
// portada lo decide ella y aquí se copia; abierta suelta, lo mira esta página.
ponerModoLigero();

const consulta = new URLSearchParams(location.search);
const EN = consulta.get('lang') === 'en';
const raiz = document.getElementById('root');
const html = document.documentElement;

/* Dentro de un <iframe> (la portada) la demostración no se queda con la rueda
   del ratón hasta que alguien pulsa dentro. Ver demo.css. */
const embebida = window.top !== window.self || consulta.has('quieta');

/* --------------------------------------------------------------------------
   LO QUE DICE LA DEMOSTRACIÓN
   Solo sus propios avisos: todo lo demás viene escrito en el volcado, en el
   idioma en que se hizo.
   -------------------------------------------------------------------------- */

const T = EN ? {
  deRotulo: (r) => `"${r}" does its job in the app. This is a copy you can click around, with no agents behind it.`,
  adeo: "I'm Adeo. In the app I tell you when a terminal is waiting for you, and one click takes you to it.",
  cerrada: 'Terminal closed. In the app that stops its agent.',
  ultima: 'In the app an empty Cockpit lets you pick a project to open. Here one stays, so there is something to look at.',
  respuesta: (n) => `In the app that types "${n}" into the terminal and the agent carries on.`,
  emisionSi: 'Stream mode on: paths, names and keys are hidden so you can share your screen.',
  emisionNo: 'Stream mode off.',
  pedir: 'In the app, Adeo opens a new conversation in Chat with this, splits it into sessions and the router picks the model.',
  pedirVacio: 'Tell Adeo what you want, in your own words.',
  tarjeta: 'In the app this opens the card to share your usage, as an image or as a video.',
  planear: 'In the app Adeo proposes the board (which sessions, which agents, in which folders) and opens nothing without your OK.',
  planearVacio: 'Type what you want set up, or click one of the examples below.',
  tema: (n) => `${n} theme. In the app the terminals change colour with it; here they keep the colours of the day they were captured.`,
  comando: (c) => `In the app, ${c} is typed into the terminal in front of you.`,
  sesion: 'In the app a click takes you to that session, or resumes it where you left it.',
  chat: "In the app, what you type here goes to that session's own terminal and the answer comes back as a conversation.",
  enviada: 'Answer sent. In the app, the agent that asked reads it and carries on.',
  faltan: (l) => (l.length === 0 ? 'Everything is answered.' : l.length === 1 ? `Question ${l[0]} is missing.` : `Questions ${l.slice(0, -1).join(', ')} and ${l[l.length - 1]} are missing.`),
  notaNueva: 'New note',
  lineaNueva: 'Double click the title to name it. It saves itself.',
  tareaNueva: 'New task',
  anadir: 'In the app you choose what to add: a note, a pomodoro, a stopwatch, a calculator or a calendar. Here you get a note.',
  herramienta: 'In the app, this tool draws on the board, on top of your terminals.',
  abrirAqui: (q) => `In the app this opens ${q} right here on the board, in that project.`,
  carpeta: 'In the app the folder opens in place, with the colour of what changed since the last commit.',
  archivo: 'In the app the file opens in a panel next to your terminals, and you can edit it there.',
  proyecto: 'In the app one click opens the whole project: every session it had, each in its own terminal.',
  decisionVieja: 'In the app that decision opens with what you answered. They delete themselves after a week.',
  contesta: 'In the app this takes you to the terminal that is waiting for you, with its question in view.',
  idea: 'In the app the idea opens with what the agent proposes: accept it, snooze it or discard it.',
  pospuesta: (cuando) => `Snoozed: ${cuando}. In the app it moves to Snoozed and comes back by itself, sooner if the agent says something new.`,
  otraHora: 'In the app you type the time: 16:30, +45 or in 2 h.',
  nota: 'In the app that note opens, with where it leads and what links to it.',
  noCarga: 'The demo could not be loaded.',
  copia: 'The app does that for real. This is a copy you can click around, with no agents behind it.',
  // The strip of set-aside terminals and «Minimise all», with the app's own words.
  apartadas: 'Set aside',
  traerla: 'Bring it back to the mosaic',
  traerTodas: 'Bring them all back',
  minimizarTodas: 'Minimise all',
  tipTraerTodas: 'Bring everything that is set aside back to the mosaic',
  tipApartarTodas: 'Set every terminal aside: they stay alive in the strip below',
  cerrarTerminal: 'Close terminal',
  mata: 'Kills the agent inside',
  otraVez: 'Press again to close it',
  estados: { a_medias: 'working', pregunta: 'WAITING FOR YOU', lista: 'finished' },
  apartada: 'Set aside, and still working. Click its tab down here to bring it back.',
  suelta: 'In the app it goes to its own window, for another monitor. Here it floats: drag it by its bar, and the same button puts it back.',
  devolver: 'Back to Adeorq (it keeps working)',
  // «Arrange the terminals» (LayoutPicker.tsx).
  ordena: 'Arrange what you have open',
  cxr: (c, r) => `${c} by ${r}`,
  cuenta: (c, r) => `${c === 1 ? '1 column' : `${c} columns`} and ${r === 1 ? '1 row' : `${r} rows`}: room for ${c * r}`,
  grande: 'Or one big one and the rest beside it',
  // The app's footer is about dragging bars and seams, which the demo cannot do: this one says what it does.
  ordenaPie: 'Click a square and the terminals in view are shared out into those columns and rows. The ones set aside stay in their strip.',
  verRecorrido: 'Show me around',
  // What a screen reader calls the demo's landmarks, apart from the home page's own.
  zonas: [['header.topbar', 'Adeorq bar (demo)'], ['nav.tabs', 'Adeorq views (demo)'], ['main.grid', 'Terminals (demo)'], ['main.chat-hilo', 'Conversation (demo)']],
  // The tour: one short line per stop.
  recorrido: [
    ['Your projects', 'Each one with its logo. One click unfolds its sessions.'],
    ['One agent, one terminal', 'Hide it, set it aside or enlarge it. Try it: minimise this one.'],
    ['Set aside, still working', 'They report from down here. Click one to bring it back.'],
    ['When it asks for permission', 'You answer right here, without hunting for its window.'],
    ['Arrange them your way', 'Columns and rows, like inserting a table.'],
    ["And me, I'm Adeo", 'I tell you when an agent is waiting. Lienzo, Chat and Decisions are up here. Now, click anything.'],
  ],
} : {
  deRotulo: (r) => `«${r}» hace su trabajo en la app. Esto es una copia para tocar, sin agentes detrás.`,
  adeo: 'Soy Adeo. En la app aviso cuando una terminal te espera, y con un clic te llevo a ella.',
  cerrada: 'Terminal cerrada. En la app, eso para a su agente.',
  ultima: 'En la app, con la Cabina vacía eliges qué proyecto abrir. Aquí se queda una, para que haya algo que mirar.',
  respuesta: (n) => `En la app, eso escribe «${n}» en la terminal y el agente sigue.`,
  emisionSi: 'Modo emisión encendido: se tapan rutas, nombres y claves para poder compartir la pantalla.',
  emisionNo: 'Modo emisión apagado.',
  pedir: 'En la app, Adeo abre con esto una conversación nueva en el Chat, la reparte en sesiones y el router elige el modelo.',
  pedirVacio: 'Dile a Adeo lo que quieres, con tus palabras.',
  tarjeta: 'En la app esto abre la tarjeta para compartir tu uso, como imagen o como vídeo.',
  planear: 'En la app, Adeo propone el tablero (qué sesiones, qué agentes, en qué carpetas) y no abre nada sin tu OK.',
  planearVacio: 'Escribe qué quieres montar, o pulsa uno de los ejemplos de abajo.',
  tema: (n) => `Tema ${n}. En la app las terminales cambian de color con él; aquí conservan los del día en que se copiaron.`,
  comando: (c) => `En la app, ${c} se escribe en la terminal que tengas delante.`,
  sesion: 'En la app, un clic te lleva a esa sesión, o la retoma donde la dejaste.',
  chat: 'En la app, lo que escribes aquí va a la terminal de esa sesión y la respuesta vuelve como conversación.',
  enviada: 'Respuesta enviada. En la app, el agente que preguntó la lee y sigue trabajando.',
  faltan: (l) => (l.length === 0 ? 'Todo contestado.' : l.length === 1 ? `Falta la pregunta ${l[0]}.` : `Faltan las preguntas ${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}.`),
  notaNueva: 'Nota nueva',
  lineaNueva: 'Doble clic en el título para ponerle nombre. Se guarda sola.',
  tareaNueva: 'Tarea nueva',
  anadir: 'En la app eliges qué añadir: una nota, un pomodoro, un cronómetro, una calculadora o un calendario. Aquí sale una nota.',
  herramienta: 'En la app, con esta herramienta dibujas en el tablero, por encima de tus terminales.',
  abrirAqui: (q) => `En la app, esto abre ${q} aquí mismo, en el tablero y en ese proyecto.`,
  carpeta: 'En la app la carpeta se despliega en su sitio, con el color de lo que ha cambiado desde el último commit.',
  archivo: 'En la app el archivo se abre en un panel al lado de tus terminales, y lo editas ahí mismo.',
  proyecto: 'En la app, un clic abre el proyecto entero: todas las sesiones que tenía, cada una en su terminal.',
  decisionVieja: 'En la app esa decisión se abre con lo que contestaste. A la semana se borran solas.',
  contesta: 'En la app te lleva a la terminal que te espera, con su pregunta a la vista.',
  idea: 'En la app se abre la idea con lo que propone el agente: aceptarla, posponerla o descartarla.',
  pospuesta: (cuando) => `Pospuesta: ${cuando}. En la app pasa a «Pospuesto» y vuelve sola, antes si el agente dice algo nuevo.`,
  otraHora: 'En la app escribes la hora: 16:30, +45 o en 2 h.',
  nota: 'En la app se abre esa nota, con a dónde lleva y quién llega hasta ella.',
  noCarga: 'La demostración no ha podido cargarse.',
  copia: 'Eso lo hace la app de verdad. Esto es una copia para tocar, sin agentes detrás.',
  // La tira de las apartadas y «Minimizar todas», con las palabras de la app.
  apartadas: 'Apartadas',
  traerla: 'Traerla de vuelta al mosaico',
  traerTodas: 'Traer todas',
  minimizarTodas: 'Minimizar todas',
  tipTraerTodas: 'Devolver al mosaico todo lo que está apartado',
  tipApartarTodas: 'Apartar todas las terminales: siguen vivas en la tira de abajo',
  cerrarTerminal: 'Cerrar terminal',
  mata: 'Mata al agente que hay dentro',
  otraVez: 'Pulsa otra vez para cerrarla',
  estados: { a_medias: 'trabajando', pregunta: 'TE ESPERA', lista: 'terminó' },
  apartada: 'Apartada, y sigue trabajando. Pulsa su ficha aquí abajo para traerla.',
  suelta: 'En la app sale a su propia ventana, para otro monitor. Aquí flota: arrástrala por su barra, y el mismo botón la devuelve.',
  devolver: 'Devolver a Adeorq (sigue trabajando)',
  // «Ordenar las terminales» (LayoutPicker.tsx).
  ordena: 'Ordena lo que tienes abierto',
  cxr: (c, r) => `${c} por ${r}`,
  cuenta: (c, r) => `${c === 1 ? '1 columna' : `${c} columnas`} y ${r === 1 ? '1 fila' : `${r} filas`}: caben ${c * r}`,
  grande: 'O una grande y el resto al lado',
  // El pie de la app habla de arrastrar barras y bordes, que aquí no se puede: este dice lo que sí hace.
  ordenaPie: 'Pulsa una casilla y las terminales que ves se reparten en esas columnas y filas. Las apartadas siguen en su tira.',
  verRecorrido: 'Enséñame la demo',
  // Cómo llama un lector de pantalla a las zonas de la demo, distintas de las de la portada.
  zonas: [['header.topbar', 'Barra de Adeorq (demo)'], ['nav.tabs', 'Vistas de Adeorq (demo)'], ['main.grid', 'Terminales (demo)'], ['main.chat-hilo', 'Conversación (demo)']],
  // El recorrido: una línea corta por parada.
  recorrido: [
    ['Tus proyectos', 'Cada uno con su logo. Un clic despliega sus sesiones.'],
    ['Un agente, una terminal', 'Tápala, apártala o amplíala. Pruébalo: minimiza esta.'],
    ['Apartadas, y trabajando', 'Siguen contando qué hacen desde aquí abajo. Pulsa una para traerla.'],
    ['Cuando te pide permiso', 'Lo contestas aquí mismo, sin buscar su ventana.'],
    ['Ordénalas a tu manera', 'Columnas y filas, como al insertar una tabla.'],
    ['Y yo soy Adeo', 'Te aviso cuando un agente te espera. Arriba tienes el Lienzo, el Chat y las decisiones. Ahora, toca lo que quieras.'],
  ],
};

/* --------------------------------------------------------------------------
   1. LA ESCALA
   La ventana mide 1920 x 1080 por dentro pase lo que pase. En la portada el
   <iframe> ya tiene esa medida y la escala es 1; abierta suelta, se encoge
   para caber y se centra.
   -------------------------------------------------------------------------- */

const estado = { vista: 'cabina', lupa: 1, lateral: -1 };

function escalar() {
  const k = Math.min(innerWidth / 1920, innerHeight / 1080) || 1;
  estado.lupa = k;
  raiz.style.setProperty('--lupa', String(k));
  raiz.style.left = Math.max(0, (innerWidth - 1920 * k) / 2) + 'px';
  raiz.style.top = Math.max(0, (innerHeight - 1080 * k) / 2) + 'px';
}
escalar();
addEventListener('resize', escalar, { passive: true });

/** Un rectángulo de pantalla, en las medidas de dentro de la ventana. */
function dentro(r) {
  const o = raiz.getBoundingClientRect();
  const k = estado.lupa;
  return { left: (r.left - o.left) / k, top: (r.top - o.top) / k, width: r.width / k, height: r.height / k, right: (r.right - o.left) / k, bottom: (r.bottom - o.top) / k };
}

/* --------------------------------------------------------------------------
   2. CARGAR LA VENTANA
   -------------------------------------------------------------------------- */

/* Los archivos de la demostración no cambian de nombre entre un despliegue y el
   siguiente, así que el build les pone un sello con su contenido (`?v=`, ver
   `stampDemo` en vite.config.js). Este archivo se lo pasa a los datos que pide,
   o el navegador juntaría un vivo.js nuevo con una ventana vieja. */
const sello = new URL(import.meta.url).searchParams.get('v');
const conSello = (archivo) => `${archivo}${sello ? `?v=${sello}` : ''}`;

/* Los logos de los proyectos y Adeo explicando llegan a la vez que la ventana,
   con el mismo sello: un `import` fijo los pediría sin él. */
let ponerLogos, prepararAdeo, recorridoVisto;
try {
  const [respuesta, logos, explica] = await Promise.all([
    fetch(conSello(`datos-${EN ? 'en' : 'es'}.html`)),
    import(conSello('./logos.js')),
    import(conSello('./explica.js')),
  ]);
  if (!respuesta.ok) throw new Error(String(respuesta.status));
  raiz.innerHTML = await respuesta.text();
  ({ ponerLogos } = logos);
  ({ prepararAdeo, recorridoVisto } = explica);
} catch (e) {
  raiz.textContent = T.noCarga;
  raiz.removeAttribute('aria-busy');
  throw e;
}

// Antes de copiar nada (la barra de siempre, las plantillas): que nazca todo con su logo.
ponerLogos(raiz);

/* NOMBRES PARA UN LECTOR DE PANTALLA. Los botones de solo icono de la app
   llevan su texto en `data-tip` (su globo), que un lector no lee: aquí pasa a
   su `aria-label`, la primera frase. Y las zonas de la demo (la barra, las
   vistas, el contenido) se llaman distinto que las de la portada que la
   rodea, o un lector oiría dos «banner» y dos «main» iguales. axe-core, en la
   portada: 32 botones sin nombre y 3 zonas repetidas. Va también dentro de
   las plantillas, para que lo que se copie de ellas nazca con su nombre. */
function ponerNombres(d) {
  for (const b of d.querySelectorAll('button[data-tip], [role="button"][data-tip]')) {
    if (b.hasAttribute('aria-label') || b.hasAttribute('aria-labelledby') || b.title || b.textContent.trim() || b.querySelector('img[alt]:not([alt=""])')) continue;
    const nombre = b.dataset.tip.split('\n')[0].split(' · ')[0].trim();
    if (nombre) b.setAttribute('aria-label', nombre);
  }
  for (const [sel, nombre] of T.zonas) for (const z of d.querySelectorAll(sel)) if (!z.hasAttribute('aria-label')) z.setAttribute('aria-label', nombre);
  for (const t of d.querySelectorAll('template')) ponerNombres(t.content);
}
ponerNombres(raiz);

const app = $('.app', raiz);
const meta = $('meta[name="adeorq-raiz"]', raiz);
if (meta) {
  // Los atributos de <html> de la app: el idioma y el tema con que se volcó.
  try {
    for (const [k, v] of Object.entries(JSON.parse(meta.content))) html.setAttribute(k, v);
  } catch { /* se queda con los de la página */ }
}
raiz.removeAttribute('aria-busy');

const plantilla = (id) => {
  const t = document.getElementById('t-' + id);
  return t ? t.content.cloneNode(true) : null;
};
const unaPieza = (id) => plantilla(id)?.firstElementChild ?? null;

/* --------------------------------------------------------------------------
   3. ADEO LO CUENTA, Y EL GLOBO
   Lo que la demo no puede hacer lo dice Adeo, que baja de su sitio en la
   barra y habla al lado de lo que se acaba de tocar (`explica.js`).
   -------------------------------------------------------------------------- */

/** Cuántos píxeles de pantalla mide uno de la ventana: dentro de la portada,
 *  lo que la encoge ella; suelta, lo que la encoge `escalar`. */
function escalaDePantalla() {
  try {
    const marco = window.frameElement;
    // El lado largo: a pantalla completa en un móvil en vertical, la portada la
    // tumba, y entonces el ancho en pantalla es su alto.
    if (marco) {
      const r = marco.getBoundingClientRect();
      return Math.max(r.width, r.height) / 1920 || estado.lupa;
    }
  } catch { /* dentro de una página de otro origen */ }
  return estado.lupa;
}

const adeo = prepararAdeo({
  app,
  EN,
  dentro: (r) => dentro(r),
  escala: escalaDePantalla,
  casa: () => $('.brand .campana .mascota', app),
  pegado: () => $$('.brand .campana .campana-n', app),
});

/* Lo último que se tocó: ahí al lado habla Adeo. */
let ultimoToque = null;
app.addEventListener('pointerdown', (e) => { ultimoToque = e.target; }, true);
app.addEventListener('keydown', (e) => { ultimoToque = e.target; }, true);

function avisar(texto, cerca = ultimoToque, extra) {
  quitarGlobo();
  adeo.decir(texto, cerca, extra);
}

/* El globo de ayuda de la app (`data-tip`), con sus mismas clases. */
let globo = null;
let relojGlobo = 0;

function quitarGlobo() {
  clearTimeout(relojGlobo);
  globo?.remove();
  globo = null;
}

function ponerGlobo(el) {
  quitarGlobo();
  const texto = el.dataset.tip;
  if (!texto || !el.isConnected) return;
  const [principal, ...resto] = texto.split('\n');
  globo = document.createElement('div');
  globo.className = 'tip';
  const m = document.createElement('span');
  m.className = 'tip-main';
  m.textContent = principal;
  globo.appendChild(m);
  if (resto.length) {
    const s = document.createElement('span');
    s.className = 'tip-sub';
    s.style.whiteSpace = 'pre-line';
    s.textContent = resto.join('\n');
    globo.appendChild(s);
  }
  app.appendChild(globo);
  const r = dentro(el.getBoundingClientRect());
  const g = dentro(globo.getBoundingClientRect());
  let y = r.bottom + 8;
  if (y + g.height > 1080 - 6) y = r.top - g.height - 8;
  const x = Math.max(g.width / 2 + 6, Math.min(1920 - g.width / 2 - 6, r.left + r.width / 2));
  globo.style.left = x + 'px';
  globo.style.top = Math.max(6, y) + 'px';
}

app.addEventListener('mouseover', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (!el || el === globo?.dataset) return;
  // Mientras Adeo habla, el globo de la app no sale encima de él.
  if ($('.adeo-dice', app)) return;
  clearTimeout(relojGlobo);
  relojGlobo = setTimeout(() => ponerGlobo(el), 380);
});
app.addEventListener('mouseout', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el && !el.contains(e.relatedTarget)) quitarGlobo();
});
app.addEventListener('pointerdown', quitarGlobo, true);

/* --------------------------------------------------------------------------
   4. LA RUEDA
   -------------------------------------------------------------------------- */

/* PRIMERO SE LEE TODO, LUEGO SE ESCRIBE. Leía el estilo de una pieza y le
   ponía su clase en la misma vuelta: cada clase nueva ensuciaba el estilo y la
   lectura siguiente obligaba al navegador a recalcularlo, y como la hoja de la
   app lleva consultas de contenedor (`@container`), leer el estilo de lo que
   cuelga de una obliga además a maquetar. Medido el 2026-11-21 en la carga de
   la portada (Brave sin cabeza, 1920 x 1080, traza con pilas): 47 recálculos y
   maquetaciones forzados desde esta función. Separadas las dos pasadas, queda
   uno como mucho, y ninguno si la pieza ya está pintada (ver «Después del
   primer pintado», abajo). Las piezas marcadas son las mismas: comprobado
   pieza por pieza en catorce pantallas de la demo. */
function marcarRuedas(desde) {
  if (!embebida) return;
  const ruedas = [];
  const sinCristal = [];
  for (const e of [desde, ...$$('*', desde)]) {
    const c = getComputedStyle(e);
    if (!e.classList.contains('demo-rueda') && /auto|scroll/.test(c.overflowY + ' ' + c.overflowX)) ruedas.push(e);
    if (cristalTapado(e, c)) sinCristal.push(e);
  }
  for (const e of ruedas) e.classList.add('demo-rueda');
  for (const e of sinCristal) e.classList.add('demo-sin-cristal');
}

/* EL CRISTAL QUE NO SE VE. Media app lleva `backdrop-filter` (la barra de
   arriba, la de proyectos, la cabecera de cada terminal), pero con el tema con
   el que abre la demostración su propio fondo es opaco, o casi (del 95 % al
   100 %): el desenfoque de detrás no llega a verse. A la gráfica le cuesta lo
   mismo que si se viera, y dentro de la portada lo vuelve a calcular en CADA
   fotograma en que la página baja con la demostración a la vista, porque para
   ella todo lo de detrás se ha movido. Era la mitad de los tirones al bajar
   desde arriba (lo medido, en demo.css). Aquí se le quita solo a la pieza cuyo
   fondo lo tapa; un menú, un aviso o un tema con paneles traslúcidos lo
   conservan. Va con la misma pasada que las ruedas, que ya lee el estilo de
   cada pieza. */
const TAPA = 0.95;

/** La opacidad de un color ya calculado: `rgb()`, `rgba()` o `color(… / a)`. */
function opacidadDe(color) {
  const conBarra = /\/\s*([\d.]+)(%?)\s*\)\s*$/.exec(color);
  if (conBarra) return parseFloat(conBarra[1]) / (conBarra[2] ? 100 : 1);
  const rgba = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\s*\)$/.exec(color);
  return rgba ? parseFloat(rgba[1]) : 1;
}

/** Si la pieza lleva cristal y su propio fondo lo tapa. Solo lee: la clase la
 *  pone quien llama, después de leer todas (ver `marcarRuedas`). */
function cristalTapado(e, c) {
  if (e.classList.contains('demo-sin-cristal')) return false;
  const cristal = c.backdropFilter ?? c.webkitBackdropFilter;
  if (!cristal || cristal === 'none') return false;
  return opacidadDe(c.backgroundColor) >= TAPA;
}

/** Con otro tema los fondos cambian: se devuelve el cristal a todas y se vuelve
 *  a mirar cuando el cambio de color ha terminado (los fondos van con transición). */
let relojCristal = 0;
function repasarCristal() {
  if (!embebida) return;
  for (const e of $$('.demo-sin-cristal', app)) e.classList.remove('demo-sin-cristal');
  clearTimeout(relojCristal);
  relojCristal = setTimeout(() => {
    const tapados = [app, ...$$('*', app)].filter((e) => cristalTapado(e, getComputedStyle(e)));
    for (const e of tapados) e.classList.add('demo-sin-cristal');
  }, 700);
}

/* DESPUÉS DEL PRIMER PINTADO. La primera pasada, la de la ventana entera,
   leía el estilo nada más entrar la ventana, sin nada colocado aún: la primera
   lectura obligaba a maquetarla entera dentro del script, con las 47 vueltas
   de arriba detrás. Era el grueso del `.then` de `Response.text` (2.751 ms de
   script, 2.254 forzados, en la medida que abrió esto). Medido el 2026-11-21,
   tres trazas de cada, alternadas, con la máquina al 100 % de CPU por otras
   sesiones (reloj y, entre paréntesis, CPU):

     antes   el .then  1.359 a 2.545 ms (278 a 373), 865 a 2.304 forzados
     ahora   el .then     92 a 522 ms (47 a 57), sin nada forzado
             1.ª maquetación, ya del navegador: 895 a 1.344 ms (222 a 247)
             esta pasada, en su propia tarea: 97 a 405 ms (51 a 91)

   La maquetación no desaparece: hace falta para pintar, y la paga el primer
   fotograma igual. Casi todo su reloj es esperar al proceso del navegador
   para cargar las letras del sistema (Consolas, Segoe UI Symbol, Cambria
   Math y la ronda de respaldo de los caracteres que no están en ninguna): en
   una traza, 1.595 ms de reloj y 173 de CPU. Mientras llega esta pasada, un
   fotograma: las zonas con scroll propio aún se quedan con la rueda y las
   piezas opacas aún llevan su cristal, que no se ve. El reloj de reserva es
   para cuando no llegan fotogramas (una pestaña de fondo; en una de las
   cuatro trazas, el primer `requestAnimationFrame` de la demo tardó más de
   dos segundos): entonces lee igual, y la maquetación ya suele estar hecha. */
function trasElPrimerPintado(hacer) {
  let hecho = false;
  const una = () => {
    if (hecho) return;
    hecho = true;
    hacer();
  };
  requestAnimationFrame(() => setTimeout(una, 0));
  setTimeout(una, 2000);
}

if (embebida) {
  trasElPrimerPintado(() => marcarRuedas(app));
  html.dataset.quieta = '';
  /* Con ratón, pulsar dentro la suelta y salir la vuelve a dejar quieta. Con el
     dedo, tocar ES empezar a deslizar: si el toque la soltara, el gesto con el
     que alguien baja la portada se quedaría dentro. Así que el dedo la suelta
     con un toque de verdad (un `click`: tocar y levantar sin moverse), y vuelve
     a quedarse quieta en cuanto la portada se mueve. Quieta, además, deja pasar
     el dedo por encima de lo que en la app se arrastra (ver demo.css). */
  let puntero = 'mouse';
  document.addEventListener('pointerdown', (e) => {
    puntero = e.pointerType || 'mouse';
    if (puntero === 'mouse') delete html.dataset.quieta;
  }, true);
  document.addEventListener('click', () => { if (puntero !== 'mouse') delete html.dataset.quieta; }, true);
  html.addEventListener('mouseleave', () => { if (!completa) html.dataset.quieta = ''; });
  try {
    window.parent.addEventListener('scroll', () => { if (puntero !== 'mouse' && !completa) html.dataset.quieta = ''; }, { passive: true });
  } catch { /* dentro de una página de otro origen: se queda como esté */ }
}

/* A pantalla completa (portada/completa.js) no hay página que bajar: la demo
   se suelta del todo, y la rueda y el dedo vuelven a ser suyos, como en la app.
   Al cerrar se queda quieta otra vez, como al llegar. */
let completa = false;
function pantallaCompleta(si) {
  completa = !!si;
  if (!embebida) return;
  if (completa) delete html.dataset.quieta;
  else html.dataset.quieta = '';
}

/* --------------------------------------------------------------------------
   5. LAS VISTAS
   La Cabina y el Lienzo viven dentro de `.view-cabina`, que la app enseña o
   esconde con un `display` escrito en línea; las demás son una hoja que cuelga
   de `.app`. Aquí se hace lo mismo, con la hoja sacada de su plantilla la
   primera vez que se abre.
   -------------------------------------------------------------------------- */

const cabina = $('.view-cabina', app);
const elLienzo = $('.view-lienzo', app);
const hojas = new Map();

function hojaDe(vista, seccion = 0) {
  return unaPieza(`v-${vista}--${seccion}`) ?? unaPieza(`v-${vista}`);
}

/** «‹ Perfil › Agenda», encima de las cuatro que viven dentro del Perfil. */
const vueltas = new Map();

/* Cuentas, Agenda, Memoria y Comandos ya no tienen pestaña (`DEL_PERFIL` en la
   app): se llega a ellas desde su resumen en el Perfil, y estando en una se
   enciende la del Perfil. */
const DEL_PERFIL = ['cuentas', 'agenda', 'memoria', 'comandos'];
const pestanaDe = (vista) => (DEL_PERFIL.includes(vista) ? 'perfil' : vista);

function irA(vista) {
  if (!$(`nav.tabs .tab[data-tab="${pestanaDe(vista)}"]`, app)) return;
  estado.vista = vista;
  for (const t of $$('nav.tabs .tab', app)) t.dataset.active = String(t.dataset.tab === pestanaDe(vista));

  const deCabina = vista === 'cabina' || vista === 'lienzo';
  cabina.dataset.vista = vista;
  cabina.style.display = deCabina ? 'flex' : 'none';
  if (elLienzo) elLienzo.style.display = vista === 'lienzo' ? 'flex' : 'none';

  // Los tres botones del final de la barra solo existen con la Cabina delante.
  let b = $('.topbar-acciones .foreman-call', app)?.nextElementSibling;
  for (; b; b = b.nextElementSibling) b.hidden = vista !== 'cabina';

  if (!deCabina && !hojas.has(vista)) {
    const hoja = hojaDe(vista);
    if (hoja) {
      const vuelta = unaPieza(`x-volver-${vista}`);
      if (vuelta) {
        app.appendChild(vuelta);
        vueltas.set(vista, vuelta);
      }
      app.appendChild(hoja);
      hojas.set(vista, hoja);
      marcarRuedas(hoja);
    }
  }
  for (const [v, hoja] of hojas) hoja.hidden = v !== vista;
  for (const [v, vuelta] of vueltas) vuelta.hidden = v !== vista;
  cerrarPaleta();
  cerrarCapataz();
  cerrarDisposicion();
  // El recorrido enseña la Cabina: quien se va a otra pantalla ya está mirando por su cuenta.
  if (vista !== 'cabina') adeo.parar();
}

/** Las pestañas de dentro de una vista (Ahora / Proyectos, las de Cuentas, las
 *  de Ajustes): cada una es la hoja entera, volcada con esa pestaña abierta. */
function irASeccion(boton) {
  const hoja = hojas.get(estado.vista);
  if (!hoja) return;
  const n = $$('nav.set-nav button.set-tab', hoja).indexOf(boton);
  const nueva = hojaDe(estado.vista, n);
  if (n < 0 || !nueva) return;
  hoja.replaceWith(nueva);
  hojas.set(estado.vista, nueva);
  marcarRuedas(nueva);
}

/* --------------------------------------------------------------------------
   6. LA CABINA
   -------------------------------------------------------------------------- */

const rejilla = $('main.grid', app);

/** Qué botón es, por su dibujo: los rótulos cambian con el idioma, el dibujo no. */
const dibujo = (boton) => boton.querySelector('svg')?.innerHTML ?? '';
const ES_OJO = 'M2 12s3.8-6';
const ES_MINIMIZAR = 'M7.5 16.5h9';
const ES_SACAR = 'M20 4l-8 8';
const ES_MAXIMIZAR = 'M9 4H6a2';

function enfocar(panel) {
  for (const p of $$('.pane', app)) p.dataset.focused = String(p === panel);
}

/* EL MOSAICO. Como en la app (`lib/layout.ts`): columnas de izquierda a
   derecha, cada una con su peso (lo que ocupa de ancho) y sus terminales de
   arriba abajo. Una apartada o sacada a su ventana sigue en su columna, sin
   ocupar sitio, y al volver vuelve a su hueco. Se lee del volcado. */
const mosaico = [];
{
  const cols = new Map();
  for (const p of $$(':scope > .pane', rejilla)) {
    const x = parseFloat(p.style.left) || 0;
    if (!cols.has(x)) cols.set(x, { peso: parseFloat(p.style.width) || 1, panes: [] });
    cols.get(x).panes.push(p);
  }
  for (const x of [...cols.keys()].sort((a, b) => a - b)) {
    const c = cols.get(x);
    c.panes.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    mosaico.push(c);
  }
}

const enMosaico = (p) => p.isConnected && !p.dataset.demoFuera && !p.dataset.demoApartada && !p.dataset.demoSuelta;
const todas = () => mosaico.flatMap((c) => c.panes).filter((p) => p.isConnected && !p.dataset.demoFuera);
const apartadas = () => todas().filter((p) => p.dataset.demoApartada);

/** Reparte la rejilla entre las que se ven: las columnas se reparten el
 *  ancho por su peso, y cada una reparte el alto entre las suyas. */
function recolocar() {
  for (const c of mosaico) c.panes = c.panes.filter((p) => p.isConnected && !p.dataset.demoFuera);
  for (let i = mosaico.length - 1; i >= 0; i--) if (!mosaico[i].panes.length) mosaico.splice(i, 1);
  const cols = mosaico.map((c) => ({ peso: c.peso, panes: c.panes.filter(enMosaico) })).filter((c) => c.panes.length);
  const total = cols.reduce((a, c) => a + c.peso, 0) || 1;
  let x = 0;
  for (const c of cols) {
    c.x = x;
    c.w = (100 * c.peso) / total;
    c.panes.forEach((p, j) => {
      p.style.left = c.x + '%';
      p.style.width = c.w + '%';
      p.style.top = (100 * j) / c.panes.length + '%';
      p.style.height = 100 / c.panes.length + '%';
    });
    x += c.w;
  }
  pintarJuntas(cols);
  const cuenta = $('nav.tabs .tab[data-tab="cabina"] .tab-count', app);
  if (cuenta) cuenta.textContent = String(todas().length);
  pintarTira();
  pintarTodas();
}

/** Las juntas entre terminales (`.divider`), donde caen ahora. */
function pintarJuntas(cols) {
  for (const d of $$(':scope > .divider', rejilla)) d.remove();
  cols.forEach((c, i) => {
    if (i > 0) {
      const d = document.createElement('div');
      d.className = 'divider divider-col';
      d.style.left = c.x + '%';
      rejilla.appendChild(d);
    }
    for (let j = 1; j < c.panes.length; j++) {
      const d = document.createElement('div');
      d.className = 'divider divider-row';
      d.style.top = (100 * j) / c.panes.length + '%';
      d.style.left = c.x + '%';
      d.style.width = c.w + '%';
      rejilla.appendChild(d);
    }
  });
}

function cerrarPanel(panel) {
  const nodo = panel.closest('.react-flow__node');
  if (nodo) return quitarNodo(nodo);
  if (todas().length <= 1) return avisar(T.ultima);
  if (panel.dataset.demoMax) maximizar(panel);
  panel.dataset.demoFuera = 'si';
  setTimeout(() => { panel.remove(); recolocar(); }, 190);
  avisar(T.cerrada);
}

/* LA TIRA DE LAS APARTADAS, al pie del mosaico, con las piezas de la app
   (`.minim`, `.minim-chip`…): cada ficha dice qué agente corre dentro, cómo
   va (la que te espera, en ámbar) y lo que ocupa, y al pulsarla vuelve. */
let tira = null;

/** Lo que dice de sí misma una terminal: te espera, terminó o trabaja. */
const estadoDe = (p) => ($('.pane-ask', p) ? 'pregunta' : p.dataset.done === 'true' ? 'lista' : 'a_medias');

/** «landing-web · claude code» es «landing-web»: el dibujo ya dice el cliente. */
const sinCliente = (nombre) => nombre.replace(/\s·\s(claude code|claude|codex|gemini|terminal|powershell)\s*$/i, '');

function ficha(p) {
  const estado = estadoDe(p);
  const b = document.createElement('button');
  b.className = 'minim-chip';
  b.dataset.estado = estado;
  if (estado === 'pregunta') b.dataset.urge = 'true';
  b.setAttribute('aria-label', `${nombreDePanel(p)}, ${T.estados[estado]}. ${T.traerla}`);
  fichas.set(b, p);
  const ico = document.createElement('span');
  ico.className = 'minim-ico';
  const marca = $('.ph-id svg', p);
  if (marca) ico.appendChild(marca.cloneNode(true));
  const nombre = document.createElement('span');
  nombre.className = 'minim-nombre';
  nombre.textContent = sinCliente(nombreDePanel(p));
  b.append(ico, nombre);
  const ram = $('.pane-ram', p)?.textContent.trim();
  if (ram) {
    const r = document.createElement('span');
    r.className = 'minim-ram';
    r.textContent = ram;
    b.appendChild(r);
  }
  const x = document.createElement('span');
  x.className = 'minim-x';
  x.setAttribute('role', 'button');
  x.setAttribute('aria-label', T.cerrarTerminal);
  x.dataset.tip = `${T.cerrarTerminal}\n${T.mata}`;
  x.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"></path></svg>';
  b.appendChild(x);
  return b;
}
const fichas = new WeakMap();

function pintarTira() {
  const fuera = apartadas();
  if (!fuera.length) {
    tira?.remove();
    tira = null;
    return;
  }
  if (!tira) {
    tira = document.createElement('div');
    tira.className = 'minim';
    rejilla.after(tira);
  }
  const eti = document.createElement('span');
  eti.className = 'minim-eti';
  const n = document.createElement('b');
  n.textContent = String(fuera.length);
  eti.append(T.apartadas, n);
  tira.replaceChildren(eti, ...fuera.map(ficha));
}

let yaContoApartar = false;
function apartar(panel, callado = false) {
  if (panel.dataset.demoMax) maximizar(panel);
  if (panel.dataset.demoSuelta) devolver(panel);
  panel.dataset.demoApartada = 'si';
  panel.hidden = true;
  recolocar();
  adeo.hecho('minimizar');
  if (!callado && !yaContoApartar && !adeo.enRecorrido()) {
    yaContoApartar = true;
    avisar(T.apartada, [...(tira?.children ?? [])].find((f) => fichas.get(f) === panel) ?? tira);
  }
}

function traer(panel) {
  delete panel.dataset.demoApartada;
  panel.hidden = false;
  recolocar();
  enfocar(panel);
  adeo.hecho('traer');
}

/* La × de una ficha: con el agente parado cierra al primer clic; si trabaja o
   te espera, pide un segundo (la terminal está apartada y no ves qué pierdes). */
function cerrarFicha(x) {
  const p = fichas.get(x.closest('.minim-chip'));
  if (!p) return;
  if (estadoDe(p) === 'lista' || x.dataset.armado) {
    p.dataset.demoFuera = 'si';
    p.remove();
    recolocar();
    return avisar(T.cerrada, tira ?? rejilla);
  }
  x.dataset.armado = 'true';
  x.dataset.tip = T.otraVez;
  x.textContent = '?';
  setTimeout(() => {
    if (!x.isConnected) return;
    delete x.dataset.armado;
    pintarTira();
  }, 4000);
}

/** «Minimizar todas» y su vuelta, «Traer todas»: el mismo botón, que cambia de
 *  nombre y de dibujo (en la app, `MinimizeIcon` y `UnminimizeIcon`). Se
 *  reconoce una vez por su dibujo y se marca, para que su regla sea solo suya:
 *  una regla para todos los botones de la barra salvaba de `podar` a su vecino
 *  «Cerrar todas», que aquí no puede cerrar nada. */
$$('.topbar-acciones button.tab', app)
  .find((b) => !b.classList.contains('layout-btn') && dibujo(b).includes(ES_MINIMIZAR))
  ?.setAttribute('data-demo-todas', '');
const botonTodas = () => $('.topbar-acciones button[data-demo-todas]', app);
const todoApartado = () => todas().length > 0 && todas().every((p) => p.dataset.demoApartada);

function pintarTodas() {
  const b = botonTodas();
  if (!b) return;
  const vuelta = todoApartado();
  b.setAttribute('aria-label', vuelta ? T.traerTodas : T.minimizarTodas);
  b.dataset.tip = vuelta ? T.tipTraerTodas : T.tipApartarTodas;
  const marco = $('svg rect', b), raya = $('svg path', b);
  if (marco && raya) {
    marco.setAttribute('opacity', vuelta ? '1' : '0.4');
    raya.setAttribute('opacity', vuelta ? '0.4' : '1');
  }
}

function alternarTodas() {
  if (todoApartado()) for (const p of apartadas()) traer(p);
  else for (const p of todas().filter((q) => !q.dataset.demoApartada)) apartar(p, true);
}

/* «Abrir en otra ventana». En la app sale a su propia ventana de Windows y su
   botón pasa a ser el de volver (`DevolverIcon`); aquí flota encima del
   mosaico, que se reparte el hueco, y se arrastra por su barra. */
const FLECHA_SALE = 'M14.5 4H20v5.5';
const FLECHA_ENTRA = 'M12 6.5V12h5.5';
let yaContoSacar = false;

function sacar(panel, boton) {
  if (panel.dataset.demoSuelta) return devolver(panel);
  if (panel.dataset.demoMax) maximizar(panel);
  panel.dataset.demoSuelta = 'si';
  recolocar();
  Object.assign(panel.style, { left: '21%', top: '12%', width: '56%', height: '68%' });
  const cabeza = $('.pane-head', panel);
  if (cabeza?.hasAttribute('draggable')) {
    cabeza.dataset.demoArrastrable = cabeza.getAttribute('draggable');
    cabeza.setAttribute('draggable', 'false');
  }
  for (const ruta of $$('svg path', boton)) if (ruta.getAttribute('d') === FLECHA_SALE) ruta.setAttribute('d', FLECHA_ENTRA);
  boton.dataset.demoTip ??= boton.dataset.tip ?? '';
  boton.dataset.tip = T.devolver;
  enfocar(panel);
  if (!yaContoSacar && !adeo.enRecorrido()) {
    yaContoSacar = true;
    avisar(T.suelta, boton);
  }
}

function devolver(panel) {
  delete panel.dataset.demoSuelta;
  const cabeza = $('.pane-head', panel);
  if (cabeza?.dataset.demoArrastrable) {
    cabeza.setAttribute('draggable', cabeza.dataset.demoArrastrable);
    delete cabeza.dataset.demoArrastrable;
  }
  for (const boton of $$('.pane-head button', panel)) {
    for (const ruta of $$('svg path', boton)) if (ruta.getAttribute('d') === FLECHA_ENTRA) ruta.setAttribute('d', FLECHA_SALE);
    if (boton.dataset.demoTip !== undefined) {
      boton.dataset.tip = boton.dataset.demoTip;
      delete boton.dataset.demoTip;
    }
  }
  recolocar();
}

/* La ventana suelta se lleva por su barra. Las cuentas van en proporción de
   la rejilla, así que valen igual con la demo encogida que a tamaño real. Se
   queda entera dentro del mosaico: podía salir hasta un 60 % por los lados y
   quedarse a 228 px fuera de la ventana por la izquierda. */
{
  let llevo = null;
  rejilla.addEventListener('pointerdown', (e) => {
    const panel = e.target.closest('.pane[data-demo-suelta]');
    if (!panel || e.button !== 0 || !e.target.closest('.pane-head') || e.target.closest('button, [role="button"], input')) return;
    const g = rejilla.getBoundingClientRect();
    llevo = { panel, x0: e.clientX, y0: e.clientY, l: parseFloat(panel.style.left), t: parseFloat(panel.style.top), w: g.width, h: g.height };
    panel.dataset.demoLlevando = 'si';
    e.target.closest('.pane-head').setPointerCapture(e.pointerId);
  });
  rejilla.addEventListener('pointermove', (e) => {
    if (!llevo) return;
    const ancho = parseFloat(llevo.panel.style.width), alto = parseFloat(llevo.panel.style.height);
    const l = llevo.l + ((e.clientX - llevo.x0) / llevo.w) * 100;
    const t = llevo.t + ((e.clientY - llevo.y0) / llevo.h) * 100;
    llevo.panel.style.left = Math.max(0, Math.min(100 - ancho, l)) + '%';
    llevo.panel.style.top = Math.max(0, Math.min(100 - alto, t)) + '%';
  });
  const soltar = () => {
    if (!llevo) return;
    delete llevo.panel.dataset.demoLlevando;
    llevo = null;
  };
  rejilla.addEventListener('pointerup', soltar);
  rejilla.addEventListener('pointercancel', soltar);
}

/* «ORDENAR LAS TERMINALES» (`LayoutPicker.tsx`): una rejilla de columnas por
   filas, como al insertar una tabla, y debajo «una grande y el resto al
   lado». Las cuentas son las de `lib/layout.ts`. */
const MAX_COLS = 4, MAX_FILAS = 4;

function equilibrada(n, c) {
  const cols = Math.max(1, Math.min(c, n, MAX_COLS));
  const base = Math.floor(n / cols);
  const extra = n % cols;
  return Array.from({ length: cols }, (_, i) => base + (i >= cols - extra ? 1 : 0));
}
const columnasPara = (n) => (n <= 3 ? Math.max(1, n) : n === 4 ? 2 : n <= 7 || n === 9 ? 3 : MAX_COLS);
const enRejilla = (c, r) => ({ rows: Array.from({ length: c }, () => r) });
function unaGrande(n) {
  const resto = Math.max(1, n - 1);
  const cols = Math.min(MAX_COLS - 1, Math.ceil(resto / 3));
  const rows = [1, ...equilibrada(resto, cols)];
  const grande = rows.length > 3 ? 1.3 : 1.6;
  return { rows, weights: rows.map((_, i) => (i === 0 ? grande : 1)) };
}

/** Reparte las que se ven según la plantilla (`applyPreset`): si falta sitio
 *  crece la columna más corta (la de la derecha entre empatadas) y si sobra
 *  encoge la más larga (la de la izquierda). */
function ordenar({ rows, weights }) {
  const vistas = mosaico.flatMap((c) => c.panes).filter(enMosaico);
  if (!vistas.length) return;
  const filas = [...rows];
  const masCorta = (xs) => xs.reduce((si, r, i) => (r <= xs[si] ? i : si), 0);
  const masLarga = (xs) => xs.reduce((si, r, i) => (r > xs[si] ? i : si), 0);
  let sitio = filas.reduce((a, b) => a + b, 0);
  for (; sitio < vistas.length; sitio++) filas[masCorta(filas)]++;
  for (; sitio > vistas.length; sitio--) filas[masLarga(filas)]--;
  const fuera = mosaico.flatMap((c) => c.panes).filter((p) => !enMosaico(p));
  mosaico.length = 0;
  let k = 0;
  filas.forEach((n, i) => {
    if (n <= 0) return;
    mosaico.push({ peso: weights?.[i] ?? 1, panes: vistas.slice(k, k + n) });
    k += n;
  });
  // Las apartadas y la suelta se quedan en la última columna, sin ocupar sitio.
  mosaico[mosaico.length - 1].panes.push(...fuera);
  recolocar();
  adeo.hecho('ordenar');
}

const vistasEnMosaico = () => Math.max(1, todas().filter(enMosaico).length);

function cerrarDisposicion() {
  $('.app > .layout-pop', app)?.remove();
  const b = $('.layout-btn', app);
  if (b) b.dataset.active = 'false';
}

function alternarDisposicion(boton) {
  if ($('.app > .layout-pop', app)) return cerrarDisposicion();
  const n = vistasEnMosaico();
  const justa = equilibrada(n, columnasPara(n));
  const deSiempre = { c: justa.length, r: Math.min(MAX_FILAS, Math.max(...justa)) };

  const pop = document.createElement('div');
  pop.className = 'layout-pop';
  const r = dentro(boton.getBoundingClientRect());
  pop.style.top = r.bottom + 8 + 'px';
  pop.style.right = Math.max(8, 1920 - r.right) + 'px';

  const titulo = document.createElement('div');
  titulo.className = 'layout-pop-title';
  titulo.textContent = T.ordena;
  const cuadro = document.createElement('div');
  cuadro.className = 'layout-rejilla';
  const cuenta = document.createElement('div');
  cuenta.className = 'layout-cuenta';
  const marcar = (m) => {
    for (const celda of cuadro.children) {
      const [c, f] = celda.dataset.demoCelda.split('x').map(Number);
      celda.dataset.on = String(c <= m.c && f <= m.r);
    }
    cuenta.textContent = T.cuenta(m.c, m.r);
  };
  for (let f = 1; f <= MAX_FILAS; f++) {
    for (let c = 1; c <= MAX_COLS; c++) {
      const celda = document.createElement('button');
      celda.className = 'layout-celda';
      celda.dataset.demoCelda = `${c}x${f}`;
      celda.setAttribute('aria-label', T.cxr(c, f));
      celda.addEventListener('mouseenter', () => marcar({ c, r: f }));
      celda.addEventListener('focus', () => marcar({ c, r: f }));
      cuadro.appendChild(celda);
    }
  }
  cuadro.addEventListener('mouseleave', () => marcar(deSiempre));
  marcar(deSiempre);
  pop.append(titulo, cuadro, cuenta);

  if (n >= 2) {
    const g = unaGrande(n);
    const grande = document.createElement('button');
    grande.className = 'layout-grande';
    const total = g.rows.reduce((a, _, i) => a + g.weights[i], 0);
    let x = 0;
    let cajas = '';
    g.rows.forEach((filas, i) => {
      const w = g.weights[i] / total;
      for (let k = 0; k < filas; k++) {
        cajas += `<rect x="${(x * 60 + 1.5).toFixed(2)}" y="${((k / filas) * 40 + 1.5).toFixed(2)}" width="${(w * 60 - 3).toFixed(2)}" height="${((1 / filas) * 40 - 3).toFixed(2)}" rx="2.5" fill="currentColor" fill-opacity="0.62"></rect>`;
      }
      x += w;
    });
    grande.innerHTML = `<svg viewBox="0 0 60 40" class="layout-thumb" aria-hidden="true">${cajas}</svg>`;
    const rotulo = document.createElement('span');
    rotulo.textContent = T.grande;
    grande.appendChild(rotulo);
    pop.appendChild(grande);
  }
  const pie = document.createElement('div');
  pie.className = 'layout-pop-foot';
  pie.textContent = T.ordenaPie;
  pop.appendChild(pie);

  app.appendChild(pop);
  boton.dataset.active = 'true';
}

function maximizar(panel) {
  if (panel.closest('.react-flow__node')) return false;
  if (panel.dataset.demoMax) {
    delete panel.dataset.demoMax;
    delete rejilla.dataset.demoMax;
  } else {
    for (const p of $$('.pane[data-demo-max]', rejilla)) delete p.dataset.demoMax;
    panel.dataset.demoMax = 'si';
    rejilla.dataset.demoMax = 'si';
  }
  return true;
}

function botonDePanel(boton) {
  const panel = boton.closest('.pane');
  if (!panel) return false;
  if (boton.classList.contains('pane-close')) {
    // La × de la barra de permiso solo la esconde; la de la cabecera cierra.
    const pregunta = boton.closest('.pane-ask');
    if (pregunta) pregunta.remove();
    else cerrarPanel(panel);
    return true;
  }
  const d = dibujo(boton);
  if (d.includes(ES_OJO)) {
    panel.dataset.blurred = String(panel.dataset.blurred !== 'true');
    return true;
  }
  if (d.includes(ES_MAXIMIZAR)) return maximizar(panel);
  // Minimizar y sacar, solo en la Cabina: en el Lienzo cuentan lo suyo con su globo.
  if (panel.closest('.react-flow__node')) return false;
  if (d.includes(ES_MINIMIZAR)) {
    apartar(panel);
    return true;
  }
  if (d.includes(ES_SACAR)) {
    sacar(panel, boton);
    return true;
  }
  return false;
}

/* La barra de proyectos. */

function abrirProyecto(proyecto, abrir) {
  const lista = $(':scope > ul.sessions', proyecto.parentElement);
  if (!lista) return false;
  proyecto.dataset.open = String(abrir);
  lista.hidden = !abrir;
  const flecha = $('.project-caret', proyecto);
  if (flecha) flecha.textContent = flecha.textContent.replace(/[▾▸]/, abrir ? '▾' : '▸');
  const principal = $('.project-main', proyecto);
  if (principal?.dataset.tip) {
    principal.dataset.tip = abrir
      ? principal.dataset.tip.replace(': ver sus', ': plegar sus')
      : principal.dataset.tip.replace(': plegar sus', ': ver sus');
  }
  return true;
}

function filtrarBarra(texto) {
  const q = texto.trim().toLowerCase();
  for (const grupo of $$('.projects > .group', app)) {
    const proyecto = $('.project', grupo);
    const nombre = (proyecto?.dataset.proyecto ?? '').toLowerCase();
    let alguna = false;
    for (const fila of $$('.session-row', grupo)) {
      const cabe = !q || nombre.includes(q) || fila.textContent.toLowerCase().includes(q);
      fila.hidden = !cabe;
      alguna ||= cabe;
    }
    grupo.hidden = !!q && !nombre.includes(q) && !alguna;
    // Buscando, todo lo que casa sale desplegado, como en la app.
    if (q && proyecto && !grupo.hidden) abrirProyecto(proyecto, true);
  }
}

const barraDeSiempre = $('aside.sidebar', app)?.cloneNode(true) ?? null;

function ponerBarra(modo) {
  const barra = $('aside.sidebar', app);
  const otra = modo === 1 ? barraDeSiempre?.cloneNode(true) : unaPieza(`x-barra-${modo}`);
  if (!barra || !otra) return false;
  barra.replaceWith(otra);
  marcarRuedas(otra);
  return true;
}

/* Los paneles de la derecha: Adeo, uso, skills y archivos, en el orden de la
   franja (`x-lateral-N`). Se cierran volviendo a pulsar su icono, que es lo que
   hace la app. */

const zonaCerrada = $('.lateral-zona', app)?.cloneNode(true) ?? null;

/** Cuál de los laterales es Adeo: desde la Cabina, el orbe de la barra y
    Ctrl+Mayús+A lo abren ahí, con las terminales a la vista. */
const LATERAL_ADEO = (() => {
  for (let n = 0; plantilla(`x-lateral-${n}`); n++) {
    if (unaPieza(`x-lateral-${n}`)?.querySelector('aside.lateral[data-cara="adeo"]')) return n;
  }
  return -1;
})();

function panelDerecho(n) {
  const zona = $('.lateral-zona', app);
  if (!zona) return false;
  const abrir = estado.lateral !== n;
  const nueva = abrir ? unaPieza(`x-lateral-${n}`) : zonaCerrada.cloneNode(true);
  if (!nueva) return false;
  zona.replaceWith(nueva);
  estado.lateral = abrir ? n : -1;
  marcarRuedas(nueva);
  return true;
}

/* El menú de «Posponer» de una decisión (`x-posponer`): cuelga de la raíz de
   Decisiones, ya colocado encima de su pie, como lo dejó la app. */
function alternarPosponer(boton) {
  const abierto = $('.dec-posponer', app);
  if (abierto) return abierto.remove();
  const menu = unaPieza('x-posponer');
  const dec = boton.closest('.dec');
  if (!menu || !dec) return false;
  dec.appendChild(menu);
}

/* Las dos pestañas de la lista del Chat, Adeo y Sesiones (`x-chatlista-N`). */
function listaDelChat(boton) {
  const lista = boton.closest('aside.chat-lista');
  const n = $$('.chat-pestana', boton.parentElement).indexOf(boton);
  const nueva = unaPieza(`x-chatlista-${n}`);
  if (!lista || !nueva) return false;
  lista.replaceWith(nueva);
  marcarRuedas(nueva);
}

/* Lo que flota: los objetivos del día y el detalle del Pulso. */

function alternarObjetivos(boton) {
  const abierto = $('.obj-flota, .app > .objetivos', app);
  if (abierto) {
    abierto.remove();
    boton.dataset.on = 'false';
    return true;
  }
  const pieza = unaPieza('x-objetivos');
  if (!pieza) return false;
  app.appendChild(pieza);
  boton.dataset.on = 'true';
  return true;
}

/* El detalle del Pulso va FUERA de la barra, como en la app: dentro, la barra
   lo recorta. Se coloca igual que allí, debajo del botón y con su borde
   derecho, sin salirse de la ventana. */
function alternarPulso(boton) {
  const detalle = $('.app > .pulso-detalle', app);
  if (detalle) {
    detalle.remove();
    boton.dataset.on = 'false';
    return true;
  }
  const suyo = plantilla('x-pulso')?.querySelector('.pulso-detalle');
  if (!suyo) return false;
  const r = dentro(boton.getBoundingClientRect());
  suyo.style.left = Math.max(8, Math.min(r.right, 1920 - 8) - 320) + 'px';
  suyo.style.top = r.bottom + 8 + 'px';
  app.appendChild(suyo);
  boton.dataset.on = 'true';
  return true;
}

/* --------------------------------------------------------------------------
   7. LA PALETA DE COMANDOS (Ctrl+K)
   -------------------------------------------------------------------------- */

function cerrarPaleta() {
  $('.app > .paleta', app)?.remove();
}

/* Adeo, el orbe de la barra. Desde la Cabina se abre en la barra de la
   derecha, con las terminales a la vista; desde las demás vistas flota encima
   de todo (`x-capataz`), como en la app. */
function cerrarCapataz() {
  $('.app > .foreman-overlay', app)?.remove();
}

const cerrarAdeoLateral = () => (estado.lateral === LATERAL_ADEO && LATERAL_ADEO >= 0 ? panelDerecho(LATERAL_ADEO) : false);

function alternarCapataz() {
  if ($('.app > .foreman-overlay', app)) return cerrarCapataz();
  if (estado.vista === 'cabina' && LATERAL_ADEO >= 0) {
    panelDerecho(LATERAL_ADEO);
    if (estado.lateral === LATERAL_ADEO) $('.lateral .foreman-input', app)?.focus();
    return;
  }
  const capataz = unaPieza('x-capataz');
  if (!capataz) return avisar(T.planear);
  app.appendChild(capataz);
  $('.foreman-input', capataz)?.focus();
}

function abrirPaleta() {
  cerrarPaleta();
  const paleta = unaPieza('x-paleta');
  if (!paleta) return;
  app.appendChild(paleta);
  marcarPaleta(paleta, 0);
  $('.paleta-input', paleta)?.focus();
}

const filasDe = (paleta) => $$('.paleta-fila', paleta).filter((f) => !f.hidden);

function marcarPaleta(paleta, n) {
  const filas = filasDe(paleta);
  for (const f of $$('.paleta-fila', paleta)) f.setAttribute('aria-selected', String(f === filas[n]));
  filas[n]?.scrollIntoView({ block: 'nearest' });
}

function lanzarPaleta(fila) {
  const texto = ($('.paleta-texto', fila) ?? fila).textContent.trim();
  cerrarPaleta();
  // Una vista por su nombre, una terminal abierta por el suyo, o lo que diga.
  const pestana = $$('nav.tabs .tab', app).find((t) => texto.toLowerCase().endsWith((t.getAttribute('aria-label') ?? '').toLowerCase()));
  if (pestana) return irA(pestana.dataset.tab);
  // Las cuatro del Perfil no tienen pestaña: se reconocen por su resumen.
  const seccion = $$('.perfil-seccion', plantilla('v-perfil') ?? document).find((s) => ($('.perfil-seccion-cab', s)?.textContent ?? '').replace('›', '').trim() === texto);
  if (seccion) return irA(seccion.dataset.seccion);
  const panel = $$(':scope > .pane', rejilla).find((p) => nombreDePanel(p) && texto === nombreDePanel(p));
  if (panel) {
    irA('cabina');
    return enfocar(panel);
  }
  avisar(T.deRotulo(texto));
}

/* --------------------------------------------------------------------------
   8. EL LIENZO
   El tablero de la app lo mueve React Flow. Aquí quedan sus piezas tal como
   estaban, con la posición escrita en un `transform`, y eso basta para volver
   a arrastrarlas, mover el tablero y acercarlo.
   -------------------------------------------------------------------------- */

const tablero = $('.react-flow', app);
const vista = tablero && $('.react-flow__viewport', tablero);
const ZOOM_TARJETA = 0.55;      // por debajo, las terminales salen como tarjeta

const leerVista = () => {
  const m = vista.style.transform.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(\s*([-\d.]+)\)/);
  return m ? { x: +m[1], y: +m[2], z: +m[3] } : { x: 0, y: 0, z: 1 };
};
const sitioDe = (nodo) => {
  const m = nodo.style.transform.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/);
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
};
const cajaDe = (nodo) => ({ ...sitioDe(nodo), w: parseFloat(nodo.style.width) || nodo.offsetWidth, h: parseFloat(nodo.style.height) || nodo.offsetHeight });

const vistaInicial = vista ? leerVista() : null;

function ponerVista(v) {
  vista.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  for (const t of $$('.rf-term', tablero)) t.dataset.lejos = String(v.z < ZOOM_TARJETA);
  pintarMapa();
}

/** El minimapa: un recuadro por pieza y, recortada, la parte que se ve. */
function pintarMapa() {
  const mapa = $('.react-flow__minimap-svg', tablero);
  if (!mapa) return;
  const nodos = $$('.react-flow__nodes > .react-flow__node', tablero);
  $$('.react-flow__minimap-node', mapa).forEach((r, i) => {
    const n = nodos[i];
    if (!n) return r.remove();
    const c = cajaDe(n);
    r.setAttribute('x', c.x);
    r.setAttribute('y', c.y);
  });
  const mascara = $('.react-flow__minimap-mask', mapa);
  if (mascara) {
    const v = leerVista();
    const w = tablero.offsetWidth / v.z, h = tablero.offsetHeight / v.z;
    const fuera = mascara.getAttribute('d').split(/\s+M/)[0];
    mascara.setAttribute('d', `${fuera} M${-v.x / v.z},${-v.y / v.z}h${w}v${h}h${-w}z`);
  }
}

/** Las flechas: de la derecha de una pieza a la izquierda de la otra. */
function pintarFlechas() {
  for (const flecha of $$('.react-flow__edge', tablero)) {
    const m = (flecha.getAttribute('aria-label') ?? '').match(/from (\S+) to (\S+)/);
    const a = m && $(`.react-flow__node[data-id="${m[1]}"]`, tablero);
    const b = m && $(`.react-flow__node[data-id="${m[2]}"]`, tablero);
    if (!a || !b) { flecha.remove(); continue; }
    const ca = cajaDe(a), cb = cajaDe(b);
    const sx = ca.x + ca.w + 2, sy = ca.y + ca.h / 2;
    const tx = cb.x - 2, ty = cb.y + cb.h / 2;
    const c = Math.max(Math.abs(tx - sx) / 2, 30);
    const d = `M${sx},${sy} C${sx + c},${sy} ${tx - c},${ty} ${tx},${ty}`;
    for (const p of $$('path', flecha)) p.setAttribute('d', d);
    const rotulo = $('.react-flow__edge-textwrapper', flecha);
    const ancho = parseFloat($('.react-flow__edge-textbg', flecha)?.getAttribute('width')) || 0;
    if (rotulo) rotulo.setAttribute('transform', `translate(${(sx + tx) / 2 - ancho / 2 + 2} ${(sy + ty) / 2 - 7})`);
  }
}

function quitarNodo(nodo) {
  nodo.dataset.demoFuera = 'si';
  setTimeout(() => {
    const n = $$('.react-flow__nodes > .react-flow__node', tablero).indexOf(nodo);
    $$('.react-flow__minimap-node', tablero)[n]?.remove();
    nodo.remove();
    pintarFlechas();
    pintarMapa();
  }, 190);
  return true;
}

function acercar(factor) {
  const v = leerVista();
  const z = Math.max(0.25, Math.min(1.6, v.z * factor));
  const cx = tablero.offsetWidth / 2, cy = tablero.offsetHeight / 2;
  ponerVista({ x: cx - (cx - v.x) * (z / v.z), y: cy - (cy - v.y) * (z / v.z), z });
}

let notas = 0;
function anadirNota() {
  const molde = $$('.react-flow__node-note', tablero).pop();
  if (!molde) return false;
  const nodo = molde.cloneNode(true);
  const v = leerVista();
  const c = cajaDe(molde);
  // Cae en mitad de lo que se ve, un poco corrida si ya hay otra nueva.
  const x = (tablero.offsetWidth / 2 - v.x) / v.z - c.w / 2 + notas * 36;
  const y = (tablero.offsetHeight / 2 - v.y) / v.z - c.h / 2 + notas * 36;
  notas++;
  nodo.dataset.id = 'demo-' + notas;
  nodo.style.transform = `translate(${x}px, ${y}px)`;
  const titulo = $('.note-title-txt', nodo);
  if (titulo) titulo.textContent = T.notaNueva;
  $('.note-count', nodo)?.remove();
  const cuerpo = $('.note-body', nodo);
  if (cuerpo) {
    const linea = document.createElement('p');
    linea.className = 'note-line';
    linea.textContent = T.lineaNueva;
    cuerpo.replaceChildren(linea);
  }
  $('.react-flow__nodes', tablero).appendChild(nodo);
  const marca = $$('.react-flow__minimap-node', tablero).pop();
  if (marca) {
    const suya = marca.cloneNode(true);
    suya.setAttribute('x', x);
    suya.setAttribute('y', y);
    marca.after(suya);
  }
  return true;
}

function contarNota(nota) {
  const cuenta = $('.note-count', nota);
  const tareas = $$('.note-task', nota);
  if (!cuenta || !tareas.length) return;
  const hechas = tareas.filter((t) => t.dataset.done === 'true').length;
  cuenta.textContent = `${hechas}/${tareas.length}`;
  cuenta.dataset.full = String(hechas === tareas.length);
}

if (tablero && vista) {
  let llevo = null;

  tablero.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, textarea, select, a, [contenteditable="true"], .react-flow__controls, .react-flow__minimap')) return;
    const nodo = e.target.closest('.react-flow__node');
    const v = leerVista();
    if (nodo) {
      llevo = { nodo, x0: e.clientX, y0: e.clientY, de: sitioDe(nodo), z: v.z };
      nodo.dataset.demoLlevando = 'si';
      const panel = $('.pane', nodo);
      if (panel) enfocar(panel);
    } else {
      const fondo = $('.react-flow__pane', tablero);
      llevo = { fondo, x0: e.clientX, y0: e.clientY, de: v };
      if (fondo) fondo.dataset.demoLlevando = 'si';
    }
    tablero.setPointerCapture(e.pointerId);
  });

  tablero.addEventListener('pointermove', (e) => {
    if (!llevo) return;
    const dx = (e.clientX - llevo.x0) / estado.lupa;
    const dy = (e.clientY - llevo.y0) / estado.lupa;
    if (llevo.nodo) {
      llevo.nodo.style.transform = `translate(${llevo.de.x + dx / llevo.z}px, ${llevo.de.y + dy / llevo.z}px)`;
      pintarFlechas();
      pintarMapa();
    } else {
      ponerVista({ x: llevo.de.x + dx, y: llevo.de.y + dy, z: llevo.de.z });
    }
  });

  const soltar = () => {
    if (!llevo) return;
    if (llevo.nodo) delete llevo.nodo.dataset.demoLlevando;
    if (llevo.fondo) delete llevo.fondo.dataset.demoLlevando;
    llevo = null;
  };
  tablero.addEventListener('pointerup', soltar);
  tablero.addEventListener('pointercancel', soltar);
}

/* --------------------------------------------------------------------------
   9. LAS DECISIONES
   -------------------------------------------------------------------------- */

function repasarDecision(doc) {
  const faltan = [];
  $$('fieldset.dec-pregunta', doc).forEach((pregunta, i) => {
    const elegida = $('input[type="radio"]:checked', pregunta);
    const libre = ($('textarea.dec-libre', pregunta)?.value ?? '').trim();
    for (const o of $$('label.dec-opcion', pregunta)) o.dataset.marcada = String(!libre && !!elegida && o.contains(elegida));
    const fila = $$('.dec-resumen > li', doc)[i];
    const hueco = fila && $('.dec-elegido', fila);
    const letra = (fila && $('.dec-letra', fila)?.textContent.trim()) || String.fromCharCode(65 + i);
    if (hueco) {
      hueco.dataset.demoFalta ??= hueco.textContent;
      const dicho = libre || (elegida ? $('.dec-opcion-linea b', elegida.closest('label'))?.textContent : '');
      hueco.textContent = dicho || hueco.dataset.demoFalta;
      hueco.dataset.falta = String(!dicho);
    }
    if (!elegida && !libre) faltan.push(letra);
  });
  const dice = $('.dec-estado', doc);
  if (dice) dice.textContent = T.faltan(faltan);
  const enviar = $('.dec-pie-botones .np-btn', doc);
  if (enviar) enviar.disabled = faltan.length > 0;
}

/* --------------------------------------------------------------------------
   9 BIS. EL INICIO Y EL PERFIL
   -------------------------------------------------------------------------- */

/** El nombre entero de un panel («storefront-api · Fallo en…») va en la
 *  primera línea de su globo; las de debajo son el modelo, el contexto y la
 *  memoria. Con el globo entero, «Contestar» no encontraba la terminal que te
 *  espera: buscaba su título con el modelo pegado detrás. */
function nombreDePanel(p) {
  const n = $('.pane-name', p);
  return (n?.dataset.tip || n?.textContent || '').split('\n')[0].trim();
}

/** Un proyecto del inicio: a la Cabina con su terminal delante (`goProject`). */
function alProyecto(nombre) {
  irA('cabina');
  const panel = $$(':scope > .pane', rejilla).find((p) => nombreDePanel(p).startsWith(nombre + ' '));
  if (panel) return enfocar(panel);
  avisar(T.proyecto);
}

/** «Contestar»: a la terminal que pregunta, por el título de su sesión. */
function alQueEspera(aviso) {
  irA('cabina');
  const texto = aviso?.textContent ?? '';
  const panel = $$(':scope > .pane', rejilla).find((p) => {
    const titulo = nombreDePanel(p).split(' · ').pop();
    return titulo && texto.includes(titulo);
  });
  if (panel) enfocar(panel);
}

/** Lo que se le pide a Adeo: en la app abre una conversación del conserje. */
function pedirAAdeo(caja) {
  const campo = $('.inicio-texto', caja);
  if (!campo?.value.trim()) {
    campo?.focus();
    return avisar(T.pedirVacio);
  }
  campo.value = '';
  const boton = $('.inicio-enviar', caja);
  if (boton) boton.disabled = true;
  avisar(T.pedir);
}

/** Las pestañas de tu uso: la lista entera de cada una viene en su plantilla. */
function porfolio(boton) {
  const pestanas = $$('button[role="tab"]', boton.parentElement);
  const lista = $('.pu-lista', boton.closest('.pu-porfolio') ?? app);
  const nueva = unaPieza(`x-porfolio-${pestanas.indexOf(boton)}`);
  if (!lista || !nueva) return false;
  lista.replaceWith(nueva);
  for (const p of pestanas) p.setAttribute('aria-selected', String(p === boton));
}

/* --------------------------------------------------------------------------
   10. EL CHAT
   -------------------------------------------------------------------------- */

function enviarChat(caja) {
  const zona = caja.closest('.chat-hilo') ?? app;
  const texto = caja.value.trim();
  const turnos = $('.chat-turnos', zona);
  if (!texto || !turnos) return;
  caja.value = '';
  const boton = $('.chat-enviar', zona);
  if (boton) boton.disabled = true;
  const turno = document.createElement('article');
  turno.className = 'chat-turno';
  turno.dataset.rol = 'tu';
  const burbuja = document.createElement('div');
  burbuja.className = 'chat-burbuja';
  burbuja.textContent = texto;
  turno.appendChild(burbuja);
  turnos.appendChild(turno);
  turnos.scrollTop = turnos.scrollHeight;
  avisar(T.chat);
}

/* --------------------------------------------------------------------------
   11. PULSAR
   Una lista de reglas, de la más concreta a la más general. Gana la primera
   que encaja y devuelve algo distinto de `false`.
   -------------------------------------------------------------------------- */

const unoSolo = (boton, atributo = 'on') => {
  const hermanos = [...boton.parentElement.children].filter((h) => h.dataset && atributo in h.dataset);
  if (hermanos.length > 1) for (const h of hermanos) h.dataset[atributo] = String(h === boton);
  else boton.dataset[atributo] = String(boton.dataset[atributo] !== 'true');
};

const REGLAS = [
  // ── La barra de arriba ──
  ['nav.tabs .tab[data-tab]', (b) => irA(b.dataset.tab)],
  // Adeo, en su sitio: se presenta y ofrece volver a enseñar la demo.
  ['.brand .campana', (b) => avisar(T.adeo, b, { botones: [{ texto: T.verRecorrido, hacer: empezarRecorrido }] })],
  ['.layout-btn', (b) => alternarDisposicion(b)],
  ['.topbar-acciones button[data-demo-todas]', () => alternarTodas()],
  ['.layout-celda', (b) => {
    const [c, f] = b.dataset.demoCelda.split('x').map(Number);
    cerrarDisposicion();
    ordenar(enRejilla(c, f));
  }],
  ['.layout-grande', () => {
    const n = vistasEnMosaico();
    cerrarDisposicion();
    ordenar(unaGrande(n));
  }],
  ['.objetivos-toggle', (b) => alternarObjetivos(b)],
  ['button.pulso', (b) => alternarPulso(b)],
  ['.stream-toggle', (b) => {
    const on = b.dataset.on !== 'true';
    b.dataset.on = String(on);
    app.dataset.stream = String(on);
    avisar(on ? T.emisionSi : T.emisionNo);
  }],
  ['.foreman-call', () => alternarCapataz()],

  // ── Enlaces: nunca dentro del marco ──
  ['a[href]', (a, e) => {
    e.preventDefault();
    const href = a.getAttribute('href') ?? '';
    if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
    else avisar(a.closest('.mem') ? T.nota : T.deRotulo(a.textContent.trim()));
  }],

  // ── Las pestañas de dentro de una vista ──
  ['nav.set-nav button.set-tab', (b) => (b.dataset.on === 'true' ? undefined : irASeccion(b))],
  ['nav.set-nav .set-sub-item', (b) => {
    // Los apartados de una sección: la hoja baja hasta su tarjeta.
    const titulo = b.textContent.trim().replace(/…$/, '');
    const tarjeta = $$('.set-hoja h2', hojas.get(estado.vista)).find((h) => h.textContent.trim().startsWith(titulo));
    tarjeta?.closest('section, .panel-card')?.scrollIntoView({ block: 'start' });
  }],

  // ── La Cabina ──
  ['.ask-btn', (b) => {
    const numero = b.textContent.trim().split(/\s/)[0];
    b.closest('.pane-ask')?.remove();
    avisar(T.respuesta(numero));
  }],
  ['.pane-head button, .pane-ask .pane-close', (b) => botonDePanel(b)],
  // La tira de las apartadas: la × cierra, la ficha entera la trae.
  ['.minim-x', (x) => cerrarFicha(x)],
  ['.minim-chip', (b) => {
    const p = fichas.get(b);
    if (p) traer(p);
  }],
  // La barra en logos o en tira no es la misma con otro ancho: tiene otro
  // esqueleto, y viene en su plantilla. 0 son los logos, 1 la de siempre y 2 la tira.
  ['.rail-tab', (b) => ponerBarra($$('.rail-tab', b.parentElement).indexOf(b))],
  ['.rail-mini .mini:not(.rail-new)', () => ponerBarra(1)],
  ['.project-main', (b) => {
    const proyecto = b.closest('.project');
    return abrirProyecto(proyecto, proyecto.dataset.open !== 'true');
  }],
  ['.session', () => avisar(T.sesion)],
  ['nav.franja .franja-btn', (b) => {
    const n = $$('.franja-btn', b.parentElement).indexOf(b);
    if (panelDerecho(n)) return true;
    // El de detrás de la raya abre una web en un panel: aquí no tiene lateral
    // que enseñar, así que lo cuenta su aviso y no se enciende (si se
    // encendiera, el lateral abierto se quedaría con su botón apagado).
    porDefecto(b);
    return true;
  }],
  ['.arch-fila', (b) => {
    for (const f of $$('.arch-fila', b.parentElement)) f.dataset.on = String(f === b);
    avisar(b.dataset.carpeta === 'true' ? T.carpeta : T.archivo);
  }],
  // Con la barra en logos, un clic abre el proyecto entero.
  ['.sidebar .project-logo', () => avisar(T.proyecto)],

  // ── El Lienzo ──
  ['.react-flow__controls-zoomin', () => acercar(1.2)],
  ['.react-flow__controls-zoomout', () => acercar(1 / 1.2)],
  ['.react-flow__controls-fitview', () => ponerVista({ ...vistaInicial })],
  ['.cb-spawn', (b) => avisar(T.abrirAqui(b.textContent.trim().replace(/^[^\p{L}]+/u, '')))],
  ['.cb-tools .cb-tool', (b) => {
    unoSolo(b);
    if ($$('.cb-tool', b.parentElement).indexOf(b) > 0) avisar(T.herramienta);
  }],
  ['.canvas-bar .cb-btn', (b) => {
    // El primero es «Añadir»; los demás cuentan lo suyo con su globo.
    if ($$('.canvas-bar .cb-btn', app).indexOf(b) !== 0) return false;
    anadirNota();
    avisar(T.anadir);
  }],
  ['.note-add', (b) => {
    const nota = b.closest('.note');
    const molde = $$('.note-task', nota).pop();
    const cuerpo = $('.note-body', nota);
    if (!cuerpo) return false;
    let tarea;
    if (molde) {
      tarea = molde.cloneNode(true);
      tarea.dataset.done = 'false';
      const casilla = $('input', tarea);
      if (casilla) casilla.checked = false;
      $('.note-task-txt', tarea).textContent = T.tareaNueva;
      molde.after(tarea);
    } else {
      tarea = document.createElement('p');
      tarea.className = 'note-line';
      tarea.textContent = '- ' + T.tareaNueva;
      cuerpo.appendChild(tarea);
    }
    contarNota(nota);
  }],
  ['.note-head .wdg-x', (b) => {
    // El último de la cabecera quita la nota; los otros dos, con su globo.
    const botones = $$('.wdg-x', b.parentElement);
    return botones.indexOf(b) === botones.length - 1 ? quitarNodo(b.closest('.react-flow__node')) : false;
  }],
  ['.kb-mia-x', (b) => {
    const columna = b.closest('.kb-col');
    b.closest('.kb-card').remove();
    const n = $('.kb-col-n', columna);
    if (n) n.textContent = String($$('.kb-card', columna).length);
  }],
  ['.kb-nueva-mas', (b) => anadirTarjeta(b.closest('.kb-nueva'))],

  // ── El inicio ──
  ['.inicio-adeo', () => avisar(T.adeo)],
  ['.inicio-estado', () => irA('cabina')],
  ['.inicio-aviso .np-btn', (b) => alQueEspera(b.closest('.inicio-aviso'))],
  ['.inicio-enviar', (b) => pedirAAdeo(b.closest('.inicio-caja'))],
  ['.inicio-proy', (b) => alProyecto($('.inicio-proy-n', b)?.textContent.trim() ?? '')],
  ['.inicio-uso .inicio-enlace', () => irA('perfil')],

  // ── El Capataz (flota encima; el orbe de la barra lo abre) ──
  ['.fm-guia-fila', (b) => {
    const caja = $('.foreman-input', b.closest('.foreman-box'));
    if (!caja) return false;
    caja.value = $('.fm-guia-ej', b)?.textContent.trim() ?? '';
    caja.focus();
  }],
  ['.fm-auto', (b) => { b.dataset.on = String(b.dataset.on !== 'true'); }],
  ['.fm-modo button', (b) => {
    unoSolo(b);
    const que = $('.fm-modo-que', b.parentElement);
    if (que && b.dataset.tip) que.textContent = b.dataset.tip;
  }],
  // (`.foreman-row` es también la fila de botones de otras tarjetas: solo la del Capataz.)
  ['.foreman-box .foreman-row .np-btn', (b) => {
    const caja = $('.foreman-input', b.closest('.foreman-box'));
    avisar(caja?.value.trim() ? T.planear : T.planearVacio);
    if (!caja?.value.trim()) caja?.focus();
  }],
  // Pulsar fuera de la caja lo cierra; dentro, siguen las demás reglas.
  ['.foreman-overlay', (o, e) => (e.target === o ? cerrarCapataz() : false)],

  // ── El Perfil ──
  ['.perfil-seccion', (b) => irA(b.dataset.seccion)],
  ['.perfil-volver-btn', () => irA('perfil')],
  ['.pu-pestanas button[role="tab"]', (b) => porfolio(b)],
  // Un día, el récord o compartir: en la app abren la tarjeta con su editor.
  ['.pu-compartir, .pu-record, button[data-celda]', () => avisar(T.tarjeta)],

  // ── La Agenda y los objetivos ──
  ['.ag-rail .project-logo', (b) => unoSolo(b, 'active')],
  ['.obj-fila', (b) => {
    const fila = b.closest('.obj-item');
    fila.dataset.done = String(fila.dataset.done !== 'true');
  }],
  ['.obj-del', (b) => b.closest('.obj-item').remove()],

  // ── Las decisiones ──
  // La que está abierta ya se ve; las contestadas, en la app, se abren con lo
  // que respondiste. Aquí solo hay una hoja, así que se dice.
  // La lista es una sola: lo que te espera en una terminal, lo que decides, las
  // ideas de los agentes y lo que ya pasó.
  ['.dec-fila', (b) => {
    if (b.dataset.on === 'true') return;
    const clase = b.dataset.clase;
    avisar(clase === 'contesta' || clase === 'mira' ? T.contesta : clase === 'idea' ? T.idea : T.decisionVieja);
  }],
  ['.dec button[data-posponer]', (b) => alternarPosponer(b)],
  ['.dec-posponer-op', (b) => {
    const tecla = $('b', b)?.textContent.trim();
    const cuando = $('span', b)?.textContent.trim() ?? '';
    $('.dec-posponer', app)?.remove();
    avisar(tecla === 'O' ? T.otraHora : T.pospuesta(cuando.charAt(0).toLowerCase() + cuando.slice(1)));
  }],
  ['.dec-posponer > button.mini', () => $('.dec-posponer', app)?.remove()],
  ['.dec-resumen-q', (b) => {
    const n = $$('.dec-resumen > li', b.closest('.dec-resumen')).indexOf(b.closest('li'));
    $$('fieldset.dec-pregunta', b.closest('.dec-abierta'))[n]?.scrollIntoView({ block: 'center' });
  }],
  ['.dec-pie-botones .np-btn', (b) => {
    b.disabled = true;
    const dice = $('.dec-estado', b.closest('.dec-pie'));
    if (dice) dice.textContent = T.enviada;
    avisar(T.enviada);
  }],

  // ── Las cuentas, los comandos y los ajustes ──
  ['.account-group-title', (b) => {
    const grupo = b.closest('.account-group');
    if (grupo.dataset.abierto === 'true') delete grupo.dataset.abierto;
    else grupo.dataset.abierto = 'true';
  }],
  ['.cmd-bar .choice', (b) => {
    unoSolo(b);
    filtrarComandos(b.closest('.commands'));
  }],
  ['.cmd-card', (b) => {
    b.dataset.sent = 'true';
    setTimeout(() => { b.dataset.sent = 'false'; }, 1600);
    avisar(T.comando((b.querySelector('code, b, strong, .cmd-name') ?? b).textContent.trim().split(/\s/)[0]));
  }],
  ['.tema-tarjeta', (b) => {
    const tema = $('[data-tema-prev]', b)?.dataset.temaPrev;
    if (!tema) return false;
    ponerTema(tema);
    // Como en la app: elegir uno a mano apaga «Seguir el claro/oscuro del
    // sistema», y sus dos desplegables se van con él.
    const sigue = $('.tema-sistema input');
    if (sigue) sigue.checked = false;
    const pares = $('.tema-sistema-pares');
    if (pares) pares.hidden = true;
    avisar(T.tema($('.tema-nombre', b)?.textContent.trim() || tema));
  }],
  ['.tema-tab', (b) => { unoSolo(b); return false; }],
  ['.panel-card .choice', (b) => {
    // El idioma de la app cambia el de la demostración entera.
    const texto = b.textContent.trim();
    const ingles = /^(inglés|english)$/i.test(texto);
    if (!ingles && !/^(español|spanish)$/i.test(texto)) return false;
    if (ingles === EN) return;
    const u = new URL(location.href);
    if (ingles) u.searchParams.set('lang', 'en');
    else u.searchParams.delete('lang');
    u.searchParams.set('vista', 'ajustes');
    location.replace(u);
  }],

  // ── El chat y la memoria ──
  ['.chat-pestana', (b) => (b.dataset.on === 'true' ? undefined : listaDelChat(b))],
  ['.chat-enviar', (b) => enviarChat($('.chat-input', b.closest('.chat-caja')))],
  ['.chat-fila', (b) => {
    for (const f of $$('.chat-fila', b.closest('.chat-lista'))) f.dataset.on = String(f === b);
    avisar(T.sesion);
  }],
  ['.mem-hoja', (b) => {
    if (b.dataset.on === 'true') return;
    avisar(T.nota);
  }],

  // ── La paleta ──
  ['.paleta-fila', (f) => lanzarPaleta(f)],
  ['.paleta', (p, e) => { if (e.target === p) cerrarPaleta(); }],

  // ── Lo general: lo que se enciende, y lo que solo puede contarlo ──
  ['[role="switch"]', (b) => { b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); }],
  ['button[data-on]', (b) => unoSolo(b)],
  ['button[data-active]', (b) => unoSolo(b, 'active')],
];

/** El botón que no tiene gesto propio: Adeo dice lo que hace (su globo, o su
 *  nombre) y que eso, en la app, pasa de verdad. */
function porDefecto(boton) {
  const tip = boton.dataset.tip?.split('\n')[0];
  const rotulo = (boton.getAttribute('aria-label') || boton.textContent || '').replace(/\s+/g, ' ').trim();
  avisar(T.copia, boton, { titulo: tip || (rotulo.length < 60 ? rotulo : '') });
}

app.addEventListener('click', (e) => {
  // Un panel se enfoca al pulsarlo, se pulse donde se pulse.
  const panel = e.target.closest('.pane');
  if (panel) enfocar(panel);
  // El menú de Posponer se cierra con un clic fuera, como en la app.
  const menu = $('.dec-posponer', app);
  if (menu && !menu.contains(e.target) && !e.target.closest('.dec button[data-posponer]')) menu.remove();
  // Y el de ordenar las terminales, igual.
  if (!e.target.closest('.layout-pop, .layout-btn')) cerrarDisposicion();

  for (const [selector, hacer] of REGLAS) {
    const el = e.target.closest(selector);
    if (!el || !app.contains(el)) continue;
    if (hacer(el, e) !== false) return;
  }
  // Las casillas, los botones de radio y los campos ya hacen lo suyo solos.
  const boton = e.target.closest('button, [role="button"]');
  if (boton && app.contains(boton)) porDefecto(boton);
});

/* Lo que BORRA o CIERRA y aquí no puede hacerlo, fuera. La demo trae todos los
   botones de la app, y los que no tienen regla contestan con el aviso de «en la
   app»; en «Cerrar las 4 terminales» o «Borrar la sesión» ese aviso se lee como
   que la demo está rota (Munir, 2026-10-13). Se
   quitan los que EMPIEZAN por un verbo de borrar o cerrar y no tienen regla;
   los que sí hacen algo (cerrar una terminal, quitar una tarjeta) se quedan.
   Con un observador y no en cada sitio que monta una hoja, porque las hojas,
   las secciones y los paneles salen de sus plantillas por caminos distintos. */
const DESTRUYE = /^(cerrar|borrar|eliminar|quitar(lo)?|descartar|vaciar|close|delete|remove|discard|sign out|log out|take .+ off)\b/i;

/* La regla de la cabecera de un panel recoge TODOS sus botones y solo atiende a
   tres (cerrar, el ojo y ampliar): de los que borran, ahí solo «cerrar» hace algo. */
function tieneRegla(b) {
  if (b.closest('.pane-head')) return b.classList.contains('pane-close');
  return REGLAS.some(([selector]) => b.closest(selector));
}

function podar(desde) {
  for (const b of [desde, ...$$('button, [role="button"]', desde)]) {
    if (!b.matches('button, [role="button"]')) continue;
    const rotulo = (b.dataset.tip?.split('\n')[0] || b.getAttribute('aria-label') || b.textContent || '').trim();
    if (DESTRUYE.test(rotulo) && !tieneRegla(b)) b.remove();
  }
}

podar(app);
new MutationObserver((cambios) => {
  for (const c of cambios) for (const n of c.addedNodes) if (n.nodeType === 1) podar(n);
}).observe(app, { childList: true, subtree: true });

/* --------------------------------------------------------------------------
   12. ESCRIBIR Y MARCAR
   -------------------------------------------------------------------------- */

function filtrarComandos(hoja) {
  if (!hoja) return;
  const q = ($('.cmd-search', hoja)?.value ?? '').trim().toLowerCase();
  const elegido = $$('.cmd-bar .choice', hoja).findIndex((c) => c.dataset.on === 'true');
  // Las fichas van en el mismo orden que sus secciones: «Todos» y luego una por una.
  $$('.cmd-section', hoja).forEach((seccion, i) => {
    let quedan = 0;
    for (const c of $$('.cmd-card', seccion)) {
      const cabe = (!q || c.textContent.toLowerCase().includes(q)) && (elegido <= 0 || elegido - 1 === i);
      c.hidden = !cabe;
      if (cabe) quedan++;
    }
    seccion.hidden = quedan === 0;
    const n = $('.cmd-section-count', seccion);
    if (n) n.textContent = String(quedan);
  });
}

function anadirTarjeta(caja) {
  const campo = $('.kb-nueva-in', caja);
  const texto = campo?.value.trim();
  const molde = $('.kb-card-mia', caja.parentElement);
  if (!texto || !molde) return campo?.focus();
  const tarjeta = molde.cloneNode(true);
  $('.kb-mia-txt', tarjeta).textContent = texto;
  const casilla = $('input', tarjeta);
  if (casilla) casilla.checked = false;
  caja.before(tarjeta);
  campo.value = '';
  const n = $('.kb-col-n', caja.closest('.kb-col'));
  if (n) n.textContent = String($$('.kb-card', caja.closest('.kb-col')).length);
}

app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('.sidebar .finder')) return filtrarBarra(el.value);
  if (el.matches('.cmd-search')) return filtrarComandos(el.closest('.commands'));
  if (el.matches('.paleta-input')) {
    const paleta = el.closest('.paleta');
    const q = el.value.trim().toLowerCase();
    for (const f of $$('.paleta-fila', paleta)) f.hidden = !!q && !f.textContent.toLowerCase().includes(q);
    return marcarPaleta(paleta, 0);
  }
  if (el.matches('.chat-input')) {
    const boton = $('.chat-enviar', el.closest('.chat-caja'));
    if (boton) boton.disabled = !el.value.trim();
    return;
  }
  if (el.matches('textarea.dec-libre')) return repasarDecision(el.closest('.dec-abierta'));
  if (el.matches('.inicio-texto')) {
    const boton = $('.inicio-enviar', el.closest('.inicio-caja'));
    if (boton) boton.disabled = !el.value.trim();
  }
});

/* El tema puesto, con su marca: el borde (`data-on`) y el svg junto al nombre
   van a la tarjeta de ese tema. Solo con `data-on` la marca se quedaba en la
   de antes. */
function ponerTema(tema) {
  html.dataset.theme = tema;
  repasarCristal();
  const tarjetas = $$('.tema-tarjeta');
  const elegida = tarjetas.find((t) => $('[data-tema-prev]', t)?.dataset.temaPrev === tema);
  if (!elegida) return;
  const marca = $('.tema-tarjeta[data-on="true"] .tema-nombre svg');
  for (const t of tarjetas) t.dataset.on = String(t === elegida);
  if (marca) $('.tema-nombre', elegida)?.appendChild(marca);
}

/* Con «Seguir el claro/oscuro del sistema» encendido manda el desplegable de
   la familia en la que esté el sistema de quien mira: el primero es el de
   oscuro y el segundo el de claro, como en la app. */
function temaDelSistema() {
  const [oscuro, claro] = $$('.tema-sistema-pares select');
  const sel = matchMedia('(prefers-color-scheme: light)').matches ? claro : oscuro;
  if (sel?.value) ponerTema(sel.value);
}

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('.tema-sistema input')) {
    const pares = $('.tema-sistema-pares');
    if (pares) pares.hidden = !el.checked;
    if (el.checked) temaDelSistema();
    return;
  }
  if (el.matches('.tema-sistema-pares select')) {
    if ($('.tema-sistema input')?.checked) temaDelSistema();
    return;
  }
  if (el.matches('.dec-opcion input[type="radio"]')) return repasarDecision(el.closest('.dec-abierta'));
  if (el.matches('.note-task input')) {
    el.closest('.note-task').dataset.done = String(el.checked);
    return contarNota(el.closest('.note'));
  }
});

app.addEventListener('keydown', (e) => {
  const el = e.target;
  if (el.matches?.('.chat-input') && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    return enviarChat(el);
  }
  if (el.matches?.('.inicio-texto') && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    return pedirAAdeo(el.closest('.inicio-caja'));
  }
  if (el.matches?.('.kb-nueva-in') && e.key === 'Enter') return anadirTarjeta(el.closest('.kb-nueva'));
  if (el.matches?.('.paleta-input')) {
    const paleta = el.closest('.paleta');
    const filas = filasDe(paleta);
    const n = filas.findIndex((f) => f.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowDown') { e.preventDefault(); marcarPaleta(paleta, Math.min(n + 1, filas.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); marcarPaleta(paleta, Math.max(n - 1, 0)); }
    if (e.key === 'Enter' && filas[n]) lanzarPaleta(filas[n]);
  }
});

/* Ctrl+K abre la paleta y Ctrl+Mayús+A llama a Adeo, como en la app. Solo
   llega aquí con el foco dentro de la demostración: fuera, esas teclas siguen
   siendo del navegador. */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if ($('.app > .paleta', app)) cerrarPaleta();
    else abrirPaleta();
  } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    alternarCapataz();
  } else if (e.key === 'Escape') {
    cerrarPaleta();
    cerrarCapataz();
    $('.dec-posponer', app)?.remove();
    // Adeo en la barra se cierra con Escape desde su caja, como en la app.
    if (e.target.closest?.('.lateral .foreman-box')) cerrarAdeoLateral();
  }
});

/* --------------------------------------------------------------------------
   13. EL ORBE DEL ASISTENTE
   El satélite da vueltas alrededor del planeta y se esconde al pasar por
   detrás. La geometría es la de src/components/Orbe.tsx; se anima a mano
   porque para esconderlo hay que saber dónde está.
   -------------------------------------------------------------------------- */

(function orbe() {
  const circulos = $$('.orbe svg circle', app);
  const punto = $('.orbe .orbe-satelite', app) ?? circulos[circulos.length - 1];
  if (!punto || circulos.length < 2) return;

  const CX = 12, CY = 11.5, R_PLANETA = 5.4, RX = 10, RY = 4.1;
  const GIRO = (-22 * Math.PI) / 180;
  const lento = matchMedia('(prefers-reduced-motion: reduce)').matches ? 2.5 : 1;
  /* Doce pasos por segundo, los del orbe de la app en reposo (`PASOS_S` en
     Orbe.tsx): a ese tamaño el satélite avanza menos de un píxel por paso y se
     ve igual. Iba a un paso por fotograma, y cada paso mueve un círculo del
     dibujo: el navegador recolocaba y repintaba la demostración 240 veces por
     segundo en una pantalla de 240 Hz, también mientras la portada bajaba
     (medido el 2026-11-19 con la CPU a 4x: 255 recolocaciones y 501 pintados en
     2,5 s con la página quieta). */
  const PASO_MS = Math.round(1000 / 12);
  let angulo = 0, antes = performance.now(), pedido = 0;

  const paso = () => {
    const ahora = performance.now();
    const dt = Math.min(ahora - antes, 250) / 1000;
    antes = ahora;
    angulo += (2 * Math.PI * dt) / (7 * lento);
    const c = Math.cos(angulo), s = Math.sin(angulo);
    const ex = RX * c, ey = RY * s;
    punto.setAttribute('cx', (CX + ex * Math.cos(GIRO) - ey * Math.sin(GIRO)).toFixed(2));
    punto.setAttribute('cy', (CY + ex * Math.sin(GIRO) + ey * Math.cos(GIRO)).toFixed(2));
    const detras = s < 0;
    punto.style.opacity = detras && Math.hypot(ex, ey) < R_PLANETA + 0.9 ? '0' : detras ? '0.45' : '1';
    pedido = setTimeout(paso, PASO_MS);
  };
  // Solo gira cuando se ve: ni con la pestaña de fondo, ni con la demostración
  // fuera de la pantalla (ver «Fuera de la vista», más abajo).
  const girar = () => {
    clearTimeout(pedido);
    if (document.hidden || html.hasAttribute('data-fuera')) return;
    antes = performance.now();
    pedido = setTimeout(paso, PASO_MS);
  };
  girar();
  document.addEventListener('visibilitychange', girar);
  document.addEventListener('demo:vista', girar);
})();

/* --------------------------------------------------------------------------
   FUERA DE LA VISTA, QUIETA
   La portada sigue hacia abajo y la demostración se queda arriba, sin que nadie
   la mire: el orbe suelta su bucle hasta que vuelve a verse. (Lo demás que
   latía solo ya no late, ver demo.css.) El observador mide contra la pantalla
   de verdad aunque esto viva dentro de un <iframe>.
   -------------------------------------------------------------------------- */

if ('IntersectionObserver' in window) {
  new IntersectionObserver((entradas) => {
    html.toggleAttribute('data-fuera', !entradas[0].isIntersecting);
    document.dispatchEvent(new Event('demo:vista'));
  }).observe(raiz);
}

/* --------------------------------------------------------------------------
   14. ARRANCAR
   -------------------------------------------------------------------------- */

/* LAS QUE YA ESTÁN APARTADAS. La barra de Sam dice que tiene siete terminales
   abiertas y la Cabina enseña cuatro: dos de las otras van a la tira, como las
   tendría él, con lo que dicen en el Lienzo (de ahí se copian). Al traerlas
   caen en su columna: la de la izquierda y la de la derecha. */
for (const [nombre, columna] of [['invoice-cli · terminal', 0], ['landing-web · claude code', 1]]) {
  const suya = $$('.react-flow__node .pane', tablero ?? app).find((p) => nombreDePanel(p) === nombre);
  if (!suya || !mosaico[columna]) continue;
  const copia = suya.cloneNode(true);
  // En el Lienzo su cabecera no lleva minimizar ni sacar; en la Cabina, sí.
  const botones = $('.ph-acts', copia), deCabina = $(':scope > .pane .ph-acts', rejilla);
  if (botones && deCabina) botones.replaceWith(deCabina.cloneNode(true));
  copia.dataset.focused = 'false';
  copia.dataset.demoApartada = 'si';
  copia.hidden = true;
  rejilla.appendChild(copia);
  mosaico[columna].panes.push(copia);
}
recolocar();

const pedida = consulta.get('vista') ?? '';
irA($(`nav.tabs .tab[data-tab="${pestanaDe(pedida)}"]`, app) ? pedida : 'cabina');

/* --------------------------------------------------------------------------
   15. EL RECORRIDO
   La primera vez que alguien ve la demo, Adeo la enseña por partes. Una vez
   por visitante (`explica.js` lo apunta), saltable con su X o con Escape, y de
   nuevo cuando se quiera pulsando a Adeo en la barra. Dentro de la portada
   espera a que la demo se vea casi entera, y no sale si quien mira ya ha
   empezado a tocar por su cuenta. `?tour=1` lo fuerza y `?tour=0` lo quita
   (las fotos y el censo de botones).
   -------------------------------------------------------------------------- */

function pasosDelRecorrido() {
  const primera = () => $$(':scope > .pane', rejilla).find(enMosaico);
  const [r1, r2, r3, r4, r5, r6] = T.recorrido;
  return [
    { el: () => $('aside.sidebar .projects', app) ?? $('aside.sidebar', app), antes: () => estado.vista !== 'cabina' && irA('cabina'), titulo: r1[0], texto: r1[1] },
    { el: () => { const p = primera(); return p && $('.ph-acts', p); }, titulo: r2[0], texto: r2[1], espera: 'minimizar' },
    { el: () => tira, partes: () => (tira ? [...tira.children] : []), titulo: r3[0], texto: r3[1], espera: 'traer' },
    { el: () => $(':scope > .pane:not([hidden]) .pane-ask', rejilla), titulo: r4[0], texto: r4[1] },
    { el: () => $('.layout-btn', app), titulo: r5[0], texto: r5[1] },
    { el: () => $('.brand .campana', app), titulo: r6[0], texto: r6[1], enCasa: true, lado: 'abajo' },
  ];
}

function empezarRecorrido() {
  if (estado.vista !== 'cabina') irA('cabina');
  adeo.recorrido(pasosDelRecorrido());
}

/* Quien ya ha empezado a tocar por su cuenta no necesita el recorrido: un
   puntero dentro de la demo, o las pestañas de encima de ella en la portada y
   sus «Tocarlo en la demo» (`portada/pestanas.js`, `portada/muestra.js`), que
   la cambian de pantalla con `adeDemo.irA` desde fuera, sin ningún puntero
   aquí dentro. */
let tocado = false;
{
  const pide = consulta.get('tour');
  app.addEventListener('pointerdown', (e) => { if (e.isTrusted) tocado = true; }, true);
  const toca = () => pide === '1' || (pide !== '0' && !recorridoVisto() && !tocado && estado.vista === 'cabina');
  if (!embebida) {
    if (toca()) setTimeout(() => toca() && !adeo.enRecorrido() && empezarRecorrido(), 900);
  } else if (toca() && 'IntersectionObserver' in window) {
    let reloj = 0;
    const vigia = new IntersectionObserver(([e]) => {
      clearTimeout(reloj);
      if (e.intersectionRatio < 0.6) return;
      reloj = setTimeout(() => {
        if (toca() && !adeo.enRecorrido()) empezarRecorrido();
        // Deja de mirar cuando ya ha salido o ya no va a salir (lo vio, o tocó
        // por su cuenta). Si no había nada que enseñar, o no estaba en la
        // Cabina, sigue mirando: sale la próxima vez que la demo se vea.
        if (adeo.enRecorrido() || recorridoVisto() || tocado) vigia.disconnect();
      }, 1200);
    }, { threshold: [0, 0.6, 0.85, 1] });
    vigia.observe(raiz);
  }
}

// La portada (y las pruebas, y quien trastee desde la consola). Cambiar de
// pantalla desde fuera es tocar: ver `tocado`, arriba.
window.adeDemo = {
  irA: (vista) => { tocado = true; irA(vista); },
  avisar, estado, empezarRecorrido, callar: () => adeo.callar(),
  pantallaCompleta, enRecorrido: () => adeo.enRecorrido(),
};
