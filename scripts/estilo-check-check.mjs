// Que el vigilante de la guía de estilo cace lo que tiene que cazar.
//   `node scripts/estilo-check-check.mjs`   ·   `pnpm estilo`
//
// Un comprobador que siempre pasa tranquiliza sin proteger, así que aquí va
// cada cosa que tiene que cazar, hecha a propósito, y al lado la forma buena,
// que tiene que pasar sin ruido. Y lo mismo con `--arreglar`: qué cambia, a
// qué, y qué no puede tocar. Al final, la hoja de verdad.

import fs from "node:fs";
import {
  arreglar,
  capas,
  clase,
  codigo,
  declaraciones,
  EN_LINEA_EXENTOS,
  escalon,
  esquinaNueva,
  juzgarEsquina,
  juzgarSombra,
  revisar,
  revisarCodigo,
  sinComentarios,
  sombraNueva,
  tramos,
} from "./estilo-check.mjs";

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? " — " + detalle : ""}`);
};
const es = (nombre, sale, esperado) => ok(nombre, sale === esperado, `sale «${sale}», se esperaba «${esperado}»`);

/* ── Encontrar las declaraciones ─────────────────────────────────────────── */

const HOJA = `
/* un comentario que nombra border-radius: 12px; no cuenta */
.a { color: red; border-radius: 12px ; }
.b {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 18px 50px rgba(0, 0, 0, 0.5);
  --mi-box-shadow: 0 9px 30px rgba(0, 0, 0, 0.4);
}
@media (max-width: 900px) { .c { border-top-left-radius: 9px !important } }
`;
const ds = declaraciones(HOJA);
es("encuentra las tres, y ni el comentario ni la variable", ds.map((d) => d.propiedad).join(" "), "border-radius box-shadow border-top-left-radius");
es("el valor sale sin los espacios de alrededor", ds[0].valor, "12px");
es("y el sitio que apunta es el del valor, no el de sus espacios", HOJA.slice(ds[0].desde, ds[0].hasta), "12px");
es("una sombra en varias líneas es una sola declaración", capas(ds[1].valor).length, 2);
es("la línea es la de la propiedad", ds[0].linea, 3);
ok("el cuerpo es el de SU regla, también dentro de un @media", ds[2].cuerpo.includes("border-top-left-radius") && !ds[2].cuerpo.includes("max-width"));
ok("los comentarios se blanquean sin mover nada de sitio", sinComentarios(HOJA).length === HOJA.length && !sinComentarios(HOJA).includes("no cuenta"));

/* ── Las esquinas ────────────────────────────────────────────────────────── */

es("hasta 4 px es un detalle y se queda", escalon(3), "3px");
es("de 5 a 8, la chica", `${escalon(5)} ${escalon(8)}`, "var(--r-chico) var(--r-chico)");
es("de 9 a 13, la de botón", `${escalon(9)} ${escalon(13)}`, "var(--r-btn) var(--r-btn)");
es("de 14 en adelante, la de caja", `${escalon(14)} ${escalon(40)}`, "var(--r-caja) var(--r-caja)");
es("999 es una pastilla", escalon(999), "var(--r-pastilla)");

es("una esquina suelta pasa a su escalón", esquinaNueva("12px"), "var(--r-btn)");
es("con cuatro valores, cada uno al suyo", esquinaNueva("11px 4px 4px 11px"), "var(--r-btn) 4px 4px var(--r-btn)");
es("el !important se conserva", esquinaNueva("9px !important"), "var(--r-btn) !important");
es("un círculo no se toca", esquinaNueva("50%"), "50%");
es("una pastilla escrita con su número pasa a la variable, que vale lo mismo", esquinaNueva("999px 999px 0 0"), "var(--r-pastilla) var(--r-pastilla) 0 0");
es("lo que ya sale de la escala, tampoco", esquinaNueva("var(--r-caja) var(--r-caja) 0 0"), "var(--r-caja) var(--r-caja) 0 0");
es("ni un detalle de 2 px", esquinaNueva("2px"), "2px");
es("una caja de 20 de alto con esquina de 10 es una pastilla", esquinaNueva("10px", "width: 34px; height: 20px; border-radius: 10px"), "var(--r-pastilla)");
es("y un punto de 14 por 14 con esquina de 7, también", esquinaNueva("7px", " width: 14px;\n  height: 14px;\n  border-radius: 7px;\n"), "var(--r-pastilla)");
es("pero una caja alta con esa misma esquina no", esquinaNueva("10px", "height: 64px; border-radius: 10px"), "var(--r-btn)");
es("min-height no es height", esquinaNueva("10px", "min-height: 18px; border-radius: 10px"), "var(--r-btn)");

ok("una esquina a mano falla", /esquina a mano \(12px\)/.test(juzgarEsquina("12px") ?? ""));
ok("y dice cuál de las cuatro", /\(9px\)/.test(juzgarEsquina("var(--r-btn) 9px 0 0") ?? ""));
ok("la escala, los círculos y los detalles pasan", [ "var(--r-btn)", "50%", "0", "3px", "999px 999px 0 0".replace(/999px/g, "var(--r-pastilla)"), "inherit" ].every((v) => juzgarEsquina(v) === null));

/* ── Las sombras ─────────────────────────────────────────────────────────── */

es("una sombra negra difuminada es de las que flotan", clase("0 18px 50px rgba(0, 0, 0, 0.5)").tipo, "flota");
es("también escrita con #000 o con black", `${clase("0 6px 20px #000").tipo} ${clase("0 6px 20px black").tipo}`, "flota flota");
es("el brillo del borde es hacia dentro", clase("inset 0 1px 0 rgba(255, 255, 255, 0.09)").tipo, "dentro");
es("una línea sin difuminar no es una sombra", clase("0 0 0 1px var(--border-strong)").tipo, "linea");
es("un resplandor de color dice algo y no es una sombra", clase("0 0 7px color-mix(in srgb, var(--cj-c, #7ee08a) 60%, transparent)").tipo, "resplandor");
es("una variable es una variable", clase("var(--glass-edge)").tipo, "variable");

es("una sombra larga pasa a la de encima, y el brillo se queda", sombraNueva("var(--glass-edge), 0 18px 50px rgba(0, 0, 0, 0.5)"), "var(--glass-edge), var(--sombra-3)");
es("una mediana, a la de cerca", sombraNueva("inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 10px 26px rgba(0, 0, 0, 0.45)"), "inset 0 1px 0 rgba(255, 255, 255, 0.22), var(--sombra-2)");
es("una corta se va: lo apoyado no lleva sombra", sombraNueva("0 3px 9px rgba(0, 0, 0, 0.35)"), "none");
es("y si llevaba además un brillo, queda el brillo", sombraNueva("inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 3px 10px rgba(0, 0, 0, 0.3)"), "inset 0 1px 0 rgba(255, 255, 255, 0.16)");
es("dos sombras de las que flotan son una sola, la mayor", sombraNueva("0 16px 40px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)"), "var(--sombra-3)");
es("un anillo de foco y un resplandor no se tocan", sombraNueva("0 0 0 2px var(--accent), 0 0 12px var(--accent)"), "0 0 0 2px var(--accent), 0 0 12px var(--accent)");
es("none es none", sombraNueva("none"), "none");
es("lo que ya sale de la escala no cambia", sombraNueva("var(--glass-edge), var(--sombra-2)"), "var(--glass-edge), var(--sombra-2)");
es("el !important de una sombra se conserva", sombraNueva("0 14px 34px rgba(0, 0, 0, 0.4) !important"), "var(--sombra-3) !important");

ok("una sombra a mano falla", /sombra a mano/.test(juzgarSombra("var(--glass-edge), 0 10px 30px rgba(0, 0, 0, 0.22)") ?? ""));
ok("la escala, el brillo, las líneas y los resplandores pasan", [ "none", "var(--sombra-3)", "var(--glass-edge), var(--sombra-2)", "inset 0 0 0 1px rgba(0, 0, 0, 0.35)", "0 0 0 2px var(--accent)", "0 0 7px var(--done)" ].every((v) => juzgarSombra(v) === null));

/* ── La hoja entera, de ida y vuelta ─────────────────────────────────────── */

const mala = revisar(HOJA);
es("en la hoja de prueba caza las tres", mala.length, 3);
ok("y dice la línea de cada una", mala.map((f) => f.linea).join(",") === "3,5,10", mala.map((f) => f.linea).join(","));
const r = arreglar(HOJA);
es("--arreglar cambia las tres", r.cambiadas, 3);
es("y lo arreglado ya no falla", revisar(r.css).length, 0);
const ARREGLADA = `
/* un comentario que nombra border-radius: 12px; no cuenta */
.a { color: red; border-radius: var(--r-btn) ; }
.b {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09), var(--sombra-3);
  --mi-box-shadow: 0 9px 30px rgba(0, 0, 0, 0.4);
}
@media (max-width: 900px) { .c { border-top-left-radius: var(--r-btn) !important } }
`;
ok("sin tocar nada que no sea un valor: el comentario, la variable y cada espacio siguen igual", r.css === ARREGLADA, JSON.stringify(r.css));
es("arreglar dos veces no cambia nada la segunda", arreglar(r.css).cambiadas, 0);

/* ── Lo escrito dentro del código ────────────────────────────────────────── */

const TSX = [
  'const a = { borderRadius: "8px" };',
  "const b = { borderRadius: 'var(--r-chico)', boxShadow: `0 0 6px ${color}, 0 0 12px ${color}` };",
  'const c = <i style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)" }} />;',
  'const d = { borderRadius: "2px" };',
].join("\n");
const enCodigo = revisarCodigo(TSX);
es("en el código caza la esquina y la sombra a mano, y nada más", enCodigo.map((f) => `${f.linea}:${f.propiedad}`).join(" "), "1:borderRadius 3:boxShadow");
ok("el editor de la web está apartado, con su porqué", Object.keys(EN_LINEA_EXENTOS).length === 1 && !codigo().some((f) => f.ruta in EN_LINEA_EXENTOS));

/* ── Y la de verdad ──────────────────────────────────────────────────────── */

let enLinea = 0;
for (const c of codigo()) enLinea += revisarCodigo(fs.readFileSync(c.entera, "utf8")).length;
ok("en el código de la app no hay ninguna esquina ni sombra a mano", enLinea === 0, `${enLinea}`);

let sueltas = 0;
let miradas = 0;
for (const t of tramos()) {
  const css = fs.readFileSync(t.entera, "utf8");
  miradas += declaraciones(css).length;
  sueltas += revisar(css).length;
}
ok("la hoja de la app tiene esquinas y sombras que mirar", miradas > 400, `${miradas}`);
ok("y ninguna se sale de la escala", sueltas === 0, `${sueltas} sueltas: \`node scripts/estilo-check.mjs\` dice cuáles`);

console.log(fallos === 0 ? "\nTODO BIEN." : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
