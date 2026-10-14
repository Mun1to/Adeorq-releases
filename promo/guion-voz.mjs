/**
 * La página para leer el guion en voz alta.
 *
 * Saca de `src/guion.ts` lo que se dice en cada escena y lo pone en una sola
 * página, con letra grande, un bloque por escena, lo que se ve mientras tanto
 * y los segundos de cada uno. No hay un guion escrito aparte: si cambia una
 * frase allí, se vuelve a correr esto y la página dice lo mismo que el vídeo.
 *
 *   node guion-voz.mjs [dónde.html]     (o `pnpm guion`; sin ruta, `out/guion-voz.html`)
 *
 * La página es un solo archivo, sin nada de fuera, y sigue el tema claro u
 * oscuro del sistema. Node lee el `.ts` tal cual (quita los tipos al cargarlo).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const { ESCENAS, IDIOMAS } = await import("./src/guion.ts");
const destino = resolve(process.argv[2] ?? join(aqui, "out", "guion-voz.html"));

/** Palabras por segundo de una lectura tranquila. Es una estimación para que
    Munir sepa por dónde va; cuando grabe, manda su ritmo. */
const RITMO = { es: 2.6, en: 2.9 };
const NOMBRE = { es: "Español", en: "English" };

const limpia = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const palabras = (t) => t.trim().split(/\s+/).length;
const segundos = (e, idioma) => e.voz.reduce((s, f) => s + palabras(f[idioma]), 0) / RITMO[idioma];
const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const coma = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const total = (lista) => lista.reduce((s, e) => s + e.dura, 0);

/** Una frase de las que se leen en pantalla, sin las marcas del guion. */
const sin = (t) => t.replace(/\*/g, "").replace(/\n/g, " ");

/** Qué hay en pantalla mientras se dice cada cosa. */
function seVe(e) {
  if (e.tipo === "pantalla") return `La pantalla «${e.nombre.es}» de la app, llenando el cuadro, con «${sin(e.titulo.es)}» en el centro. Después la cámara entra en: ${e.focos.map((f) => sin(f.dato.es)).join(" · ")}.`;
  if (e.tipo === "texto") return `Solo texto, en el centro, frase a frase: ${e.lineas.map((l) => `«${sin(l.es)}»`).join(" ")}`;
  return {
    nombre: "El logotipo abre el ojo y es Adeo, que saluda. Debajo, «Adeorq».",
    adeo: "Adeo en grande: saluda y pasa por tres de sus estados, uno por frase.",
    cierre: "Adeo celebrando, «Descárgalo gratis» y adeorq.com en grande.",
  }[e.tipo];
}

const titulo = (e) => (e.tipo === "pantalla" ? e.nombre.es : { texto: "El problema y el giro", nombre: "El nombre", adeo: "Adeo", cierre: "El cierre" }[e.tipo]);

/** De qué parte de la pieza es cada tramo, para pintarlo de su color: el
    producto, Adeo, o lo que los rodea. */
const bloques = ESCENAS.map((e, i) => ({ e, n: i + 1, capitulo: e.tipo === "pantalla" ? 1 : e.tipo === "adeo" ? 2 : 0 }));

const barra = bloques
  .map(({ e, n, capitulo: c }) => `<a href="#b${n}" class="c${c}" style="flex:${e.dura}" title="${limpia(titulo(e))}, ${coma(e.dura)} s">${n}</a>`)
  .join("");

const cuerpo = bloques
  .map(({ e, n, capitulo: c }) => {
    const frases = (idioma) => e.voz.map((f) => `<p>${limpia(f[idioma])}</p>`).join("");
    const voz = IDIOMAS.map((idioma) => `<div class="voz ${idioma}" lang="${idioma}">${frases(idioma)}<span class="seg">≈ ${coma(segundos(e, idioma))} s diciéndolo</span></div>`).join("");
    return `<section id="b${n}" class="bloque c${c}">
  <header><span class="num">${n}</span><h3>${limpia(titulo(e))}</h3><span class="dura">${coma(e.dura)} s de escena</span></header>
  <p class="seve"><b>Se ve:</b> ${limpia(seVe(e))}</p>
  ${voz}
</section>`;
  })
  .join("\n");

const entera = total(ESCENAS);
const hoy = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

const html = `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guion de voz de Adeorq, para leer (${hoy})</title>
<style>
  :root { color-scheme: light dark; --fondo:#f6f7f9; --caja:#fff; --tinta:#14171c; --flojo:#5d6673; --raya:#dfe3ea; --marca:#1c66de;
    --c0:#7a8494; --c1:#1c66de; --c2:#0d9a6c; --c3:#b3620a; --c4:#7a8494; }
  @media (prefers-color-scheme: dark) { :root { --fondo:#0d1014; --caja:#161a21; --tinta:#eef1f5; --flojo:#9aa4b2; --raya:#272d38; --marca:#6aa6ff;
    --c0:#8792a3; --c1:#6aa6ff; --c2:#3fcf9c; --c3:#f0a44b; --c4:#8792a3; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--fondo); color:var(--tinta); font:17px/1.5 "Segoe UI", system-ui, sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 34px 26px 120px; }
  h1 { font-size: 34px; line-height:1.15; margin: 0 0 6px; letter-spacing:-0.02em; }
  h2 { font-size: 22px; margin: 40px 0 12px; }
  .sub { color:var(--flojo); margin:0 0 22px; }
  .caja { background:var(--caja); border:1px solid var(--raya); border-radius:14px; padding:18px 22px; }
  .caja ol { margin: 6px 0 0; padding-left: 24px; } .caja li { margin: 7px 0; }
  code { font: 15px Consolas, monospace; background: color-mix(in srgb, var(--marca) 12%, transparent); padding: 2px 6px; border-radius: 6px; }
  .barra { display:flex; gap:3px; margin: 16px 0 6px; }
  .barra a { min-width:0; text-align:center; color:#fff; text-decoration:none; font-weight:700; font-size:13px; padding:9px 0; border-radius:6px; background:var(--c0); }
  .barra .c1 { background:var(--c1); } .barra .c2 { background:var(--c2); } .barra .c3 { background:var(--c3); }
  .barra .opc { opacity:.55; }
  .leyenda { display:flex; flex-wrap:wrap; gap:6px 18px; color:var(--flojo); font-size:14px; }
  .leyenda i { display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:6px; }
  .op { display:flex; gap:16px; align-items:baseline; padding:13px 0; border-top:1px solid var(--raya); }
  .op:first-of-type { border-top:0; }
  .op .n { font-weight:800; font-size:20px; color:var(--marca); min-width:44px; }
  .op small { display:block; color:var(--flojo); font-size:15px; }
  .rec { font-size:12px; font-weight:700; color:#fff; background:var(--marca); border-radius:99px; padding:2px 9px; margin-left:8px; vertical-align:2px; }
  /* Qué idioma se está leyendo: dos botones de radio y nada de JavaScript. */
  .idioma { position: sticky; top: 0; z-index: 2; display:flex; gap:8px; align-items:center; padding:12px 0; background:var(--fondo); border-bottom:1px solid var(--raya); margin-top:34px; }
  input[name=l] { position:absolute; opacity:0; }
  .idioma label { cursor:pointer; padding:8px 20px; border-radius:99px; border:1px solid var(--raya); font-weight:650; }
  #l-es:checked ~ main label[for=l-es], #l-en:checked ~ main label[for=l-en] { background:var(--marca); border-color:var(--marca); color:#fff; }
  #l-es:checked ~ main .voz.en, #l-en:checked ~ main .voz.es { display:none; }
  .idioma span { color:var(--flojo); font-size:14px; margin-left:auto; }
  .bloque { margin-top: 26px; padding: 4px 0 4px 22px; border-left: 5px solid var(--c0); scroll-margin-top: 76px; }
  .bloque.c1 { border-color:var(--c1); } .bloque.c2 { border-color:var(--c2); } .bloque.c3 { border-color:var(--c3); }
  .bloque header { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
  .bloque .num { font-weight:800; font-size:20px; color:var(--flojo); min-width:26px; }
  .bloque h3 { margin:0; font-size:19px; }
  .tag { font-size:13px; color:var(--flojo); border:1px dashed var(--flojo); border-radius:99px; padding:1px 10px; }
  .dura { margin-left:auto; color:var(--flojo); font-size:14px; }
  .seve { margin: 4px 0 10px; color:var(--flojo); font-size:15px; }
  .voz p { margin: 0 0 10px; font-size: 31px; line-height: 1.32; font-weight: 560; letter-spacing:-0.01em; text-wrap: pretty; }
  .voz .seg { color:var(--flojo); font-size:14px; }
  .pie { margin-top:44px; color:var(--flojo); font-size:15px; }
</style>
<input type="radio" name="l" id="l-es" checked><input type="radio" name="l" id="l-en">
<main>
  <h1>Guion de voz de Adeorq</h1>
  <p class="sub">${hoy}. Es la estructura nueva y lo que dices tú en cada escena. Si algo no te suena a ti, cámbialo al leerlo: el vídeo se ajusta a tu voz, no al revés.</p>

  <div class="caja">
    <b>La estructura: el problema, el nombre, cinco funciones, Adeo y el cierre. Una sola pieza, de una tirada.</b>
    <div class="barra">${barra}</div>
    <div class="leyenda">
      <span><i style="background:var(--c0)"></i>El problema, el nombre y el cierre</span>
      <span><i style="background:var(--c1)"></i>El producto</span>
      <span><i style="background:var(--c2)"></i>Adeo</span>
    </div>
    <p style="margin:14px 0 0">Sin voz dura <b>${reloj(entera)}</b>. Con la tuya, cada tramo dura lo que tu frase: si lees con calma,
      la pieza se alarga sola.</p>
  </div>

  <h2>Cómo grabar</h2>
  <div class="caja">
    <ol>
      <li><b>Un archivo por idioma, de un tirón</b>, con lo que quieras: la Grabadora de Windows vale.</li>
      <li><b>Deja un par de segundos de silencio entre bloque y bloque.</b> Dentro de un bloque, léelo seguido.</li>
      <li><b>Si te trabas, repite la frase entera y sigue.</b> Me quedo con la última; no hace falta parar la grabación.</li>
      <li><b>Los segundos son una pista, no un límite.</b> Léelo a tu ritmo.</li>
      <li><b>Déjalo en</b> <code>C:\\proyectos\\Adeorq\\promo\\voz\\</code> con el nombre <code>es</code> y <code>en</code> (el formato da igual), o dime dónde está y lo cojo yo.</li>
    </ol>
  </div>

  <h2>A. ¿Qué grabas?</h2>
  <div class="caja">
    <div class="op"><span class="n">A1</span><div>Los dos idiomas con tu voz. <span class="rec">LA QUE YO HARÍA</span><small>Cada vídeo habla en su idioma. Son unos dos minutos de lectura entre los dos.</small></div></div>
    <div class="op"><span class="n">A2</span><div>Solo español; el vídeo en inglés lleva tu voz en español con subtítulos en inglés.<small>Se oye quién lo ha hecho. Quien no sepa español lo lee.</small></div></div>
    <div class="op"><span class="n">A3</span><div>Solo español; el vídeo en inglés va sin voz, con rótulos y música.<small>Es como el que viste hoy, con la estructura nueva.</small></div></div>
    <div class="op"><span class="n">A4</span><div>Otra cosa: dímela.</div></div>
  </div>

  <div class="idioma">
    <label for="l-es">Español</label><label for="l-en">English</label>
    <span>${bloques.length} bloques · lee solo lo grande</span>
  </div>

${cuerpo}

  <p class="pie">Esta página sale de <code>promo/src/guion.ts</code> con <code>pnpm guion</code>. Los segundos de voz son una cuenta
    (${coma(RITMO.es)} palabras por segundo en español, ${coma(RITMO.en)} en inglés), no una medida.</p>
</main>
</html>
`;

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, html, "utf8");

console.log(`Guion de voz: ${bloques.length} bloques, ${reloj(entera)} sin voz.`);
for (const idioma of IDIOMAS) {
  const voz = ESCENAS.reduce((s, e) => s + segundos(e, idioma), 0);
  const justas = ESCENAS.filter((e) => segundos(e, idioma) > e.dura - 0.8).map((e) => `${e.id} (${coma(segundos(e, idioma))} de ${coma(e.dura)} s)`);
  console.log(`  ${NOMBRE[idioma]}: ${reloj(voz)} de voz.${justas.length ? ` Van justas: ${justas.join(", ")}.` : ""}`);
}
console.log(destino);
