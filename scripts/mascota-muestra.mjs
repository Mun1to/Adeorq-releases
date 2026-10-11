// Adeo entera en una página: todos sus estados, gestos y reacciones, moviéndose.
//
//     node scripts/mascota-muestra.mjs <ruta.html>
//
// En la app cada estado sale cuando le toca (una terminal que pregunta, música
// que suena) y cada gesto, al azar, cada varios segundos: para juzgar una
// animación habría que quedarse mirando la barra un cuarto de hora. Esto
// escribe un HTML suelto con el MISMO motor que la app (sale de
// `src/lib/mascota.ts`, pasado a JavaScript igual que para la página del
// móvil), una tarjeta por estado y un botón por gesto.
//
// Lo que sí vive aquí y hay que tener al día a mano: cómo se llama cada cosa y
// cuándo pasa (`ESTADOS`, `REACCIONES`). Si en el `.ts` hay un estado o un
// gesto que aquí no tiene nombre, sale igual, como «Gesto 4», y el script lo
// dice al terminar: así no se queda nada escondido.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generar } from "./mascota-movil-check.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** En el orden en que mandan: el de arriba tapa a los de abajo. `nuevo` es de la última tanda. */
export const ESTADOS = [
  { id: "espera", nombre: "Te esperan", cuando: "Una terminal te pregunta algo o te pide permiso.", donde: "barra y chat",
    gestos: ["Salta con los dos brazos", { n: "Golpecitos con el pie, en jarra", nuevo: true }] },
  { id: "duda", nombre: "Con la duda", cuando: "Hay una decisión esperándote en la pestaña Decisiones.", donde: "barra", nuevo: true,
    gestos: ["Se encoge de hombros", "Te señala la pregunta", "Se rasca la cabeza"] },
  { id: "lista", nombre: "Lo celebra", cuando: "Un agente ha terminado y todavía no lo has visto.", donde: "barra",
    gestos: ["Saltito con chispas", "Te saluda contenta", { n: "El baile de la victoria", nuevo: true }] },
  { id: "apurada", nombre: "Apurada", cuando: "Algo ha fallado: el conserje no pudo contestar, o un encargo programado se ha parado.", donde: "barra y chat", nuevo: true,
    gestos: ["Mira a los lados", "Se seca el sudor", "Dos pisotones"] },
  { id: "piensa", nombre: "Piensa", cuando: "El conserje está contestando.", donde: "chat",
    gestos: ["Busca la idea a los lados", "Se rasca la cabeza", "Se le ocurre algo", "Cambia el peso de pie"] },
  { id: "escucha", nombre: "Te escucha", cuando: "Estás escribiéndole al conserje.", donde: "chat", nuevo: true,
    gestos: ["Asiente", "Mira lo que escribes"] },
  { id: "trabaja", nombre: "Trabaja", cuando: "Tus agentes están trabajando.", donde: "barra y chat", nuevo: true,
    gestos: ["Se para a pensar la frase", "Una ráfaga a toda prisa", "Le da al intro con ganas", "Se cruje los dedos", "Se seca el sudor"] },
  { id: "baila", nombre: "Baila", cuando: "Suena música en el PC y nadie te reclama.", donde: "barra", nuevo: true,
    gestos: ["Brazos arriba y salto", "Pasito a los lados", "Guitarra de aire"] },
  { id: "quieta", nombre: "A lo suyo", cuando: "Hay terminales abiertas y nada te reclama.", donde: "barra y chat",
    gestos: ["Mira a los lados", "Se estira", "Cambia el peso de pie", "Te saluda", { n: "En jarra, balanceándose", nuevo: true }, { n: "Mira arriba", nuevo: true }, { n: "Te guiña el ojo", nuevo: true }] },
  { id: "dormida", nombre: "Duerme", cuando: "No hay ninguna terminal abierta.", donde: "barra", gestos: [] },
];

/** Formas de un mismo estado entre las que hay que elegir (`CANDIDATAS`, en `mascota.ts`).
    Van numeradas arriba de la página. Sin candidatas, esa parte no sale. */
export const CANDIDATAS = {
  // Hoy no hay ninguna. La última vez fueron tres formas de «trabaja» (renglones
  // de código, una estrella girando y una barra llenándose): Munir no quiso
  // ninguna y pidió un teclado, que es lo que lleva.
  de: "",
  titulo: "",
  nota: "",
  formas: [],
};

export const REACCIONES = [
  { id: "hola", nombre: "Te saluda", cuando: "Pasas el ratón por encima." },
  { id: "toque", nombre: "Brinco", cuando: "La pulsas." },
  { id: "mimo", nombre: "Mimo", cuando: "La pulsas tres veces seguidas.", nuevo: true },
  { id: "enviado", nombre: "Lo mira salir", cuando: "Le mandas un mensaje al conserje.", nuevoAqui: "antes solo en el móvil" },
];

const ESTILO = `
  :root { color-scheme: light dark; --fondo: #f6f4ef; --tinta: #1d1b17; --suave: #6a645a; --caja: #ffffff; --borde: #e2ddd3; --acento: #b8542b; --acento-suave: #fbe9df; --escena: #0f1626; }
  @media (prefers-color-scheme: dark) { :root { --fondo: #15171c; --tinta: #ebe7df; --suave: #9a958b; --caja: #1d2027; --borde: #2d313a; --acento: #e8875a; --acento-suave: #3a271d; --escena: #0b1020; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fondo); color: var(--tinta); font: 17px/1.5 Georgia, "Times New Roman", serif; }
  main { max-width: 1180px; margin: 0 auto; padding: 32px 16px 80px; }
  h1 { font-size: 32px; line-height: 1.15; margin: 0 0 8px; text-wrap: balance; }
  .sub { color: var(--suave); margin: 0 0 8px; max-width: 70ch; }
  .sub b { color: var(--tinta); }
  .grupo { font: 700 13px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--suave); margin: 34px 0 12px; }
  .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
  .tarjeta { background: var(--caja); border: 1px solid var(--borde); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
  .escena { background: radial-gradient(70% 90% at 20% 10%, #24437e 0%, transparent 65%), radial-gradient(60% 80% at 90% 100%, #4a2a78 0%, transparent 65%), var(--escena); height: 170px; display: grid; place-items: center; cursor: pointer; }
  .escena svg { display: block; shape-rendering: crispEdges; overflow: visible; }
  .elegir .escena { position: relative; grid-template-columns: 1fr; }
  .elegir .num { position: absolute; left: 12px; top: 12px; width: 34px; height: 34px; border-radius: 50%; background: var(--acento); color: #fff; font: 700 18px/34px ui-sans-serif, system-ui, sans-serif; text-align: center; }
  .elegir .chica { position: absolute; right: 14px; bottom: 12px; display: grid; justify-items: center; gap: 5px; }
  .elegir .chica em { font: 11px/1 ui-sans-serif, system-ui, sans-serif; font-style: normal; color: #9fb0cc; }
  .cuerpo { padding: 14px 16px 16px; display: grid; gap: 8px; }
  .cuerpo h2 { font-size: 20px; margin: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cuerpo p { margin: 0; color: var(--suave); font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; }
  .cuerpo p b { color: var(--tinta); font-weight: 600; }
  .chip { font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .05em; text-transform: uppercase; padding: 4px 7px; border-radius: 999px; background: var(--acento); color: #fff; }
  .gestos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .gestos button { font: 600 13px ui-sans-serif, system-ui, sans-serif; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--borde); background: transparent; color: var(--tinta); cursor: pointer; }
  .gestos button:hover { border-color: var(--acento); color: var(--acento); }
  .gestos button[data-nuevo] { border-color: var(--acento); background: var(--acento-suave); }
  .tamanos { display: flex; align-items: end; gap: 26px; flex-wrap: wrap; background: var(--escena); border-radius: 14px; padding: 22px 26px; }
  .tamanos figure { margin: 0; display: grid; justify-items: center; gap: 8px; }
  .tamanos figcaption { font: 12px/1 ui-sans-serif, system-ui, sans-serif; color: #9fb0cc; }
  .tamanos svg { display: block; shape-rendering: crispEdges; overflow: visible; }
`;

/** Lo que mueve la página. Va tal cual dentro de un <script>, detrás del motor. */
const MOTOR = `
(function () {
  var M = MASCOTA;
  function pinta(v) {
    var q = M.cuadrosDe(v.pose, "");
    var s = "";
    for (var i = 0; i < q.length; i++) s += '<rect x="' + q[i].x + '" y="' + q[i].y + '" width="1.02" height="1.02" fill="' + q[i].c + '"/>';
    v.svg.innerHTML = s;
  }
  /** El siguiente fotograma y cuánto dura. Un estado de la app lo decide el motor
      de verdad; una forma candidata, que no está en el motor, este remedo: su
      bucle, y de vez en cuando uno de sus gestos. */
  function siguiente(v) {
    if (!v.guion) {
      var r = M.avanzar(v.marcha, Date.now(), Math.random);
      v.marcha = r.marcha;
      v.pose = r.marcha.pose;
      return r.espera;
    }
    if (!v.cola.length) {
      var g = v.guion.gestos || [];
      if (g.length && Date.now() >= v.proximo) {
        v.cola = g[Math.floor(Math.random() * g.length)].slice();
        v.proximo = Date.now() + v.guion.cada[0] + Math.random() * (v.guion.cada[1] - v.guion.cada[0]);
      } else v.cola = v.guion.bucle.slice();
    }
    var p = v.cola.shift();
    v.pose = p[0];
    return p[1];
  }
  function paso(v) {
    clearTimeout(v.reloj);
    var espera = siguiente(v);
    pinta(v);
    v.reloj = setTimeout(function () { paso(v); }, espera);
  }
  function monta(svg) {
    var forma = svg.dataset.forma;
    var v = { svg: svg, animo: svg.dataset.animo, reloj: 0, toques: [], pose: null };
    if (forma) {
      v.guion = M.CANDIDATAS[forma];
      v.cola = [];
      v.proximo = Date.now() + 2500;
    } else v.marcha = M.arrancar(v.animo, Date.now(), Math.random);
    paso(v);
    return v;
  }
  /** Mete unos pasos delante de todo: es lo siguiente que se ve. */
  function delante(v, pasos) {
    if (v.guion) v.cola = pasos.concat(v.cola);
    else v.marcha = { animo: v.marcha.animo, cola: pasos.concat(v.marcha.cola), pose: v.marcha.pose, proximoGesto: v.marcha.proximoGesto };
    paso(v);
  }
  document.querySelectorAll("svg[data-animo]").forEach(function (svg) {
    var v = monta(svg);
    var tarjeta = svg.closest(".tarjeta");
    if (!tarjeta) return;
    // Como en la app: un toque es un brinco, y tres seguidos, un mimo.
    tarjeta.querySelector(".escena").addEventListener("click", function () {
      var ahora = Date.now();
      v.toques = v.toques.filter(function (t) { return ahora - t < 1500; }).concat(ahora);
      if (v.toques.length >= 3) { v.toques = []; delante(v, M.REACCIONES.mimo.slice()); }
      else delante(v, M.REACCIONES.toque.slice());
    });
    tarjeta.querySelectorAll("button[data-gesto]").forEach(function (b) {
      b.addEventListener("click", function () { delante(v, (v.guion || M.GUIONES[v.animo]).gestos[+b.dataset.gesto].slice()); });
    });
    tarjeta.querySelectorAll("button[data-entrada]").forEach(function (b) {
      b.addEventListener("click", function () { delante(v, M.GUIONES[v.animo].entrada.slice()); });
    });
    tarjeta.querySelectorAll("button[data-reaccion]").forEach(function (b) {
      b.addEventListener("click", function () { delante(v, M.REACCIONES[b.dataset.reaccion].slice()); });
    });
  });
})();
`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const svg = (animo, alto, ancho = 20, altoRejilla = 14, forma = "") =>
  `<svg data-animo="${animo}"${forma ? ` data-forma="${forma}"` : ""} viewBox="0 0 ${ancho} ${altoRejilla}" width="${Math.round((alto * ancho) / altoRejilla)}" height="${alto}" aria-hidden="true"></svg>`;

/** La página entera, a partir del texto de `mascota.ts`, y lo que le falta por nombrar. */
export function pagina(fuente) {
  // El motor, igual que para el móvil, y además las formas candidatas si las hay:
  // el bloque generado solo devuelve lo que usa el móvil.
  const bloque = generar(fuente).replace(/return \{ ([^}]*) \};\n\}\)\(\);/, (_, lista) => `return { ${lista}, CANDIDATAS: typeof CANDIDATAS === "undefined" ? {} : CANDIDATAS };\n})();`);
  // Qué estados y cuántos gestos hay DE VERDAD, leídos del motor ya generado.
  const M = new Function(`${bloque}\nreturn MASCOTA;`)();
  const sinNombre = [];
  const formas = CANDIDATAS.formas.filter((f) => f.id in M.CANDIDATAS);
  for (const id of Object.keys(M.CANDIDATAS)) if (!CANDIDATAS.formas.some((f) => f.id === id)) sinNombre.push(`la forma candidata «${id}»`);
  const elegir = formas.length
    ? `<p class="grupo">${esc(CANDIDATAS.titulo)}</p>
  <p class="sub">${esc(CANDIDATAS.nota)}</p>
  <div class="rejilla">${formas
    .map((f, i) => {
      const g = M.CANDIDATAS[f.id];
      const botones = (g.gestos ?? []).map((_, j) => `<button data-gesto="${j}">${esc(f.gestos[j] ?? `Gesto ${j + 1}`)}</button>`);
      return `<article class="tarjeta elegir">
      <div class="escena"><span class="num">${i + 1}</span>${svg(CANDIDATAS.de, 120, M.ANCHO, M.ALTO, f.id)}<span class="chica">${svg(CANDIDATAS.de, 28, M.ANCHO, M.ALTO, f.id)}<em>en la barra</em></span></div>
      <div class="cuerpo">
        <h2>${i + 1} · ${esc(f.nombre)}${i === 0 ? ' <span class="chip">puesta</span>' : ""}</h2>
        <p>${esc(f.que)}</p>
        <div class="gestos">${botones.join("")}</div>
      </div>
    </article>`;
    })
    .join("\n")}</div>`
    : "";
  const deVerdad = Object.keys(M.GUIONES);
  const estados = [...ESTADOS.filter((e) => deVerdad.includes(e.id)), ...deVerdad.filter((id) => !ESTADOS.some((e) => e.id === id)).map((id) => (sinNombre.push(`el estado «${id}»`), { id, nombre: id, cuando: "", donde: "", gestos: [] }))];
  const tarjetas = estados.map((e) => {
    const g = M.GUIONES[e.id];
    const gestos = (g.gestos ?? []).map((_, i) => {
      const dicho = e.gestos[i];
      if (dicho === undefined) sinNombre.push(`el gesto ${i + 1} de «${e.id}»`);
      const nombre = typeof dicho === "string" ? dicho : (dicho?.n ?? `Gesto ${i + 1}`);
      const nuevo = e.nuevo || (typeof dicho === "object" && dicho?.nuevo);
      return `<button data-gesto="${i}"${nuevo ? " data-nuevo" : ""}>${esc(nombre)}</button>`;
    });
    if (g.entrada) gestos.unshift(`<button data-entrada${e.nuevo ? " data-nuevo" : ""}>Al llegar</button>`);
    return `<article class="tarjeta">
      <div class="escena" title="Púlsala: un brinco. Tres veces seguidas: un mimo.">${svg(e.id, 120, M.ANCHO, M.ALTO)}</div>
      <div class="cuerpo">
        <h2>${esc(e.nombre)}${e.nuevo ? ' <span class="chip">nuevo</span>' : ""}</h2>
        <p><b>Cuándo:</b> ${esc(e.cuando)}</p>
        <p><b>Dónde:</b> ${esc(e.donde)}</p>
        ${gestos.length ? `<div class="gestos">${gestos.join("")}</div>` : "<p>No tiene gestos: solo respira y ronca.</p>"}
      </div>
    </article>`;
  });
  const reacciones = REACCIONES.filter((r) => r.id in M.REACCIONES).map(
    (r) => `<button data-reaccion="${r.id}"${r.nuevo ? " data-nuevo" : ""}>${esc(r.nombre)}: ${esc(r.cuando.replace(/\.$/, "").toLowerCase())}${r.nuevoAqui ? ` (${esc(r.nuevoAqui)})` : ""}</button>`,
  );
  for (const id of Object.keys(M.REACCIONES)) if (!REACCIONES.some((r) => r.id === id)) sinNombre.push(`la reacción «${id}»`);
  const nGestos = estados.reduce((n, e) => n + (M.GUIONES[e.id].gestos?.length ?? 0), 0);
  const nuevos = {
    estados: estados.filter((e) => e.nuevo).length,
    gestos: estados.reduce((n, e) => n + (e.nuevo ? (M.GUIONES[e.id].gestos?.length ?? 0) : e.gestos.filter((x) => typeof x === "object" && x.nuevo).length), 0),
  };
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adeo: estados y gestos</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
  <h1>Adeo: todos sus estados y gestos</h1>
  <p class="sub">La mascota de Adeorq ya tiene nombre. Aquí está entera, con el mismo motor que lleva la app: <b>${estados.length} estados</b>, <b>${nGestos} gestos</b> y <b>${Object.keys(M.REACCIONES).length} reacciones</b>. Lo marcado como nuevo es de hoy: ${nuevos.estados} estados y ${nuevos.gestos} gestos.</p>
  <p class="sub">En la app cada gesto sale solo, al azar, cada varios segundos. Aquí <b>pulsa su botón y lo ves en el acto</b>. Y pulsa a Adeo: un toque es un brinco, tres seguidos son un mimo.</p>

  ${elegir}

  <p class="grupo">Los estados, de más urgente a menos: el de arriba manda sobre los de abajo</p>
  <div class="rejilla">${tarjetas.join("\n")}</div>

  <p class="grupo">Las reacciones: lo que hace cuando tú haces algo</p>
  <article class="tarjeta" style="max-width: 720px">
    <div class="escena">${svg("quieta", 120, M.ANCHO, M.ALTO)}</div>
    <div class="cuerpo"><div class="gestos">${reacciones.join("")}</div></div>
  </article>

  <p class="grupo">A su tamaño de verdad</p>
  <div class="tamanos">
    <figure>${svg("trabaja", 16, M.ANCHO, M.ALTO)}<figcaption>en una pestaña del chat</figcaption></figure>
    <figure>${svg("espera", 28, M.ANCHO, M.ALTO)}<figcaption>en la barra de arriba</figcaption></figure>
    <figure>${svg("piensa", 30, M.ANCHO, M.ALTO)}<figcaption>junto a «Pensando…»</figcaption></figure>
    <figure>${svg("dormida", 56, M.ANCHO, M.ALTO)}<figcaption>en la lista de avisos vacía</figcaption></figure>
    <figure>${svg("quieta", 64, M.ANCHO, M.ALTO)}<figcaption>en la bienvenida del chat</figcaption></figure>
  </div>
</main>
<script>
${bloque}
${MOTOR}
</script>
</body>
</html>
`;
  return { html, sinNombre, cuenta: { estados: estados.length, gestos: nGestos, reacciones: Object.keys(M.REACCIONES).length, nuevos } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destino = process.argv[2];
  if (!destino) {
    console.error("Dime dónde escribir la página: node scripts/mascota-muestra.mjs <ruta.html>");
    process.exit(1);
  }
  const r = pagina(fs.readFileSync(path.join(RAIZ, "src", "lib", "mascota.ts"), "utf8"));
  fs.writeFileSync(destino, r.html);
  console.log(`Adeo: ${r.cuenta.estados} estados, ${r.cuenta.gestos} gestos y ${r.cuenta.reacciones} reacciones, en ${destino}`);
  if (r.sinNombre.length) console.log(`Sin nombre en la página (salen igual, numerados): ${r.sinNombre.join(", ")}.`);
}
