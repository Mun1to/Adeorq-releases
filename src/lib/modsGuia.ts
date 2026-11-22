import { PIEZAS } from "./mods";

// ── La guía: lo que un agente necesita para escribir uno ───────────────────
//
// Va aparte de `mods.ts` porque son unos 4 kB de texto que solo hacen falta al
// escribir `mods\LEEME.md`, y `mods.ts` viaja en el arranque (`vigilarMods`).
// `escribirGuia` la pide con un `import()` cuando la necesita: con ella dentro,
// el arranque pasaba del techo de `scripts/arranque-check.mjs` (1501 kB de 1500).

/**
 * La guía para quien escribe un mod, que es un agente.
 *
 * Va en español a propósito, como todo lo que Adeorq le escribe a un agente.
 * Se rehace con cada versión (lleva la lista de piezas de ESTA) y Rust la deja
 * en `mods\LEEME.md`, al lado de los mods, para que la lea un agente de
 * cualquier proveedor sin más herramienta que abrir un archivo.
 */
export function guiaDeMods(version: string, carpeta: string): string {
  const sep = carpeta.includes("\\") ? "\\" : "/";
  const piezas = Object.entries(PIEZAS)
    .map(([nombre, que]) => `- \`${nombre}\`: ${que}`)
    .join("\n");
  return `# Cómo se escribe un mod de Adeorq

Esta guía la escribe Adeorq ${version} y la rehace en cada versión. Es para ti, el agente al que
alguien le ha pedido cambiar cómo se ve su Adeorq.

## Qué es un mod

Una carpeta dentro de esta, con dos archivos. Adeorq los lee, pone tu hoja de estilo detrás de la
suya (por eso gana) y una actualización no la toca, porque vive en la carpeta de datos del usuario.

    ${carpeta}${sep}<id>${sep}mod.json
    ${carpeta}${sep}<id>${sep}estilo.css

El \`<id>\` es el nombre de la carpeta: minúsculas, números y guiones, por ejemplo \`iconos-redondos\`.
Un cambio, un mod: no metas dos pedidos distintos en el mismo.

## mod.json

    {
      "id": "iconos-redondos",
      "pedido": "quiero los iconos redondos en vez de cuadrados",
      "hecho_para": "${version}",
      "tipo": "estilo",
      "toca": ["--r-icono"]
    }

- \`pedido\`: la frase de la persona, tal cual la dijo. Es lo que permite rehacer el mod cuando una
  versión nueva cambie algo. No la resumas ni la traduzcas.
- \`hecho_para\`: la versión de Adeorq para la que lo escribes. Hoy, ${version}.
- \`tipo\`: solo \`"estilo"\`. Cualquier otro no se carga.
- \`toca\`: las variables que cambias. Adeorq las repasa en cada versión y avisa a la persona si
  alguna ya no existe.

## estilo.css

Primero mira si lo que te piden tiene **una pieza con nombre**. Son lo estable: Adeorq se
compromete a mantenerlas.

${piezas}

Se cambian en \`:root\`:

    :root {
      --r-icono: 999px;
    }

Si no hay pieza con nombre, mira la escala y los colores. Las esquinas son \`--r-chico\`, \`--r-btn\`,
\`--r-caja\` y \`--r-pastilla\`, pero cada una la usan muchas piezas a la vez. Los colores del tema son
\`--accent\`, \`--accent-dim\`, \`--border\`, \`--border-strong\`, \`--text\`, \`--muted\`, \`--panel-solid\`
y \`--popover\`, y viven en el tema: para ganarlos, el selector es \`:root, :root[data-theme]\`.

Y si tampoco, escribe reglas con las clases de la app. Están en el código, que es público
(\`src/estilos/\` en github.com/Mun1to/Adeorq-releases). Una clase puede cambiar de nombre en una
versión nueva y tu regla dejaría de aplicarse sin romper nada: por eso se prefiere una variable, y
si lo que te piden merece una pieza con nombre, díselo a la persona.

## Lo que Adeorq no deja pasar

- \`@import\`, \`image-set()\` y cualquier \`url()\` que no sea \`data:\`. Un mod no pide nada a la red.
- La barra invertida. Escribe el carácter tal cual, sin escapes.
- Una hoja de más de 256 KB.
- Código. No hay mods con JavaScript.

Y lo que no debes intentar: esconder, tapar o cambiar de sitio lo que pide un permiso, pide una
clave o enseña una cuenta. Adeorq no deja que tus reglas lleguen ahí (esas zonas llevan
\`data-sin-mods\`); solo llegan las variables, que cambian colores y esquinas.

## Al terminar

No toques nada fuera de esta carpeta: ni la instalación de Adeorq ni su código. Con los mods
encendidos (Ajustes › Mods), Adeorq aplica el tuyo solo en unos segundos. Dile a la persona que
mire ahí: verá tu mod con su estado y, si Adeorq lo rechaza, el motivo. Para deshacerlo basta con
apagarlo o quitarlo desde ese mismo sitio.
`;
}
