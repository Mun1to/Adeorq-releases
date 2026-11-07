// La ficha de la Microsoft Store, campo a campo y con un botón de copiar en cada uno, para rellenar
// Partner Center sin retocar nada a mano.
//
//   node scripts/tiendas/ficha-para-copiar.mjs [salida.html]
//
// Los textos NO se escriben aquí: salen de `docs/contexto/tiendas/ficha.md` y `notas-del-probador.md`
// (los bloques marcados con `<!-- campo: ... -->` y la tabla del apartado 2.8). Si falta uno, el script se
// niega a escribir la página, para que nunca se pegue un texto viejo. Por defecto escribe `TIENDA.html` en la
// raíz del repo, que no se versiona (`.gitignore`). La página es de un solo archivo, sin nada de internet, y
// sigue el tema claro u oscuro del sistema.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SALIDA = resolve(process.argv[2] ?? join(RAIZ, "TIENDA.html"));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8").replace(/\r\n/g, "\n");
const FICHA = leer("docs/contexto/tiendas/ficha.md");
const NOTAS = leer("docs/contexto/tiendas/notas-del-probador.md");
// La tabla de los valores de la ficha es la del 2.8; el apartado 1 tiene otra con los mismos nombres de fila.
const TABLA = FICHA.slice(FICHA.indexOf("### 2.8"), FICHA.indexOf("## 3."));

const faltan = [];
function bloque(md, campo) {
  const re = new RegExp(`<!-- campo: ${campo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};[^>]*-->\\s*\`\`\`\\n([\\s\\S]*?)\\n\`\`\``);
  const m = re.exec(md);
  if (!m) faltan.push(`el bloque «${campo}»`);
  return m ? m[1] : "";
}
function celda(fila) {
  // La tabla del 2.8: `| Campo | `valor` | nota |`, y el valor es el primer código de la fila.
  const linea = TABLA.split("\n").find((l) => l.startsWith(`| ${fila}`));
  const m = linea && /`([^`]+)`/.exec(linea.slice(fila.length + 2));
  if (!m) faltan.push(`la fila «${fila}» de la tabla 2.8`);
  return m ? m[1] : "";
}
const lineas = (t) => t.split("\n").map((l) => l.trim()).filter(Boolean);

const comun = {
  privacidad: celda("Política de privacidad (URL)"),
  web: celda("Sitio web"),
  ayuda: celda("Contacto de ayuda"),
  copyright: celda("Copyright y marcas (200)"),
  autor: celda("Desarrollado por (255)"),
  licencia: (() => {
    const l = TABLA.split("\n").find((x) => x.startsWith("| Términos de licencia adicionales"));
    const m = l && /una sola dirección: `([^`]+)`/.exec(l);
    if (!m) faltan.push("la dirección de la licencia (tabla 2.8)");
    return m ? m[1] : "";
  })(),
};
const idioma = (sufijo) => ({
  descripcion: bloque(FICHA, `Descripción ${sufijo}`),
  corta: bloque(FICHA, `Descripción corta ${sufijo}`),
  funciones: lineas(bloque(FICHA, `Funciones ${sufijo}`)),
  palabras: lineas(bloque(FICHA, `Palabras ${sufijo}`)),
});
const en = idioma("EN");
const es = idioma("ES");
const notas = bloque(NOTAS, "Notas del probador EN");
const fulltrust = bloque(NOTAS, "Justificación runFullTrust EN");

// Los límites de Partner Center (ficha.md, apartado 1): si un texto se pasa, la página no se escribe.
const largo = (t) => [...t].length;
const pasados = [];
const tope = (que, t, n) => largo(t) > n && pasados.push(`${que}: ${largo(t)} de ${n}`);
for (const [nom, l] of [["inglés", en], ["español", es]]) {
  tope(`descripción en ${nom}`, l.descripcion, 10000);
  tope(`descripción corta en ${nom}`, l.corta, 1000);
  if (l.funciones.length > 20) pasados.push(`funciones en ${nom}: ${l.funciones.length} de 20`);
  l.funciones.forEach((f, i) => tope(`función ${i + 1} en ${nom}`, f, 200));
  if (l.palabras.length > 7) pasados.push(`palabras en ${nom}: ${l.palabras.length} de 7`);
  l.palabras.forEach((p, i) => tope(`palabra ${i + 1} en ${nom}`, p, 40));
}
tope("notas para el revisor", notas, 2000);
tope("justificación de runFullTrust", fulltrust, 2000);
tope("copyright", comun.copyright, 200);

if (faltan.length || pasados.length) {
  for (const f of faltan) console.error(`FALTA ${f}`);
  for (const p of pasados) console.error(`SE PASA ${p}`);
  process.exit(1);
}

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let n = 0;
const campo = (nombre, texto, limite, nota = "") => {
  const id = `c${++n}`;
  return `<div class="campo">
  <div class="cab"><span class="nom">${esc(nombre)}</span><span class="cuenta">${limite ? `${largo(texto)} de ${limite}` : ""}</span><button type="button" data-de="${id}">Copiar</button></div>
  ${nota ? `<p class="nota">${nota}</p>` : ""}<pre id="${id}">${esc(texto)}</pre>
</div>`;
};
const ficha = (titulo, l) => `<section><h2>${titulo}</h2>
${campo("Description", l.descripcion, 10000)}
${campo("Short description", l.corta, 1000)}
<h3>Product features: una por casilla (pulsa «Add more» para la siguiente)</h3>
${l.funciones.map((f, i) => campo(`Feature ${i + 1}`, f, 200)).join("\n")}
<h3>Search terms: una por casilla</h3>
${l.palabras.map((p, i) => campo(`Term ${i + 1}`, p, 40)).join("\n")}
${campo("Copyright and trademark info", comun.copyright, 200)}
${campo("Developed by", comun.autor, 255)}
${campo("Additional license terms", comun.licencia, 10000, "Mi recomendación, para que mande tu licencia y no los términos de Microsoft. Si prefieres los de Microsoft, deja la casilla vacía.")}
${campo("What's new in this version", "", 0, "Vacía en el primer envío: no pegues nada.")}
</section>`;

const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adeorq en la Microsoft Store: los textos para copiar</title>
<style>
:root { color-scheme: light dark; --bg:#f6f6f4; --card:#fff; --texto:#1d1d1f; --suave:#6b6b70; --linea:#e2e2e0; --acento:#3e5ba9; --sobre:#fff; }
@media (prefers-color-scheme: dark) { :root { --bg:#121214; --card:#1c1c1f; --texto:#ececef; --suave:#9a9aa2; --linea:#2c2c31; --acento:#7f9cf0; --sobre:#0e0e10; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--texto); font:15px/1.5 system-ui, "Segoe UI", sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 20px 80px; }
h1 { font-size: 26px; margin: 0 0 6px; } h2 { font-size: 20px; margin: 36px 0 10px; } h3 { font-size: 15px; margin: 22px 0 8px; color: var(--suave); }
.intro { color: var(--suave); margin: 0 0 8px; }
.campo { background: var(--card); border: 1px solid var(--linea); border-radius: 12px; padding: 12px 14px; margin: 10px 0; }
.cab { display: flex; align-items: center; gap: 12px; }
.nom { font-weight: 600; flex: 1; } .cuenta { color: var(--suave); font-size: 13px; }
.nota { color: var(--suave); margin: 6px 0 0; font-size: 14px; }
pre { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font: 14px/1.5 ui-monospace, Consolas, monospace; }
pre:empty { display: none; }
button { border: 0; border-radius: 8px; padding: 7px 14px; background: var(--acento); color: var(--sobre); font: inherit; font-weight: 600; cursor: pointer; }
button.hecho { opacity: .7; }
</style></head><body><main>
<h1>Adeorq en la Microsoft Store: los textos para copiar</h1>
<p class="intro">Cada casilla de Partner Center con su texto. Pulsa «Copiar» y pégalo en la casilla del mismo nombre. Los textos salen de <code>docs/contexto/tiendas/ficha.md</code> y <code>notas-del-probador.md</code>; si cambian allí, esta página se rehace con <code>node scripts/tiendas/ficha-para-copiar.mjs</code>.</p>
<p class="intro">Hecha el ${new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}.</p>
<section><h2>Properties</h2>
${campo("Privacy policy URL", comun.privacidad, 0)}
${campo("Website", comun.web, 0)}
${campo("Support contact info", comun.ayuda, 0)}
</section>
${ficha("Store listing: English (United States)", en)}
${ficha("Store listing: español", es)}
<section><h2>Submission options</h2>
${campo("Notes for certification", notas, 2000)}
${campo("Restricted capabilities: runFullTrust", fulltrust, 2000)}
</section>
</main>
<script>
document.addEventListener("click", function (e) {
  var b = e.target.closest("button[data-de]"); if (!b) return;
  var t = document.getElementById(b.getAttribute("data-de")).textContent;
  function listo() { b.textContent = "Copiado"; b.classList.add("hecho"); setTimeout(function () { b.textContent = "Copiar"; b.classList.remove("hecho"); }, 1800); }
  function aMano() { var a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); listo(); } finally { a.remove(); } }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(listo, aMano); else aMano();
});
</script>
</body></html>
`;
writeFileSync(SALIDA, html);
console.log(`${SALIDA}: ${n} campos`);
