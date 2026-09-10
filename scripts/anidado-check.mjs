// Que no vuelva a haber un componente declarado DENTRO de otro.
//   `node scripts/anidado-check.mjs`   ·   `pnpm anidado`
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// React decide si conserva un nodo del DOM comparando el TIPO del elemento, y
// el tipo de `<Login />` es la propia función `Login`. Declarada dentro del
// cuerpo de otro componente, cada render del padre crea una función nueva con
// otra identidad: React ve un tipo distinto, tira el subárbol entero y monta
// otro. El `<input>` de dentro pasa a ser otro nodo del DOM y el foco del
// teclado se queda en el que acaba de desaparecer.
//
// Ya costó dos veces en esta casa:
//   · 2026-08-11, `DiaSuelto`: su efecto avisaba hacia arriba al montarse, el
//     padre se re-renderizaba y volvía a montarlo. La Agenda parpadeaba sin
//     parar y no llegaba a pintar (el porqué sigue escrito en su comentario).
//   · 2026-09-10, ocho más en `AgendaView`, tres de ellos con `<input>` dentro,
//     incluidos el correo y la contraseña del acceso a la brújula.
//
// Medido con React de verdad en `scripts/remonte-check.tsx`: con el hijo
// dentro, dos montajes y el foco perdido en UN solo render del padre.
//
// ── LAS DOS SALIDAS BUENAS ──────────────────────────────────────────────────
//
//   1. Si NO usa el estado del padre → sácalo fuera, como componente normal.
//   2. Si lo usa → déjalo donde está pero llámalo `{Login()}` en vez de
//      `<Login />`. Así su JSX entra en el árbol del padre sin ser un tipo que
//      React compare, y no hay nada que remontar. Condición: que no use hooks,
//      o que la llamada sea incondicional; si no, sube los hooks al padre.
//
// Este script busca justo eso: algo declarado con sangría y USADO como `<X`.
// Lo declarado con sangría pero llamado como `X()` no es un componente y no se
// señala, que es la salida 2.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function tsx(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...tsx(p));
    else if (e.name.endsWith(".tsx")) salida.push(p);
  }
  return salida;
}

export function revisar(raiz = RAIZ) {
  const culpables = [];
  for (const archivo of tsx(raiz)) {
    const texto = fs.readFileSync(archivo, "utf8");
    const lineas = texto.split("\n");

    /* El uso se busca sobre el código SIN comentarios: si no, un comentario que
       explique por qué algo dejó de escribirse `<Seccion />` hace que el propio
       script lo denuncie. Pasó nada más estrenarlo. */
    const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[^\n"'`]*\/\/[^\n]*$/gm, " ");

    lineas.forEach((linea, i) => {
      // Declarado con sangría: dentro de algo. Nombre en mayúscula: componente.
      const m = linea.match(
        /^(\s+)(?:export\s+)?(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]*)?=>)/,
      );
      if (!m) return;
      const nombre = m[2] || m[3];

      // ¿Se usa como componente en algún sitio del archivo? Eso es lo que
      // hace que React lo compare por tipo. Llamado como `Nombre()` no.
      const comoEtiqueta = new RegExp(`<${nombre}[\\s/>]`);
      if (!comoEtiqueta.test(codigo)) return;

      culpables.push({
        archivo: path.relative(path.join(raiz, ".."), archivo).replace(/\\/g, "/"),
        linea: i + 1,
        nombre,
      });
    });
  }
  return culpables;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const malos = revisar();
  if (malos.length) {
    console.error("\nESTOS COMPONENTES SE REMONTAN EN CADA RENDER DE SU PADRE:\n");
    for (const c of malos) console.error(`  ${c.archivo}:${c.linea}  ${c.nombre}`);
    console.error(
      "\n  Un componente declarado dentro de otro es una función NUEVA en cada\n" +
        "  render: React lo ve como otro tipo, desmonta lo que había y monta\n" +
        "  otra vez. Lo de dentro pierde su estado, su scroll y el foco.\n\n" +
        "  Si no usa el estado del padre, sácalo fuera.\n" +
        "  Si lo usa, llámalo `{Nombre()}` en vez de `<Nombre />`.\n",
    );
    process.exit(1);
  }
  console.log("ok  ningún componente se declara dentro de otro");
}
