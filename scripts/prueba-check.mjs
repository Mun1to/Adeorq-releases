// Que ninguna versión salga sin decir CÓMO se probó.  `node scripts/prueba-check.mjs <notas.md>`
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Munir, 2026-09-01, después de que se le publicara como arreglado un scroll
// que seguía igual: «me está empezando a tocar los cojones que no pruebes bien
// las cosas y des por hecho que ya está... te tengo que decir las cosas 57.000
// millones de veces».
//
// El fallo, destilado: se probó la HIPÓTESIS, no el SÍNTOMA. Él dijo «el scroll
// va mal con el trackpad»; se probó que una función devolvía los números
// esperados, y eso se contó como «medido». Son cosas distintas y se vendieron
// como la misma.
//
// La regla AD ya lo prohíbe con todas las letras, incluido el «si no se puede
// probar, se dice NO PROBADO con esas palabras». O sea que el problema no es
// que falte texto: es que el texto se hojea y un comprobador no. Doscientos kB
// de reglas frente a treinta y ocho scripts que no fallan nunca.
//
// Así que antes de publicar hay que declarar en qué escalón está cada versión,
// y la declaración VIAJA en las notas, para que Munir lo lea antes de
// actualizar en vez de tener que fiarse.
//
// Los tres escalones, y el de en medio es el que se disfrazaba de bueno:
//
//   PROBADO     Reproduje el fallo ANTES, hice el cambio, repetí los mismos
//               pasos y lo vi pasar. Es el único que puede decir «arreglado».
//   MEDIDO      No pude reproducir el síntoma, pero medí algo relacionado y
//               tiene que decir QUÉ midió y QUÉ NO. No dice «arreglado».
//   NO PROBADO  No se pudo comprobar. Dice qué falta para poder hacerlo.
//
// Se lanza solo desde `publicar-check.mjs`, y a mano así:
//   node scripts/prueba-check.mjs <ruta de las notas>

import fs from "node:fs";

const ESCALONES = ["PROBADO", "MEDIDO", "NO PROBADO"];

/**
 * La primera línea con contenido de las notas tiene que ser la declaración.
 *
 * Se exige ARRIBA del todo a propósito: enterrada al final no la lee nadie, y
 * el objetivo es justo que se lea antes de decidir si actualizar.
 */
export function revisar(texto) {
  const lineas = texto.split(/\r?\n/);
  const primera = lineas.find((l) => l.trim() !== "");
  if (!primera) return { ok: false, por: "las notas están vacías" };

  const m = primera.trim().match(/^>\s*(PROBADO|MEDIDO|NO PROBADO)\s*:\s*(.+)$/);
  if (!m) {
    return {
      ok: false,
      por:
        "la primera línea de las notas tiene que declarar cómo se probó, así:\n\n" +
        "    > PROBADO: reproduje el fallo con <tal cosa>, y tras el cambio ya no pasa.\n" +
        "    > MEDIDO: no pude reproducir <el síntoma>; lo que sí medí es <esto>.\n" +
        "    > NO PROBADO: no he podido comprobarlo. Falta <esto>.\n\n" +
        `y empieza por: «${primera.trim().slice(0, 70)}»`,
    };
  }

  const [, escalon, detalle] = m;
  if (detalle.trim().length < 25) {
    return { ok: false, por: `«${escalon}» sin explicar. Di QUÉ hiciste, no solo la etiqueta.` };
  }

  // Un MEDIDO o un NO PROBADO no pueden ir vendiendo arreglos: es exactamente
  // lo que pasó con el scroll del trackpad.
  if (escalon !== "PROBADO") {
    /* Entrecomillado NO cuenta: hablar de la palabra no es usarla. Sin esto,
       unas notas que EXPLIQUEN esta misma regla no podrían salir, que es lo
       primero que pasó al estrenarla. Las comillas angulares son las de la
       casa; van también las rectas y las de código por si acaso. */
    const cuerpo = texto
      .toLowerCase()
      .replace(/«[^»]*»/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/"[^"]*"/g, " ");
    const vendidas = ["arreglado", "solucionado", "resuelto", "ya no pasa", "queda arreglado"];
    const cazada = vendidas.find((p) => cuerpo.includes(p));
    if (cazada && !detalle.toLowerCase().includes(cazada)) {
      return {
        ok: false,
        por:
          `las notas dicen «${cazada}» pero la declaración es «${escalon}».\n` +
          "  Si no se reprodujo el fallo, no se puede afirmar que esté arreglado:\n" +
          "  se dice qué se cambió y qué falta por comprobar.",
      };
    }
  }

  return { ok: true, escalon, detalle: detalle.trim() };
}

const ruta = process.argv[2];
if (ruta) {
  if (!fs.existsSync(ruta)) {
    console.error(`No encuentro las notas: ${ruta}`);
    process.exit(1);
  }
  const r = revisar(fs.readFileSync(ruta, "utf8"));
  if (!r.ok) {
    console.error(`\nESTA VERSIÓN NO SALE.\n\n  ${r.por}\n`);
    console.error(`  Los escalones son: ${ESCALONES.join(", ")}.\n`);
    process.exit(1);
  }
  console.log(`ok  ${r.escalon}: ${r.detalle}`);
}
