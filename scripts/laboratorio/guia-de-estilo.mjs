// Monta una página con la guía de estilo de docs/contexto/estilo.md enseñada
// con la hoja DE VERDAD de la app (App.css con sus 36 tramos, pegada dentro), así
// que cada esquina, sombra, color y velocidad es la que pinta Adeorq hoy.
// Se lanza con: node scripts/laboratorio/guia-de-estilo.mjs [salida.html] (sin salida, va a la carpeta temporal)
// y se abre en el navegador. Munir la pidió el 2026-10-19 («ábremela y lo miro»).
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../src", import.meta.url));

const app = readFileSync(join(SRC, "App.css"), "utf8");
const hoja = app.replace(/@import\s+"\.\/(estilos\/[^"]+)";/g, (_, ruta) => `/* ── ${ruta} ── */\n` + readFileSync(join(SRC, ruta), "utf8"));
const tramos = (app.match(/@import\s+"\.\/estilos\//g) ?? []).length;

const icono = (d) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  terminal: icono('<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>'),
  carpeta: icono('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  ajustes: icono('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  mas: icono('<path d="M12 5v14M5 12h14"/>'),
  copiar: icono('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  repetir: icono('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
};

const COLORES = [
  ["--accent", "el acento de tu tema: lo que manda y lo elegido"],
  ["--ok", "bien, vivo, hecho, añadido"],
  ["--mal", "error, fallo, borrado"],
  ["--warn", "aviso que no es un error"],
  ["--ask", "te pregunta algo"],
  ["--wait", "te espera"],
  ["--done", "terminó"],
  ["--espejo", "estás en el Modo Espejo"],
  ["--rec", "emitiendo en directo"],
  ["--marca-claude", "Claude, solo donde se habla de Claude"],
];

const pagina = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guía de estilo de Adeorq</title>
<script>
  // Sigue el tema de tu Windows: oscuro = Azul (el de fábrica), claro = Claro.
  (function () {
    var m = matchMedia("(prefers-color-scheme: light)");
    function poner() { if (m.matches) document.documentElement.setAttribute("data-theme", "claro"); else document.documentElement.removeAttribute("data-theme"); }
    poner(); m.addEventListener("change", poner);
  })();
</script>
<style>
/* ════ La hoja de verdad de Adeorq: src/App.css con sus ${tramos} tramos ════ */
${hoja}
/* ════ Lo de esta página (solo colocación; los valores salen de la hoja) ════ */
/* La app no se desplaza nunca (01-base.css: html, body y #root con overflow
   hidden y overscroll-behavior none). Aquí sí: el documento baja, y el body NO
   es su propio contenedor de scroll, porque con overflow auto y sin nada que
   desplazar se quedaba la rueda y su overscroll none no la dejaba pasar a la
   página (Munir, 2026-10-19: «no me deja hacer scroll en esto»). */
html { overflow: auto !important; height: auto !important; overscroll-behavior: auto !important; }
body { overflow: visible !important; height: auto !important; overscroll-behavior: auto !important; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(1200px 700px at 12% -10%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 62%),
    radial-gradient(900px 600px at 95% 40%, color-mix(in srgb, #8a5cf6 26%, transparent), transparent 60%),
    radial-gradient(900px 700px at 30% 110%, color-mix(in srgb, #1fb5a8 22%, transparent), transparent 60%),
    var(--hondo);
  color: var(--text);
  user-select: text;
}
:root[data-theme="claro"] body {
  background:
    radial-gradient(1200px 700px at 12% -10%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 62%),
    radial-gradient(900px 600px at 95% 40%, color-mix(in srgb, #8a5cf6 20%, transparent), transparent 60%),
    #e9eef7;
}
.g { max-width: 1080px; margin: 0 auto; padding: 36px 20px 80px; display: grid; gap: 22px; }
.g-cab h1 { margin: 0 0 6px; font-size: 26px; font-weight: 650; letter-spacing: -0.01em; text-wrap: balance; }
.g-cab p { margin: 0; color: var(--muted); max-width: 70ch; line-height: 1.5; }
.g-cab code, .g code { font: 12px/1.4 "Cascadia Mono", Consolas, monospace; color: var(--text); }
.g-sec {
  background: var(--panel);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--border);
  border-radius: var(--r-caja);
  box-shadow: var(--glass-edge);
  padding: 20px 22px 22px;
  display: grid;
  gap: 16px;
}
.g-sec > header { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 6px 12px; }
.g-num { font-size: 22px; font-weight: 700; color: var(--accent); min-width: 1.4em; }
.g-sec h2 { margin: 0; font-size: 17px; font-weight: 650; }
.g-sec header p { margin: 0; grid-column: 1 / -1; color: var(--muted); line-height: 1.5; max-width: 76ch; }
.g-fila { display: flex; flex-wrap: wrap; gap: 14px; align-items: stretch; }
.g-muestra {
  flex: 1 1 210px;
  min-width: 0;
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 14px;
  border-radius: var(--r-btn);
  background: color-mix(in srgb, var(--panel-solid) 55%, transparent);
  border: 1px solid var(--border);
}
.g-et { font-size: 12.5px; color: var(--muted); line-height: 1.45; }
.g-et b { color: var(--text); font-weight: 600; }
.g-valor { font: 11.5px/1 "Cascadia Mono", Consolas, monospace; color: var(--muted); }
.g-escena { min-height: 92px; display: grid; place-items: center; position: relative; }

/* 1 · esquinas */
.g-caja { width: 120px; height: 64px; background: var(--row); border: 1px solid var(--border-strong); }

/* 2 · sombras: un panel de mentira debajo para que se vea lo que flota */
.g-suelo { position: relative; width: 100%; height: 110px; border-radius: var(--r-btn); background: var(--pane-bg); border: 1px solid var(--border); display: grid; place-items: center; overflow: hidden; }
.g-suelo::before { content: "ls -la   pnpm dev   git status"; position: absolute; left: 10px; top: 8px; font: 11px/1.6 "Cascadia Mono", Consolas, monospace; color: var(--muted); white-space: pre; opacity: 0.6; }
.g-flota { position: relative; padding: 10px 14px; border-radius: var(--r-btn); background: var(--panel-solid); border: 1px solid var(--border-strong); font-size: 12.5px; }

/* 3 · colores */
.g-colores { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.g-color { display: grid; grid-template-columns: 34px 1fr; gap: 4px 10px; align-items: center; padding: 10px 12px; border-radius: var(--r-btn); background: color-mix(in srgb, var(--panel-solid) 55%, transparent); border: 1px solid var(--border); }
.g-color i { grid-row: span 2; width: 34px; height: 34px; border-radius: var(--r-btn); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); }
.g-color b { font: 600 12px/1.2 "Cascadia Mono", Consolas, monospace; }
.g-color span { font-size: 12px; color: var(--muted); line-height: 1.35; }
.g-uso { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; font-size: 13px; }
.g-punto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }

/* 4 · velocidades */
.g-mandos { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.g-lento { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; }
.g-vel.lento { --t-rapida: 0.48s; --t-media: 0.72s; --t-lenta: 1.4s; }
.g-hover { display: grid; gap: 2px; width: 190px; padding: 4px; border-radius: var(--r-btn); background: var(--panel-solid); border: 1px solid var(--border-strong); }
.g-hover .menu-item.g-auto { background: var(--panel-head); }
.g-menu-escena { height: 120px; width: 100%; display: grid; justify-items: center; align-content: start; gap: 6px; }
.g-menu {
  width: 180px; padding: 4px; display: grid; gap: 2px;
  background: var(--panel-solid); border: 1px solid var(--border-strong); border-radius: var(--r-btn);
  box-shadow: var(--glass-edge), var(--sombra-3);
  opacity: 0; transform: translateY(-6px) scale(0.98); transform-origin: top center;
  transition: opacity var(--t-media) ease, transform var(--t-media) cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}
.g-menu.abierto { opacity: 1; transform: none; pointer-events: auto; }
.g-inter { width: 38px; height: 22px; border-radius: var(--r-pastilla); background: var(--row); border: 1px solid var(--border-strong); position: relative; transition: background var(--t-media) ease; }
.g-inter::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--text); transition: transform var(--t-media) cubic-bezier(0.2, 0.8, 0.2, 1); }
.g-inter.on { background: var(--accent); }
.g-inter.on::after { transform: translateX(16px); background: var(--on-accent); }
.g-pantalla { position: relative; width: 100%; height: 120px; overflow: hidden; border-radius: var(--r-btn); background: var(--pane-bg); border: 1px solid var(--border); }
.g-pantalla::before { content: "una terminal"; position: absolute; left: 10px; top: 8px; font: 11px/1.6 "Cascadia Mono", Consolas, monospace; color: var(--muted); }
.g-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 46%;
  background: var(--panel-solid); border-left: 1px solid var(--border-strong);
  box-shadow: var(--glass-edge), var(--sombra-2);
  padding: 10px 12px; font-size: 12px; color: var(--muted);
  transform: translateX(102%);
  transition: transform var(--t-lenta) cubic-bezier(0.2, 0.8, 0.2, 1);
}
.g-panel.dentro { transform: none; }

/* 5 · mientras algo tarda */
.g-lista { width: 100%; min-height: 96px; display: grid; gap: 2px; align-content: start; padding: 6px; border-radius: var(--r-btn); background: var(--pane-bg); border: 1px solid var(--border); }
.g-lista .menu-item { cursor: default; }
.g-lista .espera { margin: 8px 6px; font-size: 13px; color: var(--muted); }
.g-reloj { font: 11.5px/1 "Cascadia Mono", Consolas, monospace; color: var(--muted); min-height: 1em; }

/* 6 · sin cárceles */
.g-carcel { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: var(--r-pastilla); border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: 11px; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; }
.g-carcel-ico { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: var(--r-btn); border: 1px solid var(--border-strong); background: var(--row); color: var(--text); }
.g-tachado { position: relative; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.g-mal { color: var(--mal); font-size: 12px; font-weight: 600; }
.g-bien { color: var(--ok); font-size: 12px; font-weight: 600; }
.g-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.g-pie { color: var(--muted); font-size: 12.5px; line-height: 1.55; max-width: 80ch; }
@media (max-width: 560px) { .g { padding-top: 20px; } .g-sec { padding: 16px; } }
</style>
</head>
<body>
<main class="g">
  <header class="g-cab">
    <h1>La guía de estilo de Adeorq</h1>
    <p>Cada esquina, sombra, color y velocidad de esta página sale de la hoja de verdad de la app
    (<code>src/App.css</code> con sus ${tramos} tramos, pegada dentro tal cual), en el tema Azul de fábrica, o en Claro si tu
    Windows va en claro. Los números van numerados para que me digas «la 4, más lenta». Montada el <span id="g-fecha"></span>.</p>
  </header>

  <section class="g-sec">
    <header><span class="g-num">1</span><h2>Esquinas: cuatro tamaños y nada más</h2>
      <p>Antes había 48 esquinas distintas para lo mismo. Ahora cada cosa pide la suya por lo que es, no por cómo se ve la de al lado.</p></header>
    <div class="g-fila">
      <div class="g-muestra"><div class="g-escena"><div class="g-caja" style="border-radius:var(--r-chico)"></div></div>
        <div class="g-et"><b>Chica</b> · una fila, un botón de solo icono, una casilla</div><div class="g-valor" data-token="--r-chico"></div></div>
      <div class="g-muestra"><div class="g-escena"><button class="mini">${I.mas} Nueva terminal</button></div>
        <div class="g-et"><b>De botón</b> · un botón con texto, un campo, un menú</div><div class="g-valor" data-token="--r-btn"></div></div>
      <div class="g-muestra"><div class="g-escena"><div class="g-caja" style="border-radius:var(--r-caja);width:150px;height:76px"></div></div>
        <div class="g-et"><b>De caja</b> · una tarjeta, un panel, un diálogo</div><div class="g-valor" data-token="--r-caja"></div></div>
      <div class="g-muestra"><div class="g-escena"><div class="g-inter on"></div></div>
        <div class="g-et"><b>Pastilla</b> · solo lo que es redondo a propósito, como un interruptor</div><div class="g-valor" data-token="--r-pastilla"></div></div>
    </div>
  </section>

  <section class="g-sec">
    <header><span class="g-num">2</span><h2>Sombras: lo apoyado no lleva, lo que flota sí</h2>
      <p>Dos sombras y el brillo de cristal de siempre (la línea clara del borde de arriba). Había 119 sombras distintas; las cortas de antes se quitaron.</p></header>
    <div class="g-fila">
      <div class="g-muestra"><div class="g-suelo"><div class="g-flota" style="box-shadow:var(--glass-edge)">Apoyado: sin sombra</div></div>
        <div class="g-et"><b>Apoyado</b> · una fila, una tarjeta en su sitio</div><div class="g-valor">solo --glass-edge</div></div>
      <div class="g-muestra"><div class="g-suelo"><div class="g-flota" style="box-shadow:var(--glass-edge),var(--sombra-2)">Flota cerca: un menú</div></div>
        <div class="g-et"><b>Flota cerca</b> · menús, tarjetas que se levantan</div><div class="g-valor">--sombra-2</div></div>
      <div class="g-muestra"><div class="g-suelo"><div class="modal" style="position:static;width:auto;max-width:90%;padding:12px 16px;box-shadow:var(--glass-edge),var(--sombra-3)"><div class="modal-title" style="font-size:13px">¿Cerrar la terminal?</div><div class="modal-text" style="font-size:12px;margin:4px 0 0">El agente sigue trabajando.</div></div></div>
        <div class="g-et"><b>Flota encima de todo</b> · un diálogo (este es el <code>.modal</code> de verdad)</div><div class="g-valor">--sombra-3</div></div>
    </div>
  </section>

  <section class="g-sec">
    <header><span class="g-num">3</span><h2>Colores: uno por cosa que se dice</h2>
      <p>Había 151 colores escritos a mano: cinco verdes para «bien» y nueve rojos para «mal». Ahora un color con matiz sale siempre de una variable, y la variable dice qué significa. El acento cambia con tu tema; los demás no.</p></header>
    <div class="g-colores">
${COLORES.map(([v, que]) => `      <div class="g-color"><i style="background:var(${v})"></i><b>${v}</b><span>${que}<br><em class="g-valor" data-token="${v}" data-solo></em></span></div>`).join("\n")}
    </div>
    <div class="g-uso">
      <span><i class="g-punto" style="background:var(--ok)"></i>Sesión viva</span>
      <span style="color:var(--ask)"><i class="g-punto" style="background:var(--ask)"></i>Claude te pregunta</span>
      <span style="color:var(--wait)"><i class="g-punto" style="background:var(--wait)"></i>Te espera</span>
      <span style="color:var(--done)"><i class="g-punto" style="background:var(--done)"></i>Terminó</span>
      <span style="color:var(--mal)">No se pudo guardar</span>
      <span style="color:var(--ok)">+12</span><span style="color:var(--mal)">−3</span>
    </div>
  </section>

  <section class="g-sec g-vel" id="g-vel">
    <header><span class="g-num">4</span><h2>Velocidades: tres, según cuánto recorre</h2>
      <p>Había 209 transiciones con catorce duraciones distintas. Ahora son tres. Lo que dura un segundo o más, o se repite sin fin (el latido de «te espera», la rueda), es un ritmo y va con su número.</p></header>
    <div class="g-mandos">
      <button class="mini" id="g-todas">${I.repetir} Las tres a la vez</button>
      <label class="g-lento"><input type="checkbox" id="g-lento"> A cámara lenta (cuatro veces)</label>
    </div>
    <div class="g-fila">
      <div class="g-muestra">
        <div class="g-escena"><div class="g-hover" id="g-hover">
          <button class="menu-item">${I.terminal} Abrir terminal</button>
          <button class="menu-item">${I.carpeta} Abrir carpeta</button>
          <button class="menu-item">${I.copiar} Copiar ruta</button></div></div>
        <div class="g-et"><b>Rápida</b> · lo que responde a tu mano: pasar el ratón, pulsar. Pasa el ratón por las filas.</div>
        <div class="g-mandos"><button class="mini" data-repite="rapida">${I.repetir} Repetir</button><span class="g-valor" data-token="--t-rapida"></span></div>
      </div>
      <div class="g-muestra">
        <div class="g-escena"><div class="g-menu-escena">
          <div class="g-inter" id="g-inter"></div>
          <div class="g-menu" id="g-menu">
            <button class="menu-item">${I.terminal} Claude Code</button>
            <button class="menu-item">${I.terminal} Codex</button>
            <button class="menu-item">${I.terminal} Gemini</button></div></div></div>
        <div class="g-et"><b>Media</b> · lo que se mueve: abrir un menú, mover un interruptor, entrar un aviso</div>
        <div class="g-mandos"><button class="mini" data-repite="media">${I.repetir} Repetir</button><span class="g-valor" data-token="--t-media"></span></div>
      </div>
      <div class="g-muestra">
        <div class="g-escena"><div class="g-pantalla"><div class="g-panel" id="g-panel">Archivos<br>src/App.tsx<br>src/main.tsx</div></div></div>
        <div class="g-et"><b>Lenta</b> · lo que recorre la pantalla: un panel que entra, un cambio de disposición</div>
        <div class="g-mandos"><button class="mini" data-repite="lenta">${I.repetir} Repetir</button><span class="g-valor" data-token="--t-lenta"></span></div>
      </div>
    </div>
  </section>

  <section class="g-sec">
    <header><span class="g-num">5</span><h2>Mientras algo tarda: nada, apagado o la rueda</h2>
      <p>Antes unas pantallas escribían «Leyendo…» por algo que tardaba 80 ms (un parpadeo) y otras no decían nada en tres segundos. La regla: menos de 100 ms, nada; hasta un segundo, lo que había se apaga; a partir del segundo, la rueda con su texto. Pulsa los tres y mira la lista.</p></header>
    <div class="g-fila">
${[["60", "60 ms: no ves nada"], ["450", "450 ms: se apaga y vuelve"], ["2400", "2,4 s: sale la rueda"]].map(([ms, que]) => `      <div class="g-muestra">
        <div class="g-lista" data-lista="${ms}">
          <button class="menu-item">${I.terminal} Adeorq · arreglar el scroll</button>
          <button class="menu-item">${I.terminal} winshotx · fotos con WGC</button>
          <button class="menu-item">${I.terminal} munito.dev · la portada</button></div>
        <div class="g-et"><b>${que}</b></div>
        <div class="g-mandos"><button class="mini" data-tarda="${ms}">${I.repetir} Releer tus sesiones</button><span class="g-reloj" data-reloj="${ms}"></span></div>
      </div>`).join("\n")}
    </div>
  </section>

  <section class="g-sec">
    <header><span class="g-num">6</span><h2>Sin cárceles: el icono y el texto, sueltos</h2>
      <p>Una cárcel es un borde o un fondo tintado alrededor de un icono o de un texto corto: la píldora, el chip, el icono en su cuadradito. En su lugar, sueltos en reposo y de cristal al pasar el ratón; y lo elegido, con color y una raya de acento, nunca con fondo.</p></header>
    <div class="g-fila">
      <div class="g-muestra">
        <div class="g-tachado"><span class="g-mal">Antes</span><span class="g-carcel">Trabajando</span><span class="g-carcel-ico">${I.ajustes}</span><span class="g-carcel-ico">${I.copiar}</span></div>
        <div class="g-tachado"><span class="g-bien">Ahora</span><span style="color:var(--accent);font-size:12.5px;font-weight:600">Trabajando</span><button class="mini icono" title="Ajustes">${I.ajustes}</button><button class="mini icono" title="Copiar">${I.copiar}</button></div>
        <div class="g-et">Los dos botones de «ahora» son <code>.mini icono</code> de verdad: pasa el ratón y sale el cristal de antes.</div>
      </div>
      <div class="g-muestra">
        <nav class="tabs g-tabs" style="position:static">
          <button class="tab" data-active="true"><span class="tab-icon">${I.terminal}</span>Cabina</button>
          <button class="tab"><span class="tab-icon">${I.carpeta}</span>Lienzo</button>
          <button class="tab"><span class="tab-icon">${I.ajustes}</span>Ajustes</button>
        </nav>
        <div class="g-et">Las pestañas de arriba (<code>.tab</code> de verdad): la elegida lleva el texto pleno y una raya corta de acento debajo. Pulsa otra.</div>
      </div>
    </div>
  </section>

  <p class="g-pie">Lo que la guía todavía no cubre: los colores escritos dentro del código (la mascota, los esquemas de la terminal, las marcas de cada CLI y el lienzo, que son datos y no la cara de la app), la página del móvil, que es otra casa, y la web, que se regenera desde la hoja al publicar. El vigilante es <code>pnpm estilo</code>: falla con una esquina de más de 4 px, una sombra, un color con matiz o una velocidad de menos de un segundo escritos a mano.</p>
</main>
<script>
(function () {
  var raiz = getComputedStyle(document.documentElement);
  function pintarValores() {
    raiz = getComputedStyle(document.documentElement);
    document.querySelectorAll("[data-token]").forEach(function (el) {
      var v = el.getAttribute("data-token");
      el.textContent = (el.hasAttribute("data-solo") ? "" : v + ": ") + raiz.getPropertyValue(v).trim();
    });
  }
  pintarValores();
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () { setTimeout(pintarValores, 0); });
  document.getElementById("g-fecha").textContent = ${JSON.stringify(new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" }))};

  var vel = document.getElementById("g-vel");
  document.getElementById("g-lento").addEventListener("change", function (e) { vel.classList.toggle("lento", e.target.checked); });
  var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var factor = function () { return vel.classList.contains("lento") ? 4 : 1; };

  async function rapida() {
    var filas = document.querySelectorAll("#g-hover .menu-item");
    for (var i = 0; i < filas.length; i++) { filas[i].classList.add("g-auto"); await espera(380 * factor()); filas[i].classList.remove("g-auto"); }
  }
  async function media() {
    var m = document.getElementById("g-menu"), s = document.getElementById("g-inter");
    m.classList.remove("abierto"); s.classList.remove("on"); await espera(500 * factor());
    s.classList.add("on"); m.classList.add("abierto"); await espera(1600 * factor());
    m.classList.remove("abierto"); s.classList.remove("on");
  }
  async function lenta() {
    var p = document.getElementById("g-panel");
    p.classList.remove("dentro"); await espera(500 * factor());
    p.classList.add("dentro"); await espera(1800 * factor());
    p.classList.remove("dentro");
  }
  var demos = { rapida: rapida, media: media, lenta: lenta };
  document.querySelectorAll("[data-repite]").forEach(function (b) { b.addEventListener("click", function () { demos[b.getAttribute("data-repite")](); }); });
  document.getElementById("g-todas").addEventListener("click", function () { rapida(); media(); lenta(); });

  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { document.querySelectorAll(".tab").forEach(function (o) { o.removeAttribute("data-active"); }); t.setAttribute("data-active", "true"); });
  });

  // La regla de lib/espera.ts: SUSPIRO_MS = 100, RUEDA_MS = 1000.
  var SUSPIRO = 100, RUEDA = 1000;
  document.querySelectorAll("[data-tarda]").forEach(function (b) {
    b.addEventListener("click", function () {
      var ms = +b.getAttribute("data-tarda");
      var lista = document.querySelector('[data-lista="' + ms + '"]');
      var reloj = document.querySelector('[data-reloj="' + ms + '"]');
      var filas = Array.prototype.slice.call(lista.querySelectorAll(".menu-item"));
      var t0 = performance.now(), rueda = null;
      b.disabled = true;
      var apagar = setTimeout(function () { lista.setAttribute("data-espera", "atenuado"); }, SUSPIRO);
      var girar = setTimeout(function () {
        lista.removeAttribute("data-espera");
        filas.forEach(function (f) { f.style.display = "none"; });
        rueda = document.createElement("p"); rueda.className = "espera"; rueda.setAttribute("role", "status");
        rueda.innerHTML = '<span class="espera-rueda" aria-hidden="true"></span>Leyendo tus sesiones…';
        lista.appendChild(rueda);
      }, RUEDA);
      var tic = setInterval(function () { reloj.textContent = Math.round(performance.now() - t0) + " ms"; }, 30);
      setTimeout(function () {
        clearTimeout(apagar); clearTimeout(girar); clearInterval(tic);
        lista.removeAttribute("data-espera");
        if (rueda) rueda.remove();
        filas.forEach(function (f) { f.style.display = ""; });
        reloj.textContent = "listo en " + ms + " ms";
        b.disabled = false;
      }, ms);
    });
  });
})();
</script>
</body>
</html>
`;

const SALIDA = process.argv[2] ?? join(tmpdir(), "adeorq-guia-de-estilo.html");
writeFileSync(SALIDA, pagina);
console.log(SALIDA, Math.round(pagina.length / 1024), "KB,", tramos, "tramos");
