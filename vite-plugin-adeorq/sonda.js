// La sonda: los ojos y las manos de Adeorq DENTRO de tu página.
//
// Adeorq enseña tu localhost en un iframe, y un iframe de otro origen es una
// caja cerrada: desde fuera no se puede leer ni un nodo. Así que la parte que
// toca la página tiene que correr aquí dentro, y hablar con Adeorq por
// `postMessage`, que es el único hueco que deja el navegador.
//
// ── EL REPARTO ──────────────────────────────────────────────────────────────
//
// Aquí dentro va todo lo que necesita las coordenadas de la página: el
// resaltado, el marco de selección, las asas, el arrastre y el texto editable.
// La barra de herramientas y el panel de propiedades los pinta Adeorq, fuera,
// porque son cristal de la app y no deben heredar el CSS de tu web ni pelearse
// con él.
//
// ── POR QUÉ NO ESCRIBE FICHEROS ─────────────────────────────────────────────
//
// La sonda cambia el estilo EN VIVO mientras arrastras, para que se vea al
// momento, pero eso es DOM y se pierde al recargar. Cuando sueltas, manda el
// cambio a Adeorq y es Adeorq quien lo escribe en el fuente. Así solo hay un
// sitio en todo el sistema que toque tus ficheros, y está en Rust, donde se le
// puede poner un cerrojo de verdad.
//
// ── LO QUE NO SE TOCA ───────────────────────────────────────────────────────
//
// Nada de lo que pinta la sonda entra en el árbol normal de la página: vive en
// un `shadow root` aparte para que ni tu CSS le afecte ni el suyo te manche, y
// lleva `data-adeorq-sonda` para que nunca se pueda seleccionar a sí misma.

const MARCA = "data-adeorq-loc";
const LIMITE = 2147483000;

/** La carpeta del proyecto, que la rellena el plugin al servir este fichero. */
const RAIZ = __ADEORQ_RAIZ__;

/* ── Estado ──────────────────────────────────────────────────────────────── */

let editando = false;
let herramienta = "select";
let elegido = null;
let debajo = null;
/** Copia de los estilos que tenía el elegido al entrar, para poder cancelar. */
let original = null;

/* ── La capa de encima, fuera del alcance de tu CSS ──────────────────────── */

const anfitrion = document.createElement("div");
anfitrion.setAttribute("data-adeorq-sonda", "");
anfitrion.style.cssText =
  "position:fixed;inset:0;pointer-events:none;z-index:" + LIMITE + ";";
const capa = anfitrion.attachShadow({ mode: "open" });
capa.innerHTML = `
  <style>
    :host { all: initial; }
    .caja { position: fixed; pointer-events: none; box-sizing: border-box; }
    .hover { border: 1px solid #6c63ff; background: rgba(108,99,255,.08); border-radius: 2px; }
    .sel { border: 1px solid #6c63ff; }
    .asa {
      position: fixed; width: 9px; height: 9px; margin: -5px 0 0 -5px;
      background: #fff; border: 1.5px solid #6c63ff; border-radius: 2px;
      pointer-events: auto; box-sizing: border-box;
    }
    .etiqueta {
      position: fixed; pointer-events: none; transform: translateY(-100%);
      background: #6c63ff; color: #fff; border-radius: 3px 3px 0 0;
      padding: 1px 6px; font: 600 11px/1.5 ui-sans-serif, system-ui, sans-serif;
      white-space: nowrap;
    }
    .lazo { position: fixed; border: 1px dashed #6c63ff; background: rgba(108,99,255,.10); pointer-events: none; }
  </style>
  <div class="caja hover" hidden></div>
  <div class="caja sel" hidden></div>
  <div class="etiqueta" hidden></div>
  <div class="lazo" hidden></div>
`;
const vHover = capa.querySelector(".hover");
const vSel = capa.querySelector(".sel");
const vEtiqueta = capa.querySelector(".etiqueta");
const vLazo = capa.querySelector(".lazo");

/** Las ocho asas del marco, en el orden en que se colocan. */
const PUNTOS = [
  ["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0],
  ["e", 1, 0.5], ["se", 1, 1], ["s", 0.5, 1],
  ["sw", 0, 1], ["w", 0, 0.5],
];
const asas = PUNTOS.map(([lado]) => {
  const a = document.createElement("div");
  a.className = "asa";
  a.dataset.lado = lado;
  a.hidden = true;
  capa.appendChild(a);
  return a;
});

const montar = () => document.body && document.body.appendChild(anfitrion);
if (document.body) montar();
else document.addEventListener("DOMContentLoaded", montar, { once: true });

/* ── Hablar con Adeorq ───────────────────────────────────────────────────── */

function aAdeorq(mensaje) {
  if (window.parent === window) return;
  window.parent.postMessage({ de: "adeorq-sonda", ...mensaje }, "*");
}

/* ── Leer un elemento ────────────────────────────────────────────────────── */

/** Lo que Adeorq necesita saber de un elemento para pintar su panel. */
function retrato(el) {
  const c = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const propio = el.style;
  return {
    loc: el.getAttribute(MARCA) || null,
    etiqueta: el.tagName.toLowerCase(),
    clases: el.className && typeof el.className === "string" ? el.className : "",
    texto: soloTexto(el),
    caja: { x: r.x, y: r.y, ancho: r.width, alto: r.height },
    // Lo calculado es lo que se VE; lo propio es lo que ya está escrito en el
    // elemento. El panel enseña lo primero y solo escribe lo que tú cambies,
    // que es lo que evita clavar en el fichero cuarenta propiedades heredadas.
    estilo: {
      color: c.color,
      backgroundColor: c.backgroundColor,
      fontSize: c.fontSize,
      fontWeight: c.fontWeight,
      lineHeight: c.lineHeight,
      letterSpacing: c.letterSpacing,
      padding: c.padding,
      margin: c.margin,
      borderRadius: c.borderRadius,
      opacity: c.opacity,
      zIndex: c.zIndex === "auto" ? "" : c.zIndex,
      rotate: rotacionDe(c.transform),
      width: Math.round(r.width) + "px",
      height: Math.round(r.height) + "px",
      display: c.display,
      backgroundImage: c.backgroundImage === "none" ? "" : c.backgroundImage,
      boxShadow: c.boxShadow === "none" ? "" : c.boxShadow,
    },
    puesto: Object.fromEntries(
      Array.from(propio).map((k) => [aCamello(k), propio.getPropertyValue(k)]),
    ),
  };
}

/** Solo el texto directo. Un `div` con seis hijos no es un texto editable. */
function soloTexto(el) {
  const hijos = Array.from(el.childNodes);
  const texto = hijos.filter((n) => n.nodeType === 3);
  const otros = hijos.filter((n) => n.nodeType === 1);
  if (otros.length > 0 || texto.length === 0) return null;
  return texto.map((n) => n.nodeValue).join("").trim();
}

/** Los grados de una matriz de transformación, que es como llega `rotate`. */
function rotacionDe(transform) {
  if (!transform || transform === "none") return "";
  const n = transform.match(/matrix\(([^)]+)\)/);
  if (!n) return "";
  const [a, b] = n[1].split(",").map(Number);
  const grados = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  return grados === 0 ? "" : String(grados);
}

const aCamello = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/* ── Pintar el marco ─────────────────────────────────────────────────────── */

function colocarCaja(vista, el) {
  if (!el) {
    vista.hidden = true;
    return null;
  }
  const r = el.getBoundingClientRect();
  vista.hidden = false;
  vista.style.left = r.x + "px";
  vista.style.top = r.y + "px";
  vista.style.width = r.width + "px";
  vista.style.height = r.height + "px";
  return r;
}

function repintar() {
  colocarCaja(vHover, editando && debajo && debajo !== elegido ? debajo : null);
  const r = colocarCaja(vSel, elegido);
  if (!r) {
    vEtiqueta.hidden = true;
    asas.forEach((a) => (a.hidden = true));
    return;
  }
  vEtiqueta.hidden = false;
  vEtiqueta.style.left = r.x + "px";
  vEtiqueta.style.top = r.y + "px";
  vEtiqueta.textContent =
    elegido.tagName.toLowerCase() + "  " + Math.round(r.width) + " x " + Math.round(r.height);

  const conAsas = herramienta === "select" || herramienta === "mover";
  asas.forEach((a, i) => {
    const [, fx, fy] = PUNTOS[i];
    a.hidden = !conAsas;
    a.style.left = r.x + r.width * fx + "px";
    a.style.top = r.y + r.height * fy + "px";
    a.style.cursor = PUNTOS[i][0].length === 2 ? PUNTOS[i][0] + "-resize" : PUNTOS[i][0] + "-resize";
  });
}

/* ── Elegir ──────────────────────────────────────────────────────────────── */

/** El elemento de tu página que hay bajo el puntero, saltándose lo nuestro. */
function bajoElPuntero(e) {
  const pila = document.elementsFromPoint(e.clientX, e.clientY);
  for (const el of pila) {
    if (el === anfitrion || el.hasAttribute("data-adeorq-sonda")) continue;
    if (el === document.documentElement || el === document.body) continue;
    return el;
  }
  return null;
}

function elegir(el) {
  elegido = el;
  original = el ? el.getAttribute("style") : null;
  repintar();
  aAdeorq({ tipo: "seleccion", elemento: el ? retrato(el) : null });
}

/* ── Los gestos ──────────────────────────────────────────────────────────── */

let gesto = null;

function alMover(e) {
  if (!editando) return;
  if (gesto) {
    seguirGesto(e);
    return;
  }
  if (herramienta === "caja" && lazo) {
    pintarLazo(e);
    return;
  }
  const nuevo = bajoElPuntero(e);
  if (nuevo !== debajo) {
    debajo = nuevo;
    repintar();
  }
}

function alBajar(e) {
  if (!editando) return;

  if (herramienta === "caja") {
    lazo = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    return;
  }

  const el = bajoElPuntero(e);
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();

  if (el !== elegido) elegir(el);

  if (herramienta === "mover") {
    const r = el.getBoundingClientRect();
    gesto = {
      clase: "mover",
      x0: e.clientX,
      y0: e.clientY,
      base: baseDeTraslacion(el),
      ancho: r.width,
      alto: r.height,
    };
  }
}

/** El `translate` que ya tuviera puesto, para sumar sobre él y no saltar. */
function baseDeTraslacion(el) {
  const m = (el.style.transform || "").match(
    /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/,
  );
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
}

function seguirGesto(e) {
  const dx = e.clientX - gesto.x0;
  const dy = e.clientY - gesto.y0;

  if (gesto.clase === "mover") {
    const x = Math.round(gesto.base.x + dx);
    const y = Math.round(gesto.base.y + dy);
    elegido.style.transform = `translate(${x}px, ${y}px)`;
  } else if (gesto.clase === "estirar") {
    const lado = gesto.lado;
    let ancho = gesto.ancho;
    let alto = gesto.alto;
    if (lado.includes("e")) ancho = gesto.ancho + dx;
    if (lado.includes("w")) ancho = gesto.ancho - dx;
    if (lado.includes("s")) alto = gesto.alto + dy;
    if (lado.includes("n")) alto = gesto.alto - dy;
    if (lado.includes("e") || lado.includes("w")) {
      elegido.style.width = Math.max(8, Math.round(ancho)) + "px";
    }
    if (lado.includes("n") || lado.includes("s")) {
      elegido.style.height = Math.max(8, Math.round(alto)) + "px";
    }
  }
  repintar();
}

function alSubir() {
  if (lazo) {
    cerrarLazo();
    return;
  }
  // Las asas siguen escuchando el `pointerup` aunque entre medias hayas
  // deseleccionado con Escape, así que aquí no se da por hecho que haya algo.
  if (!gesto || !elegido) {
    gesto = null;
    return;
  }
  const cambios = {};
  if (gesto.clase === "mover") cambios.transform = elegido.style.transform;
  if (gesto.clase === "estirar") {
    if (elegido.style.width) cambios.width = elegido.style.width;
    if (elegido.style.height) cambios.height = elegido.style.height;
  }
  gesto = null;
  guardar(cambios);
  aAdeorq({ tipo: "seleccion", elemento: retrato(elegido) });
}

/* ── La caja que se manda al agente ──────────────────────────────────────── */

let lazo = null;

function pintarLazo(e) {
  const x = Math.min(lazo.x, e.clientX);
  const y = Math.min(lazo.y, e.clientY);
  vLazo.hidden = false;
  vLazo.style.left = x + "px";
  vLazo.style.top = y + "px";
  vLazo.style.width = Math.abs(e.clientX - lazo.x) + "px";
  vLazo.style.height = Math.abs(e.clientY - lazo.y) + "px";
}

function cerrarLazo() {
  const r = vLazo.getBoundingClientRect();
  vLazo.hidden = true;
  lazo = null;
  if (r.width < 8 || r.height < 8) return;

  // Lo que hay dentro del recuadro, quedándose solo con los de más arriba: si
  // coges una tarjeta entera, al agente no le sirve la lista de sus veinte
  // hijos, le sirve la tarjeta.
  const dentro = Array.from(document.querySelectorAll("[" + MARCA + "]")).filter((el) => {
    const c = el.getBoundingClientRect();
    return c.x >= r.x - 2 && c.y >= r.y - 2 && c.right <= r.right + 2 && c.bottom <= r.bottom + 2;
  });
  const mayores = dentro.filter((el) => !dentro.some((otro) => otro !== el && otro.contains(el)));
  aAdeorq({
    tipo: "caja",
    elementos: mayores.slice(0, 12).map(retrato),
  });
}

/* ── Escribir en el fichero (a través de Adeorq) ─────────────────────────── */

function guardar(estilos) {
  if (!elegido || Object.keys(estilos).length === 0) return;
  const loc = elegido.getAttribute(MARCA);
  if (!loc) {
    aAdeorq({ tipo: "sinorigen", elemento: retrato(elegido) });
    return;
  }
  aAdeorq({ tipo: "escribir", loc, estilos });
}

/* ── Texto en su sitio ───────────────────────────────────────────────────── */

let editandoTexto = null;

function abrirTexto(el) {
  if (!el || soloTexto(el) === null) return;
  editandoTexto = { el, antes: el.textContent };
  el.setAttribute("contenteditable", "plaintext-only");
  el.focus();
  const rango = document.createRange();
  rango.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(rango);
}

function cerrarTexto(guardando) {
  if (!editandoTexto) return;
  const { el, antes } = editandoTexto;
  editandoTexto = null;
  el.removeAttribute("contenteditable");
  const ahora = el.textContent.trim();
  if (!guardando || ahora === antes.trim()) {
    if (!guardando) el.textContent = antes;
    return;
  }
  const loc = el.getAttribute(MARCA);
  if (loc) aAdeorq({ tipo: "escribirTexto", loc, valor: ahora, antes: antes.trim() });
  repintar();
}

/* ── Lo que manda Adeorq ─────────────────────────────────────────────────── */

window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.de !== "adeorq") return;
  // Y solo de la ventana que nos tiene dentro. Sin esto, cualquier script de
  // la propia página podría mandarse órdenes a sí mismo y acabar escribiendo
  // en tu fichero: lo que entra por aquí termina en `editor.rs`.
  if (e.source !== window.parent) return;

  switch (m.tipo) {
    case "hola":
      aAdeorq({ tipo: "lista", url: location.href, raiz: RAIZ, marcados: document.querySelectorAll("[" + MARCA + "]").length });
      break;

    case "modo":
      editando = !!m.editar;
      document.documentElement.style.cursor = editando ? "crosshair" : "";
      if (!editando) {
        cerrarTexto(false);
        elegido = null;
        debajo = null;
      }
      repintar();
      break;

    case "herramienta":
      herramienta = m.cual;
      if (herramienta === "texto" && elegido) abrirTexto(elegido);
      else cerrarTexto(true);
      repintar();
      break;

    case "previa":
      // Enseñarlo mientras mueves el control, sin tocar el fichero.
      if (elegido) {
        Object.assign(elegido.style, m.estilos);
        repintar();
      }
      break;

    case "aplicar":
      if (elegido) {
        Object.assign(elegido.style, m.estilos);
        guardar(m.estilos);
        repintar();
      }
      break;

    case "cancelar":
      if (elegido) {
        if (original === null) elegido.removeAttribute("style");
        else elegido.setAttribute("style", original);
        repintar();
      }
      break;

    case "duplicar":
    case "borrar":
      if (elegido) {
        const loc = elegido.getAttribute(MARCA);
        if (loc) aAdeorq({ tipo: m.tipo, loc });
      }
      break;

    case "alagente":
      if (elegido) aAdeorq({ tipo: "alagente", elemento: retrato(elegido) });
      break;

    case "deseleccionar":
      elegir(null);
      break;
  }
});

/* ── Enganches ───────────────────────────────────────────────────────────── */

document.addEventListener("pointermove", alMover, true);
document.addEventListener("pointerdown", alBajar, true);
document.addEventListener("pointerup", alSubir, true);
document.addEventListener("dblclick", (e) => {
  if (!editando) return;
  e.preventDefault();
  abrirTexto(bajoElPuntero(e));
}, true);
document.addEventListener("keydown", (e) => {
  if (!editando) return;
  if (editandoTexto) {
    if (e.key === "Escape") cerrarTexto(false);
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      cerrarTexto(true);
    }
    return;
  }
  if (e.key === "Escape") elegir(null);
}, true);

// Un clic en modo edición no debe activar tu web: no queremos navegar a otra
// página por seleccionar un enlace.
document.addEventListener("click", (e) => {
  if (editando && !editandoTexto) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

for (const asa of asas) {
  asa.addEventListener("pointerdown", (e) => {
    if (!elegido) return;
    e.preventDefault();
    e.stopPropagation();
    const r = elegido.getBoundingClientRect();
    gesto = {
      clase: "estirar",
      lado: asa.dataset.lado,
      x0: e.clientX,
      y0: e.clientY,
      ancho: r.width,
      alto: r.height,
    };
    asa.setPointerCapture(e.pointerId);
  });
  asa.addEventListener("pointermove", (e) => gesto && seguirGesto(e));
  asa.addEventListener("pointerup", alSubir);
}

window.addEventListener("scroll", repintar, true);
window.addEventListener("resize", repintar);

aAdeorq({ tipo: "lista", url: location.href, raiz: RAIZ, marcados: 0 });
