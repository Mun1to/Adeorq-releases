/* ============================================================================
   Adeorq · demo/vivo.js
   LO QUE HACE QUE LA DEMOSTRACIÓN SE PUEDA PULSAR.

   Lo que se ve es el DOM de la app, congelado (`datos-es.html`, `datos-en.html`,
   generados por `scripts/hacer-demo.mjs`). Congelado quiere decir que React no
   está: nada responde solo. Este archivo le devuelve los gestos, uno por uno,
   con las mismas clases y los mismos atributos que usa la app, para que su
   propia hoja de estilos haga el resto:

     · cambiar de vista, de sección y de tema
     · la Cabina: enfocar, tapar, maximizar y cerrar terminales, la barra de
       proyectos, los paneles de la derecha y la paleta de Ctrl+K
     · el Lienzo: arrastrar las piezas, mover y acercar el tablero, tachar tareas
     · las decisiones, los objetivos, los comandos y las cuentas

   Lo que no se puede imitar sin mentir (abrir una terminal de verdad, llamar a
   un agente) no se finge: sale un aviso que dice qué haría la app. Ningún botón
   se queda mudo: el que no tiene gesto propio cuenta lo que hace con su propio
   globo de ayuda.
   ========================================================================= */

const $ = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];

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
  marca: 'Demo',
  deTip: (tip) => `${tip.replace(/[.\s]+$/, '')}. That is in the app: this is a copy you can click around, with no agents behind it.`,
  deRotulo: (r) => `"${r}" does its job in the app. This is a copy you can click around, with no agents behind it.`,
  mudo: 'In the app this responds. This is a copy you can click around, with no agents behind it.',
  adeo: "I'm Adeo. In the app I tell you when a terminal is waiting for you, and one click takes you to it.",
  cerrada: 'Terminal closed. In the app that stops its agent.',
  ultima: 'In the app an empty Cockpit lets you pick a project to open. Here one stays, so there is something to look at.',
  respuesta: (n) => `In the app that types "${n}" into the terminal and the agent carries on.`,
  emisionSi: 'Stream mode on: paths, names and keys are hidden so you can share your screen.',
  emisionNo: 'Stream mode off.',
  asistente: 'The Assistant lives on the Dashboard: ask for the board in your own words and it proposes the plan.',
  planear: 'In the app the Foreman proposes the board (which sessions, which agents, in which folders) and opens nothing without your OK.',
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
  nota: 'In the app that note opens, with where it leads and what links to it.',
  noCarga: 'The demo could not be loaded.',
} : {
  marca: 'Demo',
  deTip: (tip) => `${tip.replace(/[.\s]+$/, '')}. Eso, en la app: esto es una copia para tocar, sin agentes detrás.`,
  deRotulo: (r) => `«${r}» hace su trabajo en la app. Esto es una copia para tocar, sin agentes detrás.`,
  mudo: 'En la app esto responde. Esto es una copia para tocar, sin agentes detrás.',
  adeo: 'Soy Adeo. En la app aviso cuando una terminal te espera, y con un clic te llevo a ella.',
  cerrada: 'Terminal cerrada. En la app, eso para a su agente.',
  ultima: 'En la app, con la Cabina vacía eliges qué proyecto abrir. Aquí se queda una, para que haya algo que mirar.',
  respuesta: (n) => `En la app, eso escribe «${n}» en la terminal y el agente sigue.`,
  emisionSi: 'Modo emisión encendido: se tapan rutas, nombres y claves para poder compartir la pantalla.',
  emisionNo: 'Modo emisión apagado.',
  asistente: 'El Asistente vive en el Panel: le pides el tablero con tus palabras y él propone el plan.',
  planear: 'En la app, el Capataz propone el tablero (qué sesiones, qué agentes, en qué carpetas) y no abre nada sin tu OK.',
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
  nota: 'En la app se abre esa nota, con a dónde lleva y quién llega hasta ella.',
  noCarga: 'La demostración no ha podido cargarse.',
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

try {
  const respuesta = await fetch(`datos-${EN ? 'en' : 'es'}.html${sello ? `?v=${sello}` : ''}`);
  if (!respuesta.ok) throw new Error(String(respuesta.status));
  raiz.innerHTML = await respuesta.text();
} catch (e) {
  raiz.textContent = T.noCarga;
  raiz.removeAttribute('aria-busy');
  throw e;
}

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
   3. EL AVISO Y EL GLOBO
   -------------------------------------------------------------------------- */

let relojAviso = 0;
function avisar(texto) {
  let a = $('.demo-aviso', app);
  if (!a) {
    a = document.createElement('div');
    a.className = 'demo-aviso';
    a.setAttribute('role', 'status');
    app.appendChild(a);
  }
  const marca = document.createElement('b');
  marca.textContent = T.marca;
  const cuerpo = document.createElement('span');
  cuerpo.textContent = texto;
  a.replaceChildren(marca, cuerpo);
  // Un fotograma después, para que la transición vea el estado de partida.
  requestAnimationFrame(() => { a.dataset.on = 'true'; });
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => delete a.dataset.on, 4200);
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

function marcarRuedas(desde) {
  if (!embebida) return;
  for (const e of [desde, ...$$('*', desde)]) {
    if (e.classList.contains('demo-rueda')) continue;
    const c = getComputedStyle(e);
    if (/auto|scroll/.test(c.overflowY + ' ' + c.overflowX)) e.classList.add('demo-rueda');
  }
}

if (embebida) {
  marcarRuedas(app);
  html.dataset.quieta = '';
  document.addEventListener('pointerdown', () => delete html.dataset.quieta, true);
  html.addEventListener('mouseleave', () => { html.dataset.quieta = ''; });
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

function irA(vista) {
  if (!$(`nav.tabs .tab[data-tab="${vista}"]`, app)) return;
  estado.vista = vista;
  for (const t of $$('nav.tabs .tab', app)) t.dataset.active = String(t.dataset.tab === vista);

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
      app.appendChild(hoja);
      hojas.set(vista, hoja);
      marcarRuedas(hoja);
    }
  }
  for (const [v, hoja] of hojas) hoja.hidden = v !== vista;
  cerrarPaleta();
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

/** Reparte la rejilla entre los paneles que quedan: las columnas se reparten
 *  el ancho, y cada una reparte el alto entre los suyos. */
function recolocar() {
  const vivos = $$(':scope > .pane', rejilla).filter((p) => !p.dataset.demoFuera);
  const columnas = new Map();
  for (const p of vivos) {
    const clave = p.dataset.demoCol ?? (p.dataset.demoCol = p.style.left);
    if (!columnas.has(clave)) columnas.set(clave, []);
    columnas.get(clave).push(p);
  }
  const orden = [...columnas.keys()].sort((a, b) => parseFloat(a) - parseFloat(b));
  orden.forEach((clave, i) => {
    const suyos = columnas.get(clave).sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    suyos.forEach((p, j) => {
      p.style.left = (100 * i) / orden.length + '%';
      p.style.width = 100 / orden.length + '%';
      p.style.top = (100 * j) / suyos.length + '%';
      p.style.height = 100 / suyos.length + '%';
    });
  });
  const cuenta = $('nav.tabs .tab[data-tab="cabina"] .tab-count', app);
  if (cuenta) cuenta.textContent = String(vivos.length);
}

function cerrarPanel(panel) {
  const nodo = panel.closest('.react-flow__node');
  if (nodo) return quitarNodo(nodo);
  const vivos = $$(':scope > .pane', rejilla).filter((p) => !p.dataset.demoFuera);
  if (vivos.length <= 1) return avisar(T.ultima);
  if (panel.dataset.demoMax) maximizar(panel);
  panel.dataset.demoFuera = 'si';
  setTimeout(() => { panel.remove(); recolocar(); }, 190);
  avisar(T.cerrada);
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

/* Los paneles de la derecha: skills, actividad y archivos. Se cierran volviendo
   a pulsar su icono, que es lo que hace la app. */

const zonaCerrada = $('.lateral-zona', app)?.cloneNode(true) ?? null;

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
  const panel = $$(':scope > .pane', rejilla).find((p) => texto.includes($('.pane-name', p)?.textContent.trim() ?? '\u0000'));
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
  ['.brand .campana', () => avisar(T.adeo)],
  ['.objetivos-toggle', (b) => alternarObjetivos(b)],
  ['button.pulso', (b) => alternarPulso(b)],
  ['.stream-toggle', (b) => {
    const on = b.dataset.on !== 'true';
    b.dataset.on = String(on);
    app.dataset.stream = String(on);
    avisar(on ? T.emisionSi : T.emisionNo);
  }],
  ['.foreman-call', () => {
    irA('panel');
    $('.foreman-input', app)?.focus();
    avisar(T.asistente);
  }],

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
    return n < 3 ? panelDerecho(n) : false;
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

  // ── El Panel ──
  ['.stat-card[data-live="true"]', () => irA('cabina')],
  ['.hot-item', () => irA('cabina')],
  ['.fm-guia-fila', (b) => {
    const caja = $('.foreman-input', b.closest('.foreman-card'));
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
  ['.foreman-card .foreman-row .np-btn', (b) => {
    const caja = $('.foreman-input', b.closest('.foreman-card'));
    avisar(caja?.value.trim() ? T.planear : T.planearVacio);
    if (!caja?.value.trim()) caja?.focus();
  }],

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
  ['.dec-fila', (b) => { if (b.dataset.on !== 'true') avisar(T.decisionVieja); }],
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
    html.dataset.theme = tema;
    for (const t of $$('.tema-tarjeta', b.parentElement)) t.dataset.on = String(t === b);
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

function porDefecto(boton) {
  const tip = boton.dataset.tip?.split('\n')[0];
  const rotulo = (boton.getAttribute('aria-label') || boton.textContent || '').replace(/\s+/g, ' ').trim();
  avisar(tip ? T.deTip(tip) : rotulo && rotulo.length < 60 ? T.deRotulo(rotulo) : T.mudo);
}

app.addEventListener('click', (e) => {
  // Un panel se enfoca al pulsarlo, se pulse donde se pulse.
  const panel = e.target.closest('.pane');
  if (panel) enfocar(panel);

  for (const [selector, hacer] of REGLAS) {
    const el = e.target.closest(selector);
    if (!el || !app.contains(el)) continue;
    if (hacer(el, e) !== false) return;
  }
  // Las casillas, los botones de radio y los campos ya hacen lo suyo solos.
  const boton = e.target.closest('button, [role="button"]');
  if (boton && app.contains(boton)) porDefecto(boton);
});

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
});

app.addEventListener('change', (e) => {
  const el = e.target;
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

/* Ctrl+K abre la paleta, como en la app. Solo llega aquí con el foco dentro de
   la demostración: fuera, Ctrl+K sigue siendo del navegador. */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if ($('.app > .paleta', app)) cerrarPaleta();
    else abrirPaleta();
  } else if (e.key === 'Escape') {
    cerrarPaleta();
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
  let angulo = 0, antes = performance.now(), pedido = 0;

  const paso = (ahora) => {
    const dt = Math.min(ahora - antes, 250) / 1000;
    antes = ahora;
    angulo += (2 * Math.PI * dt) / (7 * lento);
    const c = Math.cos(angulo), s = Math.sin(angulo);
    const ex = RX * c, ey = RY * s;
    punto.setAttribute('cx', (CX + ex * Math.cos(GIRO) - ey * Math.sin(GIRO)).toFixed(2));
    punto.setAttribute('cy', (CY + ex * Math.sin(GIRO) + ey * Math.cos(GIRO)).toFixed(2));
    const detras = s < 0;
    punto.style.opacity = detras && Math.hypot(ex, ey) < R_PLANETA + 0.9 ? '0' : detras ? '0.45' : '1';
    pedido = requestAnimationFrame(paso);
  };
  // Solo gira cuando se ve: ni con la pestaña de fondo, ni con la demostración
  // fuera de la pantalla (ver «Fuera de la vista», más abajo).
  const girar = () => {
    cancelAnimationFrame(pedido);
    if (document.hidden || html.hasAttribute('data-fuera')) return;
    antes = performance.now();
    pedido = requestAnimationFrame(paso);
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

irA($(`nav.tabs .tab[data-tab="${consulta.get('vista')}"]`, app) ? consulta.get('vista') : 'cabina');

// Para las pruebas, y para quien quiera trastear desde la consola.
window.adeDemo = { irA, avisar, estado };
